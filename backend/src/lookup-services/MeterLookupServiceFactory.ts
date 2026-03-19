import {
  LookupService,
  LookupQuestion,
  LookupFormula,
  AdmissionMode,
  SpendNotificationMode,
  OutputAdmittedByTopic,
  OutputSpent
} from '@bsv/overlay'
import { MeterStorage } from './MeterStorage.js'
import { extractStateFromScript } from 'runar-sdk'
import type { RunarArtifact } from 'runar-sdk'
import docs from './MeterLookupDocs.md.js'
import counterArtifact from '../../artifacts/Counter.runar.json' with { type: 'json' }
import { Db } from 'mongodb'

const artifact = counterArtifact as unknown as RunarArtifact

class MeterLookupService implements LookupService {
  readonly admissionMode: AdmissionMode = 'locking-script'
  readonly spendNotificationMode: SpendNotificationMode = 'none'

  constructor(public storage: MeterStorage) { }

  async outputAdmittedByTopic(
    payload: OutputAdmittedByTopic
  ): Promise<void> {
    if (payload.mode !== 'locking-script') throw new Error('Invalid payload')
    const { txid, outputIndex, topic, lockingScript } = payload
    if (topic !== 'tm_meter') return
    try {
      const state = extractStateFromScript(artifact, lockingScript.toHex())
      if (!state) throw new Error('Failed to extract state from script')

      const value = Number(state.count as bigint)
      const creatorIdentityKey = state.creatorIdentityKey as string

      await this.storage.storeRecord(
        txid,
        outputIndex,
        value,
        creatorIdentityKey
      )
    } catch (e) {
      console.error('Error indexing token in lookup database', e)
      return
    }
  }

  async outputSpent?(
    payload: OutputSpent
  ): Promise<void> {
    if (payload.mode !== 'none') throw new Error('Invalid payload')
    const { topic, txid, outputIndex } = payload
    if (topic !== 'tm_meter') return
    await this.storage.deleteRecord(txid, outputIndex)
  }

  async outputEvicted(
    txid: string, outputIndex: number
  ): Promise<void> {
    await this.storage.deleteRecord(txid, outputIndex)
  }

  async lookup(
    question: LookupQuestion
  ): Promise<LookupFormula> {
    if (question.query === undefined || question.query === null) {
      throw new Error('A valid query must be provided!')
    }
    if (question.service !== 'ls_meter') {
      throw new Error('Lookup service not supported!')
    }

    const query = question.query as {
      txid?: string
      creatorIdentityKey?: string
      findAll?: boolean
    }
    if (query.findAll) {
      return await this.storage.findAll()
    }
    const mess = JSON.stringify(question, null, 2)
    throw new Error(`question.query:${mess}}`)
  }

  async getDocumentation(): Promise<string> {
    return docs
  }

  async getMetaData(): Promise<{
    name: string
    shortDescription: string
    iconURL?: string
    version?: string
    informationURL?: string
  }> {
    return {
      name: 'Meter Lookup Service',
      shortDescription: 'Meters, up and down.'
    }
  }
}

export default (db: Db): MeterLookupService => {
  return new MeterLookupService(new MeterStorage(db))
}
