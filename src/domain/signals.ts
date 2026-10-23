import type { Candle } from './market'
import type { Strategy } from './strategy'
import { createStrategyEvaluator } from './strategyEvaluator'

export type TradingSignal = {
  id: string
  strategyId: string
  strategyName: string
  strategyVersion: number
  symbol: string
  timeframe: string
  direction: 'entry' | 'exit'
  candleTime: number
  price: number
  source: 'binance-public'
  detectedAt: number
}

export function evaluateStrategySignal(symbol: string, timeframe: string, candles: Candle[], strategy: Strategy): { signal: TradingSignal | null; errors: string[] } {
  if (!candles.length) return { signal: null, errors: ['No completed candles are available for signal evaluation.'] }
  const evaluator = createStrategyEvaluator(candles, strategy)
  const index = candles.length - 1
  const evaluation = evaluator.evaluate(index)
  const errors = [...evaluator.errors, ...evaluation.errors]
  if (errors.length) return { signal: null, errors }
  const direction = evaluation.entry ? 'entry' : evaluation.exit ? 'exit' : null
  if (!direction) return { signal: null, errors: [] }
  const candle = candles[index]
  return {
    signal: {
      id: `${strategy.id}:${strategy.version}:${symbol}:${timeframe}:${direction}:${candle.time}`,
      strategyId: strategy.id,
      strategyName: strategy.name,
      strategyVersion: strategy.version,
      symbol,
      timeframe,
      direction,
      candleTime: candle.time,
      price: candle.close,
      source: 'binance-public',
      detectedAt: Date.now(),
    },
    errors: [],
  }
}

export const loadSignals = (): TradingSignal[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem('vectoris.signals') ?? '[]') as TradingSignal[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export const saveSignals = (signals: TradingSignal[]) => {
  try {
    localStorage.setItem('vectoris.signals', JSON.stringify(signals.slice(0, 100)))
  } catch {
    // Local persistence is optional in browser private mode.
  }
}
