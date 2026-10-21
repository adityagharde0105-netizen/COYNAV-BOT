import type { Candle } from './market'

export const sma = (values: number[], period: number): number[] =>
  values.map((_, index) => index + 1 < period || period <= 0 || values.slice(index + 1 - period, index + 1).some((value) => !Number.isFinite(value)) ? NaN : values.slice(index + 1 - period, index + 1).reduce((sum, value) => sum + value, 0) / period)

export const ema = (values: number[], period: number): number[] => {
  if (!values.length || period <= 0) return values.map(() => NaN)
  const multiplier = 2 / (period + 1)
  const result = values.map(() => NaN)
  if (values.length < period) return result
  if (values.slice(0, period).some((value) => !Number.isFinite(value))) return result
  result[period - 1] = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period
  for (let index = period; index < values.length; index += 1) {
    if (!Number.isFinite(values[index])) continue
    if (!Number.isFinite(result[index - 1])) {
      result[index] = values[index]
      continue
    }
    result[index] = (values[index] - result[index - 1]) * multiplier + result[index - 1]
  }
  return result
}

export const rsi = (values: number[], period = 14): number[] => {
  const result = values.map(() => NaN)
  if (values.length <= period || period <= 0) return result
  let gains = 0
  let losses = 0
  for (let index = 1; index <= period; index += 1) {
    if (!Number.isFinite(values[index]) || !Number.isFinite(values[index - 1])) return result
    const change = values[index] - values[index - 1]
    gains += Math.max(change, 0)
    losses += Math.max(-change, 0)
  }
  let averageGain = gains / period
  let averageLoss = losses / period
  result[period] = averageLoss === 0 ? 100 : 100 - 100 / (1 + averageGain / averageLoss)
  for (let index = period + 1; index < values.length; index += 1) {
    if (!Number.isFinite(values[index]) || !Number.isFinite(values[index - 1])) {
      averageGain = 0
      averageLoss = 0
      continue
    }
    const change = values[index] - values[index - 1]
    averageGain = (averageGain * (period - 1) + Math.max(change, 0)) / period
    averageLoss = (averageLoss * (period - 1) + Math.max(-change, 0)) / period
    result[index] = averageLoss === 0 ? 100 : 100 - 100 / (1 + averageGain / averageLoss)
  }
  return result
}

export const macd = (values: number[], fast = 12, slow = 26, signal = 9) => {
  const fastEma = ema(values, fast)
  const slowEma = ema(values, slow)
  const line = values.map((_, index) => Number.isFinite(fastEma[index]) && Number.isFinite(slowEma[index]) ? fastEma[index] - slowEma[index] : NaN)
  const firstValid = line.findIndex(Number.isFinite)
  const signalLine = line.map(() => NaN)
  if (firstValid >= 0) {
    const calculated = ema(line.slice(firstValid).filter(Number.isFinite), signal)
    calculated.forEach((value, index) => { signalLine[firstValid + index] = value })
  }
  return { line, signal: signalLine, histogram: line.map((value, index) => Number.isFinite(value) && Number.isFinite(signalLine[index]) ? value - signalLine[index] : NaN) }
}

export const standardDeviation = (values: number[]): number => {
  if (!values.length) return 0
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length)
}

export const relativeVolume = (candles: Candle[], period = 20): number[] =>
  candles.map((candle, index) => {
    if (index < period || period <= 0) return NaN
    const average = candles.slice(index - period, index).reduce((sum, item) => sum + item.volume, 0) / period
    return average === 0 ? NaN : candle.volume / average
  })

export const volatility = (candles: Candle[], period = 20): number[] =>
  candles.map((_, index) => {
    if (index < period || period <= 0) return NaN
    const returns = candles.slice(index - period + 1, index + 1).map((item, offset) => {
      const previous = candles[index - period + offset]
      return Number.isFinite(item.close) && Number.isFinite(previous.close) && item.close > 0 && previous.close > 0 ? Math.log(item.close / previous.close) : NaN
    }).filter(Number.isFinite)
    if (returns.length < period) return NaN
    return standardDeviation(returns) * Math.sqrt(365)
  })
