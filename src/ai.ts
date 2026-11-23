import type { Trade } from './App'

export type AiCoachingResult = {
  summary: string
  strengths: string[]
  weaknesses: string[]
  priorityRecommendations: string[]
  followUpPrompts: string[]
}

export type AiProviderSettings = {
  provider: 'gemini' | 'openai'
  baseUrl: string
  apiKey: string
  model: string
}

const cleanJson = (text: string) => {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start >= 0 && end > start) return text.slice(start, end + 1)
  return text
}

export async function requestOpenAiCompatibleCoaching(
  settings: AiProviderSettings,
  prompt: string,
  screenshots: string[],
): Promise<AiCoachingResult> {
  if (!settings.apiKey.trim()) throw new Error('API anahtarı girilmedi.')

  const base = settings.baseUrl.trim().replace(/\/$/, '')
  const endpoint = base.endsWith('/chat/completions') ? base : `${base}/chat/completions`
  const content: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> = [
    { type: 'text', text: prompt },
  ]

  for (const screenshot of screenshots) {
    if (screenshot.startsWith('data:image/')) content.push({ type: 'image_url', image_url: { url: screenshot } })
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey.trim()}`,
    },
    body: JSON.stringify({
      model: settings.model.trim() || (settings.provider === 'gemini' ? 'gemini-3.8-flash' : 'gpt-4o-mini'),
      temperature: 0.35,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'Sen bir trading koçusun. Veri odaklı, ölçülü ve uygulamaya dönük Türkçe geri bildirim ver. Finansal tavsiye değil; risk yönetimi ve süreç iyileştirmesi odaklı ol. Tam olarak JSON nesnesi döndür: summary, strengths, weaknesses, priorityRecommendations, followUpPrompts. Diziler metin dizisidir.',
        },
        { role: 'user', content },
      ],
    }),
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`Sağlayıcı hatası (${response.status}): ${detail.slice(0, 220)}`)
  }

  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
  const text = payload.choices?.[0]?.message?.content
  if (!text) throw new Error('Sağlayıcı yapılandırılmış bir yanıt vermedi.')

  try {
    const parsed = JSON.parse(cleanJson(text)) as Partial<AiCoachingResult>
    return {
      summary: parsed.summary || 'Özet oluşturulamadı.',
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
      weaknesses: Array.isArray(parsed.weaknesses) ? parsed.weaknesses : [],
      priorityRecommendations: Array.isArray(parsed.priorityRecommendations) ? parsed.priorityRecommendations : [],
      followUpPrompts: Array.isArray(parsed.followUpPrompts) ? parsed.followUpPrompts : [],
    }
  } catch {
    throw new Error('Sağlayıcı yanıtı beklenen JSON formatında değildi.')
  }
}

export function buildJournalSnapshot(trades: Trade[], includeNotes: boolean) {
  const wins = trades.filter((trade) => trade.result === 'Kazanç')
  const losses = trades.filter((trade) => trade.result === 'Kayıp')
  const grossProfit = wins.reduce((sum, trade) => sum + Math.max(trade.pnl, 0), 0)
  const grossLoss = Math.abs(losses.reduce((sum, trade) => sum + Math.min(trade.pnl, 0), 0))
  const net = trades.reduce((sum, trade) => sum + trade.pnl, 0)

  const byStrategy = [...new Set(trades.map((trade) => trade.strategy))].map((strategy) => {
    const group = trades.filter((trade) => trade.strategy === strategy)
    const winsInGroup = group.filter((trade) => trade.result === 'Kazanç').length
    return {
      strategy,
      trades: group.length,
      winRate: group.length ? (winsInGroup / group.length) * 100 : 0,
      netPnl: group.reduce((sum, trade) => sum + trade.pnl, 0),
    }
  })

  const byTimeframe = [...new Set(trades.map((trade) => trade.timeframe))].map((timeframe) => {
    const group = trades.filter((trade) => trade.timeframe === timeframe)
    return { timeframe, trades: group.length, netPnl: group.reduce((sum, trade) => sum + trade.pnl, 0) }
  })

  const byDirection = [...new Set(trades.map((trade) => trade.direction))].map((direction) => {
    const group = trades.filter((trade) => trade.direction === direction)
    return { direction, trades: group.length, netPnl: group.reduce((sum, trade) => sum + trade.pnl, 0) }
  })

  const ordered = [...trades].sort((a, b) => a.date.localeCompare(b.date))
  let streak = 0
  let longestWin = 0
  let longestLoss = 0
  let lastResult: string | null = null
  for (const trade of ordered) {
    if (trade.result === lastResult) streak += 1
    else { streak = 1; lastResult = trade.result }
    if (trade.result === 'Kazanç') longestWin = Math.max(longestWin, streak)
    if (trade.result === 'Kayıp') longestLoss = Math.max(longestLoss, streak)
  }

  return {
    aggregate: {
      totalTrades: trades.length,
      winRate: trades.length ? (wins.length / trades.length) * 100 : 0,
      netPnl: net,
      grossProfit,
      grossLoss,
      profitFactor: grossLoss ? grossProfit / grossLoss : grossProfit ? 99 : 0,
      avgWin: wins.length ? wins.reduce((sum, trade) => sum + trade.pnl, 0) / wins.length : 0,
      avgLoss: losses.length ? losses.reduce((sum, trade) => sum + trade.pnl, 0) / losses.length : 0,
      avgRiskReward: trades.length ? trades.reduce((sum, trade) => sum + trade.riskReward, 0) / trades.length : 0,
      longestWinStreak: longestWin,
      longestLossStreak: longestLoss,
      byStrategy,
      byTimeframe,
      byDirection,
      repeatedTags: [...new Set(trades.flatMap((trade) => trade.tags))].map((tag) => ({ tag, count: trades.filter((trade) => trade.tags.includes(tag)).length })),
    },
    trades: trades.map((trade) => ({
      date: trade.date,
      symbol: trade.symbol,
      direction: trade.direction,
      timeframe: trade.timeframe,
      entry: trade.entry,
      stopLoss: trade.stopLoss,
      takeProfit: trade.takeProfit,
      exit: trade.exit,
      riskReward: trade.riskReward,
      result: trade.result,
      pnl: trade.pnl,
      strategy: trade.strategy,
      tags: trade.tags,
      notes: includeNotes ? trade.notes : '[notlar gizlendi]',
      chartScreenshots: trade.chartScreenshots?.length
        ? trade.chartScreenshots.map((_, index) => `[ekran görüntüsü ${index + 1} dahil]`)
        : trade.chartScreenshot
          ? ['[ekran görüntüsü dahil]']
          : ['[ekran görüntüsü yok]'],
    })),
  }
}
