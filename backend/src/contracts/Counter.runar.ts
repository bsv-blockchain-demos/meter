import { StatefulSmartContract, assert, type PubKey, type Sha256 } from 'runar-lang'

export class Counter extends StatefulSmartContract {
  count: bigint
  creatorIdentityKey: PubKey
  creatorSignature: Sha256

  constructor (count: bigint, creatorIdentityKey: PubKey, creatorSignature: Sha256) {
    super(count, creatorIdentityKey, creatorSignature)
    this.count = count
    this.creatorIdentityKey = creatorIdentityKey
    this.creatorSignature = creatorSignature
  }

  public increment () {
    this.count++
  }

  public decrement () {
    assert(this.count > 0n)
    this.count--
  }
}
