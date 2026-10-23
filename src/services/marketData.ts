import { validateCandles, type Candle, type MarketDataResult, type MarketTicker } from '../domain/market'
import { symbolToBinance } from '../domain/market'

const API = 'https://api.binance.com/api/v3'
const CACHE_PREFIX = 'vectoris.market.'
const CACHE_TTL = 60_000
let lastRequestAt = 0
const intervalMilliseconds: Record<string, number> = { '1m': 60_000, '3m': 180_000, '5m': 300_000, '15m': 900_000, '30m': 1_800_000, '1h': 3_600_000, '2h': 7_200_000, '4h': 14_400_000, '6h': 21_600_000, '8h': 28_800_000, '12h': 43_200_000, '1d': 86_400_000, '3d': 259_200_000, '1w': 604_800_000 }

const waitForThrottle = async (signal?: AbortSignal) => {
  const wait = Math.max(0, 250 - (Date.now() - lastRequestAt))
  if (wait) await new Promise<void>((resolve, reject) => {
    const timeout = globalThis.setTimeout(resolve, wait)
    signal?.addEventListener('abort', () => { globalThis.clearTimeout(timeout); reject(new DOMException('Request cancelled.', 'AbortError')) }, { once: true })
  })
  lastRequestAt = Date.now()
}

async function request<T>(path: string, signal?: AbortSignal, attempt = 0): Promise<T> {
  await waitForThrottle(signal)
  const controller = new AbortController()
  const timeout = globalThis.setTimeout(() => controller.abort(), 8_000)
  const cancel = () => controller.abort()
  signal?.addEventListener('abort', cancel, { once: true })
  try {
    const response = await fetch(`${API}${path}`, { signal: controller.signal })
    if (!response.ok) throw new Error(`Market data request failed (${response.status}).`)
    return await response.json() as T
  } catch (error) {
    if (signal?.aborted) throw error
    if (attempt < 2) {
      await new Promise((resolve) => globalThis.setTimeout(resolve, 350 * (attempt + 1)))
      return request<T>(path, signal, attempt + 1)
    }
    throw error
  } finally {
    globalThis.clearTimeout(timeout)
    signal?.removeEventListener('abort', cancel)
  }
}

function cached<T>(key: string): T | null {
  try {
    const item = JSON.parse(localStorage.getItem(CACHE_PREFIX + key) ?? 'null') as { savedAt: number; value: T } | null
    return item && Date.now() - item.savedAt < CACHE_TTL * 10 ? item.value : null
  } catch { return null }
}

function saveCache<T>(key: string, value: T) {
  try { localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ savedAt: Date.now(), value })) } catch { /* storage is optional */ }
}

export async function getTicker(symbol: string, signal?: AbortSignal): Promise<MarketDataResult<MarketTicker>> {
  const normalized = symbolToBinance(symbol)
  try {
    const result = await request<{ symbol: string; lastPrice: string; priceChangePercent: string; quoteVolume: string; closeTime: number }>(`/ticker/24hr?symbol=${normalized}`, signal)
    if (result.symbol !== normalized || ![result.lastPrice, result.priceChangePercent, result.quoteVolume, result.closeTime].every((value) => value !== undefined && Number.isFinite(Number(value)))) throw new Error('Market ticker response failed validation.')
    const data = { symbol: result.symbol, price: Number(result.lastPrice), change24h: Number(result.priceChangePercent), volume24h: Number(result.quoteVolume), timestamp: result.closeTime }
    saveCache(`ticker.${normalized}`, data)
    return { data, state: 'ready', source: 'binance-public', updatedAt: Date.now() }
  } catch (error) {
    const fallback = cached<MarketTicker>(`ticker.${normalized}`)
    return { data: fallback, state: fallback ? 'stale' : 'error', source: fallback ? 'cache' : 'demonstration', updatedAt: fallback?.timestamp ?? null, error: error instanceof Error ? error.message : 'Unknown market data error.' }
  }
}

export async function getCandles(symbol: string, interval = '4h', limit = 500, signal?: AbortSignal): Promise<MarketDataResult<Candle[]>> {
  const normalized = symbolToBinance(symbol)
  try {
    const result = await request<Array<[number, string, string, string, string, string, number]>>(`/klines?symbol=${normalized}&interval=${interval}&limit=${Math.min(limit, 1000)}`, signal)
    const data = result
      .filter(([, , , , , , closeTime]) => closeTime <= Date.now())
      .map(([time, open, high, low, close, volume]) => ({ time, open: Number(open), high: Number(high), low: Number(low), close: Number(close), volume: Number(volume) }))
    const validationErrors = validateCandles(data, intervalMilliseconds[interval])
    if (validationErrors.length) throw new Error(`Candle response failed validation: ${validationErrors[0]}`)
    saveCache(`candles.${normalized}.${interval}`, data)
    return { data, state: 'ready', source: 'binance-public', updatedAt: Date.now() }
  } catch (error) {
    const fallback = cached<Candle[]>(`candles.${normalized}.${interval}`)
    return { data: fallback, state: fallback ? 'stale' : 'error', source: fallback ? 'cache' : 'demonstration', updatedAt: fallback ? fallback[fallback.length - 1]?.time ?? null : null, error: error instanceof Error ? error.message : 'Unknown market data error.' }
  }
}
