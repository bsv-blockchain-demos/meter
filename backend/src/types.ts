export interface YearBookRecord {
  txid: string
  outputIndex: number
  creatorIdentityKey: string
  friends: string[]
  createdAt: Date
}

export interface UTXOReference {
  txid: string
  outputIndex: number
}
