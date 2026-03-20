export interface YearBookRecord {
  txid: string
  outputIndex: number
  creatorIdentityKey: string
  entryCount: number
  createdAt: Date
}

export interface UTXOReference {
  txid: string
  outputIndex: number
}
