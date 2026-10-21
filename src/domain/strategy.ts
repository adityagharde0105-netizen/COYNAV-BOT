export type Comparison = 'above' | 'below' | 'crossesAbove' | 'crossesBelow'
export type StrategyCondition = { id: string; indicator: 'ema' | 'rsi' | 'macd' | 'volume'; period?: number; comparison: Comparison; value: number | string }
export type Strategy = {
  id: string
  name: string
  version: number
  entry: { operator: 'AND' | 'OR'; conditions: StrategyCondition[] }
  exit: { operator: 'AND' | 'OR'; conditions: StrategyCondition[] }
  stopLossPercent: number
  takeProfitPercent: number
  updatedAt: number
}

export const defaultStrategy = (): Strategy => ({
  id: crypto.randomUUID(),
  name: 'EMA momentum starter',
  version: 1,
  entry: { operator: 'AND', conditions: [{ id: crypto.randomUUID(), indicator: 'ema', period: 20, comparison: 'above', value: 'ema50' }, { id: crypto.randomUUID(), indicator: 'rsi', period: 14, comparison: 'above', value: 50 }] },
  exit: { operator: 'OR', conditions: [{ id: crypto.randomUUID(), indicator: 'ema', period: 20, comparison: 'below', value: 'ema50' }] },
  stopLossPercent: 2,
  takeProfitPercent: 6,
  updatedAt: Date.now(),
})

export const validateStrategy = (strategy: Strategy): string[] => {
  const errors: string[] = []
  if (!strategy.name.trim()) errors.push('Strategy name is required.')
  if (!strategy.entry.conditions.length) errors.push('Add at least one entry condition.')
  if (!strategy.exit.conditions.length) errors.push('Add at least one exit condition.')
  if (strategy.stopLossPercent <= 0) errors.push('Stop-loss must be greater than zero.')
  if (strategy.takeProfitPercent <= 0) errors.push('Take-profit must be greater than zero.')
  if (strategy.takeProfitPercent < strategy.stopLossPercent) errors.push('Take-profit should not be below stop-loss for this template.')
  for (const condition of [...strategy.entry.conditions, ...strategy.exit.conditions]) {
    if (condition.period !== undefined && (!Number.isInteger(condition.period) || condition.period <= 0)) errors.push(`${condition.indicator.toUpperCase()} period must be a positive integer.`)
    if (typeof condition.value === 'number' && !Number.isFinite(condition.value)) errors.push(`${condition.indicator.toUpperCase()} threshold must be finite.`)
    if (typeof condition.value === 'string') {
      const validReference = condition.indicator === 'macd' ? condition.value === 'signal' : condition.indicator === 'ema' ? /^ema\d+$/.test(condition.value) : false
      if (!validReference) errors.push(`${condition.indicator.toUpperCase()} condition reference "${condition.value}" is unsupported.`)
    }
  }
  return errors
}

export const loadStrategies = (): Strategy[] => {
  try { return JSON.parse(localStorage.getItem('vectoris.strategies') ?? '[]') as Strategy[] } catch { return [] }
}
export const saveStrategies = (strategies: Strategy[]) => localStorage.setItem('vectoris.strategies', JSON.stringify(strategies))
