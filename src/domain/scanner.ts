import type { Candle } from './market'
import { ema, macd, relativeVolume, rsi, volatility } from './indicators'

export type ScannerFilters = {
  minRsi?: number
  maxRsi?: number
  minRelativeVolume?: number
  trend?: 'bullish' | 'bearish' | 'any'
  breakout?: 'breakout' | 'breakdown' | 'any'
  minChangePercent?: number
}

export type ScanResult = {
  symbol: string
  timeframe: string
  close: number
  changePercent: number
  rsi: number
  relativeVolume: number
  volatility: number
  emaFast: number
  emaSlow: number
  macd: number
  macdSignal: number
  trend: 'bullish' | 'bearish'
  condition: string
  explanation: string
  timestamp: number
}

export function scanCandles(symbol: string, timeframe: string, candles: Candle[], filters: ScannerFilters = {}): ScanResult | null {
  if (candles.length < 50) return null
  const closes = candles.map((candle) => candle.close)
  const fast = ema(closes, 20)
  const slow = ema(closes, 50)
  const rsiValues = rsi(closes)
  const macdValues = macd(closes)
  const volumes = relativeVolume(candles)
  const volatilityValues = volatility(candles)
  const index = candles.length - 1
  const previous = candles[index - 1]
  const current = candles[index]
  const high20 = Math.max(...candles.slice(index - 20, index).map((candle) => candle.high))
  const low20 = Math.min(...candles.slice(index - 20, index).map((candle) => candle.low))
  const trend = fast[index] >= slow[index] ? 'bullish' : 'bearish'
  const isBreakout = current.close > high20
  const isBreakdown = current.close < low20
  const changePercent = ((current.close - candles[Math.max(0, index - 1)].close) / candles[Math.max(0, index - 1)].close) * 100
  const values = { rsi: rsiValues[index], relativeVolume: volumes[index], volatility: volatilityValues[index], trend, changePercent }
  if (filters.minRsi !== undefined && values.rsi < filters.minRsi) return null
  if (filters.maxRsi !== undefined && values.rsi > filters.maxRsi) return null
  if (filters.minRelativeVolume !== undefined && values.relativeVolume < filters.minRelativeVolume) return null
  if (filters.trend && filters.trend !== 'any' && values.trend !== filters.trend) return null
  if (filters.breakout === 'breakout' && !isBreakout) return null
  if (filters.breakout === 'breakdown' && !isBreakdown) return null
  if (filters.minChangePercent !== undefined && values.changePercent < filters.minChangePercent) return null
  const macdLine = macdValues.line[index]
  const signalLine = macdValues.signal[index]
  const condition = isBreakout ? '20-period breakout' : isBreakdown ? '20-period breakdown' : fast[index] > slow[index] ? 'EMA 20 > EMA 50' : 'EMA 20 < EMA 50'
  return {
    symbol,
    timeframe,
    close: current.close,
    changePercent,
    rsi: rsiValues[index],
    relativeVolume: volumes[index],
    volatility: volatilityValues[index],
    emaFast: fast[index],
    emaSlow: slow[index],
    macd: macdLine,
    macdSignal: signalLine,
    trend,
    condition,
    explanation: `${condition}; RSI ${rsiValues[index].toFixed(1)}, relative volume ${volumes[index].toFixed(2)}×, MACD ${macdLine >= signalLine ? 'above' : 'below'} signal.`,
    timestamp: current.time,
  }
}

