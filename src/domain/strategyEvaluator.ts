import type { Candle } from './market'
import { ema, macd, relativeVolume, rsi } from './indicators'
import type { Strategy, StrategyCondition } from './strategy'

type Series = { values: number[]; minimum: number; name: string }
type Prepared = { series: Map<string, Series>; errors: string[] }

export type StrategyEvaluation = {
  entry: boolean
  exit: boolean
  entryConditions: boolean[]
  exitConditions: boolean[]
  errors: string[]
}

const finite = (value: number | undefined): value is number => value !== undefined && Number.isFinite(value)

function prepare(candles: Candle[], strategy: Strategy): Prepared {
  const closes = candles.map((candle) => candle.close)
  const series = new Map<string, Series>()
  const errors: string[] = []
  const add = (key: string, values: number[], minimum: number, name: string) => series.set(key, { values, minimum, name })
  const requestedEmaPeriods = new Set<number>()
  const requestedRsiPeriods = new Set<number>()
  const requestedVolumePeriods = new Set<number>()
  for (const condition of [...strategy.entry.conditions, ...strategy.exit.conditions]) {
    const period = condition.period
    if (condition.indicator === 'ema') requestedEmaPeriods.add(period ?? 0)
    if (condition.indicator === 'rsi') requestedRsiPeriods.add(period ?? 0)
    if (condition.indicator === 'volume') requestedVolumePeriods.add(period ?? 0)
    if (condition.indicator === 'ema' && typeof condition.value === 'string') {
      const reference = /^ema(\d+)$/.exec(condition.value)
      if (reference) requestedEmaPeriods.add(Number(reference[1]))
    }
    if (condition.indicator === 'macd' && period !== undefined && period <= 0) errors.push(`MACD period must be positive (condition ${condition.id}).`)
  }
  for (const period of requestedEmaPeriods) {
    if (period <= 0 || !Number.isInteger(period)) errors.push(`EMA period must be a positive integer (received ${period}).`)
    else add(`ema:${period}`, ema(closes, period), period, `EMA ${period}`)
  }
  for (const period of requestedRsiPeriods) {
    if (period <= 0 || !Number.isInteger(period)) errors.push(`RSI period must be a positive integer (received ${period}).`)
    else add(`rsi:${period}`, rsi(closes, period), period + 1, `RSI ${period}`)
  }
  for (const period of requestedVolumePeriods) {
    if (period <= 0 || !Number.isInteger(period)) errors.push(`Volume lookback must be a positive integer (received ${period}).`)
    else add(`volume:${period}`, relativeVolume(candles, period), period + 1, `Relative volume ${period}`)
  }
  const macdResult = macd(closes)
  add('macd', macdResult.line, 26, 'MACD')
  add('macd:signal', macdResult.signal, 26 + 9, 'MACD signal')
  for (const condition of [...strategy.entry.conditions, ...strategy.exit.conditions]) {
    if (condition.indicator === 'macd' && typeof condition.value === 'string' && condition.value !== 'signal') errors.push(`Unsupported MACD reference "${condition.value}" (use "signal").`)
    if (condition.indicator !== 'macd' && typeof condition.value === 'string' && !/^ema\d+$/.test(condition.value)) errors.push(`Unsupported ${condition.indicator} reference "${condition.value}".`)
  }
  return { series, errors }
}

function referenceValue(condition: StrategyCondition, index: number, prepared: Prepared): number | undefined {
  const primary = prepared.series.get(`${condition.indicator}:${condition.period ?? 14}`) ?? prepared.series.get(condition.indicator)
  if (!primary || index < primary.minimum || !finite(primary.values[index])) return undefined
  if (typeof condition.value === 'number') return condition.value
  if (condition.indicator === 'macd' && condition.value === 'signal') {
    const signal = prepared.series.get('macd:signal')
    return signal && finite(signal.values[index]) ? signal.values[index] : undefined
  }
  if (condition.indicator === 'ema') {
    const match = /^ema(\d+)$/.exec(condition.value)
    if (match) {
      const reference = prepared.series.get(`ema:${Number(match[1])}`)
      return reference && finite(reference.values[index]) ? reference.values[index] : undefined
    }
  }
  return undefined
}

function conditionResult(condition: StrategyCondition, index: number, prepared: Prepared): boolean | undefined {
  const primary = prepared.series.get(`${condition.indicator}:${condition.period ?? 14}`) ?? prepared.series.get(condition.indicator)
  const current = primary?.values[index]
  const previous = primary?.values[index - 1]
  const reference = referenceValue(condition, index, prepared)
  const previousReference = referenceValue(condition, index - 1, prepared)
  if (!finite(current) || !finite(reference)) return undefined
  if (condition.comparison === 'above') return current > reference
  if (condition.comparison === 'below') return current < reference
  if (!finite(previous) || !finite(previousReference)) return undefined
  if (condition.comparison === 'crossesAbove') return previous <= previousReference && current > reference
  return previous >= previousReference && current < reference
}

function groupResult(group: Strategy['entry'], index: number, prepared: Prepared): { value: boolean; values: boolean[]; errors: string[] } {
  const values = group.conditions.map((condition) => conditionResult(condition, index, prepared))
  const errors = values.map((value, conditionIndex) => value === undefined ? `Insufficient indicator history for ${group.conditions[conditionIndex].indicator} condition ${group.conditions[conditionIndex].id} at candle ${index}.` : '').filter(Boolean)
  const resolved = values.map((value) => value === true)
  return { value: group.operator === 'AND' ? values.every((value) => value === true) : values.some((value) => value === true), values: resolved, errors }
}

export function createStrategyEvaluator(candles: Candle[], strategy: Strategy) {
  const prepared = prepare(candles, strategy)
  return {
    errors: prepared.errors,
    evaluate(index: number): StrategyEvaluation {
      if (index < 0 || index >= candles.length) return { entry: false, exit: false, entryConditions: [], exitConditions: [], errors: ['Decision index is outside the candle dataset.'] }
      const entry = groupResult(strategy.entry, index, prepared)
      const exit = groupResult(strategy.exit, index, prepared)
      return { entry: entry.value, exit: exit.value, entryConditions: entry.values, exitConditions: exit.values, errors: [...entry.errors, ...exit.errors] }
    },
  }
}

export function validateStrategyForBacktest(candles: Candle[], strategy: Strategy): string[] {
  const evaluator = createStrategyEvaluator(candles, strategy)
  const errors = [...evaluator.errors]
  const warmup = Math.max(0, ...[...strategy.entry.conditions, ...strategy.exit.conditions].map((condition) => condition.indicator === 'macd' ? 35 : (condition.period ?? 14) + 1))
  if (candles.length <= warmup + 1) errors.push(`Insufficient historical data: this strategy needs more than ${warmup + 1} candles.`)
  return errors
}
