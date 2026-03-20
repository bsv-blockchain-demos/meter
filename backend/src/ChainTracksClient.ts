import type { ChainTracker } from '@bsv/sdk'

/**
 * ChainTracker implementation backed by a ChainTracks server.
 */
export default class ChainTracksClient implements ChainTracker {
  private readonly baseUrl: string

  constructor (baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '')
  }

  async isValidRootForHeight (root: string, height: number): Promise<boolean> {
    const res = await fetch(`${this.baseUrl}/v2/header/height/${height}`)
    if (!res.ok) return false
    const header = await res.json()
    return header.merkleRoot === root
  }

  async currentHeight (): Promise<number> {
    const res = await fetch(`${this.baseUrl}/v2/tip`)
    if (!res.ok) throw new Error(`ChainTracks request failed: ${res.status}`)
    const info = await res.json()
    return info.height ?? 0
  }
}
