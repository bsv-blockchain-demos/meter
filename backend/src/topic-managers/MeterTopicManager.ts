import { AdmittanceInstructions, TopicManager } from '@bsv/overlay'
import { Transaction, ProtoWallet, Utils } from '@bsv/sdk'
import { extractStateFromScript } from 'runar-sdk'
import type { RunarArtifact } from 'runar-sdk'
import docs from './MeterTopicDocs.md.js'
import counterArtifact from '../../artifacts/Counter.runar.json' with { type: 'json' }

const artifact = counterArtifact as unknown as RunarArtifact
const anyoneWallet = new ProtoWallet('anyone')

export default class MeterTopicManager implements TopicManager {
  async identifyAdmissibleOutputs(
    beef: number[],
    previousCoins: number[]
  ): Promise<AdmittanceInstructions> {
    const outputsToAdmit: number[] = []
    try {
      const parsedTransaction = Transaction.fromBEEF(beef)

      for (const [i, output] of parsedTransaction.outputs.entries()) {
        try {
          const scriptHex = output.lockingScript.toHex()

          // Try to extract state from the locking script using Runar
          const state = extractStateFromScript(artifact, scriptHex)
          if (!state) continue

          const creatorIdentityKey = state.creatorIdentityKey as string
          const creatorSignature = state.creatorSignature as string

          // Verify creator signature
          const verifyResult = await anyoneWallet.verifySignature({
            protocolID: [0, 'meter'],
            keyID: '1',
            counterparty: creatorIdentityKey,
            data: [1],
            signature: Utils.toArray(creatorSignature, 'hex')
          })

          if (verifyResult.valid !== true) {
            throw new Error('Signature invalid')
          }

          outputsToAdmit.push(i)
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
      name: 'Meter Topic Manager',
      shortDescription: 'Meters, up and down.'
    }
  }
}
