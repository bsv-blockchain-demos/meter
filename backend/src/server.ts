import { Engine } from '@bsv/overlay'
import { MongoClient } from 'mongodb'
import MeterTopicManager from './topic-managers/MeterTopicManager.js'
import MeterLookupServiceFactory from './lookup-services/MeterLookupServiceFactory.js'

const PORT = Number(process.env.PORT ?? 3001)
const MONGO_URL = process.env.MONGO_URL ?? 'mongodb://localhost:27017'

async function main() {
  const client = new MongoClient(MONGO_URL)
  await client.connect()
  const db = client.db('meter')

  const engine = new Engine({
    topicManagers: {
      tm_meter: new MeterTopicManager()
    },
    lookupServices: {
      ls_meter: MeterLookupServiceFactory(db)
    }
  })

  // The exact API depends on @bsv/overlay version — check docs for
  // Engine.startHTTP(), OverlayExpress, or similar. Adjust as needed.
  await engine.listen(PORT)
  console.log(`Meter overlay service listening on port ${PORT}`)
}

main().catch(err => {
  console.error('Failed to start server:', err)
  process.exit(1)
})
