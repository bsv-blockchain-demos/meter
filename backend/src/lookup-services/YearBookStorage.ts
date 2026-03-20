import { Collection, Db } from 'mongodb'
import { YearBookRecord, UTXOReference } from '../types.js'

export class YearBookStorage {
  private readonly records: Collection<YearBookRecord>

  constructor (private readonly db: Db) {
    this.records = db.collection<YearBookRecord>('YearBookRecords')
  }

  async storeRecord (txid: string, outputIndex: number, creatorIdentityKey: string, entryCount: number): Promise<void> {
    await this.records.insertOne({
      txid,
      outputIndex,
      creatorIdentityKey,
      entryCount,
      createdAt: new Date()
    })
  }

  async deleteRecord (txid: string, outputIndex: number): Promise<void> {
    await this.records.deleteOne({ txid, outputIndex })
  }

  async findAll (): Promise<UTXOReference[]> {
    return await this.records.find({})
      .project<UTXOReference>({ txid: 1, outputIndex: 1 })
      .toArray()
      .then(results => results.map(record => ({
        txid: record.txid,
        outputIndex: record.outputIndex
      })))
  }
}
