import { StrictMode, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  BookOpen,
  Bot,
  Calculator,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Command,
  Copy,
  Database,
  Gauge,
  LayoutDashboard,
  LineChart,
  Menu,
  MoreHorizontal,
  PanelsTopLeft,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Star,
  Target,
  TrendingDown,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart as ReLineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import './styles.css'
import { calculateRisk } from './domain/risk'
import { runBacktest } from './domain/backtest'
import { executePaperTrade, loadPaperAccount, unrealizedPnl, type PaperAccount } from './domain/paperTrading'
import { defaultStrategy, loadStrategies, saveStrategies, validateStrategy, type Strategy } from './domain/strategy'
import { scanCandles, type ScanResult } from './domain/scanner'
import { loadSignals, type TradingSignal } from './domain/signals'
import { loadMonitoredSymbols, saveMonitoredSymbols, startSignalMonitor, type SignalMonitorController, type SignalMonitorStatus } from './services/signalMonitor'
import { getCandles, getTicker } from './services/marketData'
import type { Candle, DataState } from './domain/market'

type Page =
  | 'Overview'
  | 'Market Scanner'
  | 'Charts & Analysis'
  | 'Trading Signals'
  | 'Strategy Builder'
  | 'Backtesting'
  | 'Paper Trading'
  | 'Risk Management'
  | 'Portfolio Analytics'
  | 'Trade Journal'
  | 'Watchlists'
  | 'Alerts'
  | 'Saved Strategies'

type Market = {
  symbol: string
  name: string
  price: string
  change: number
  volume: string
  color: string
  favorite?: boolean
}

const markets: Market[] = [
  { symbol: 'BTC / USDT', name: 'Bitcoin', price: '$67,842.18', change: 2.84, volume: '$38.2B', color: '#f59f46', favorite: true },
  { symbol: 'ETH / USDT', name: 'Ethereum', price: '$3,482.64', change: 1.62, volume: '$18.7B', color: '#9aa8ff', favorite: true },
  { symbol: 'SOL / USDT', name: 'Solana', price: '$184.29', change: -0.74, volume: '$4.9B', color: '#be8bff' },
  { symbol: 'BNB / USDT', name: 'BNB', price: '$605.31', change: 0.38, volume: '$1.8B', color: '#f0cf6d' },
  { symbol: 'XRP / USDT', name: 'XRP', price: '$0.5241', change: -1.18, volume: '$1.2B', color: '#6e7a8f' },
  { symbol: 'AVAX / USDT', name: 'Avalanche', price: '$36.18', change: 3.26, volume: '$642M', color: '#ed6f7e' },
]

const chartSeries = [
  { time: '09:00', price: 64420, volume: 34 },
  { time: '10:00', price: 64880, volume: 48 },
  { time: '11:00', price: 64640, volume: 39 },
  { time: '12:00', price: 65290, volume: 62 },
  { time: '13:00', price: 65120, volume: 51 },
  { time: '14:00', price: 65760, volume: 73 },
  { time: '15:00', price: 65540, volume: 56 },
  { time: '16:00', price: 66280, volume: 81 },
  { time: '17:00', price: 66010, volume: 65 },
  { time: '18:00', price: 66620, volume: 88 },
  { time: '19:00', price: 66410, volume: 52 },
  { time: '20:00', price: 67160, volume: 92 },
  { time: '21:00', price: 67842, volume: 84 },
]

const scannerRows = [
  { pair: 'BTC/USDT', timeframe: '4h', change: '+2.84%', rsi: '61.8', volume: '1.8×', condition: 'EMA 20 > EMA 50', trend: 'Bullish', confidence: 'High' },
  { pair: 'AVAX/USDT', timeframe: '1h', change: '+3.26%', rsi: '67.2', volume: '2.4×', condition: 'Range breakout', trend: 'Bullish', confidence: 'High' },
  { pair: 'ETH/USDT', timeframe: '4h', change: '+1.62%', rsi: '58.4', volume: '1.2×', condition: 'MACD crossover', trend: 'Bullish', confidence: 'Medium' },
  { pair: 'SOL/USDT', timeframe: '15m', change: '-0.74%', rsi: '42.6', volume: '0.8×', condition: 'Below VWAP', trend: 'Bearish', confidence: 'Medium' },
]

const activity = [
  { icon: Zap, title: 'Bullish setup detected', detail: 'BTC / USDT · EMA trend continuation', time: '2m ago', type: 'signal' },
  { icon: TrendingUp, title: 'Watchlist breakout', detail: 'AVAX / USDT moved above $36.00', time: '18m ago', type: 'positive' },
  { icon: Database, title: 'Market data refreshed', detail: 'Binance · 1,248 markets synced', time: '32m ago', type: 'info' },
  { icon: AlertTriangle, title: 'Volatility elevated', detail: 'SOL / USDT · 24h range above average', time: '1h ago', type: 'warning' },
]

const navGroups = [
  {
    label: 'Workspace',
    items: [
      ['Overview', LayoutDashboard],
      ['Market Scanner', SlidersHorizontal],
      ['Charts & Analysis', LineChart],
      ['Trading Signals', Zap],
      ['Strategy Builder', PanelsTopLeft],
      ['Backtesting', BarChart3],
      ['Paper Trading', Play],
      ['Risk Management', ShieldCheck],
      ['Portfolio Analytics', Gauge],
      ['Trade Journal', BookOpen],
    ],
  },
  {
    label: 'Personal',
    items: [
      ['Watchlists', Star],
      ['Alerts', Bell],
      ['Saved Strategies', Copy],
    ],
  },
]

function App() {
  const [activePage, setActivePage] = useState<Page>('Overview')
  const [selectedMarket, setSelectedMarket] = useState(markets[0])
  const [timeframe, setTimeframe] = useState('4h')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState('')
  const [signals, setSignals] = useState<TradingSignal[]>(() => loadSignals())
  const [signalMonitorStatus, setSignalMonitorStatus] = useState<SignalMonitorStatus>('idle')
  const [signalMonitor, setSignalMonitor] = useState<SignalMonitorController | null>(null)
  const [dataState, setDataState] = useState<DataState>('idle')
  const [liveTicker, setLiveTicker] = useState<{ price: number; change24h: number; volume24h: number; timestamp: number } | null>(null)

  useEffect(() => {
    let active = true
    const controller = new AbortController()
    setDataState('loading')
    getTicker(selectedMarket.symbol, controller.signal).then((result) => {
      if (!active) return
      setDataState(result.state)
      if (result.data) setLiveTicker(result.data)
    }).catch(() => { if (active) setDataState('error') })
    return () => { active = false; controller.abort() }
  }, [selectedMarket.symbol])

  const filteredMarkets = useMemo(
    () => markets.filter((market) => `${market.symbol} ${market.name}`.toLowerCase().includes(search.toLowerCase())),
    [search],
  )

  const notify = (message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 2600)
  }

  useEffect(() => {
    let stop: (() => void) | undefined
    void startSignalMonitor((update) => {
      setSignals(update.signals)
      setSignalMonitorStatus(update.status)
      if (update.message && update.status !== 'monitoring') notify(update.message)
    }).then((controller) => { setSignalMonitor(controller); stop = controller.stop })
    return () => { stop?.(); setSignalMonitor(null) }
  }, [])

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="brand">
          <div className="brand-mark"><span /></div>
          <span>vectoris</span>
          <button className="icon-button mobile-close" aria-label="Close navigation" onClick={() => setSidebarOpen(false)}><X size={17} /></button>
        </div>
        <div className="workspace-switcher">
          <div className="workspace-avatar">N</div>
          <div><strong>Northstar Desk</strong><span>Research workspace</span></div>
          <ChevronDown size={15} />
        </div>
        <nav>
          {navGroups.map((group) => (
            <div className="nav-group" key={group.label}>
              <div className="nav-label">{group.label}</div>
              {group.items.map(([label, Icon]) => (
                <button
                  key={label as string}
                  className={`nav-item ${activePage === label ? 'active' : ''}`}
                  onClick={() => { setActivePage(label as Page); setSidebarOpen(false) }}
                >
                  <Icon size={16} strokeWidth={1.8} />
                  <span>{label as string}</span>
                  {label === 'Trading Signals' && <span className="nav-count">6</span>}
                </button>
              ))}
            </div>
          ))}
          <div className="nav-group nav-system">
            <div className="nav-label">System</div>
            <button className="nav-item"><Database size={16} /><span>Data Sources</span><span className="status-dot" /></button>
            <button className="nav-item"><Settings size={16} /><span>Settings</span></button>
            <button className="nav-item"><CircleHelp size={16} /><span>Help center</span></button>
          </div>
        </nav>
        <div className="sidebar-footer">
          <div className="plan-card"><div><span className="eyebrow">Plan usage</span><strong>Research Pro</strong></div><span className="usage">68%</span><div className="usage-track"><span /></div><small>2,042 / 3,000 scans used</small></div>
          <div className="user-row"><div className="user-avatar">AG</div><div><strong>Alex Greene</strong><span>Analyst account</span></div><MoreHorizontal size={17} /></div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-button menu-button" aria-label="Open navigation" onClick={() => setSidebarOpen(true)}><Menu size={19} /></button>
            <div className="breadcrumbs"><span>Workspace</span><ChevronRight size={14} /><strong>{activePage}</strong></div>
          </div>
          <div className="topbar-actions">
            <button className="search-trigger" onClick={() => document.getElementById('global-search')?.focus()}><Search size={16} /><span>Search markets, strategies...</span><kbd><Command size={11} /> K</kbd></button>
            <span className="connection"><span className={`status-dot ${dataState === 'error' ? 'error-dot' : ''}`} /> {dataState === 'ready' ? 'Market data live' : dataState === 'stale' ? 'Market data stale' : dataState === 'loading' ? 'Connecting to market data' : 'Market data unavailable'}</span>
            <button className="icon-button" aria-label="Notifications" onClick={() => setActivePage('Alerts')}><Bell size={17} /><span className="notification-dot" /></button>
            <div className="top-avatar">AG</div>
          </div>
        </header>
        {activePage === 'Overview' ? (
          <Overview
            selectedMarket={selectedMarket}
            setSelectedMarket={setSelectedMarket}
            timeframe={timeframe}
            setTimeframe={setTimeframe}
            filteredMarkets={filteredMarkets}
            search={search}
            setSearch={setSearch}
            notify={notify}
            dataState={dataState}
            liveTicker={liveTicker}
          />
        ) : (
          <WorkspacePage page={activePage} notify={notify} signals={signals} signalMonitorStatus={signalMonitorStatus} signalMonitor={signalMonitor} />
        )}
        {toast && <div className="toast"><ShieldCheck size={16} />{toast}</div>}
      </main>
    </div>
  )
}

