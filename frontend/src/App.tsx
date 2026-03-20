import React, { useState, FormEvent } from 'react'
import { ToastContainer, toast } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'
import {
  AppBar,
  Toolbar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  LinearProgress,
  Typography,
  IconButton,
  Card,
  CardContent,
  TextField,
  Chip,
  Box,
  Container,
  Avatar
} from '@mui/material'
import GitHubIcon from '@mui/icons-material/GitHub'
import CreateIcon from '@mui/icons-material/AutoStories'
import DrawIcon from '@mui/icons-material/Draw'
import useAsyncEffect from 'use-async-effect'
import { YearBook, Token } from './types/types'
import { RunarContract, extractStateFromScript } from 'runar-sdk'
import type { RunarArtifact } from 'runar-sdk'
import yearBookArtifact from './artifacts/YearBook.runar.json'
const artifact = yearBookArtifact as unknown as RunarArtifact
import {
  SHIPBroadcaster,
  LookupResolver,
  Transaction,
  Utils,
  WalletClient,
  SHIPBroadcasterConfig,
  CreateActionArgs,
  HTTPSOverlayBroadcastFacilitator
} from '@bsv/sdk'

const walletClient = new WalletClient()
const NETWORK_PRESET = 'local'
const OVERLAY_URL = 'http://localhost:8080'
const httpFacilitator = new HTTPSOverlayBroadcastFacilitator(fetch, true)

const TOPIC = 'tm_yearbook'
const SERVICE = 'ls_yearbook'

const broadcasterConfig = (): SHIPBroadcasterConfig => ({
  networkPreset: NETWORK_PRESET,
  facilitator: httpFacilitator,
  resolver: new LookupResolver({
    hostOverrides: {
      'ls_ship': [OVERLAY_URL],
      'ls_slap': [OVERLAY_URL],
      [SERVICE]: [OVERLAY_URL]
    }
  }),
  requireAcknowledgmentFromSpecificHostsForTopics: {
    [TOPIC]: [OVERLAY_URL]
  }
})

const truncateKey = (key: string): string =>
  key.length > 16 ? `${key.slice(0, 8)}...${key.slice(-8)}` : key

const keyToColor = (key: string): string => {
  let hash = 0
  for (let i = 0; i < key.length; i++) hash = key.charCodeAt(i) + ((hash << 5) - hash)
  const hue = Math.abs(hash) % 360
  return `hsl(${hue}, 60%, 50%)`
}

