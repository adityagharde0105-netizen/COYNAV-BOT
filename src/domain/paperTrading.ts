import type { Candle } from './market'

export type PaperPosition = { symbol: string; quantity: number; averagePrice: number; openedAt: number }
export type PaperTrade = { id: string; symbol: string; side: 'buy' | 'sell'; quantity: number; price: number; fee: number; timestamp: number }
export type PaperAccount = { cash: number; startingCash: number; realizedPnl: number; positions: PaperPosition[]; trades: PaperTrade[] }

export const createPaperAccount = (cash = 100000): PaperAccount => ({ cash, startingCash: cash, realizedPnl: 0, positions: [], trades: [] })

export function loadPaperAccount(raw: string | null): PaperAccount {
  if (!raw) return createPaperAccount()
  try {
    const parsed = JSON.parse(raw) as Partial<PaperAccount>
    const { cash, startingCash, realizedPnl, positions: rawPositions, trades: rawTrades } = parsed
    if (typeof cash !== 'number' || !Number.isFinite(cash) || typeof startingCash !== 'number' || !Number.isFinite(startingCash) || typeof realizedPnl !== 'number' || !Number.isFinite(realizedPnl) || !Array.isArray(rawPositions) || !Array.isArray(rawTrades)) return createPaperAccount()
    const positions = rawPositions.every((position) => typeof position.symbol === 'string' && Number.isFinite(position.quantity) && position.quantity > 0 && Number.isFinite(position.averagePrice) && position.averagePrice > 0 && Number.isFinite(position.openedAt))
    const trades = rawTrades.every((trade) => typeof trade.id === 'string' && typeof trade.symbol === 'string' && (trade.side === 'buy' || trade.side === 'sell') && Number.isFinite(trade.quantity) && trade.quantity > 0 && Number.isFinite(trade.price) && trade.price > 0 && Number.isFinite(trade.fee) && trade.fee >= 0 && Number.isFinite(trade.timestamp))
    if (!positions || !trades || cash < 0 || startingCash <= 0) return createPaperAccount()
    return { cash, startingCash, realizedPnl, positions: rawPositions, trades: rawTrades }
  } catch {
    return createPaperAccount()
  }
}

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
