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
    if (payload.mode !== 'locking-script') throw new Error('Invalid payload')
    const { txid, outputIndex, topic, lockingScript } = payload
    if (topic !== 'tm_yearbook') return
    try {
      const state = extractStateFromScript(artifact, lockingScript.toHex())
      if (!state) throw new Error('Failed to extract state from script')

      const creatorIdentityKey = state.creatorIdentityKey as string
      const friends: string[] = FRIEND_FIELDS.map(f => String(state[f] ?? ''))

      await this.storage.storeRecord(txid, outputIndex, creatorIdentityKey, friends)
    } catch (e) {
      console.error('Error indexing yearbook in lookup database', e)
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
    if (question.query === undefined || question.query === null) {
      throw new Error('A valid query must be provided!')
    }
    if (question.service !== 'ls_yearbook') {
      throw new Error('Lookup service not supported!')
    }

    const query = question.query as { findAll?: boolean }
    if (query.findAll) {
      return await this.storage.findAll()
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