const App: React.FC = () => {
  const [createOpen, setCreateOpen] = useState(false)
  const [createLoading, setCreateLoading] = useState(false)
  const [signOpen, setSignOpen] = useState<number | null>(null)
  const [signMessage, setSignMessage] = useState('')
  const [signLoading, setSignLoading] = useState(false)
  const [yearBooksLoading, setYearBooksLoading] = useState(true)
  const [yearBooks, setYearBooks] = useState<YearBook[]>([])

  const handleCreateSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault()
    try {
      setCreateLoading(true)
      const publicKey = (await walletClient.getPublicKey({ identityKey: true })).publicKey

      const yearbook = new RunarContract(artifact, [publicKey, BigInt(0)])
      const lockingScript = yearbook.getLockingScript()

      const result = await walletClient.createAction({
        description: 'Create a yearbook',
        outputs: [{
          basket: 'yearbook tokens',
          lockingScript,
          satoshis: 1,
          outputDescription: 'YearBook output'
        }],
        options: { randomizeOutputs: false }
      })

      if (!result.tx) throw new Error('Transaction is undefined')

      const transaction = Transaction.fromAtomicBEEF(result.tx)
      const txid = transaction.id('hex')

      const broadcaster = new SHIPBroadcaster([TOPIC], broadcasterConfig())
      const broadcastResult = await broadcaster.broadcast(transaction)
      if (broadcastResult.status === 'error') throw new Error('Transaction failed to broadcast')

      toast.dark('Yearbook created!')
      setYearBooks(prev => [{
        creatorIdentityKey: publicKey,
        entryCount: 0,
        token: {
          atomicBeefTX: Utils.toHex(result.tx!),
          txid,
          outputIndex: 0,
          lockingScript,
          satoshis: 1
        } as Token
      }, ...prev])
      setCreateOpen(false)
    } catch (e) {
      toast.error((e as Error).message)
      console.error(e)
    } finally {
      setCreateLoading(false)
    }
  }

  useAsyncEffect(() => {
    const fetchYearBooks = async () => {
      try {
        const resolver = new LookupResolver({
          networkPreset: NETWORK_PRESET,
          hostOverrides: { [SERVICE]: [OVERLAY_URL] }
        })
        const lookupResult = await resolver.query({
          service: SERVICE,
          query: { findAll: true }
        }) as any

        if (!lookupResult || lookupResult.type !== 'output-list' || !lookupResult.outputs) return

        const parsed: YearBook[] = []
        for (const result of lookupResult.outputs) {
          try {
            const tx = Transaction.fromBEEF(result.beef)
            const script = tx.outputs[Number(result.outputIndex)].lockingScript.toHex()
            const state = extractStateFromScript(artifact, script)
            if (!state) continue

            parsed.push({
              creatorIdentityKey: String(state.creatorIdentityKey),
              entryCount: Number(state.entryCount as bigint),
              token: {
                atomicBeefTX: Utils.toHex(tx.toAtomicBEEF()),
                txid: tx.id('hex'),
                outputIndex: result.outputIndex,
                lockingScript: script,
                satoshis: tx.outputs[Number(result.outputIndex)].satoshis as number
              } as Token
            })
          } catch (error) {
            console.error('Failed to parse YearBook:', error)
          }
        }
        setYearBooks(parsed)
      } catch (error) {
        console.error('Failed to load YearBooks:', error)
      } finally {
        setYearBooksLoading(false)
      }
    }
    fetchYearBooks()
  }, [])

  const handleSign = async (index: number) => {
    try {
      setSignLoading(true)
      const yb = yearBooks[index]
      if (!yb?.token?.atomicBeefTX || !yb.token.lockingScript || !yb.token.txid) {
        throw new Error('Missing token data')
      }

      const contract = RunarContract.fromUtxo(artifact, {
        txid: yb.token.txid,
        outputIndex: yb.token.outputIndex,
        satoshis: yb.token.satoshis,
        script: yb.token.lockingScript
      })

      const nextContract = RunarContract.fromUtxo(artifact, {
        txid: yb.token.txid,
        outputIndex: yb.token.outputIndex,
        satoshis: yb.token.satoshis,
        script: yb.token.lockingScript
      })
      nextContract.setState({
        ...contract.state,
        entryCount: (contract.state.entryCount as bigint) + 1n
      })
      const nextScript = nextContract.getLockingScript()
      const unlockingScript = contract.buildUnlockingScript('sign', [])
      const atomicBeef = Utils.toArray(yb.token.atomicBeefTX, 'hex')

      const actionParams: CreateActionArgs = {
        inputs: [{
          inputDescription: 'Sign yearbook',
          outpoint: `${yb.token.txid}.${yb.token.outputIndex}`,
          unlockingScript
        }],
        inputBEEF: atomicBeef,
        outputs: [{
          basket: 'yearbook tokens',
          lockingScript: nextScript,
          satoshis: yb.token.satoshis,
          outputDescription: 'YearBook output'
        }],
        description: `Sign a yearbook: ${signMessage}`,
        options: { acceptDelayedBroadcast: false, randomizeOutputs: false }
      }

      const result = await walletClient.createAction(actionParams)
      if (!result.tx) throw new Error('Transaction creation failed')

      const transaction = Transaction.fromAtomicBEEF(result.tx)
      const txid = transaction.id('hex')

      const broadcaster = new SHIPBroadcaster([TOPIC], broadcasterConfig())
      const broadcastResult = await broadcaster.broadcast(transaction)
      if (broadcastResult.status === 'error') {
        console.error('Broadcast error:', broadcastResult.description)
      }

      toast.dark('Yearbook signed!')
      setYearBooks(prev => {
        const copy = [...prev]
        copy[index] = {
          ...copy[index],
          entryCount: copy[index].entryCount + 1,
          token: {
            atomicBeefTX: Utils.toHex(result.tx!),
            txid,
            outputIndex: 0,
            lockingScript: nextScript,
            satoshis: yb.token.satoshis
          } as Token
        }
        return copy
      })
      setSignOpen(null)
      setSignMessage('')
    } catch (error) {
      toast.error((error as Error).message)
      console.error('Error signing yearbook:', error)
    } finally {
      setSignLoading(false)
    }
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <ToastContainer position="top-center" autoClose={4000} theme="dark" />

      {/* Nav */}
      <AppBar position="fixed" elevation={0} sx={{
        bgcolor: 'rgba(10, 10, 26, 0.8)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)'
      }}>
        <Toolbar sx={{ maxWidth: 'lg', width: '100%', mx: 'auto' }}>
          <Typography variant="h6" sx={{ flexGrow: 1, fontWeight: 700, letterSpacing: '-0.01em' }}>
            YearBook
          </Typography>
          <IconButton
            sx={{ color: 'text.secondary', '&:hover': { color: 'text.primary' } }}
            onClick={() => window.open('https://github.com/bsv-blockchain-demos/meter', '_blank')}
          >
            <GitHubIcon />
          </IconButton>
        </Toolbar>
      </AppBar>

      {/* Hero */}
      <Box sx={{
        pt: { xs: 14, md: 18 },
        pb: { xs: 6, md: 10 },
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden',
        '&::before': {
          content: '""',
          position: 'absolute',
          top: '-30%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '600px',
          height: '600px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(108, 99, 255, 0.12) 0%, transparent 70%)',
          pointerEvents: 'none'
        }
      }}>
        <Container maxWidth="sm">
          <Typography variant="h3" sx={{
            fontSize: { xs: '2rem', sm: '2.5rem', md: '3rem' },
            mb: 2,
            background: 'linear-gradient(135deg, #6C63FF 0%, #FF6B9D 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}>
            Sign My Yearbook
          </Typography>
          <Typography variant="body1" sx={{
            color: 'text.secondary',
            fontSize: { xs: '1rem', md: '1.15rem' },
            lineHeight: 1.7,
            mb: 4,
            maxWidth: 440,
            mx: 'auto'
          }}>
            Create an on-chain yearbook and let friends sign it.
            Every signature is a Bitcoin transaction, forever on the blockchain.
          </Typography>
          <Button
            variant="contained"
            size="large"
            startIcon={<CreateIcon />}
            onClick={() => setCreateOpen(true)}
            sx={{
              px: 4,
              py: 1.5,
              fontSize: '1rem',
              background: 'linear-gradient(135deg, #6C63FF, #8B83FF)',
              '&:hover': {
                background: 'linear-gradient(135deg, #5B52EE, #7A73FF)',
                boxShadow: '0 8px 32px rgba(108, 99, 255, 0.35)'
              }
            }}
          >
            Create a Yearbook
          </Button>
        </Container>
      </Box>

      {/* Content */}
      <Container maxWidth="md" sx={{ pb: 8 }}>
        {yearBooksLoading ? (
          <LinearProgress sx={{ borderRadius: 1, mt: 2 }} />
        ) : yearBooks.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <Box sx={{
              width: 80,
              height: 80,
              borderRadius: '50%',
              bgcolor: 'rgba(108, 99, 255, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              mx: 'auto',
              mb: 3
            }}>
              <CreateIcon sx={{ fontSize: 36, color: 'primary.main' }} />
            </Box>
            <Typography variant="h6" sx={{ mb: 1, color: 'text.secondary' }}>
              No yearbooks yet
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
              Be the first to create one
            </Typography>
          </Box>
        ) : (
          <>
            <Typography variant="overline" sx={{
              color: 'text.secondary',
              letterSpacing: 2,
              display: 'block',
              mb: 2
            }}>
              {yearBooks.length} yearbook{yearBooks.length !== 1 ? 's' : ''}
            </Typography>

            <Box sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
              gap: 2
            }}>
              {yearBooks.map((yb, i) => (
                <Card key={i} sx={{ display: 'flex', flexDirection: 'column' }}>
                  <CardContent sx={{ flex: 1, p: 3 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                      <Avatar sx={{
                        width: 40,
                        height: 40,
                        bgcolor: keyToColor(yb.creatorIdentityKey),
                        fontSize: 16,
                        fontWeight: 700
                      }}>
                        {yb.creatorIdentityKey.slice(2, 4).toUpperCase()}
                      </Avatar>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
                          {truncateKey(yb.creatorIdentityKey)}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                          owner
                        </Typography>
                      </Box>
                    </Box>

                    <Chip
                      icon={<DrawIcon sx={{ fontSize: '16px !important' }} />}
                      label={`${yb.entryCount} signature${yb.entryCount !== 1 ? 's' : ''}`}
                      size="small"
                      variant="outlined"
                      sx={{
                        mb: 2.5,
                        borderColor: yb.entryCount > 0 ? 'secondary.dark' : 'rgba(255,255,255,0.12)',
                        color: yb.entryCount > 0 ? 'secondary.light' : 'text.secondary'
                      }}
                    />

                    <Button
                      variant="contained"
                      fullWidth
                      startIcon={<DrawIcon />}
                      onClick={() => setSignOpen(i)}
                      sx={{
                        background: 'linear-gradient(135deg, #FF6B9D, #FF8FB3)',
                        '&:hover': {
                          background: 'linear-gradient(135deg, #EE5A8C, #FF7EA5)',
                          boxShadow: '0 6px 24px rgba(255, 107, 157, 0.3)'
                        }
                      }}
                    >
                      Sign This Yearbook
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </Box>
          </>
        )}
      </Container>

      {/* Create Dialog */}
      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <form onSubmit={(e: FormEvent<HTMLFormElement>) => {
          e.preventDefault()
          void (async () => {
            try { await handleCreateSubmit(e) } catch (err) { console.error(err) }
          })()
        }}>
          <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>Create a Yearbook</DialogTitle>
          <DialogContent>
            <DialogContentText>
              Start your on-chain yearbook. Once created, anyone can sign it with their wallet.
            </DialogContentText>
          </DialogContent>
          {createLoading ? <LinearProgress sx={{ mx: 3, mb: 2, borderRadius: 1 }} /> : (
            <DialogActions sx={{ px: 3, pb: 2.5 }}>
              <Button onClick={() => setCreateOpen(false)} sx={{ color: 'text.secondary' }}>Cancel</Button>
              <Button type="submit" variant="contained">Create</Button>
            </DialogActions>
          )}
        </form>
      </Dialog>

      {/* Sign Dialog */}
      <Dialog
        open={signOpen !== null}
        onClose={() => { setSignOpen(null); setSignMessage('') }}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>Sign This Yearbook</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2.5 }}>
            Leave a message that gets recorded as a Bitcoin transaction.
          </DialogContentText>
          <TextField
            autoFocus
            fullWidth
            label="Your message"
            placeholder="Have a great summer!"
            value={signMessage}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSignMessage(e.target.value)}
            multiline
            rows={3}
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: 2,
                '&.Mui-focused fieldset': { borderColor: 'secondary.main' }
              }
            }}
          />
        </DialogContent>
        {signLoading ? <LinearProgress sx={{ mx: 3, mb: 2, borderRadius: 1 }} /> : (
          <DialogActions sx={{ px: 3, pb: 2.5 }}>
            <Button onClick={() => { setSignOpen(null); setSignMessage('') }} sx={{ color: 'text.secondary' }}>
              Cancel
            </Button>
            <Button
              variant="contained"
              disabled={!signMessage.trim()}
              onClick={() => signOpen !== null && handleSign(signOpen)}
              sx={{
                background: 'linear-gradient(135deg, #FF6B9D, #FF8FB3)',
                '&:hover': {
                  background: 'linear-gradient(135deg, #EE5A8C, #FF7EA5)',
                  boxShadow: '0 6px 24px rgba(255, 107, 157, 0.3)'
                },
                '&.Mui-disabled': { background: 'rgba(255,255,255,0.08)' }
              }}
            >
              Sign
            </Button>
          </DialogActions>
        )}
      </Dialog>
    </Box>
  )
}

export default App
