import type { Candle } from './market'

export type PaperPosition = { symbol: string; quantity: number; averagePrice: number; openedAt: number }
export type PaperTrade = { id: string; symbol: string; side: 'buy' | 'sell'; quantity: number; price: number; fee: number; timestamp: number }
export type PaperAccount = { cash: number; startingCash: number; realizedPnl: number; positions: PaperPosition[]; trades: PaperTrade[] }

export const createPaperAccount = (cash = 100000): PaperAccount => ({ cash, startingCash: cash, realizedPnl: 0, positions: [], trades: [] })

export function executePaperTrade(account: PaperAccount, symbol: string, side: 'buy' | 'sell', quantity: number, price: number, feeRate = 0.001, timestamp = Date.now()): PaperAccount {
  if (![quantity, price, feeRate].every(Number.isFinite) || quantity <= 0 || price <= 0 || feeRate < 0) throw new Error('Quantity, price, and fee rate must be valid non-negative numbers.')
  const fee = quantity * price * feeRate
  const positions = account.positions.map((item) => ({ ...item }))
  const trades = [...account.trades]
  const next: PaperAccount = { ...account, positions, trades, realizedPnl: account.realizedPnl ?? 0 }
  const position = positions.find((item) => item.symbol === symbol)
  if (side === 'buy') {
    const total = quantity * price + fee
    if (total > next.cash) throw new Error('Insufficient virtual cash.')
    next.cash -= total
    if (position) {
      const totalQuantity = position.quantity + quantity
      position.averagePrice = ((position.averagePrice * position.quantity) + price * quantity) / totalQuantity
      position.quantity = totalQuantity
    } else positions.push({ symbol, quantity, averagePrice: price, openedAt: timestamp })
  } else {
    if (!position || position.quantity < quantity) throw new Error('Insufficient virtual position.')
    next.cash += quantity * price - fee
    next.realizedPnl += (price - position.averagePrice) * quantity - fee
    position.quantity -= quantity
    if (position.quantity === 0) next.positions = positions.filter((item) => item !== position)
  }
  next.trades.push({ id: crypto.randomUUID(), symbol, side, quantity, price, fee, timestamp })
  return next
}

export const unrealizedPnl = (account: PaperAccount, prices: Record<string, number>) =>
  account.positions.reduce((sum, position) => {
    const mark = prices[position.symbol]
    return Number.isFinite(mark) ? sum + (mark - position.averagePrice) * position.quantity : sum
  }, 0)
