import { AdmittanceInstructions, TopicManager } from '@bsv/overlay'
import { Transaction } from '@bsv/sdk'
import { extractStateFromScript } from 'runar-sdk'
import type { RunarArtifact } from 'runar-sdk'
import docs from './YearBookTopicDocs.md.js'
import yearBookArtifact from '../../artifacts/YearBook.runar.json' with { type: 'json' }

const artifact = yearBookArtifact as unknown as RunarArtifact

export default class YearBookTopicManager implements TopicManager {
  async identifyAdmissibleOutputs (
    beef: number[],
    previousCoins: number[]
  ): Promise<AdmittanceInstructions> {
    const outputsToAdmit: number[] = []
    console.log('[TopicManager] identifyAdmissibleOutputs called', { previousCoins, beefLength: beef.length })
    try {
      const parsedTransaction = Transaction.fromBEEF(beef)
      console.log('[TopicManager] parsed tx', { txid: parsedTransaction.id('hex'), outputCount: parsedTransaction.outputs.length, inputCount: parsedTransaction.inputs.length })

      for (const [i, output] of parsedTransaction.outputs.entries()) {
        try {
          const scriptHex = output.lockingScript.toHex()
          console.log(`[TopicManager] output ${i}: scriptHex length=${scriptHex.length}, satoshis=${output.satoshis}`)
          const state = extractStateFromScript(artifact, scriptHex)
          if (!state) {
            console.log(`[TopicManager] output ${i}: no state extracted (not a YearBook script)`)
            continue
          }

          console.log(`[TopicManager] output ${i}: state extracted`, { fields: Object.keys(state) })

          // State was successfully extracted — this is a valid YearBook script.
          // creatorIdentityKey is a readonly prop baked into the code portion,
          // not in stateFields, so we validate by checking state extraction succeeded.
          outputsToAdmit.push(i)
          console.log(`[TopicManager] output ${i}: ADMITTED`)
        } catch (error) {
          console.error(`[TopicManager] output ${i}: error during extraction`, error)
          continue
        }
      }
    } catch (error) {
      console.error('[TopicManager] failed to parse BEEF transaction', error)
      const beefStr = JSON.stringify(beef, null, 2)
      throw new Error(
        `topicManager:Error:identifying admissible outputs:${error} beef:${beefStr}}`
      )
    }

    console.log('[TopicManager] result', { outputsToAdmit, coinsToRetain: previousCoins })
    return {
      outputsToAdmit,
      coinsToRetain: previousCoins
    }
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
      name: 'YearBook Topic Manager',
      shortDescription: 'On-chain yearbooks that anyone can sign.'
    }
  }
}
