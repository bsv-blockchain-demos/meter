import OverlayExpress from '@bsv/overlay-express'
import { ARC } from '@bsv/sdk'
import YearBookTopicManager from './topic-managers/YearBookTopicManager.js'
import YearBookLookupServiceFactory from './lookup-services/YearBookLookupServiceFactory.js'
import ChainTracksClient from './ChainTracksClient.js'

const PORT = Number(process.env.PORT ?? 8080)
const MONGO_URL = process.env.MONGO_URL ?? 'mongodb://localhost:27017'
const SERVER_PRIVATE_KEY = process.env.SERVER_PRIVATE_KEY ?? '0000000000000000000000000000000000000000000000000000000000000001'
const HOSTING_DOMAIN = process.env.HOSTING_DOMAIN ?? 'localhost'
const ARC_URL = process.env.ARC_URL ?? 'https://arcade-us-1.bsvb.tech'
const CHAINTRACKS_URL = process.env.CHAINTRACKS_URL ?? 'https://arcade-us-1.bsvb.tech/chaintracks'
const ENABLE_GASP_SYNC = process.env.ENABLE_GASP_SYNC === 'true'

async function main () {
  const server = new OverlayExpress('yearbook', SERVER_PRIVATE_KEY, HOSTING_DOMAIN)

  server.configurePort(PORT)
  server.configureNetwork(process.env.BSV_NETWORK === 'test' ? 'test' : 'main')
  server.configureChainTracker(new ChainTracksClient(CHAINTRACKS_URL))

  await server.configureKnex(process.env.KNEX_URL ?? 'mysql://root:example@localhost:3306/yearbook')
  await server.configureMongo(MONGO_URL)

  server.configureTopicManager('tm_yearbook', new YearBookTopicManager())
  server.configureLookupServiceWithMongo('ls_yearbook', (db) => YearBookLookupServiceFactory(db))

  server.configureEngineParams({
    broadcaster: new ARC(ARC_URL),
    syncConfiguration: {},
    suppressDefaultSyncAdvertisements: true
  })

  await server.configureEngine(false)
  await server.start()
  console.log(`YearBook overlay service listening on port ${PORT}`)
  console.log('[Server] config:', { MONGO_URL, HOSTING_DOMAIN, ARC_URL, CHAINTRACKS_URL, ENABLE_GASP_SYNC, network: process.env.BSV_NETWORK === 'test' ? 'test' : 'main' })
}

main().catch(err => {
  console.error('Failed to start server:', err)
  process.exit(1)
})
