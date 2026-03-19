import { StatefulSmartContract, assert } from 'runar-lang'

export class Counter extends StatefulSmartContract {
  count: bigint
  creatorIdentityKey: ByteString
  creatorSignature: ByteString

  constructor(count: bigint, creatorIdentityKey: ByteString, creatorSignature: ByteString) {
    super(count, creatorIdentityKey, creatorSignature)
    this.count = count
    this.creatorIdentityKey = creatorIdentityKey
    this.creatorSignature = creatorSignature
  }

  public increment() {
    this.count++
  }

  public decrement() {
    assert(this.count > 0n)
    this.count--
  }
}
