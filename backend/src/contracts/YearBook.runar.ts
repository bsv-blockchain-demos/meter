import { StatefulSmartContract, assert, checkSig, type Sig, type PubKey, type ByteString } from 'runar-lang'

export class YearBook extends StatefulSmartContract {
  readonly creatorIdentityKey: PubKey
  friend1: ByteString = "" as ByteString
  friend2: ByteString = "" as ByteString
  friend3: ByteString = "" as ByteString
  friend4: ByteString = "" as ByteString
  friend5: ByteString = "" as ByteString
  friend6: ByteString = "" as ByteString
  friend7: ByteString = "" as ByteString
  friend8: ByteString = "" as ByteString
  friend9: ByteString = "" as ByteString
  friend10: ByteString = "" as ByteString


  constructor (creatorIdentityKey: PubKey) {
    super(creatorIdentityKey)
    this.creatorIdentityKey = creatorIdentityKey
  }

  public sign (message: ByteString, publicKey: PubKey, signature: Sig) {
    assert(checkSig(signature, publicKey))
    if (this.friend1 === '') {
      this.friend1 = message
    } else if (this.friend2 === '') {
      this.friend2 = message
    } else if (this.friend3 === '') {
      this.friend3 = message
    } else if (this.friend4 === '') {
      this.friend4 = message
    } else if (this.friend5 === '') {
      this.friend5 = message
    } else if (this.friend6 === '') {
      this.friend6 = message
    } else if (this.friend7 === '') {
      this.friend7 = message
    } else if (this.friend8 === '') {
      this.friend8 = message
    } else if (this.friend9 === '') {
      this.friend9 = message
    } else if (this.friend10 === '') {
      this.friend10 = message
    } else {
      assert(false, 'Year book is full')
    }
  }

  public burn (signature: Sig) {
    assert(checkSig(signature, this.creatorIdentityKey))
  }
}
