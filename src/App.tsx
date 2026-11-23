import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties, FormEvent, ReactElement } from 'react'
import { buildJournalSnapshot, requestOpenAiCompatibleCoaching } from './ai'
import type { AiCoachingResult } from './ai'

export type Direction = 'Long' | 'Short'
export type Result = 'Kazanç' | 'Kayıp' | 'BE'

export type Trade = {
  id: string
  date: string
  symbol: string
  direction: Direction
  timeframe: string
  entry: number
  stopLoss: number
  takeProfit: number
  exit: number
  riskReward: number
  result: Result
  pnl: number
  strategy: string
  tags: string[]
  notes: string
  chartScreenshot?: string
}

const STORAGE_KEY = 'trade-journal-trades-v1'

const seedTrades: Trade[] = [
  { id: '1', date: '2026-11-18', symbol: 'XAUUSD', direction: 'Long', timeframe: '15dk', entry: 4078.5, stopLoss: 4068, takeProfit: 4101, exit: 4099.2, riskReward: 2.1, result: 'Kazanç', pnl: 2120, strategy: 'London Breakout', tags: ['momentum', 'London'], notes: 'Asia aralığı kırılımı sonrası temiz giriş.' },
  { id: '2', date: '2026-11-17', symbol: 'EURUSD', direction: 'Short', timeframe: '30dk', entry: 1.1542, stopLoss: 1.157, takeProfit: 1.1486, exit: 1.1571, riskReward: 2, result: 'Kayıp', pnl: -1160, strategy: 'ICT Killzone', tags: ['sell-side', 'liquidity'], notes: 'Beklenen likiditeyi alamadan stop oldu.' },
  { id: '3', date: '2026-11-14', symbol: 'NAS100', direction: 'Long', timeframe: '5dk', entry: 24218, stopLoss: 24172, takeProfit: 24310, exit: 24307, riskReward: 2, result: 'Kazanç', pnl: 1780, strategy: 'VWAP Reversal', tags: ['VWAP', 'NY'], notes: 'VWAP temasından güçlü dönüş.' },
  { id: '4', date: '2026-11-13', symbol: 'BTCUSD', direction: 'Short', timeframe: '1s', entry: 98640, stopLoss: 99050, takeProfit: 97820, exit: 98640, riskReward: 2, result: 'BE', pnl: 0, strategy: 'Range Breakdown', tags: ['range'], notes: 'Bozulum teyit edilmedi; başa baş çıkıldı.' },
  { id: '5', date: '2026-11-12', symbol: 'GBPJPY', direction: 'Long', timeframe: '15dk', entry: 203.42, stopLoss: 203.08, takeProfit: 204.1, exit: 203.09, riskReward: 2, result: 'Kayıp', pnl: -680, strategy: 'London Breakout', tags: ['breakout'], notes: 'Kırılım hacim teyidi vermedi.' },
  { id: '6', date: '2026-11-10', symbol: 'US30', direction: 'Short', timeframe: '15dk', entry: 47210, stopLoss: 47290, takeProfit: 47050, exit: 47058, riskReward: 2, result: 'Kazanç', pnl: 3040, strategy: 'ICT Killzone', tags: ['premium', 'NY'], notes: 'Premium bölgeden kısa işlem; hedefe ulaştı.' },
]

const emptyForm: Omit<Trade, 'id'> = {
  date: new Date().toISOString().slice(0, 10),
  symbol: '',
  direction: 'Long',
  timeframe: '15dk',
  entry: 0,
  stopLoss: 0,
  takeProfit: 0,
  exit: 0,
  riskReward: 1,
  result: 'BE',
  pnl: 0,
  strategy: '',
  tags: [],
  notes: '',
  chartScreenshot: '',
}

const money = (value: number) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)

const compressImage = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Lütfen bir görsel dosyası seçin.'))
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      reject(new Error('Görsel 10 MB sınırını aşıyor.'))
      return
    }
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Görsel okunamadı.'))
    reader.onload = () => {
      const image = new Image()
      image.onerror = () => reject(new Error('Görsel işlenemedi.'))
      image.onload = () => {
        const maxWidth = 1200
        const scale = Math.min(1, maxWidth / image.width)
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(image.width * scale)
        canvas.height = Math.round(image.height * scale)
        const context = canvas.getContext('2d')
        if (!context) {
          reject(new Error('Görsel sıkıştırma ortamı kullanılamıyor.'))
          return
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.78))
      }
      image.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  })

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const paths: Record<string, ReactElement> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    journal: <><path d="M6 3h12v18H6z" /><path d="M9 7h6M9 11h6M9 15h4" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    filter: <><path d="M4 5h16l-6 7v5l-4 2v-7z" /></>,
    search: <><circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" /></>,
    edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z" /></>,
    trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" /></>,
    close: <><path d="m5 5 14 14M19 5 5 19" /></>,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

