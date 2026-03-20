import { StatefulSmartContract, type PubKey } from 'runar-lang'

export class YearBook extends StatefulSmartContract {
  creatorIdentityKey: PubKey
  entryCount: bigint

  constructor (creatorIdentityKey: PubKey, entryCount: bigint) {
    super(creatorIdentityKey, entryCount)
    this.creatorIdentityKey = creatorIdentityKey
    this.entryCount = entryCount
  }

  public sign () {
    this.entryCount++
  }
}
