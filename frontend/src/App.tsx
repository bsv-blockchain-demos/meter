import React, { useState, FormEvent } from 'react'
import { ToastContainer, toast } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'
import {
  AppBar,
  Toolbar,
  List,
  ListItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  Fab,
  LinearProgress,
  Typography,
  IconButton,
  Grid,
  Card,
  CardContent,
  TextField,
  Chip
} from '@mui/material'
import { styled } from '@mui/system'
import AddIcon from '@mui/icons-material/Add'
import GitHubIcon from '@mui/icons-material/GitHub'
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

const AppBarPlaceholder = styled('div')({ height: '4em' })

const NoItems = styled(Grid)({
  margin: 'auto',
  textAlign: 'center',
  marginTop: '5em'
})

const AddMoreFab = styled(Fab)({
  position: 'fixed',
  right: '1em',
  bottom: '1em',
  zIndex: 10
})

const LoadingBar = styled(LinearProgress)({ margin: '1em' })

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
      console.log('broadcastResult:', broadcastResult)
      if (broadcastResult.status === 'error') {
        throw new Error('Transaction failed to broadcast')
      }

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

        if (!lookupResult || lookupResult.type !== 'output-list' || !lookupResult.outputs) {
          console.error('No outputs found')
          return
        }

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

      // Build next state (entryCount + 1)
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
    <>
      <ToastContainer position="top-right" autoClose={5000} />
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            Sign My Yearbook
          </Typography>
          <IconButton
            sx={{ color: '#ffffff' }}
            onClick={() => window.open('https://github.com/bsv-blockchain-demos/meter', '_blank')}
          >
            <GitHubIcon />
          </IconButton>
        </Toolbar>
      </AppBar>
      <AppBarPlaceholder />

      {yearBooks.length >= 1 && (
        <AddMoreFab color="primary" onClick={() => setCreateOpen(true)}>
          <AddIcon />
        </AddMoreFab>
      )}

      {yearBooksLoading ? (
        <LoadingBar />
      ) : (
        <List>
          {yearBooks.length === 0 && (
            <NoItems container direction="column" justifyContent="center" alignItems="center">
              <Grid item>
                <Typography variant="h4">No Yearbooks Yet</Typography>
                <Typography color="textSecondary">
                  Create your yearbook and let others sign it
                </Typography>
              </Grid>
              <Grid item sx={{ paddingTop: '2.5em', marginBottom: '1em' }}>
                <Fab color="primary" onClick={() => setCreateOpen(true)}>
                  <AddIcon />
                </Fab>
              </Grid>
            </NoItems>
          )}
          {yearBooks.map((yb, i) => (
            <ListItem key={i}>
              <Card sx={{ width: '100%', padding: 2 }}>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Yearbook
                  </Typography>
                  <Chip
                    label={`${yb.entryCount} signature${yb.entryCount !== 1 ? 's' : ''}`}
                    color="primary"
                    size="small"
                    sx={{ mb: 1 }}
                  />
                  <Typography variant="body2" color="textSecondary" sx={{ mb: 2, wordBreak: 'break-all' }}>
                    Owner: {yb.creatorIdentityKey}
                  </Typography>
                  <Button
                    variant="contained"
                    color="primary"
                    onClick={() => setSignOpen(i)}
                  >
                    Sign This Yearbook
                  </Button>
                </CardContent>
              </Card>
            </ListItem>
          ))}
        </List>
      )}

      {/* Create Yearbook Dialog */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)}>
        <form onSubmit={e => {
          e.preventDefault()
          void (async () => {
            try { await handleCreateSubmit(e) } catch (err) { console.error(err) }
          })()
        }}>
          <DialogTitle>Create a Yearbook</DialogTitle>
          <DialogContent>
            <DialogContentText>
              Start your on-chain yearbook. Others will be able to sign it with their messages.
            </DialogContentText>
          </DialogContent>
          {createLoading ? <LoadingBar /> : (
            <DialogActions>
              <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" variant="contained">Create</Button>
            </DialogActions>
          )}
        </form>
      </Dialog>

      {/* Sign Yearbook Dialog */}
      <Dialog open={signOpen !== null} onClose={() => { setSignOpen(null); setSignMessage('') }}>
        <DialogTitle>Sign This Yearbook</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Leave your mark on this yearbook.
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
          />
        </DialogContent>
        {signLoading ? <LoadingBar /> : (
          <DialogActions>
            <Button onClick={() => { setSignOpen(null); setSignMessage('') }}>Cancel</Button>
            <Button
              variant="contained"
              disabled={!signMessage.trim()}
              onClick={() => signOpen !== null && handleSign(signOpen)}
            >
              Sign
            </Button>
          </DialogActions>
        )}
      </Dialog>
    </>
  )
}

export default App
