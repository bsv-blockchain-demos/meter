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
    try {
      const parsedTransaction = Transaction.fromBEEF(beef)

      for (const [i, output] of parsedTransaction.outputs.entries()) {
        try {
          const scriptHex = output.lockingScript.toHex()
          const state = extractStateFromScript(artifact, scriptHex)
          if (!state) continue

          // Valid YearBook output — has creatorIdentityKey (PubKey)
          // and friend fields for signature slots
          if (state.creatorIdentityKey) {
            outputsToAdmit.push(i)
          }
        } catch (error) {
          continue
        }
      }
    } catch (error) {
      const beefStr = JSON.stringify(beef, null, 2)
      throw new Error(
        `topicManager:Error:identifying admissible outputs:${error} beef:${beefStr}}`
      )
    }

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
