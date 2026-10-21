export type RiskInputs = {
  accountBalance: number
  riskPercent: number
  entryPrice: number
  stopPrice: number
  targetPrice?: number
  existingExposure?: number
  maxExposure?: number
}

export type RiskResult = {
  riskAmount: number
  stopDistance: number
  stopDistancePercent: number
  positionSize: number
  notionalValue: number
  rewardRisk: number | null
  exposurePercent: number
  warnings: string[]
}

export function calculateRisk(inputs: RiskInputs): RiskResult {
  const warnings: string[] = []
  const { accountBalance, riskPercent, entryPrice, stopPrice, targetPrice = 0, existingExposure = 0, maxExposure = 100 } = inputs
  const stopDistance = Math.abs(entryPrice - stopPrice)
  const riskAmount = accountBalance * (riskPercent / 100)
  const positionSize = stopDistance > 0 ? riskAmount / stopDistance : 0
  const notionalValue = positionSize * entryPrice
  const exposurePercent = accountBalance > 0 ? ((existingExposure + notionalValue) / accountBalance) * 100 : 0
  const rewardRisk = stopDistance > 0 && targetPrice > 0 ? Math.abs(targetPrice - entryPrice) / stopDistance : null
  if (accountBalance <= 0) warnings.push('Account balance must be greater than zero.')
  if (riskPercent <= 0 || riskPercent > 5) warnings.push('Risk per trade should be between 0.1% and 5%.')
  if (entryPrice <= 0 || stopPrice <= 0) warnings.push('Entry and stop prices must be greater than zero.')
  if (entryPrice === stopPrice) warnings.push('Entry and stop prices must differ.')
  if (exposurePercent > maxExposure) warnings.push(`This position would exceed the ${maxExposure}% exposure limit.`)
  if (targetPrice > 0 && rewardRisk !== null && rewardRisk < 1) warnings.push('Target is less than 1:1 reward-to-risk.')
  return { riskAmount, stopDistance, stopDistancePercent: entryPrice > 0 ? (stopDistance / entryPrice) * 100 : 0, positionSize, notionalValue, rewardRisk, exposurePercent, warnings }
}

