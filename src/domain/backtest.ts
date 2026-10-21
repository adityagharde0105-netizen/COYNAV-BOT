import type { Candle } from './market'
import { validateCandles } from './market'
import type { Strategy } from './strategy'
import { createStrategyEvaluator, validateStrategyForBacktest } from './strategyEvaluator'

export type BacktestTrade = { entryTime: number; exitTime: number; entry: number; exit: number; quantity: number; pnl: number; returnPercent: number; exitReason: 'stop-loss' | 'take-profit' | 'signal' | 'end-of-data' }
export type BacktestResult = { netReturn: number; maxDrawdown: number; winRate: number; profitFactor: number; totalTrades: number; equityCurve: Array<{ time: number; equity: number; drawdown: number }>; trades: BacktestTrade[]; warnings: string[]; assumptions: { fees: number; slippage: number; dataStart: number; dataEnd: number; strategyId: string; strategyName: string; strategyVersion: number; intrabarCollision: 'stop-loss-first' } }

export function runBacktest(candles: Candle[], strategy: Strategy, initialCapital = 100000, fees = 0.001, slippage = 0.0005): BacktestResult {
  let cash = initialCapital
  let quantity = 0
  let entry = 0
  let entryTime = 0
  let entryCost = 0
  const trades: BacktestTrade[] = []
  const equityCurve: BacktestResult['equityCurve'] = []
  const warnings = [...validateCandles(candles), ...validateStrategyForBacktest(candles, strategy)]
  if (candles.length < 52 || warnings.length > 0 || initialCapital <= 0 || fees < 0 || slippage < 0) {
    return { netReturn: 0, maxDrawdown: 0, winRate: 0, profitFactor: 0, totalTrades: 0, equityCurve: [], trades: [], warnings: warnings.length ? warnings : ['At least 52 valid candles and non-negative capital, fees, and slippage are required.'], assumptions: { fees, slippage, dataStart: candles[0]?.time ?? 0, dataEnd: candles[candles.length - 1]?.time ?? 0, strategyId: strategy.id, strategyName: strategy.name, strategyVersion: strategy.version, intrabarCollision: 'stop-loss-first' } }
  }
  let peak = initialCapital
  const evaluator = createStrategyEvaluator(candles, strategy)
  for (let index = 1; index < candles.length; index += 1) {
    const prevIndex = index - 1
    const price = candles[index].open
    const decision = evaluator.evaluate(prevIndex)
    const enter = quantity === 0 && decision.entry
    const stopPrice = entry * (1 - strategy.stopLossPercent / 100)
    const targetPrice = entry * (1 + strategy.takeProfitPercent / 100)
    const stop = quantity > 0 && candles[index].low <= stopPrice
    const target = quantity > 0 && candles[index].high >= targetPrice
    const signalExit = quantity > 0 && decision.exit
    const exit = stop || target || signalExit
    if (enter) {
      const fill = price * (1 + slippage)
      quantity = cash / (fill * (1 + fees))
      entryCost = quantity * fill * (1 + fees)
      cash -= entryCost
      entry = fill
      entryTime = candles[index].time
    } else if (exit) {
      const rawFill = stop ? stopPrice : target ? targetPrice : price
      const fill = rawFill * (1 - slippage)
      const proceeds = quantity * fill * (1 - fees)
      const pnl = proceeds - entryCost
      trades.push({ entryTime, exitTime: candles[index].time, entry, exit: fill, quantity, pnl, returnPercent: (pnl / entryCost) * 100, exitReason: stop ? 'stop-loss' : target ? 'take-profit' : 'signal' })
      cash += proceeds
      quantity = 0
      entry = 0
      entryCost = 0
    }
    const equity = cash + quantity * candles[index].close
    peak = Math.max(peak, equity)
    equityCurve.push({ time: candles[index].time, equity, drawdown: ((equity - peak) / peak) * 100 })
  }
  if (quantity > 0) {
    const price = candles[candles.length - 1].close * (1 - slippage)
    const proceeds = quantity * price * (1 - fees)
    const pnl = proceeds - entryCost
    trades.push({ entryTime, exitTime: candles[candles.length - 1].time, entry, exit: price, quantity, pnl, returnPercent: (pnl / entryCost) * 100, exitReason: 'end-of-data' })
    cash += proceeds
  }
  const netReturn = ((cash - initialCapital) / initialCapital) * 100
  const wins = trades.filter((trade) => trade.pnl > 0)
  const grossProfit = wins.reduce((sum, trade) => sum + trade.pnl, 0)
  const grossLoss = Math.abs(trades.filter((trade) => trade.pnl < 0).reduce((sum, trade) => sum + trade.pnl, 0))
  return { netReturn, maxDrawdown: Math.min(0, ...equityCurve.map((point) => point.drawdown)), winRate: trades.length ? (wins.length / trades.length) * 100 : 0, profitFactor: grossLoss ? grossProfit / grossLoss : grossProfit ? Infinity : 0, totalTrades: trades.length, equityCurve, trades, warnings, assumptions: { fees, slippage, dataStart: candles[0]?.time ?? 0, dataEnd: candles[candles.length - 1]?.time ?? 0, strategyId: strategy.id, strategyName: strategy.name, strategyVersion: strategy.version, intrabarCollision: 'stop-loss-first' } }
}
