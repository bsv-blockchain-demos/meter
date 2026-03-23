import {
  LookupService,
  LookupQuestion,
  LookupFormula,
  AdmissionMode,
  SpendNotificationMode,
  OutputAdmittedByTopic,
  OutputSpent
} from '@bsv/overlay'
import { YearBookStorage } from './YearBookStorage.js'
import { extractStateFromScript } from 'runar-sdk'
import type { RunarArtifact } from 'runar-sdk'
import docs from './YearBookLookupDocs.md.js'
import yearBookArtifact from '../../artifacts/YearBook.runar.json' with { type: 'json' }
import { Db } from 'mongodb'

const artifact = yearBookArtifact as unknown as RunarArtifact

// creatorIdentityKey is a readonly prop baked into the code script (not in stateFields).
// The compiler splices it at this byte offset as a 33-byte PubKey push (0x21 + 33 bytes).
const CREATOR_KEY_BYTE_OFFSET = (yearBookArtifact as any).constructorSlots[0].byteOffset
const CREATOR_KEY_HEX_OFFSET = CREATOR_KEY_BYTE_OFFSET * 2

const FRIEND_FIELDS = [
  'friend1', 'friend2', 'friend3', 'friend4', 'friend5',
  'friend6', 'friend7', 'friend8', 'friend9', 'friend10'
] as const

class YearBookLookupService implements LookupService {
  readonly admissionMode: AdmissionMode = 'locking-script'
  readonly spendNotificationMode: SpendNotificationMode = 'none'

  constructor (public storage: YearBookStorage) { }

  async outputAdmittedByTopic (
    payload: OutputAdmittedByTopic
  ): Promise<void> {
    console.log('[LookupService] outputAdmittedByTopic called', { mode: payload.mode, topic: (payload as any).topic, txid: (payload as any).txid, outputIndex: (payload as any).outputIndex })
    if (payload.mode !== 'locking-script') throw new Error('Invalid payload')
    const { txid, outputIndex, topic, lockingScript } = payload
    if (topic !== 'tm_yearbook') {
      console.log('[LookupService] skipping — topic is not tm_yearbook:', topic)
      return
    }
    try {
      const scriptHex = lockingScript.toHex()
      console.log('[LookupService] extracting state from script, length:', scriptHex.length)
      const state = extractStateFromScript(artifact, scriptHex)
      if (!state) throw new Error('Failed to extract state from script')

      // creatorIdentityKey is readonly, baked into the code script — extract from known offset
      // Offset points to the push opcode (0x21 = 33 bytes), pubkey hex follows it
      const scriptHexFull = lockingScript.toHex()
      const creatorIdentityKey = scriptHexFull.slice(CREATOR_KEY_HEX_OFFSET + 2, CREATOR_KEY_HEX_OFFSET + 2 + 66)
      const friends: string[] = FRIEND_FIELDS.map(f => String(state[f] ?? ''))
      console.log('[LookupService] storing record', { txid, outputIndex, creatorIdentityKey, friendCount: friends.filter(f => f !== '').length })

      await this.storage.storeRecord(txid, outputIndex, creatorIdentityKey, friends)
      console.log('[LookupService] record stored successfully')
    } catch (e) {
      console.error('[LookupService] Error indexing yearbook in lookup database', e)
      return
    }
  }

  async outputSpent? (
    payload: OutputSpent
  ): Promise<void> {
    if (payload.mode !== 'none') throw new Error('Invalid payload')
    const { topic, txid, outputIndex } = payload
    if (topic !== 'tm_yearbook') return
    await this.storage.deleteRecord(txid, outputIndex)
  }

  async outputEvicted (txid: string, outputIndex: number): Promise<void> {
    await this.storage.deleteRecord(txid, outputIndex)
  }

  async lookup (question: LookupQuestion): Promise<LookupFormula> {
    console.log('[LookupService] lookup called', JSON.stringify(question))
    if (question.query === undefined || question.query === null) {
      throw new Error('A valid query must be provided!')
    }
    if (question.service !== 'ls_yearbook') {
      throw new Error('Lookup service not supported!')
    }

    const query = question.query as { findAll?: boolean }
    if (query.findAll) {
      const results = await this.storage.findAll()
      console.log('[LookupService] findAll returned', results.length, 'records')
      return results
    }
    throw new Error(`Unsupported query: ${JSON.stringify(question)}`)
  }

  async getDocumentation (): Promise<string> {
    return docs
  }

  async getMetaData (): Promise<{
    name: string
    shortDescription: string
    iconURL?: string
    version?: string
    informationURL?: string
  }> {
    return {
      name: 'YearBook Lookup Service',
      shortDescription: 'On-chain yearbooks that anyone can sign.'
    }
  }
}

export default (db: Db): YearBookLookupService => {
  return new YearBookLookupService(new YearBookStorage(db))
}