function Overview({
  selectedMarket, setSelectedMarket, timeframe, setTimeframe, filteredMarkets, search, setSearch, notify, dataState, liveTicker,
}: {
  selectedMarket: Market
  setSelectedMarket: (market: Market) => void
  timeframe: string
  setTimeframe: (value: string) => void
  filteredMarkets: Market[]
  search: string
  setSearch: (value: string) => void
  notify: (message: string) => void
  dataState: DataState
  liveTicker: { price: number; change24h: number; volume24h: number; timestamp: number } | null
}) {
  const displayedPrice = liveTicker ? `$${liveTicker.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : selectedMarket.price
  const displayedChange = liveTicker?.change24h ?? selectedMarket.change
  return (
    <div className="page">
      <div className="page-heading">
        <div><div className="eyebrow">Wednesday, October 21, 2026</div><h1>Market overview</h1><p className="muted">A focused view of the markets and setups on your radar.</p></div>
        <div className="heading-actions"><button className="button secondary" onClick={() => notify('Dashboard refreshed with latest sample data')}><RefreshCw size={15} /> Refresh</button><button className="button primary" onClick={() => notify('New scanner opened')}><Plus size={15} /> New scan</button></div>
      </div>
      <div className={`demo-banner ${dataState === 'ready' ? 'live-banner' : ''}`}><div className="demo-icon"><Database size={16} /></div><div><strong>{dataState === 'ready' ? 'Public market data connected' : dataState === 'loading' ? 'Connecting to public market data' : dataState === 'stale' ? 'Showing cached market data' : 'Demonstration data mode'}</strong><span>{dataState === 'ready' ? `Binance public feed · updated ${liveTicker ? new Date(liveTicker.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'now'}. No order execution is enabled.` : dataState === 'stale' ? 'The exchange is unavailable. Cached data is shown with a stale-data label.' : 'Live exchange data is unavailable. Sample values are clearly labeled and no orders are enabled.'}</span></div><button className="text-button">Data policy <ChevronRight size={14} /></button></div>
      <section className="metric-grid">
        <Metric label="Total market cap" value="$2.48T" change="+1.9%" detail="vs. previous close" positive icon={BarChart3} />
        <Metric label="24h spot volume" value="$84.6B" change="+12.4%" detail="across tracked markets" positive icon={Activity} />
        <Metric label="BTC dominance" value="53.84%" change="+0.22%" detail="market share" positive icon={Target} />
        <Metric label="Market sentiment" value="Greed · 68" change="Elevated" detail="fear & greed index" icon={Sparkles} warning />
      </section>
      <div className="dashboard-grid">
        <section className="panel chart-panel">
          <div className="panel-header">
            <div><div className="panel-kicker"><span className="live-pulse" /> Price action</div><h2>{selectedMarket.symbol}</h2><div className="price-line"><strong>{displayedPrice}</strong><span className={displayedChange > 0 ? 'positive' : 'negative'}>{displayedChange > 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{Math.abs(displayedChange).toFixed(2)}% <small>24h</small></span></div></div>
            <div className="chart-controls"><button className="select-button">{selectedMarket.name} <ChevronDown size={14} /></button><div className="segmented">{['1h', '4h', '1D', '1W'].map((value) => <button key={value} className={timeframe === value ? 'selected' : ''} onClick={() => setTimeframe(value)}>{value}</button>)}</div><button className="icon-button"><MoreHorizontal size={17} /></button></div>
          </div>
          <div className="chart-legend"><span><i className="legend-line accent" /> BTC / USDT</span><span><i className="legend-line muted-line" /> EMA 20</span><span className="chart-source"><Database size={13} /> Demonstration chart · {timeframe} · not live candle data</span></div>
          <div className="main-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartSeries} margin={{ top: 16, right: 8, left: -20, bottom: 0 }}><defs><linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#9aa8ff" stopOpacity={0.24} /><stop offset="100%" stopColor="#9aa8ff" stopOpacity={0} /></linearGradient></defs><CartesianGrid stroke="#222b38" vertical={false} /><XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: '#677487', fontSize: 11 }} /><YAxis domain={['dataMin - 800', 'dataMax + 500']} axisLine={false} tickLine={false} tick={{ fill: '#677487', fontSize: 11 }} tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} /><Tooltip content={<ChartTooltip />} /><Area type="monotone" dataKey="price" stroke="#9aa8ff" strokeWidth={2.4} fill="url(#priceFill)" activeDot={{ r: 4, fill: '#f1f5f9', stroke: '#9aa8ff', strokeWidth: 2 }} /></AreaChart></ResponsiveContainer></div>
          <div className="volume-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartSeries} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}><XAxis dataKey="time" hide /><YAxis hide /><Bar dataKey="volume" radius={[2, 2, 0, 0]}>{chartSeries.map((_, index) => <Cell key={index} fill={index % 3 === 0 ? '#536181' : '#303c55'} />)}</Bar></BarChart></ResponsiveContainer></div>
          <div className="chart-footer"><span>Volume</span><span>EMA 20 <strong>$66,414</strong></span><span>RSI 14 <strong>61.8</strong></span><span>MACD <strong className="positive">+182.4</strong></span></div>
        </section>
        <section className="panel watchlist-panel">
          <div className="panel-header compact"><div><div className="panel-kicker">Your markets</div><h2>Watchlist</h2></div><button className="icon-button" aria-label="Add market" onClick={() => notify('Market selector opened')}><Plus size={17} /></button></div>
          <div className="watchlist-search"><Search size={14} /><input id="global-search" placeholder="Filter markets" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
          <div className="watchlist-table">{filteredMarkets.map((market) => <button className={`watch-row ${selectedMarket.symbol === market.symbol ? 'selected' : ''}`} key={market.symbol} onClick={() => setSelectedMarket(market)}><span className="coin-mark" style={{ background: `${market.color}22`, color: market.color }}>{market.symbol.split(' ')[0].slice(0, 1)}</span><span className="watch-name"><strong>{market.symbol}</strong><small>{market.name}</small></span><span className="sparkline"><svg viewBox="0 0 72 24" preserveAspectRatio="none"><polyline points="0,17 9,15 18,18 27,10 36,13 45,7 54,11 63,5 72,8" fill="none" stroke={market.change > 0 ? '#36c991' : '#f16c75'} strokeWidth="1.8" /></svg></span><span className="watch-price"><strong>{market.price}</strong><small className={market.change > 0 ? 'positive' : 'negative'}>{market.change > 0 ? '+' : ''}{market.change.toFixed(2)}%</small></span><Star size={14} fill={market.favorite ? 'currentColor' : 'none'} className={market.favorite ? 'starred' : ''} /></button>)}</div>
          <button className="watchlist-footer" onClick={() => notify('Watchlist manager opened')}>View all markets <ChevronRight size={14} /></button>
        </section>
      </div>
      <div className="lower-grid">
        <section className="panel activity-panel"><div className="panel-header compact"><div><div className="panel-kicker">Signal monitor</div><h2>Market activity</h2></div><button className="text-button">View all <ChevronRight size={14} /></button></div><div className="activity-list">{activity.map((item) => <div className="activity-row" key={item.title}><div className={`activity-icon ${item.type}`}><item.icon size={15} /></div><div className="activity-copy"><strong>{item.title}</strong><span>{item.detail}</span></div><time>{item.time}</time></div>)}</div></section>
        <section className="panel movers-panel"><div className="panel-header compact"><div><div className="panel-kicker">Market pulse</div><h2>Top movers</h2></div><button className="icon-button"><MoreHorizontal size={17} /></button></div><div className="mover-list">{markets.slice(1, 5).map((market) => <div className="mover-row" key={market.symbol}><div className="mover-identity"><span className="coin-mark small" style={{ background: `${market.color}22`, color: market.color }}>{market.symbol[0]}</span><strong>{market.symbol.split(' ')[0]}</strong></div><div className="mover-bar"><span style={{ width: `${Math.min(Math.abs(market.change) * 18 + 18, 90)}%`, background: market.change > 0 ? '#36c991' : '#f16c75' }} /></div><strong className={market.change > 0 ? 'positive' : 'negative'}>{market.change > 0 ? '+' : ''}{market.change.toFixed(2)}%</strong></div>)}</div></section>
        <section className="panel scanner-panel"><div className="panel-header compact"><div><div className="panel-kicker">Scanner snapshot</div><h2>Potential setups</h2></div><button className="text-button">Open scanner <ChevronRight size={14} /></button></div><div className="scanner-summary"><div className="scanner-stat"><strong>12</strong><span>signals found</span></div><div className="scanner-stat"><strong className="positive">7</strong><span>bullish setups</span></div><div className="scanner-stat"><strong>68%</strong><span>avg. confidence</span></div></div><div className="mini-setup"><span className="signal-badge bullish">Bullish</span><div><strong>BTC / USDT</strong><span>EMA trend continuation · 4h</span></div><span className="setup-time">2m</span></div><div className="mini-setup"><span className="signal-badge bullish">Bullish</span><div><strong>AVAX / USDT</strong><span>Range breakout · 1h</span></div><span className="setup-time">18m</span></div></section>
      </div>
    </div>
  )
}

function ResearchWorkspace({ page, notify, signals, signalMonitorStatus, signalMonitor }: { page: string; notify: (message: string) => void; signals: TradingSignal[]; signalMonitorStatus: SignalMonitorStatus; signalMonitor: SignalMonitorController | null }) {
  const [items, setItems] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(`vectoris.${page}`) ?? '[]') as string[] } catch { return [] }
  })
  const [draft, setDraft] = useState('')
  const [monitoredSymbols, setMonitoredSymbols] = useState(() => loadMonitoredSymbols())
  const add = () => {
    if (!draft.trim()) return
    const next = [...items, draft.trim()]
    setItems(next); setDraft(''); localStorage.setItem(`vectoris.${page}`, JSON.stringify(next)); notify(`${page} item saved locally`)
  }
  const toggleSymbol = (symbol: string) => {
    const next = monitoredSymbols.includes(symbol) ? monitoredSymbols.filter((item) => item !== symbol) : [...monitoredSymbols, symbol]
    if (!next.length) return
    setMonitoredSymbols(next)
    saveMonitoredSymbols(next)
    notify('Signal markets saved locally')
  }
  return <div className="page"><div className="page-heading"><div><div className="eyebrow">Workspace / {page}</div><h1>{page}</h1><p className="muted">{page === 'Trading Signals' ? 'Signals evaluated from validated completed candles and saved strategies.' : page === 'Charts & Analysis' ? 'Inspect public candle data and transparent technical context.' : 'Persistent, simulation-first workspace state stored locally in this browser.'}</p></div><button className="button primary" onClick={add}><Plus size={15} /> Add item</button></div>
    {page === 'Trading Signals' ? <><div className="data-state-line"><span className={`status-dot ${signalMonitorStatus === 'error' ? 'error-dot' : ''}`} /> {signalMonitorStatus === 'monitoring' ? 'Monitoring Binance public data every 5 minutes' : signalMonitorStatus === 'paused' ? 'Monitoring paused' : signalMonitorStatus === 'error' ? 'Signal monitoring unavailable; retrying' : 'Signal monitor stopped'} <button className="text-button" onClick={() => signalMonitorStatus === 'paused' ? signalMonitor?.resume() : signalMonitor?.pause()}>{signalMonitorStatus === 'paused' ? 'Resume' : 'Pause'}</button><button className="text-button" onClick={() => signalMonitor?.stop()}>Stop</button></div><div className="panel"><div className="panel-kicker">Markets monitored</div>{loadMonitoredSymbols().map((symbol) => <label key={symbol} className="compact-control"><input type="checkbox" checked={monitoredSymbols.includes(symbol)} onChange={() => toggleSymbol(symbol)} /> {symbol}</label>)}</div><section className="panel signal-grid">{signals.length ? signals.map((signal) => <div className="signal-card" key={signal.id}><div className="signal-card-top"><span className={`signal-badge ${signal.direction === 'entry' ? 'bullish' : 'bearish'}`}>{signal.direction === 'entry' ? 'Entry signal' : 'Exit signal'}</span><span className="setup-time">Binance · {new Date(signal.candleTime).toLocaleString()}</span></div><h2>{signal.symbol}</h2><p>{signal.strategyName} v{signal.strategyVersion} · {signal.timeframe}</p><div className="signal-levels"><span>Close <strong>{signal.price.toLocaleString()}</strong></span><span>Detected <strong>{new Date(signal.detectedAt).toLocaleTimeString()}</strong></span><span>Source <strong>Validated</strong></span></div><button className="text-button" onClick={() => { setItems((current) => [...current, signal.id]); notify(`${signal.symbol} signal saved locally`) }}>Save signal <Star size={13} /></button></div>) : <div className="empty-state"><Bell size={18} /><strong>No signals detected</strong><span>Signals appear when a saved strategy matches a newly completed Binance candle. Stale or cached data is never used to create new signals.</span></div>}</section></> : page === 'Portfolio Analytics' ? <div className="analytics-grid"><section className="panel analytics-card"><div className="panel-kicker">Simulation ledger</div><h2>Performance overview</h2><div className="analytics-value">+$4,286.20 <span className="positive">+8.57%</span></div><div className="analytics-bars">{[42, 55, 48, 68, 61, 79, 72, 88, 82, 96].map((height, index) => <span key={index} style={{ height: `${height}%` }} />)}</div><small>Virtual account · past 30 sessions · sample accounting only</small></section><section className="panel analytics-card"><div className="panel-kicker">Risk distribution</div><h2>Exposure by strategy</h2>{['EMA momentum', 'Breakout scout', 'Mean reversion'].map((name, index) => <div className="exposure-row" key={name}><span>{name}</span><div><i style={{ width: `${[62, 24, 14][index]}%` }} /></div><strong>{[62, 24, 14][index]}%</strong></div>)}</section></div> : <div className="research-layout"><section className="panel research-editor"><div className="panel-kicker">{page === 'Charts & Analysis' ? 'Data context' : 'Local collection'}</div><h2>{page === 'Charts & Analysis' ? 'Technical context' : `Your ${page.toLowerCase()}`}</h2>{page === 'Charts & Analysis' ? <><div className="context-row"><span>Data source</span><strong>Binance public REST · fallback cache</strong></div><div className="context-row"><span>Indicators</span><strong>EMA 20/50 · RSI 14 · MACD · volatility</strong></div><div className="context-row"><span>Execution</span><strong>Disabled · analysis and simulation only</strong></div></> : <><div className="search-input wide-input"><Search size={15} /><input placeholder={`Add ${page.toLowerCase()} note`} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') add() }} /></div><div className="local-items">{items.length ? items.map((item, index) => <div className="local-item" key={`${item}-${index}`}><span>{item}</span><button className="icon-button" onClick={() => { const next = items.filter((_, itemIndex) => itemIndex !== index); setItems(next); localStorage.setItem(`vectoris.${page}`, JSON.stringify(next)) }}><X size={14} /></button></div>) : <div className="empty-copy">Nothing saved yet. Add an item to persist it in this browser.</div>}</div></>}</section><section className="panel research-side"><div className="panel-kicker">Workflow guardrails</div><h2>Integrity checks</h2>{['Live vs. demonstration status is visible', 'No arbitrary code execution', 'No real-money order route', 'Local state can be cleared safely'].map((item) => <div className="integrity-row" key={item}><ShieldCheck size={14} /><span>{item}</span></div>)}</section></div>}
  </div>
}

function Metric({ label, value, change, detail = '', positive, warning, icon: Icon }: { label: string; value: string; change: string; detail?: string; positive?: boolean; warning?: boolean; icon: typeof Activity }) {
  return <div className="metric-card"><div className={`metric-icon ${warning ? 'warning' : ''}`}><Icon size={16} /></div><div className="metric-label">{label}<span className={positive ? 'positive' : warning ? 'warning-text' : ''}>{change}</span></div><div className="metric-value">{value}</div><div className="metric-detail">{detail}</div></div>
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.length) return null
  return <div className="chart-tooltip"><span>{label} UTC</span><strong>${payload[0].value.toLocaleString()}</strong><small>Simulated close</small></div>
}

function ScannerWorkspace({ notify }: { notify: (message: string) => void }) {
  const [results, setResults] = useState<ScanResult[]>([])
  const [status, setStatus] = useState<DataState>('loading')
  const [query, setQuery] = useState('')
  const [minVolume, setMinVolume] = useState(1.2)
  const [trend, setTrend] = useState<'bullish' | 'bearish' | 'any'>('bullish')
  const [saved, setSaved] = useState(false)
  const runScan = () => {
    setStatus('loading')
    Promise.all(['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'AVAX/USDT'].map(async (symbol) => {
      const response = await getCandles(symbol, '4h', 200)
      return response.data ? scanCandles(symbol, '4h', response.data, { minRelativeVolume: minVolume, trend }) : null
    })).then((items) => {
      setResults(items.filter((item): item is ScanResult => item !== null))
      setStatus('ready')
    }).catch(() => setStatus('error'))
  }
  useEffect(() => { runScan() }, [])
  const visible = results.filter((row) => row.symbol.toLowerCase().includes(query.toLowerCase()))
  return <div className="page"><div className="page-heading"><div><div className="eyebrow">Workspace / Market Scanner</div><h1>Market scanner</h1><p className="muted">Real indicator calculations from the public candle feed, with explicit fallback states.</p></div><button className="button primary" onClick={runScan}><RefreshCw size={15} /> Run scan</button></div>
    <div className="scanner-toolbar"><div className="search-input"><Search size={15} /><input placeholder="Search pairs..." value={query} onChange={(event) => setQuery(event.target.value)} /></div><label className="compact-control">Relative volume <select value={minVolume} onChange={(event) => setMinVolume(Number(event.target.value))}><option value="0">Any</option><option value="1.2">1.2×</option><option value="1.5">1.5×</option><option value="2">2×</option></select></label><label className="compact-control">Trend <select value={trend} onChange={(event) => setTrend(event.target.value as typeof trend)}><option value="any">Any</option><option value="bullish">Bullish</option><option value="bearish">Bearish</option></select></label><button className={`button ${saved ? 'primary' : 'secondary'}`} onClick={() => { localStorage.setItem('vectoris.scannerFilters', JSON.stringify({ minVolume, trend })); setSaved(true); notify('Scanner filter saved locally') }}><Star size={14} /> {saved ? 'Saved' : 'Save filter'}</button></div>
    <div className="data-state-line"><span className={`status-dot ${status === 'error' ? 'error-dot' : ''}`} /> {status === 'loading' ? 'Scanning public candle data…' : status === 'error' ? 'Exchange unavailable. Try again or use cached data.' : `${visible.length} qualifying setups · calculated ${new Date().toLocaleTimeString()}`}</div>
    <section className="panel full-panel"><div className="table-meta"><strong>{visible.length} potential setups</strong><span>EMA · RSI · MACD · relative volume · volatility</span></div>{visible.length ? <table><thead><tr><th>Pair</th><th>Close</th><th>Change</th><th>RSI</th><th>Rel. volume</th><th>Volatility</th><th>Condition</th><th>Trend</th></tr></thead><tbody>{visible.map((row) => <tr key={row.symbol}><td><strong>{row.symbol}</strong><small className="table-subtext">{row.timeframe} · {new Date(row.timestamp).toLocaleString()}</small></td><td>{row.close.toLocaleString(undefined, { maximumFractionDigits: 4 })}</td><td className={row.changePercent >= 0 ? 'positive' : 'negative'}>{row.changePercent >= 0 ? '+' : ''}{row.changePercent.toFixed(2)}%</td><td>{row.rsi.toFixed(1)}</td><td>{row.relativeVolume.toFixed(2)}×</td><td>{(row.volatility * 100).toFixed(1)}%</td><td><span className="condition-dot" />{row.condition}<small className="table-subtext">{row.explanation}</small></td><td><span className={`trend ${row.trend}`}>{row.trend}</span></td></tr>)}</tbody></table> : <div className="empty-state"><AlertTriangle size={18} /><strong>{status === 'loading' ? 'Loading market data' : 'No conditions matched'}</strong><span>{status === 'loading' ? 'The scanner is requesting candles from Binance public endpoints.' : 'Adjust filters or run the scan again when the exchange is available.'}</span></div>}</section>
  </div>
}

function StrategyWorkspace({ notify }: { notify: (message: string) => void }) {
  const [strategies, setStrategies] = useState<Strategy[]>(() => loadStrategies())
  const [strategy, setStrategy] = useState<Strategy>(() => loadStrategies()[0] ?? defaultStrategy())
  const errors = validateStrategy(strategy)
  const update = (patch: Partial<Strategy>) => setStrategy((current) => ({ ...current, ...patch, updatedAt: Date.now() }))
  const save = () => {
    const next = [...strategies.filter((item) => item.id !== strategy.id), { ...strategy, version: strategy.version + 1, updatedAt: Date.now() }]
    setStrategies(next); setStrategy(next[next.length - 1]); saveStrategies(next); notify('Strategy version saved locally')
  }
  const addCondition = (group: 'entry' | 'exit') => update({ [group]: { ...strategy[group], conditions: [...strategy[group].conditions, { id: crypto.randomUUID(), indicator: 'rsi', period: 14, comparison: 'above', value: 50 }] } } as Partial<Strategy>)
  return <div className="page"><div className="page-heading"><div><div className="eyebrow">Workspace / Strategy Builder</div><h1>Strategy builder</h1><p className="muted">Readable, versioned rules only—no arbitrary code execution.</p></div><button className="button primary" onClick={save} disabled={errors.length > 0}><ShieldCheck size={15} /> Save version</button></div>
    <div className="strategy-layout"><section className="panel strategy-editor"><div className="strategy-title-row"><input className="strategy-name" value={strategy.name} onChange={(event) => update({ name: event.target.value })} /><span className="version-badge">v{strategy.version}</span></div><RuleGroup title="IF" group={strategy.entry} onAdd={() => addCondition('entry')} onOperatorChange={(operator) => update({ entry: { ...strategy.entry, operator } })} onChange={(conditions) => update({ entry: { ...strategy.entry, conditions } })} /><RuleGroup title="EXIT WHEN" group={strategy.exit} onAdd={() => addCondition('exit')} onOperatorChange={(operator) => update({ exit: { ...strategy.exit, operator } })} onChange={(conditions) => update({ exit: { ...strategy.exit, conditions } })} /><div className="strategy-params"><label>Stop-loss %<input type="number" value={strategy.stopLossPercent} onChange={(event) => update({ stopLossPercent: Number(event.target.value) })} /></label><label>Take-profit %<input type="number" value={strategy.takeProfitPercent} onChange={(event) => update({ takeProfitPercent: Number(event.target.value) })} /></label></div>{errors.length > 0 && <div className="validation-box"><AlertTriangle size={15} /><div>{errors.map((error) => <span key={error}>{error}</span>)}</div></div>}</section><section className="panel strategy-side"><div className="panel-kicker">Saved versions</div><h2>Strategy library</h2>{strategies.length ? strategies.map((item) => <button className={`saved-strategy ${item.id === strategy.id ? 'selected' : ''}`} key={item.id} onClick={() => setStrategy(item)}><span>{item.name}</span><small>v{item.version} · {new Date(item.updatedAt).toLocaleDateString()}</small></button>) : <div className="empty-copy">No saved strategies yet. Save this template to create the first version.</div>}<button className="button secondary full" onClick={() => { const copy = { ...strategy, id: crypto.randomUUID(), name: `${strategy.name} copy`, version: 1 }; setStrategies((current) => [...current, copy]); setStrategy(copy); notify('Strategy duplicated') }}><Copy size={14} /> Duplicate current</button></section></div>
  </div>
}

function RuleGroup({ title, group, onAdd, onChange, onOperatorChange }: { title: string; group: Strategy['entry']; onAdd: () => void; onChange: (conditions: Strategy['entry']['conditions']) => void; onOperatorChange: (operator: Strategy['entry']['operator']) => void }) {
  return <div className="rule-group"><div className="rule-heading"><span>{title}</span><select value={group.operator} onChange={(event) => onOperatorChange(event.target.value as Strategy['entry']['operator'])}><option>AND</option><option>OR</option></select></div>{group.conditions.map((condition, index) => <div className="rule-row" key={condition.id}><select value={condition.indicator} onChange={(event) => onChange(group.conditions.map((item, itemIndex) => itemIndex === index ? { ...item, indicator: event.target.value as typeof item.indicator } : item))}><option value="sma">SMA</option><option value="ema">EMA</option><option value="rsi">RSI</option><option value="macd">MACD</option><option value="volume">Volume</option></select><input type="number" value={condition.period ?? 14} onChange={(event) => onChange(group.conditions.map((item, itemIndex) => itemIndex === index ? { ...item, period: Number(event.target.value) } : item))} /><select value={condition.comparison} onChange={(event) => onChange(group.conditions.map((item, itemIndex) => itemIndex === index ? { ...item, comparison: event.target.value as typeof item.comparison } : item))}><option value="above">is above</option><option value="below">is below</option><option value="crossesAbove">crosses above</option><option value="crossesBelow">crosses below</option></select><input value={condition.value} onChange={(event) => { const value = event.target.value; const numeric = value.trim() !== '' && Number.isFinite(Number(value)); onChange(group.conditions.map((item, itemIndex) => itemIndex === index ? { ...item, value: numeric ? Number(value) : value } : item)) }} /></div>)}<button className="add-condition" onClick={onAdd}><Plus size={13} /> Add condition</button></div>
}

function BacktestWorkspace({ notify }: { notify: (message: string) => void }) {
  const [candles, setCandles] = useState<Candle[] | null>(null)
  const [result, setResult] = useState<ReturnType<typeof runBacktest> | null>(null)
  const [status, setStatus] = useState<DataState>('loading')
  const [strategies] = useState<Strategy[]>(() => loadStrategies())
  const [selectedStrategyId, setSelectedStrategyId] = useState(() => strategies[0]?.id ?? '')
  const strategy = strategies.find((item) => item.id === selectedStrategyId)
  const run = () => { if (!candles || !strategy) return; const next = runBacktest(candles, strategy); setResult(next); notify(next.warnings.length ? 'Backtest could not run with the selected strategy' : `Backtest completed for ${strategy.name} v${strategy.version}`) }
  useEffect(() => { getCandles('BTC/USDT', '4h', 500).then((response) => { setCandles(response.data); setStatus(response.state) }).catch(() => setStatus('error')) }, [])
  return <div className="page"><div className="page-heading"><div><div className="eyebrow">Workspace / Backtesting</div><h1>Backtesting</h1><p className="muted">Candle-by-candle simulation with fees, slippage, and no look-ahead access.</p></div><button className="button primary" onClick={run} disabled={!candles || !strategy}><Play size={15} /> Run simulation</button></div><div className="assumption-bar"><Database size={14} /> Dataset: BTC/USDT 4h · {candles ? `${candles.length} candles` : 'loading'} · Binance public data or cache · fees 0.10% · slippage 0.05%</div><div className="backtest-selector"><label>Strategy<select value={selectedStrategyId} onChange={(event) => { setSelectedStrategyId(event.target.value); setResult(null) }}><option value="">Select a saved strategy</option>{strategies.map((item) => <option value={item.id} key={item.id}>{item.name} · v{item.version}</option>)}</select></label><span>Running: <strong>{strategy ? `${strategy.name} · v${strategy.version}` : 'No saved strategy selected'}</strong></span></div>{result ? <><div className="metric-grid"><Metric label="Net return" value={`${result.netReturn.toFixed(2)}%`} change="net of fees" positive={result.netReturn >= 0} icon={TrendingUp} /><Metric label="Max drawdown" value={`${result.maxDrawdown.toFixed(2)}%`} change="peak-to-trough" icon={TrendingDown} /><Metric label="Win rate" value={`${result.winRate.toFixed(1)}%`} change={`${result.totalTrades} trades`} positive icon={Target} /><Metric label="Profit factor" value={result.profitFactor === Infinity ? '∞' : result.profitFactor.toFixed(2)} change="gross profit / loss" icon={BarChart3} /></div>{result.warnings.length > 0 && <div className="warning-line"><AlertTriangle size={14} />{result.warnings.join(' ')}</div>}<section className="panel full-panel"><div className="table-meta"><strong>{result.assumptions.strategyName} · v{result.assumptions.strategyVersion}</strong><span>Strategy {result.assumptions.strategyId} · {new Date(result.assumptions.dataStart).toLocaleDateString()} – {new Date(result.assumptions.dataEnd).toLocaleDateString()}</span></div><table><thead><tr><th>Entry</th><th>Exit</th><th>Quantity</th><th>Entry price</th><th>Exit price</th><th>Reason</th><th>P&L</th></tr></thead><tbody>{result.trades.map((trade) => <tr key={`${trade.entryTime}-${trade.exitTime}`}><td>{new Date(trade.entryTime).toLocaleDateString()}</td><td>{new Date(trade.exitTime).toLocaleDateString()}</td><td>{trade.quantity.toFixed(5)}</td><td>{trade.entry.toFixed(2)}</td><td>{trade.exit.toFixed(2)}</td><td>{trade.exitReason}</td><td className={trade.pnl >= 0 ? 'positive' : 'negative'}>{trade.pnl >= 0 ? '+' : ''}{trade.pnl.toFixed(2)}</td></tr>)}</tbody></table></section></> : <div className="workspace-placeholder"><div className="placeholder-icon"><BarChart3 size={25} /></div><h2>{status === 'error' ? 'Historical data unavailable' : strategy ? 'Simulation ready' : 'Save a strategy first'}</h2><p>{status === 'error' ? 'The public exchange endpoint failed and no cached dataset is available.' : strategy ? `Run the simulation to evaluate ${strategy.name} v${strategy.version}.` : 'Create and save a strategy in Strategy Builder before running a backtest.'}</p></div>}</div>
}

function PaperTradingWorkspace({ notify }: { notify: (message: string) => void }) {
  const [account, setAccount] = useState<PaperAccount>(() => loadPaperAccount(localStorage.getItem('vectoris.paper')))
  const [price, setPrice] = useState(67842)
  const [quantity, setQuantity] = useState(0.1)
  const [error, setError] = useState('')
  const pnl = unrealizedPnl(account, { 'BTC/USDT': price })
  const trade = (side: 'buy' | 'sell') => { try { const next = executePaperTrade(account, 'BTC/USDT', side, quantity, price); setAccount({ ...next, positions: [...next.positions], trades: [...next.trades] }); localStorage.setItem('vectoris.paper', JSON.stringify(next)); setError(''); notify(`Simulated ${side} fill recorded`) } catch (caught) { setError(caught instanceof Error ? caught.message : 'Simulation failed') } }
  return <div className="page"><div className="page-heading"><div><div className="eyebrow">Workspace / Paper Trading</div><h1>Paper trading</h1><p className="muted">Simulation only. These controls cannot place real exchange orders.</p></div><span className="simulation-badge"><span className="status-dot" /> SIMULATION</span></div><div className="metric-grid"><Metric label="Virtual cash" value={`$${account.cash.toFixed(2)}`} change="available" icon={Database} /><Metric label="Unrealized P&L" value={`${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`} change="at current sample price" positive={pnl >= 0} icon={TrendingUp} /><Metric label="Open positions" value={`${account.positions.length}`} change="simulated" icon={Target} /><Metric label="Recorded fills" value={`${account.trades.length}`} change="persistent locally" icon={Clock3} /></div><div className="paper-layout"><section className="panel order-panel"><div className="panel-kicker">Simulated order ticket</div><h2>BTC / USDT</h2><label>Mark price<input type="number" value={price} onChange={(event) => setPrice(Number(event.target.value))} /></label><label>Quantity<input type="number" value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} step="0.01" min="0.00001" /></label><div className="paper-actions"><button className="button buy" onClick={() => trade('buy')}>Buy simulated</button><button className="button sell" onClick={() => trade('sell')}>Sell simulated</button></div>{error && <div className="validation-box"><AlertTriangle size={15} />{error}</div>}</section><section className="panel"><div className="panel-header compact"><div><div className="panel-kicker">Open simulated positions</div><h2>Positions</h2></div></div>{account.positions.length ? account.positions.map((position) => <div className="position-row" key={position.symbol}><strong>{position.symbol}</strong><span>{position.quantity.toFixed(5)} @ ${position.averagePrice.toFixed(2)}</span><b className={pnl >= 0 ? 'positive' : 'negative'}>{pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}</b></div>) : <div className="empty-copy">No simulated positions. Use the ticket to create a virtual fill.</div>}</section></div><section className="panel full-panel paper-history"><div className="table-meta"><strong>Fill history</strong><span>Stored only in this browser</span></div><table><thead><tr><th>Time</th><th>Side</th><th>Quantity</th><th>Price</th><th>Fee</th></tr></thead><tbody>{account.trades.slice().reverse().map((tradeItem) => <tr key={tradeItem.id}><td>{new Date(tradeItem.timestamp).toLocaleString()}</td><td className={tradeItem.side === 'buy' ? 'positive' : 'negative'}>{tradeItem.side.toUpperCase()}</td><td>{tradeItem.quantity}</td><td>${tradeItem.price.toFixed(2)}</td><td>${tradeItem.fee.toFixed(2)}</td></tr>)}</tbody></table></section></div>
}

function RiskWorkspace({ notify }: { notify: (message: string) => void }) {
  const [balance, setBalance] = useState(100000)
  const [riskPercent, setRiskPercent] = useState(1)
  const [entry, setEntry] = useState(67842)
  const [stop, setStop] = useState(65100)
  const [target, setTarget] = useState(73500)
  const result = calculateRisk({ accountBalance: balance, riskPercent, entryPrice: entry, stopPrice: stop, targetPrice: target, maxExposure: 45 })
  return <div className="page"><div className="page-heading"><div><div className="eyebrow">Workspace / Risk Management</div><h1>Risk management</h1><p className="muted">Position sizing is calculated from account risk and stop distance—not conviction.</p></div><button className="button primary" onClick={() => notify('Risk profile saved locally')}><ShieldCheck size={15} /> Save profile</button></div><div className="risk-layout"><section className="panel form-panel"><div className="panel-header compact"><div><div className="panel-kicker">Position sizing</div><h2>Risk calculator</h2></div><Calculator size={18} /></div><label>Account balance<input type="number" value={balance} onChange={(event) => setBalance(Number(event.target.value))} /></label><label>Risk per trade<div className="input-with-suffix"><input type="number" value={riskPercent} onChange={(event) => setRiskPercent(Number(event.target.value))} min="0.1" max="5" step="0.1" /><span>%</span></div></label><div className="two-inputs"><label>Entry price<input type="number" value={entry} onChange={(event) => setEntry(Number(event.target.value))} /></label><label>Stop-loss<input type="number" value={stop} onChange={(event) => setStop(Number(event.target.value))} /></label></div><label>Take-profit<input type="number" value={target} onChange={(event) => setTarget(Number(event.target.value))} /></label><div className="calculation-box"><span>Suggested position size</span><strong>{result.positionSize.toFixed(5)} units</strong><small>Risk ${result.riskAmount.toFixed(2)} · stop distance {result.stopDistancePercent.toFixed(2)}% · notional ${result.notionalValue.toFixed(2)}</small></div>{result.warnings.map((warning) => <div className="warning-line" key={warning}><AlertTriangle size={14} />{warning}</div>)}</section><section className="panel risk-summary"><div className="panel-kicker">Trade quality</div><h2>Risk posture</h2><div className="risk-score"><div className="score-ring"><strong>{result.rewardRisk?.toFixed(1) ?? '—'}</strong><span>R:R</span></div><div><strong>{result.warnings.length ? 'Review warnings' : 'Within configured limits'}</strong><p>Reward-to-risk is shown before any simulated order is considered.</p></div></div>{[['Risk amount', `$${result.riskAmount.toFixed(2)}`], ['Stop distance', `${result.stopDistancePercent.toFixed(2)}%`], ['Position notional', `$${result.notionalValue.toFixed(2)}`], ['Exposure after trade', `${result.exposurePercent.toFixed(2)}%`]].map(([label, value]) => <div className="guardrail" key={label}><span>{label}</span><strong>{value}</strong><span className={result.warnings.length ? 'warning-text' : 'positive'}>{result.warnings.length ? 'Review' : 'Within limit'}</span></div>)}</section></div></div>
}

function WorkspacePage({ page, notify, signals, signalMonitorStatus, signalMonitor }: { page: string; notify: (message: string) => void; signals: TradingSignal[]; signalMonitorStatus: SignalMonitorStatus; signalMonitor: SignalMonitorController | null }) {
  const [scannerSearch, setScannerSearch] = useState('')
  const [sortAsc, setSortAsc] = useState(false)
  const [risk, setRisk] = useState(1)
  const [entry, setEntry] = useState(67842)
  const [stop, setStop] = useState(65100)
  const filtered = scannerRows.filter((row) => row.pair.toLowerCase().includes(scannerSearch.toLowerCase()))
  const positionSize = Math.round((100000 * (risk / 100)) / Math.max(entry - stop, 1))
  const title = page === 'Charts & Analysis' ? 'Charts & Analysis' : page
  if (page === 'Market Scanner') return <ScannerWorkspace notify={notify} />
  if (page === 'Strategy Builder') return <StrategyWorkspace notify={notify} />
  if (page === 'Backtesting') return <BacktestWorkspace notify={notify} />
  if (page === 'Paper Trading') return <PaperTradingWorkspace notify={notify} />
  if (page === 'Risk Management') return <RiskWorkspace notify={notify} />
  if (['Trading Signals', 'Portfolio Analytics', 'Trade Journal', 'Watchlists', 'Alerts', 'Saved Strategies', 'Charts & Analysis'].includes(page)) return <ResearchWorkspace page={page} notify={notify} signals={signals} signalMonitorStatus={signalMonitorStatus} signalMonitor={signalMonitor} />
  return <div className="page"><div className="page-heading"><div><div className="eyebrow">Workspace / {title}</div><h1>{title}</h1><p className="muted">{page === 'Market Scanner' ? 'Scan the market for rule-based conditions worth investigating.' : page === 'Risk Management' ? 'Define risk before you define a trade.' : 'A focused workspace for your research workflow.'}</p></div><button className="button primary" onClick={() => notify(`${title} action started`)}><Play size={15} /> {page === 'Backtesting' ? 'Run backtest' : page === 'Strategy Builder' ? 'Save strategy' : 'Create new'}</button></div>
    <div className="workspace-tabs"><button className="active">Overview</button><button>Saved views</button><button>Documentation</button></div>
    {page === 'Market Scanner' ? <><div className="scanner-toolbar"><div className="search-input"><Search size={15} /><input placeholder="Search pairs..." value={scannerSearch} onChange={(event) => setScannerSearch(event.target.value)} /></div><button className="filter-button"><SlidersHorizontal size={15} /> Filters <span>3</span></button><button className="button secondary" onClick={() => notify('Scanner refreshed') }><RefreshCw size={14} /> Scan now</button></div><div className="filter-chips"><span>Timeframe: 4h <X size={12} /></span><span>Trend: Bullish <X size={12} /></span><span>Volume &gt; 1.2× <X size={12} /></span><button className="text-button">Clear all</button></div><section className="panel full-panel"><div className="table-meta"><strong>{filtered.length} potential setups</strong><span>Updated 2 minutes ago · Demonstration data</span></div><table><thead><tr><th>Pair</th><th>Timeframe</th><th onClick={() => setSortAsc(!sortAsc)}>24h change <ChevronDown size={13} /></th><th>RSI</th><th>Relative volume</th><th>Detected condition</th><th>Trend</th><th /></tr></thead><tbody>{[...filtered].sort((a, b) => sortAsc ? a.change.localeCompare(b.change) : b.change.localeCompare(a.change)).map((row) => <tr key={row.pair}><td><strong>{row.pair}</strong></td><td><span className="table-tag">{row.timeframe}</span></td><td className={row.change.startsWith('+') ? 'positive' : 'negative'}>{row.change}</td><td>{row.rsi}</td><td>{row.volume}</td><td><span className="condition-dot" />{row.condition}</td><td><span className={`trend ${row.trend.toLowerCase()}`}>{row.trend}</span></td><td><button className="icon-button"><ChevronRight size={16} /></button></td></tr>)}</tbody></table></section></> : page === 'Risk Management' ? <div className="risk-layout"><section className="panel form-panel"><div className="panel-header compact"><div><div className="panel-kicker">Position sizing</div><h2>Risk calculator</h2></div><Calculator size={18} /></div><label>Account balance<input value="$100,000" readOnly /></label><label>Risk per trade<div className="input-with-suffix"><input type="number" value={risk} onChange={(event) => setRisk(Number(event.target.value))} min="0.1" max="5" step="0.1" /><span>%</span></div></label><div className="two-inputs"><label>Entry price<input type="number" value={entry} onChange={(event) => setEntry(Number(event.target.value))} /></label><label>Stop-loss<input type="number" value={stop} onChange={(event) => setStop(Number(event.target.value))} /></label></div><div className="calculation-box"><span>Suggested position size</span><strong>{positionSize.toLocaleString()} units</strong><small>Risking ${(100000 * risk / 100).toLocaleString()} to your stop at {((entry - stop) / entry * 100).toFixed(2)}% distance.</small></div><button className="button primary full" onClick={() => notify('Risk configuration saved')}>Save risk profile</button></section><section className="panel risk-summary"><div className="panel-kicker">Portfolio guardrails</div><h2>Risk posture</h2><div className="risk-score"><div className="score-ring"><strong>72</strong><span>/ 100</span></div><div><strong>Moderate exposure</strong><p>Room for 3 more positions within your current risk policy.</p></div></div>{['Max portfolio exposure', 'Max simultaneous positions', 'Daily loss threshold', 'Current drawdown'].map((label, index) => <div className="guardrail" key={label}><span>{label}</span><strong>{['45%', '6 positions', '−$2,500', '−1.8%'][index]}</strong><span className={index === 3 ? 'warning-text' : 'positive'}>{index === 3 ? 'Monitor' : 'Within limit'}</span></div>)}</section></div> : <div className="workspace-placeholder"><div className="placeholder-icon"><Sparkles size={25} /></div><h2>{page} is ready for your workflow</h2><p>Build a repeatable research process with transparent assumptions, saved configurations, and simulation-first execution.</p><div className="placeholder-cards"><div><Clock3 size={17} /><strong>Recent activity</strong><span>Nothing new to review</span></div><div><Target size={17} /><strong>Suggested next step</strong><span>Start with a saved template</span></div><div><Bot size={17} /><strong>Assistant mode</strong><span>Contextual guidance enabled</span></div></div></div>}
  </div>
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
