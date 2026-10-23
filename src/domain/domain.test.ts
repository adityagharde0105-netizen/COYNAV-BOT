import { describe, expect, it } from 'vitest'
import { ema, macd, relativeVolume, rsi, sma, volatility } from './indicators'
import { runBacktest } from './backtest'
import { createPaperAccount, executePaperTrade, loadPaperAccount, unrealizedPnl } from './paperTrading'
import { calculateRisk } from './risk'
import { defaultStrategy, validateStrategy } from './strategy'
import { validateCandles, type Candle } from './market'
import { createStrategyEvaluator, validateStrategyForBacktest } from './strategyEvaluator'
import { evaluateStrategySignal } from './signals'

const candles: Candle[] = Array.from({ length: 80 }, (_, index) => {
  const close = 100 + index * 0.8 + Math.sin(index / 4) * 2
  return { time: index * 3_600_000, open: close - 0.4, high: close + 1, low: close - 1, close, volume: 1000 + index * 10 }
})

describe('indicators', () => {
  it('calculates a seeded SMA/EMA window without look-ahead values', () => {
    expect(sma([1, 2, 3, 4, 5], 3).slice(0, 2).every(Number.isNaN)).toBe(true)
    expect(sma([1, 2, 3, 4, 5], 3)[2]).toBe(2)
    expect(ema([1, 2, 3, 4, 5], 3).slice(0, 2).every(Number.isNaN)).toBe(true)
    expect(ema([1, 2, 3, 4, 5], 3)[2]).toBe(2)
  })
  it('returns bounded RSI values and MACD arrays', () => {
    const values = candles.map((candle) => candle.close)
    const valuesRsi = rsi(values)
    expect(valuesRsi.slice(14).every((value) => value >= 0 && value <= 100)).toBe(true)
    expect(macd(values).line).toHaveLength(values.length)
    expect(relativeVolume(candles)[20]).toBeGreaterThan(0)
    expect(volatility(candles)[19]).toBeNaN()
  })
  it('matches the canonical Wilder RSI reference value', () => {
    const values = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46, 46.03, 46.41, 46.22, 45.64, 46.21]
    expect(rsi(values, 14)[14]).toBeCloseTo(70.464, 3)
  })
  it('does not bias MACD signal initialization with pre-valid zeros', () => {
    const result = macd(Array.from({ length: 40 }, (_, index) => index + 1))
    expect(result.signal.slice(0, 33).every(Number.isNaN)).toBe(true)
    expect(result.signal[34]).toBeCloseTo(7, 6)
  })
})

describe('risk and strategy validation', () => {
  it('calculates position size from account risk and stop distance', () => {
    const result = calculateRisk({ accountBalance: 100000, riskPercent: 1, entryPrice: 100, stopPrice: 95, targetPrice: 110 })
    expect(result.riskAmount).toBe(1000)
    expect(result.positionSize).toBe(200)
    expect(result.rewardRisk).toBe(2)
    expect(calculateRisk({ accountBalance: 1000, riskPercent: 1, entryPrice: 100, stopPrice: 100 }).warnings).toContain('Entry and stop prices must differ.')
  })
  it('rejects incomplete or contradictory strategies', () => {
    const strategy = defaultStrategy()
    expect(validateStrategy({ ...strategy, name: '', takeProfitPercent: 1, stopLossPercent: 2 })).toHaveLength(2)
  })
  it('evaluates every builder indicator and AND/OR groups', () => {
    const strategy = {
      ...defaultStrategy(),
      entry: {
        operator: 'AND' as const,
        conditions: [
          { id: 'ema', indicator: 'ema' as const, period: 3, comparison: 'above' as const, value: 0 },
          { id: 'rsi', indicator: 'rsi' as const, period: 2, comparison: 'above' as const, value: 50 },
          { id: 'macd', indicator: 'macd' as const, comparison: 'above' as const, value: 'signal' },
          { id: 'volume', indicator: 'volume' as const, period: 2, comparison: 'above' as const, value: 0 },
        ],
      },
      exit: { operator: 'OR' as const, conditions: [{ id: 'exit', indicator: 'ema' as const, period: 3, comparison: 'below' as const, value: 0 }] },
    }
    const evaluator = createStrategyEvaluator(candles, strategy)
    expect(evaluator.errors).toHaveLength(0)
    expect(evaluator.evaluate(79).entry).toBe(true)
    expect(evaluator.evaluate(79).exit).toBe(false)
    expect(validateStrategyForBacktest(candles, strategy)).toHaveLength(0)
  })
  it('rejects unsupported condition references', () => {
    const strategy = defaultStrategy()
    strategy.entry.conditions[0].value = 'futureClose'
    expect(validateStrategy(strategy).some((error) => error.includes('unsupported'))).toBe(true)
    expect(validateStrategyForBacktest(candles, strategy).some((error) => error.includes('Unsupported'))).toBe(true)
  })
  it('accepts numeric string thresholds from persisted builder state', () => {
    const strategy = {
      ...defaultStrategy(),
      entry: { operator: 'AND' as const, conditions: [{ id: 'sma', indicator: 'sma' as const, period: 3, comparison: 'above' as const, value: '0' }] },
      exit: { operator: 'AND' as const, conditions: [{ id: 'rsi', indicator: 'rsi' as const, period: 2, comparison: 'below' as const, value: '101' }] },
    }
    const evaluator = createStrategyEvaluator(candles, strategy)
    expect(evaluator.errors).toHaveLength(0)
    expect(evaluator.evaluate(79).entry).toBe(true)
    expect(validateStrategy(strategy)).toHaveLength(0)
  })
})

