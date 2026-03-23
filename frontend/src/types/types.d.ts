export interface Token {
  atomicBeefTX: HexString
  txid: TXIDHexString
  outputIndex: PositiveIntegerOrZero
  lockingScript: HexString
  satoshis: SatoshiValue
}

export interface YearBook {
  creatorIdentityKey: PubKeyHex
  friends: string[]
  token: Token
}
