import { StatefulSmartContract, assert, checkSig, type Sig, type PubKey, type ByteString, FixedArray } from 'runar-lang'

export class YearBook extends StatefulSmartContract {
  readonly creatorIdentityKey: PubKey
  entries: FixedArray<ByteString, 30>

  constructor (creatorIdentityKey: PubKey, entryCount: bigint) {
    super(creatorIdentityKey, entryCount)
    this.creatorIdentityKey = creatorIdentityKey
    this.entries = ['','','','','','','','','','','','','','','','','','','','','','','','','','','','','',''] as FixedArray<ByteString, 30>
  }

  public sign (message: ByteString, publicKey: PubKey, signature: Sig) {
    assert(checkSig(signature, publicKey))
    let done = false
    for (let i = 0; i < 30; i++) {
      if (this.entries[i] === '' && !done) {
        this.entries[i] = message
        done = true
      }
    }
  }

  public burn (signature: Sig) {
    assert(checkSig(signature, this.creatorIdentityKey))
  }
}