describe('backtest and paper accounting', () => {
  it('produces reproducible trade metrics with assumptions', () => {
    const result = runBacktest(candles, defaultStrategy(), 10000)
    expect(result.assumptions.fees).toBe(0.001)
    expect(result.equityCurve.length).toBe(candles.length - 1)
    expect(result.totalTrades).toBeGreaterThanOrEqual(0)
    expect(result.assumptions.intrabarCollision).toBe('stop-loss-first')
    expect(runBacktest([{ ...candles[0], time: 2 }, { ...candles[1], time: 1 }], defaultStrategy()).warnings.length).toBeGreaterThan(0)
  })
  it('uses the saved custom strategy instead of the starter rule', () => {
    const custom = {
      ...defaultStrategy(),
      name: 'Always-on test',
      entry: { operator: 'AND' as const, conditions: [{ id: 'entry', indicator: 'ema' as const, period: 2, comparison: 'above' as const, value: 0 }] },
      exit: { operator: 'AND' as const, conditions: [{ id: 'exit', indicator: 'ema' as const, period: 2, comparison: 'below' as const, value: 0 }] },
    }
    const customResult = runBacktest(candles, custom, 10000, 0, 0)
    const starterResult = runBacktest(candles, defaultStrategy(), 10000, 0, 0)
    expect(customResult.totalTrades).toBeGreaterThan(0)
    expect(customResult.assumptions.strategyName).toBe('Always-on test')
    expect(customResult.totalTrades).not.toBe(starterResult.totalTrades)
  })
  it('creates a deduplicable signal from the saved strategy and completed candle', () => {
    const custom = {
      ...defaultStrategy(),
      id: 'saved-strategy',
      name: 'Signal test',
      version: 3,
      entry: { operator: 'AND' as const, conditions: [{ id: 'entry', indicator: 'ema' as const, period: 2, comparison: 'above' as const, value: 0 }] },
      exit: { operator: 'AND' as const, conditions: [{ id: 'exit', indicator: 'ema' as const, period: 2, comparison: 'below' as const, value: 0 }] },
    }
    const result = evaluateStrategySignal('BTC/USDT', '4h', candles, custom)
    expect(result.errors).toHaveLength(0)
    expect(result.signal).toMatchObject({
      id: 'saved-strategy:3:BTC/USDT:4h:entry:284400000',
      strategyName: 'Signal test',
      source: 'binance-public',
      price: candles[candles.length - 1].close,
    })
  })
  it('tracks paper cash, positions, fees, and unrealized pnl', () => {
    let account = createPaperAccount(1000)
    account = executePaperTrade(account, 'BTC/USDT', 'buy', 0.01, 100)
    expect(account.positions[0].quantity).toBe(0.01)
    expect(account.cash).toBeLessThan(999)
    expect(unrealizedPnl(account, { 'BTC/USDT': 110 })).toBe(0.1)
    account = executePaperTrade(account, 'BTC/USDT', 'sell', 0.01, 110)
    expect(account.positions).toHaveLength(0)
    expect(account.trades).toHaveLength(2)
    expect(account.realizedPnl).toBeCloseTo(0.0989, 4)
    expect(unrealizedPnl(account, {})).toBe(0)
  })
})

describe('market data validation', () => {
  it('rejects non-monotonic and invalid OHLCV candles', () => {
    expect(validateCandles([{ time: 2, open: 10, high: 9, low: 8, close: 10, volume: 1 }, { time: 1, open: 10, high: 11, low: 9, close: 10, volume: 1 }])).toEqual([
      'Candle 0 has invalid OHLCV bounds.',
      'Candle 1 is not strictly after the previous candle.',
    ])
    expect(validateCandles([
      { time: 0, open: 10, high: 11, low: 9, close: 10, volume: 1 },
      { time: 3_600_000 * 2, open: 10, high: 11, low: 9, close: 10, volume: 1 },
    ], 3_600_000)).toContain('Candle 1 is not contiguous with the expected interval.')
  })
  it('recovers safely from invalid persisted paper state', () => {
    const account = loadPaperAccount(JSON.stringify({ cash: -10, startingCash: 1000, realizedPnl: 0, positions: [], trades: [] }))
    expect(account).toEqual(createPaperAccount())
  })
})
