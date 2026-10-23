import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification'
import { getCandles } from './marketData'
import { evaluateStrategySignal, loadSignals, saveSignals, type TradingSignal } from '../domain/signals'
import { loadStrategies } from '../domain/strategy'

export type SignalMonitorStatus = 'idle' | 'monitoring' | 'paused' | 'error'
export type SignalMonitorUpdate = { status: SignalMonitorStatus; signals: TradingSignal[]; message?: string }
export type SignalMonitorController = { pause: () => void; resume: () => void; stop: () => void }

const MONITOR_INTERVAL_MS = 5 * 60_000
export const DEFAULT_MONITORED_SYMBOLS = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT', 'AVAX/USDT']
const SYMBOLS_KEY = 'vectoris.signalMarkets'

export const loadMonitoredSymbols = (): string[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(SYMBOLS_KEY) ?? 'null') as unknown
    if (Array.isArray(parsed)) {
      const symbols = parsed.filter((symbol): symbol is string => typeof symbol === 'string' && /^[A-Z0-9]+\/[A-Z0-9]+$/.test(symbol))
      if (symbols.length) return [...new Set(symbols)]
    }
  } catch {
    // Recover with the supported defaults when local state is invalid.
  }
  return [...DEFAULT_MONITORED_SYMBOLS]
}

export const saveMonitoredSymbols = (symbols: string[]) => {
  const valid = [...new Set(symbols.filter((symbol) => DEFAULT_MONITORED_SYMBOLS.includes(symbol)))]
  if (valid.length) localStorage.setItem(SYMBOLS_KEY, JSON.stringify(valid))
}

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

async function poll(onUpdate: (update: SignalMonitorUpdate) => void, signalState: { signals: TradingSignal[] }, lifecycle: { paused: boolean; stopped: boolean }, inFlight: { value: boolean }) {
  if (inFlight.value) return
  inFlight.value = true
  try {
    const strategies = loadStrategies()
    if (!strategies.length) {
      onUpdate({ status: 'paused', signals: signalState.signals, message: 'Save a strategy to enable signal monitoring.' })
      return
    }
    const symbols = loadMonitoredSymbols()
    const seen = new Set(signalState.signals.map((signal) => signal.id))
    const additions: TradingSignal[] = []
    let freshResponses = 0
    let failedResponses = 0
    for (const symbol of symbols) {
      const response = await getCandles(symbol, '4h', 200)
      if (response.state !== 'ready' || response.source !== 'binance-public' || !response.data) {
        failedResponses += 1
        continue
      }
      freshResponses += 1
      for (const strategy of strategies) {
        const result = evaluateStrategySignal(symbol, '4h', response.data, strategy)
        if (result.signal && !seen.has(result.signal.id)) {
          seen.add(result.signal.id)
          additions.push(result.signal)
        }
      }
    }
    if (lifecycle.paused || lifecycle.stopped) return
    for (const signal of additions) await notify(signal)
    const next = [...additions, ...signalState.signals].slice(0, 100)
    signalState.signals = next
    saveSignals(next)
    onUpdate({
      status: lifecycle.paused ? 'paused' : freshResponses && failedResponses === 0 ? 'monitoring' : 'error',
      signals: next,
      message: failedResponses ? `${failedResponses} market request${failedResponses === 1 ? '' : 's'} failed; monitoring will retry. ${additions.length ? `${additions.length} new signal${additions.length === 1 ? '' : 's'} detected.` : ''}` : (additions.length ? `${additions.length} new signal${additions.length === 1 ? '' : 's'} detected.` : undefined),
    })
  } catch (error) {
    onUpdate({ status: lifecycle.paused ? 'paused' : 'error', signals: signalState.signals, message: error instanceof Error ? error.message : 'Signal monitor failed.' })
  } finally {
    inFlight.value = false
  }
}

export async function startSignalMonitor(onUpdate: (update: SignalMonitorUpdate) => void): Promise<SignalMonitorController> {
  let stopped = false
  let paused = false
  const lifecycle = { paused: false, stopped: false }
  const signalState = { signals: loadSignals() }
  const inFlight = { value: false }
  let timer: ReturnType<typeof setInterval> | undefined
  let unlisten: UnlistenFn | undefined
  const stopTimer = () => {
    if (timer) {
      clearInterval(timer)
      timer = undefined
    }
  }
  const tick = () => {
    if (!stopped && !paused) void poll(onUpdate, signalState, lifecycle, inFlight)
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
  return {
    pause: () => {
      if (stopped || paused) return
      paused = true
      lifecycle.paused = true
      stopTimer()
      if (runningInTauri()) void invoke('stop_background_monitor').catch(() => undefined)
      onUpdate({ status: 'paused', signals: signalState.signals, message: 'Signal monitoring paused.' })
    },
    resume: () => {
      if (stopped || !paused) return
      paused = false
      lifecycle.paused = false
      if (runningInTauri()) {
        void invoke('start_background_monitor', { intervalMs: MONITOR_INTERVAL_MS }).catch((error) => {
          onUpdate({ status: 'error', signals: signalState.signals, message: error instanceof Error ? error.message : 'Could not resume signal monitoring.' })
        })
      } else {
        timer = setInterval(tick, MONITOR_INTERVAL_MS)
      }
      onUpdate({ status: 'monitoring', signals: signalState.signals, message: 'Signal monitoring resumed.' })
      tick()
    },
    stop: () => {
      if (stopped) return
      stopped = true
      paused = true
      lifecycle.stopped = true
      lifecycle.paused = true
      stopTimer()
      if (unlisten) void unlisten()
      if (runningInTauri()) void invoke('stop_background_monitor').catch(() => undefined)
      onUpdate({ status: 'idle', signals: signalState.signals, message: 'Signal monitoring stopped.' })
    },
  }
}
