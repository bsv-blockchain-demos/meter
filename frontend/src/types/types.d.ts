export interface Token {
  atomicBeefTX: HexString
  txid: TXIDHexString
  outputIndex: PositiveIntegerOrZero
  lockingScript: HexString
  satoshis: SatoshiValue
}

export interface Meter {
  value: number
  token: Token
  creatorIdentityKey: PubKeyHex
}
