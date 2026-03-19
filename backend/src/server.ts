import OverlayExpress from '@bsv/overlay-express'
import MeterTopicManager from './topic-managers/MeterTopicManager.js'
import MeterLookupServiceFactory from './lookup-services/MeterLookupServiceFactory.js'

const PORT = Number(process.env.PORT ?? 3001)
const MONGO_URL = process.env.MONGO_URL ?? 'mongodb://localhost:27017'
const SERVER_PRIVATE_KEY = process.env.SERVER_PRIVATE_KEY ?? '0000000000000000000000000000000000000000000000000000000000000001'
const HOSTING_DOMAIN = process.env.HOSTING_DOMAIN ?? 'localhost'

async function main () {
  const server = new OverlayExpress('meter', SERVER_PRIVATE_KEY, HOSTING_DOMAIN)

  server.configurePort(PORT)
  server.configureNetwork(process.env.BSV_NETWORK === 'test' ? 'test' : 'main')

  await server.configureMongo(MONGO_URL)

  server.configureTopicManager('tm_meter', new MeterTopicManager())
  server.configureLookupServiceWithMongo('ls_meter', (db) => MeterLookupServiceFactory(db))

  await server.start()
  console.log(`Meter overlay service listening on port ${PORT}`)
}

main().catch(err => {
  console.error('Failed to start server:', err)
  process.exit(1)
})