function App() {
  const [trades, setTrades] = useState<Trade[]>([])
  const [loading, setLoading] = useState(true)
  const [storageError, setStorageError] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<Omit<Trade, 'id'>>(emptyForm)
  const [filters, setFilters] = useState({ strategy: '', symbol: '', direction: '', result: '', timeframe: '', date: '' })
  const [search, setSearch] = useState('')
  const [previewTrade, setPreviewTrade] = useState<Trade | null>(null)
  const [modalClosing, setModalClosing] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [activeView, setActiveView] = useState<'Dashboard' | 'Journal' | 'Strategies' | 'Analytics' | 'AI'>('Dashboard')
  const [hidePnl, setHidePnl] = useState(false)
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false)
  const [aiApiKey, setAiApiKey] = useState('')
  const [aiBaseUrl, setAiBaseUrl] = useState('https://api.openai.com/v1')
  const [aiModel, setAiModel] = useState('gpt-4o-mini')
  const [includeNotes, setIncludeNotes] = useState(true)
  const [includeScreenshots, setIncludeScreenshots] = useState(true)
  const [aiStatus, setAiStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [aiError, setAiError] = useState('')
  const [aiResult, setAiResult] = useState<AiCoachingResult | null>(null)
  const [tradeReview, setTradeReview] = useState<Trade | null>(null)
  const [tradeReviewStatus, setTradeReviewStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY)
        setTrades(stored ? JSON.parse(stored) : seedTrades)
        if (!stored) localStorage.setItem(STORAGE_KEY, JSON.stringify(seedTrades))
      } catch {
        setStorageError('Tarayıcı verisi okunamadı. Demo verilerle devam ediliyor.')
        setTrades(seedTrades)
      } finally {
        setLoading(false)
      }
    }, 300)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (!modalOpen && !previewTrade && !aiSettingsOpen && !tradeReview) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (previewTrade) setPreviewTrade(null)
        else if (tradeReview) setTradeReview(null)
        else if (aiSettingsOpen) setAiSettingsOpen(false)
        else closeModal()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [modalOpen, previewTrade, aiSettingsOpen, tradeReview])

  const persist = (next: Trade[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      setTrades(next)
      setStorageError('')
    } catch (error) {
      const quota = error instanceof DOMException && (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')
      setStorageError(quota
        ? 'Yerel depolama dolu. Görsel boyutunu küçültün veya eski işlemleri silin.'
        : 'Değişiklikler kaydedilemedi. Tarayıcı depolama erişimini kontrol edin.')
    }
  }

  const filtered = useMemo(() => trades.filter((trade) => {
    const matchesSearch = !search || `${trade.symbol} ${trade.strategy} ${trade.tags.join(' ')}`.toLowerCase().includes(search.toLowerCase())
    return matchesSearch &&
      (!filters.strategy || trade.strategy === filters.strategy) &&
      (!filters.symbol || trade.symbol === filters.symbol) &&
      (!filters.direction || trade.direction === filters.direction) &&
      (!filters.result || trade.result === filters.result) &&
      (!filters.timeframe || trade.timeframe === filters.timeframe) &&
      (!filters.date || trade.date === filters.date)
  }), [trades, filters, search])

  const stats = useMemo(() => {
    const total = trades.length
    const wins = trades.filter((trade) => trade.result === 'Kazanç').length
    const winRate = total ? (wins / total) * 100 : 0
    const net = trades.reduce((sum, trade) => sum + trade.pnl, 0)
    const grossProfit = trades.filter((trade) => trade.pnl > 0).reduce((sum, trade) => sum + trade.pnl, 0)
    const grossLoss = Math.abs(trades.filter((trade) => trade.pnl < 0).reduce((sum, trade) => sum + trade.pnl, 0))
    return { total, winRate, net, profitFactor: grossLoss ? grossProfit / grossLoss : grossProfit ? 99 : 0 }
  }, [trades])

  const strategies = useMemo(() => {
    const map = new Map<string, { trades: number; win: number; pnl: number }>()
    trades.forEach((trade) => {
      const current = map.get(trade.strategy) || { trades: 0, win: 0, pnl: 0 }
      current.trades += 1
      if (trade.result === 'Kazanç') current.win += 1
      current.pnl += trade.pnl
      map.set(trade.strategy, current)
    })
    return [...map.entries()].map(([name, value]) => ({ name, ...value, winRate: value.trades ? (value.win / value.trades) * 100 : 0 }))
  }, [trades])

  const chartData = useMemo(() => {
    return [...trades].sort((a, b) => a.date.localeCompare(b.date)).reduce(
      (points, trade) => {
        const previousBalance = points.at(-1)?.balance ?? 0
        return [...points, { date: trade.date, balance: previousBalance + trade.pnl }]
      },
      [] as { date: string; balance: number }[],
    )
  }, [trades])

  const openCreate = () => {
    setEditingId(null)
    setForm(emptyForm)
    setModalClosing(false)
    setModalOpen(true)
  }

  const openEdit = (trade: Trade) => {
    setEditingId(trade.id)
    setForm({ ...trade, tags: [...trade.tags] })
    setModalClosing(false)
    setModalOpen(true)
  }

  function closeModal() {
    setModalClosing(true)
    window.setTimeout(() => {
      setModalOpen(false)
      setModalClosing(false)
    }, 180)
  }

  const handleScreenshot = async (file?: File) => {
    if (!file) return
    setUploading(true)
    setStorageError('')
    try {
      const compressed = await compressImage(file)
      setForm((current) => ({ ...current, chartScreenshot: compressed }))
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : 'Görsel yüklenemedi.')
    } finally {
      setUploading(false)
    }
  }

  const submitTrade = (event: FormEvent) => {
    event.preventDefault()
    if (!form.symbol.trim() || !form.strategy.trim()) return
    if (editingId) {
      persist(trades.map((trade) => trade.id === editingId ? { ...form, id: editingId, symbol: form.symbol.toUpperCase(), tags: form.tags } : trade))
    } else {
      persist([{ ...form, id: crypto.randomUUID(), symbol: form.symbol.toUpperCase(), tags: form.tags }, ...trades])
    }
    closeModal()
  }

  const deleteTrade = (id: string) => {
    if (window.confirm('Bu işlemi silmek istiyor musunuz?')) persist(trades.filter((trade) => trade.id !== id))
  }

  const runJournalAnalysis = async () => {
    if (!aiApiKey.trim()) {
      setAiStatus('error')
      setAiError('Önce ayarlar bölümünden API anahtarı ve sağlayıcı bilgilerini girin.')
      setAiSettingsOpen(true)
      return
    }
    setAiStatus('loading')
    setAiError('')
    try {
      const snapshot = buildJournalSnapshot(trades, includeNotes)
      const prompt = [
        'Aşağıdaki işlem günlüğünü analiz et.',
        'Aggregate verileri, strateji ve zaman dilimi performanslarını, yönleri, tekrar eden etiketleri, serileri, ortalama kâr/kayıp ve risk/ödül ilişkisini değerlendir.',
        'Güçlü tarafları ve tekrar eden zayıflıkları kanıtla. Her öncelik önerisi için somut uygulama adımı ver.',
        'chartScreenshot değerleri "[ekran görüntüsü dahil]" olan işlemlerden en fazla 4 ekran görüntüsü ayrıca kullanıcı tarafından onaylandıktan sonra görsel olarak gönderilecektir.',
        'JSON nesnesi döndür.',
        JSON.stringify(snapshot),
      ].join('\n')
      const screenshots = includeScreenshots
        ? trades.filter((trade) => trade.chartScreenshot).map((trade) => trade.chartScreenshot as string)
        : []
      const result = await requestOpenAiCompatibleCoaching(
        { baseUrl: aiBaseUrl, apiKey: aiApiKey, model: aiModel },
        prompt,
        screenshots,
      )
      setAiResult(result)
      setAiStatus('success')
    } catch (error) {
      setAiStatus('error')
      setAiError(error instanceof Error ? error.message : 'AI analizi başarısız oldu.')
    }
  }

  const runTradeReview = async (trade: Trade) => {
    if (!aiApiKey.trim()) {
      setAiSettingsOpen(true)
      setAiError('Tek işlem değerlendirmesi için önce API ayarlarını tamamlayın.')
      return
    }
    setTradeReviewStatus('loading')
    setAiError('')
    try {
      const prompt = [
        'Tek bir trading işlemini odaklı olarak incele.',
        'Kurulum kalitesi, giriş/stop/target ilişkisi, risk/ödül, sonuç, strateji uyumu, zaman dilimi ve notlarda görünen olası tekrar hataları değerlendir.',
        'Özellikle kısa ve uygulanabilir üç öncelik öner.',
        'JSON nesnesi döndür.',
        JSON.stringify(buildJournalSnapshot([trade], includeNotes).trades[0]),
      ].join('\n')
      const result = await requestOpenAiCompatibleCoaching(
        { baseUrl: aiBaseUrl, apiKey: aiApiKey, model: aiModel },
        prompt,
        includeScreenshots && trade.chartScreenshot ? [trade.chartScreenshot] : [],
      )
      setAiResult(result)
      setTradeReviewStatus('success')
    } catch (error) {
      setTradeReviewStatus('error')
      setAiError(error instanceof Error ? error.message : 'İşlem değerlendirmesi başarısız oldu.')
    }
  }

  const exportAiData = () => {
    const snapshot = buildJournalSnapshot(trades, includeNotes)
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `tradelog-ai-verisi-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const clearFilters = () => setFilters({ strategy: '', symbol: '', direction: '', result: '', timeframe: '', date: '' })

  const symbols = [...new Set(trades.map((trade) => trade.symbol))]
  const strategyNames = [...new Set(trades.map((trade) => trade.strategy))]
  const timeframeNames = [...new Set(trades.map((trade) => trade.timeframe))]

  if (loading) return (
    <div className="loading-shell" role="status" aria-label="Günlük yükleniyor">
      <aside className="skeleton-sidebar" />
      <main className="skeleton-main">
        <div className="skeleton-line title" />
        <div className="summary-grid">{[0, 1, 2, 3].map((item) => <div className="skeleton-card" key={item} />)}</div>
        <div className="dashboard-grid"><div className="skeleton-panel" /><div className="skeleton-panel" /></div>
      </main>
    </div>
  )

  return (
    <div className="app-shell liquid-shell">
      <header className="liquid-header">
        <button className="liquid-brand" type="button" onClick={() => setActiveView('Dashboard')} aria-label="TradeLog ana sayfası">
          <span className="brand-glyph">TL</span><strong>TradeLog</strong>
        </button>
        <nav className="liquid-nav" aria-label="Ana menü">
          {(['Dashboard', 'Journal', 'Strategies', 'Analytics', 'AI'] as const).map((view) => (
            <button key={view} type="button" className={activeView === view ? 'active' : ''} onClick={() => setActiveView(view)}>
              {{ Dashboard: 'Pano', Journal: 'Günlük', Strategies: 'Stratejiler', Analytics: 'Analiz', AI: 'AI Koç' }[view]}
            </button>
          ))}
        </nav>
        <div className="header-actions">
          <button className="account-chip" type="button" aria-label="Hesap seç"><span className="status-dot" />Hesap 1<span className="chevron">⌄</span></button>
          <button className="profile-chip" type="button" aria-label="Profil">TK</button>
        </div>
      </header>

      <main className="liquid-main">
        {storageError && <div className="error-banner" role="alert">{storageError}</div>}

        {activeView === 'Dashboard' && (
          <div className="view-enter">
            <div className="dashboard-heading">
              <div><p className="eyebrow">Pano</p><h1>Genel Performans</h1><small className="dashboard-date">Perşembe, 20 Kasım 2026</small></div>
              <div className="date-actions"><button type="button" onClick={() => setActiveView('Analytics')}>Plan</button><button type="button" onClick={() => setActiveView('Journal')}>Günlüğü Paylaş</button></div>
            </div>
            <section className="announcement" aria-label="Günlük özet">
              <div><span className="announcement-dot" /><strong>Haftalık performansınız hazır</strong><small>Son 7 günün işlem verilerini inceleyin.</small></div>
              <button type="button" onClick={() => setActiveView('Analytics')}>Raporu aç →</button>
            </section>
            <section className="ai-dashboard-panel" aria-label="AI koçluk özeti">
              <div className="ai-panel-icon">AI</div>
              <div><span>AI KOÇ</span><strong>{aiStatus === 'success' && aiResult ? aiResult.summary : 'İşlem günlüğünden güçlü ve zayıf tarafları keşfet.'}</strong></div>
              <button type="button" onClick={() => setActiveView('AI')}>{aiStatus === 'success' ? 'Analizi aç' : 'AI içgörülerini aç'} →</button>
            </section>

            <section className="pnl-zone" aria-label="Net kar zarar">
              <div className="pnl-label"><span>Toplam P&amp;L</span><button type="button" onClick={() => setHidePnl((hidden) => !hidden)} aria-label={hidePnl ? 'P&L göster' : 'P&L gizle'}>{hidePnl ? 'P&L göster' : 'P&L gizle'} <span>USD</span></button></div>
              <strong className={stats.net >= 0 ? 'positive pnl-value' : 'negative pnl-value'}>{hidePnl ? '$•••' : stats.net === 0 ? '$0' : `${stats.net >= 0 ? '+' : ''}${money(stats.net)}`}</strong>
              <div className="pnl-controls">
                <button type="button" onClick={() => setActiveView('Journal')}>Toplam <b>{stats.total}</b></button>
                <button type="button" onClick={() => setActiveView('Analytics')}>Kâr oranı <b>{stats.winRate.toFixed(1)}%</b></button>
                <button type="button" onClick={() => setActiveView('Strategies')}>En iyi strateji <b>{strategies[0]?.name || '—'}</b></button>
              </div>
            </section>

            <section className="performance-section" aria-label="Performans özeti">
              <div className="performance-header">
                <h2>PERFORMANCE</h2>
                <div>
                  <button type="button" onClick={() => setActiveView('Analytics')}>Full analytics <span>→</span></button>
                  <button type="button" onClick={() => setHidePnl((hidden) => !hidden)}>{hidePnl ? '◉ P&L göster' : '◉ Hide P&L'}</button>
                </div>
              </div>
              {(() => {
                const wins = trades.filter((trade) => trade.result === 'Kazanç')
                const losses = trades.filter((trade) => trade.result === 'Kayıp')
                const avgWinRR = wins.reduce((sum, trade) => sum + trade.riskReward, 0) / Math.max(wins.length, 1)
                const avgWin = wins.reduce((sum, trade) => sum + Math.max(trade.pnl, 0), 0) / Math.max(wins.length, 1)
                const avgLoss = Math.abs(losses.reduce((sum, trade) => sum + Math.min(trade.pnl, 0), 0) / Math.max(losses.length, 1))
                const barMax = Math.max(avgWin, avgLoss, 1)
                return (
                  <div className="performance-grid">
                    <article className="performance-cell avg-rr">
                      <div className="metric-label">Avg win RR <span className="metric-info">i</span></div>
                      <strong>{hidePnl ? '•••R' : `${avgWinRR.toFixed(2)}R`}</strong>
                      <div className="rr-scale"><span /><i /><i /><i /><i /><small>0</small><small>1R</small><small>2R</small><small>3R</small></div>
                    </article>
                    <article className="performance-cell gauge-cell">
                      <div className="metric-label"><span>Profit factor</span><strong>{stats.profitFactor.toFixed(2)}</strong></div>
                      <div className="performance-gauge" style={{ '--win': `${stats.winRate * 3.6}deg` } as CSSProperties}>
                        <div><strong>{stats.winRate.toFixed(0)}%</strong><span>win rate</span></div>
                      </div>
                    </article>
                    <article className="performance-cell win-loss">
                      <div className="wins-losses-title"><span>Wins / losses <b>{losses.length}</b></span><small>{trades.length} real trades</small></div>
                      <div className="win-count"><strong className="positive">{wins.length}</strong><span>Wins</span></div>
                      <div className="loss-count"><strong className="negative">{losses.length}</strong><span>Losses</span></div>
                    </article>
                    <article className="performance-cell avg-bars">
                      <div className="metric-label">Avg win / loss <span className="metric-info">i</span></div>
                      <div className="avg-bar-row"><span>Win</span><div><i className="win-bar" style={{ width: `${(avgWin / barMax) * 100}%` }} /></div><strong>{hidePnl ? '$•••' : money(avgWin)}</strong></div>
                      <div className="avg-bar-row"><span>Loss</span><div><i className="loss-bar" style={{ width: `${(avgLoss / barMax) * 100}%` }} /></div><strong>{hidePnl ? '$•••' : money(avgLoss)}</strong></div>
                    </article>
                  </div>
                )
              })()}
            </section>

            {(() => {
              const now = new Date()
              const monday = new Date(now)
              monday.setHours(0, 0, 0, 0)
              monday.setDate(now.getDate() - ((now.getDay() + 6) % 7))
              const thisWeek = trades.filter((trade) => new Date(`${trade.date}T00:00:00`) >= monday)
              const weekPnL = thisWeek.reduce((sum, trade) => sum + trade.pnl, 0)
              const weekWins = thisWeek.filter((trade) => trade.result === 'Kazanç').length
              const weekWinRate = thisWeek.length ? (weekWins / thisWeek.length) * 100 : 0
              return (
                <section className="dashboard-bottom-grid" aria-label="P&L, haftalık performans ve skor">
                  <article className="panel lower-panel cumulative-panel">
                    <div className="lower-panel-header"><span>CUMULATIVE P&L</span><button type="button">All time⌄</button></div>
                    {chartData.length ? <EquityChart data={chartData} /> : <div className="lower-empty">No trades logged yet.</div>}
                  </article>
                  <article className="panel lower-panel week-panel">
                    <div className="lower-panel-header"><span>This week</span><small>{monday.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} - today</small></div>
                    <div className="week-primary"><strong>{hidePnl ? '$•••' : money(weekPnL)}</strong></div>
                    <div className="week-metrics"><div><span>Trades</span><strong>{thisWeek.length}</strong></div><div><span>Win rate</span><strong>{weekWinRate.toFixed(0)}%</strong></div></div>
                    <div className="weekday-bars" aria-label="Pazartesi-Cuma işlem günleri">
                      {['M', 'T', 'W', 'T', 'F'].map((day, index) => <div key={`${day}-${index}`}><i /><span>{day}</span></div>)}
                    </div>
                    <small className="week-empty">{thisWeek.length ? `${thisWeek.length} işlem kaydedildi` : 'No trades logged this week yet.'}</small>
                  </article>
                  <article className="panel lower-panel score-panel">
                    <div className="score-background"><span className="score-grid" /></div>
                    <div className="score-footer"><div className="score-lock">◆</div><div><strong>Liquid Score</strong><small>Prestige</small></div><button type="button" onClick={() => setActiveView('Analytics')}>Unlock</button></div>
                  </article>
                </section>
              )
            })()}
          </div>
        )}

        {activeView === 'Journal' && (
          <div className="view-enter">
            <div className="dashboard-heading"><div><p className="eyebrow">İşlem kaydı</p><h1>Günlük</h1></div><button className="primary-button" type="button" onClick={openCreate}><Icon name="plus" />Yeni İşlem</button></div>
            <section className="panel trades-panel" id="recent-trades">
              <div className="filter-bar journal-filter" id="filters">
                <label className="search-box"><Icon name="search" /><span className="sr-only">Ara</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Sembol veya strateji ara" /></label>
                <select aria-label="Strateji" value={filters.strategy} onChange={(e) => setFilters({ ...filters, strategy: e.target.value })}><option value="">Tüm stratejiler</option>{strategyNames.map((name) => <option key={name}>{name}</option>)}</select>
                <select aria-label="Sembol" value={filters.symbol} onChange={(e) => setFilters({ ...filters, symbol: e.target.value })}><option value="">Tüm semboller</option>{symbols.map((symbol) => <option key={symbol}>{symbol}</option>)}</select>
                <select aria-label="Yön" value={filters.direction} onChange={(e) => setFilters({ ...filters, direction: e.target.value })}><option value="">Tüm yönler</option><option>Long</option><option>Short</option></select>
                <select aria-label="Sonuç" value={filters.result} onChange={(e) => setFilters({ ...filters, result: e.target.value })}><option value="">Tüm sonuçlar</option><option>Kazanç</option><option>Kayıp</option><option>BE</option></select>
                <select aria-label="Zaman dilimi" value={filters.timeframe} onChange={(e) => setFilters({ ...filters, timeframe: e.target.value })}><option value="">Tüm zaman dilimleri</option>{timeframeNames.map((timeframe) => <option key={timeframe}>{timeframe}</option>)}</select>
                <input aria-label="İşlem tarihi" type="date" value={filters.date} onChange={(e) => setFilters({ ...filters, date: e.target.value })} />
                {(Object.values(filters).some(Boolean) || search) && <button className="clear-button" type="button" onClick={() => { clearFilters(); setSearch('') }}>Temizle</button>}
              </div>
              <div className="table-wrap">
                <table><thead><tr><th>Tarih</th><th>Sembol</th><th>Zaman dilimi</th><th>Yön</th><th>Strateji</th><th>R / R</th><th>Sonuç</th><th>P&L</th><th>Grafik</th><th><span className="sr-only">İşlemler</span></th></tr></thead>
                  <tbody>{filtered.map((trade) => (
                    <tr key={trade.id}><td>{new Date(`${trade.date}T00:00:00`).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })}</td><td><strong>{trade.symbol}</strong></td><td><span className="timeframe-badge">{trade.timeframe}</span></td><td><span className={`direction ${trade.direction.toLowerCase()}`}>{trade.direction === 'Long' ? '↑' : '↓'} {trade.direction}</span></td><td>{trade.strategy}</td><td>{trade.riskReward.toFixed(1)}R</td><td><span className={`result ${trade.result === 'Kazanç' ? 'win' : trade.result === 'Kayıp' ? 'loss' : 'be'}`}>{trade.result}</span></td><td className={trade.pnl >= 0 ? 'positive' : 'negative'}><strong>{trade.pnl >= 0 ? '+' : ''}{money(trade.pnl)}</strong></td><td>{trade.chartScreenshot ? <button className="chart-thumbnail" type="button" aria-label={`${trade.symbol} grafik önizlemesini aç`} onClick={() => setPreviewTrade(trade)}><img src={trade.chartScreenshot} alt={`${trade.symbol} işlem grafiği`} /></button> : <span className="no-chart">—</span>}</td><td><div className="row-actions"><button type="button" aria-label={`${trade.symbol} AI değerlendirmesi`} title="AI değerlendirmesi" onClick={() => { setTradeReview(trade); setTradeReviewStatus('idle'); setAiError('') }}>AI</button><button type="button" aria-label={`${trade.symbol} düzenle`} onClick={() => openEdit(trade)}><Icon name="edit" size={16} /></button><button type="button" aria-label={`${trade.symbol} sil`} onClick={() => deleteTrade(trade.id)}><Icon name="trash" size={16} /></button></div></td></tr>
                  ))}</tbody></table>
                {!filtered.length && <div className="empty-state"><strong>İşlem bulunamadı</strong><span>Filtreleri değiştirin veya yeni bir işlem ekleyin.</span><button type="button" onClick={openCreate}>Yeni işlem ekle</button></div>}
              </div>
            </section>
          </div>
        )}

        {(activeView === 'Strategies' || activeView === 'Analytics') && (
          <div className="view-enter"><div className="dashboard-heading"><div><p className="eyebrow">{activeView === 'Strategies' ? 'Strateji performansı' : 'Detaylı analiz'}</p><h1>{activeView === 'Strategies' ? 'Stratejiler' : 'Analiz'}</h1></div></div>
            <section className="panel secondary-view"><div className="strategy-list wide">{strategies.map((item) => <div className="strategy-row" key={item.name}><div className="strategy-name"><span className="strategy-dot" /><div><strong>{item.name}</strong><small>{item.trades} işlem</small></div></div><div className="strategy-values"><strong className={item.pnl >= 0 ? 'positive' : 'negative'}>{money(item.pnl)}</strong><small>{item.winRate.toFixed(0)}% kazanç</small></div></div>)}</div></section>
            {activeView === 'Analytics' && <section className="panel cumulative-panel"><div className="panel-header"><div><p className="eyebrow">Kümülatif performans</p><h2>Net P&amp;L</h2></div></div><EquityChart data={chartData} /></section>}
          </div>
        )}

        {activeView === 'AI' && (
          <div className="view-enter ai-view">
            <div className="dashboard-heading">
              <div><p className="eyebrow">Güvenli ve açık onaylı</p><h1>AI İşlem Koçu</h1></div>
              <button className="secondary-button ai-settings-button" type="button" onClick={() => setAiSettingsOpen(true)}>Sağlayıcı ayarları</button>
            </div>
            <section className="ai-consent-panel">
              <div>
                <span className="ai-consent-label">Gönderilecek veri özeti</span>
                <p>{trades.length} işlem: sembol, tarih, yön, zaman dilimi, giriş/stop/target/çıkış, R/R, sonuç, P&L, strateji, etiketler{includeNotes ? ' ve notlar' : '; notlar gizli'}.</p>
                <p>{includeScreenshots ? `${trades.filter((trade) => trade.chartScreenshot).length} ekran görüntüsü (en fazla 4) görsel olarak dahil edilebilir.` : 'Ekran görüntüleri gönderilmeyecek.'}</p>
              </div>
              <div className="ai-consent-controls">
                <label><input type="checkbox" checked={includeNotes} onChange={(event) => setIncludeNotes(event.target.checked)} /> Notları gönder</label>
                <label><input type="checkbox" checked={includeScreenshots} onChange={(event) => setIncludeScreenshots(event.target.checked)} /> Ekran görüntülerini gönder</label>
                <button type="button" onClick={exportAiData}>Veriyi JSON olarak dışa aktar</button>
              </div>
              <button className="primary-button" type="button" disabled={aiStatus === 'loading' || !trades.length} onClick={() => void runJournalAnalysis()}>
                {aiStatus === 'loading' ? 'Analiz hazırlanıyor...' : 'Analizi Başlat'}
              </button>
            </section>
            {aiStatus === 'loading' && <div className="ai-loading" role="status"><span className="spinner" /><div><strong>Günlük taranıyor</strong><small>Desenler, seriler ve tekrar eden hatalar inceleniyor...</small></div></div>}
            {aiStatus === 'error' && <div className="error-banner" role="alert">{aiError}</div>}
            {aiStatus === 'idle' && !aiResult && <div className="ai-empty panel"><strong>Henüz AI değerlendirmesi yok</strong><span>Analizi başlatmadan hiçbir işlem verisi gönderilmez.</span></div>}
            {aiResult && aiStatus === 'success' && (
              <div className="ai-result-grid">
                <article className="panel ai-result-card ai-summary"><span>Özet</span><p>{aiResult.summary}</p></article>
                <article className="panel ai-result-card"><span>Güçlü Yönler</span><ul>{aiResult.strengths.map((item, index) => <li key={index}>{item}</li>)}</ul></article>
                <article className="panel ai-result-card"><span>Zayıf Yönler</span><ul>{aiResult.weaknesses.map((item, index) => <li key={index}>{item}</li>)}</ul></article>
                <article className="panel ai-result-card ai-priorities"><span>Öncelikli Öneriler</span><ol>{aiResult.priorityRecommendations.map((item, index) => <li key={index}>{item}</li>)}</ol></article>
                <article className="panel ai-result-card ai-prompts"><span>Daha Derin İnceleme Soruları</span><div>{aiResult.followUpPrompts.map((item, index) => <button type="button" key={index}>{item}</button>)}</div></article>
              </div>
            )}
          </div>
        )}
      </main>

      {modalOpen && (
        <div className={`modal-backdrop ${modalClosing ? 'closing' : ''}`} role="presentation" onMouseDown={(e) => e.target === e.currentTarget && closeModal()}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="trade-form-title">
            <div className="modal-header"><div><p className="eyebrow">{editingId ? 'Kaydı güncelle' : 'Yeni kayıt'}</p><h2 id="trade-form-title">{editingId ? 'İşlem Düzenle' : 'İşlem Ekle'}</h2></div><button className="icon-button" type="button" aria-label="Pencereyi kapat" onClick={closeModal}><Icon name="close" /></button></div>
            <form onSubmit={submitTrade}>
              <div className="form-grid">
                <label>Tarih<input required type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
                <label>Sembol<input required type="text" value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })} placeholder="Örn. XAUUSD" /></label>
                <label>Yön<select value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value as Direction })}><option>Long</option><option>Short</option></select></label>
                <label>Zaman Dilimi<select value={form.timeframe} onChange={(e) => setForm({ ...form, timeframe: e.target.value })}><option>1dk</option><option>5dk</option><option>15dk</option><option>30dk</option><option>1s</option><option>4s</option><option>1G</option></select></label>
                <label>Giriş<input required type="number" step="any" value={form.entry || ''} onChange={(e) => setForm({ ...form, entry: Number(e.target.value) })} /></label>
                <label>Stop Loss<input required type="number" step="any" value={form.stopLoss || ''} onChange={(e) => setForm({ ...form, stopLoss: Number(e.target.value) })} /></label>
                <label>Kâr Hedefi<input required type="number" step="any" value={form.takeProfit || ''} onChange={(e) => setForm({ ...form, takeProfit: Number(e.target.value) })} /></label>
                <label>Çıkış<input required type="number" step="any" value={form.exit || ''} onChange={(e) => setForm({ ...form, exit: Number(e.target.value) })} /></label>
                <label>Risk / Ödül<input required type="number" step="0.1" value={form.riskReward || ''} onChange={(e) => setForm({ ...form, riskReward: Number(e.target.value) })} /></label>
                <label>Sonuç<select value={form.result} onChange={(e) => setForm({ ...form, result: e.target.value as Result })}><option>Kazanç</option><option>Kayıp</option><option>BE</option></select></label>
                <label>P&L (USD)<input required type="number" step="any" value={form.pnl || ''} onChange={(e) => setForm({ ...form, pnl: Number(e.target.value) })} /></label>
                <label>Strateji<input required type="text" value={form.strategy} onChange={(e) => setForm({ ...form, strategy: e.target.value })} placeholder="Örn. London Breakout" /></label>
                <label className="full-field">Etiketler<input type="text" value={form.tags.join(', ')} onChange={(e) => setForm({ ...form, tags: e.target.value.split(',').map((tag) => tag.trim()).filter(Boolean) })} placeholder="momentum, London" /></label>
                <div className="full-field screenshot-field">
                  <span>Grafik ekran görüntüsü</span>
                  {form.chartScreenshot
                    ? <div className="screenshot-preview"><img src={form.chartScreenshot} alt="Seçilen işlem grafiği" /><button type="button" onClick={() => setForm((current) => ({ ...current, chartScreenshot: '' }))}>Görseli kaldır</button></div>
                    : <label className="upload-control"><input type="file" accept="image/*" onChange={(e) => void handleScreenshot(e.target.files?.[0])} /><span>{uploading ? 'Görsel sıkıştırılıyor...' : 'Dosya seç veya sürükle'}</span><small>En fazla 10 MB · otomatik sıkıştırılır</small></label>}
                </div>
                <label className="full-field">Notlar<textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Kurulum, duygular ve dersler..." /></label>
              </div>
              <div className="modal-actions"><button className="secondary-button" type="button" onClick={closeModal}>İptal</button><button className="primary-button" type="submit" disabled={uploading}>{editingId ? 'Değişiklikleri Kaydet' : 'İşlemi Ekle'}</button></div>
            </form>
          </div>
        </div>
      )}

      {previewTrade?.chartScreenshot && (
        <div className="modal-backdrop preview-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && setPreviewTrade(null)}>
          <div className="preview-modal" role="dialog" aria-modal="true" aria-labelledby="preview-title">
            <div className="preview-header">
              <div><p className="eyebrow">Grafik önizleme · {previewTrade.timeframe}</p><h2 id="preview-title">{previewTrade.symbol} {previewTrade.direction}</h2></div>
              <button className="icon-button" type="button" aria-label="Önizlemeyi kapat" onClick={() => setPreviewTrade(null)}><Icon name="close" /></button>
            </div>
            <div className="preview-image"><img src={previewTrade.chartScreenshot} alt={`${previewTrade.symbol} büyük işlem grafiği`} /></div>
            <div className="preview-meta">
              <div><span>Tarih</span><strong>{new Date(`${previewTrade.date}T00:00:00`).toLocaleDateString('tr-TR')}</strong></div>
              <div><span>Strateji</span><strong>{previewTrade.strategy}</strong></div>
              <div><span>Sonuç</span><strong className={previewTrade.pnl >= 0 ? 'positive' : 'negative'}>{previewTrade.result} · {money(previewTrade.pnl)}</strong></div>
              <div><span>Zaman dilimi</span><strong className="timeframe-badge">{previewTrade.timeframe}</strong></div>
            </div>
          </div>
        </div>
      )}

      {aiSettingsOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setAiSettingsOpen(false)}>
          <div className="modal ai-settings-modal" role="dialog" aria-modal="true" aria-labelledby="ai-settings-title">
            <div className="modal-header"><div><p className="eyebrow">OpenAI uyumlu sağlayıcı</p><h2 id="ai-settings-title">AI Sağlayıcı Ayarları</h2></div><button className="icon-button" type="button" aria-label="Ayarları kapat" onClick={() => setAiSettingsOpen(false)}><Icon name="close" /></button></div>
            <div className="ai-settings-form">
              <label>API Base URL<input type="url" value={aiBaseUrl} onChange={(event) => setAiBaseUrl(event.target.value)} placeholder="https://api.openai.com/v1" /></label>
              <label>API Key<input type="password" value={aiApiKey} onChange={(event) => setAiApiKey(event.target.value)} placeholder="sk-..." autoComplete="off" /></label>
              <label>Vision model<input type="text" value={aiModel} onChange={(event) => setAiModel(event.target.value)} placeholder="gpt-4o-mini" /></label>
              <div className="ai-key-warning"><strong>Tarayıcıdan doğrudan API kullanımı üretim için önerilmez.</strong><p>Anahtar React oturumu içinde tutulur; localStorage’a veya kaynak dosyasına kaydedilmez. Sayfayı yenilemek anahtarı siler. Üretimde bir backend proxy kullanın.</p></div>
            </div>
            <div className="modal-actions"><button className="primary-button" type="button" onClick={() => setAiSettingsOpen(false)}>Ayarları Kaydet</button></div>
          </div>
        </div>
      )}

      {tradeReview && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setTradeReview(null)}>
          <div className="modal trade-review-modal" role="dialog" aria-modal="true" aria-labelledby="trade-review-title">
            <div className="modal-header"><div><p className="eyebrow">Tek işlem incelemesi · {tradeReview.timeframe}</p><h2 id="trade-review-title">{tradeReview.symbol} — AI değerlendirmesi</h2></div><button className="icon-button" type="button" aria-label="İncelemeyi kapat" onClick={() => setTradeReview(null)}><Icon name="close" /></button></div>
            <div className="trade-review-body">
              {tradeReview.chartScreenshot && includeScreenshots && <img className="trade-review-chart" src={tradeReview.chartScreenshot} alt={`${tradeReview.symbol} işlem grafiği`} />}
              <div className="trade-review-meta"><span>{tradeReview.date}</span><span>{tradeReview.direction}</span><span>{tradeReview.strategy}</span><span>{tradeReview.result}</span></div>
              <p className="trade-review-consent">Bu işlem için sembol, tarih, yön, timeframe, fiyatlar, R/R, sonuç, P&L, strateji, etiketler ve seçili ise not/grafik gönderilir. Veriler yalnızca aşağıdaki butona basınca gönderilir.</p>
              {tradeReviewStatus === 'idle' && <button className="primary-button" type="button" onClick={() => void runTradeReview(tradeReview)}>Bu İşlemi AI ile Değerlendir</button>}
              {tradeReviewStatus === 'loading' && <div className="ai-loading" role="status"><span className="spinner" /><div><strong>İşlem inceleniyor</strong></div></div>}
              {tradeReviewStatus === 'error' && <div className="error-banner" role="alert">{aiError}</div>}
              {tradeReviewStatus === 'success' && aiResult && (
                <div className="ai-result-grid trade-review-result">
                  <article className="panel ai-result-card ai-summary"><span>Özet</span><p>{aiResult.summary}</p></article>
                  <article className="panel ai-result-card"><span>Güçlü Yönler</span><ul>{aiResult.strengths.map((item, index) => <li key={index}>{item}</li>)}</ul></article>
                  <article className="panel ai-result-card"><span>Zayıf Yönler</span><ul>{aiResult.weaknesses.map((item, index) => <li key={index}>{item}</li>)}</ul></article>
                  <article className="panel ai-result-card ai-priorities"><span>Öncelikli Öneriler</span><ol>{aiResult.priorityRecommendations.map((item, index) => <li key={index}>{item}</li>)}</ol></article>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function EquityChart({ data }: { data: { date: string; balance: number }[] }) {
  const width = 760
  const height = 260
  const pad = 18
  const values = data.map((item) => item.balance)
  const min = Math.min(...values, 0)
  const max = Math.max(...values, 1)
  const range = max - min || 1
  const points = data.map((item, index) => {
    const x = pad + (index / Math.max(data.length - 1, 1)) * (width - pad * 2)
    const y = height - pad - ((item.balance - min) / range) * (height - pad * 2)
    return `${x},${y}`
  }).join(' ')
  const baseline = height - pad - ((0 - min) / range) * (height - pad * 2)
  return (
    <svg className="equity-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Sermaye eğrisi grafiği">
      {[0, 1, 2, 3, 4].map((line) => <line key={line} x1="0" x2={width} y1={line * 52 + 26} y2={line * 52 + 26} className="grid-line" />)}
      <line x1="0" x2={width} y1={baseline} y2={baseline} className="zero-line" />
      <polygon points={`${pad},${height - pad} ${points} ${width - pad},${height - pad}`} className="chart-area" />
      <polyline points={points} className="chart-line" />
      {data.map((item, index) => {
        const [x, y] = points.split(' ')[index].split(',')
        return <circle key={item.date} cx={x} cy={y} r="3.5" className="chart-dot"><title>{new Date(`${item.date}T00:00:00`).toLocaleDateString('tr-TR')}: {money(item.balance)}</title></circle>
      })}
    </svg>
  )
}

export default App
