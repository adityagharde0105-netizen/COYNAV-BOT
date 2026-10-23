import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification'
import { getCandles } from './marketData'
import { evaluateStrategySignal, loadSignals, saveSignals, type TradingSignal } from '../domain/signals'
import { loadStrategies } from '../domain/strategy'

export type SignalMonitorStatus = 'idle' | 'monitoring' | 'paused' | 'error'
export type SignalMonitorUpdate = { status: SignalMonitorStatus; signals: TradingSignal[]; message?: string }

const MONITOR_INTERVAL_MS = 5 * 60_000
const symbols = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT', 'AVAX/USDT']

const runningInTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

async function notify(signal: TradingSignal) {
  const title = `${signal.direction === 'entry' ? 'Entry' : 'Exit'} signal: ${signal.symbol}`
  const body = `${signal.strategyName} v${signal.strategyVersion} · ${signal.timeframe} close ${signal.price.toLocaleString()}`
  if (runningInTauri()) {
    try {
      let permission = await isPermissionGranted()
      if (!permission) permission = await requestPermission() === 'granted'
      if (permission) await sendNotification({ title, body })
      return
    } catch {
      // Fall through to the browser notification API when the plugin is unavailable.
    }
  }
  if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body })
}

async function poll(onUpdate: (update: SignalMonitorUpdate) => void, signalState: { signals: TradingSignal[] }, inFlight: { value: boolean }) {
  if (inFlight.value) return
  inFlight.value = true
  try {
    const strategies = loadStrategies()
    if (!strategies.length) {
      onUpdate({ status: 'paused', signals: signalState.signals, message: 'Save a strategy to enable signal monitoring.' })
      return
    }
    const seen = new Set(signalState.signals.map((signal) => signal.id))
    const additions: TradingSignal[] = []
    for (const symbol of symbols) {
      const response = await getCandles(symbol, '4h', 200)
      if (response.state !== 'ready' || response.source !== 'binance-public' || !response.data) continue
      for (const strategy of strategies) {
        const result = evaluateStrategySignal(symbol, '4h', response.data, strategy)
        if (result.signal && !seen.has(result.signal.id)) {
          seen.add(result.signal.id)
          additions.push(result.signal)
        }
      }
    }
    for (const signal of additions) await notify(signal)
    const next = [...additions, ...signalState.signals].slice(0, 100)
    signalState.signals = next
    saveSignals(next)
    onUpdate({ status: 'monitoring', signals: next, message: additions.length ? `${additions.length} new signal${additions.length === 1 ? '' : 's'} detected.` : undefined })
  } catch (error) {
    onUpdate({ status: 'error', signals: signalState.signals, message: error instanceof Error ? error.message : 'Signal monitor failed.' })
  } finally {
    inFlight.value = false
  }
}

export async function startSignalMonitor(onUpdate: (update: SignalMonitorUpdate) => void): Promise<() => void> {
  let stopped = false
  const signalState = { signals: loadSignals() }
  const inFlight = { value: false }
  let timer: ReturnType<typeof setInterval> | undefined
  let unlisten: UnlistenFn | undefined
  const tick = () => {
    if (!stopped) void poll(onUpdate, signalState, inFlight)
  }
  if (runningInTauri()) {
    try {
      unlisten = await listen('vectoris://monitor-tick', tick)
      await invoke('start_background_monitor', { intervalMs: MONITOR_INTERVAL_MS })
    } catch {
      timer = setInterval(tick, MONITOR_INTERVAL_MS)
    }
  } else {
    timer = setInterval(tick, MONITOR_INTERVAL_MS)
  }
  tick()
  onUpdate({ status: 'monitoring', signals: signalState.signals })
  return () => {
    stopped = true
    if (timer) clearInterval(timer)
    if (unlisten) void unlisten()
    if (runningInTauri()) void invoke('stop_background_monitor').catch(() => undefined)
  }
}
