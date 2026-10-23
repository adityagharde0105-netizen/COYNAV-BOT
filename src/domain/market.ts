export type Candle = {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export type MarketTicker = {
  symbol: string
  price: number
  change24h: number
  volume24h: number
  timestamp: number
}

export type DataState = 'idle' | 'loading' | 'ready' | 'stale' | 'error'

export type MarketDataResult<T> = {
  data: T | null
  state: DataState
  source: 'binance-public' | 'cache' | 'demonstration'
  updatedAt: number | null
  error?: string
}

export const symbolToBinance = (symbol: string) => symbol.replace(/[^A-Z0-9]/gi, '').toUpperCase()

export function validateCandles(candles: Candle[], intervalMs?: number): string[] {
  const errors: string[] = []
  if (intervalMs !== undefined && (!Number.isFinite(intervalMs) || intervalMs <= 0)) errors.push('Candle interval must be a positive finite number.')
  for (let index = 0; index < candles.length; index += 1) {
    const candle = candles[index]
    if (![candle.time, candle.open, candle.high, candle.low, candle.close, candle.volume].every(Number.isFinite)) {
      errors.push(`Candle ${index} contains a non-finite value.`)
      continue
    }
    if (candle.high < Math.max(candle.open, candle.close) || candle.low > Math.min(candle.open, candle.close) || candle.low > candle.high || candle.volume < 0) {
      errors.push(`Candle ${index} has invalid OHLCV bounds.`)
    }
    if (index > 0) {
      const difference = candle.time - candles[index - 1].time
      if (difference <= 0) errors.push(`Candle ${index} is not strictly after the previous candle.`)
      else if (intervalMs !== undefined && difference !== intervalMs) errors.push(`Candle ${index} is not contiguous with the expected interval.`)
    }
  }
  return errors
}
