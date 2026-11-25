import type { StructuredAgentContextUsage } from '../agent-session/conversation-context/structured-agent-session-context-usage'
import type { AgentSessionPromptCache } from '../agent-session/conversation-context/agent-session-context-usage'

/** Reduce provider context breakdowns to the rows shown by the composer ring. */
export type NativeChatContextUsageSummary = {
  usedTokens: number
  windowTokens: number
  percentage: number
  estimated: boolean
  /** Largest first, as a share of the window; empty rows are dropped, and deferred rows sit outside the used total. */
  rows: readonly { name: string; tokens: number; percentage: number; deferred?: true }[]
  promptCache?: AgentSessionPromptCache
}

/** Past this the window is nearly spent, so the ring turns red to say so. */
const CRITICAL_PERCENTAGE = 90

/** What a ring draws: its fill clamped to 0-100, the red state, and the token counts as shown. */
export function contextUsageRingReadout(usage: NativeChatContextUsageSummary): {
  filled: number
  critical: boolean
  used: string
  window: string
} {
  return {
    filled: Math.min(Math.max(usage.percentage, 0), 100),
    critical: usage.percentage >= CRITICAL_PERCENTAGE,
    used: formatContextTokenCount(usage.usedTokens),
    window: formatContextTokenCount(usage.windowTokens)
  }
}

/** The last fifth of the TTL; whole minutes for both the 5m and 1h TTLs. */
const EXPIRING_SHARE = 0.2
const MINUTE_MS = 60_000

export type PromptCacheReadout =
  | {
      state: 'warm' | 'expiring'
      expiresAt: number
      ttlSeconds: number
      /** Rounded up, so the last minute reads 1 rather than 0. */
      minutesLeft: number
      /** When `minutesLeft` (and with it `state`) next changes. */
      nextChangeAt: number
    }
  | { state: 'cold' }

export function promptCacheReadout(
  cache: AgentSessionPromptCache,
  now: number
): PromptCacheReadout {
  if (cache.kind === 'cold') {
    return { state: 'cold' }
  }
  const ttlMs = cache.ttlSeconds * 1000
  const expiresAt = cache.refreshedAt + ttlMs
  // Clamped so a host clock ahead of this one never reads past the TTL.
  const leftMs = Math.min(expiresAt - now, ttlMs)
  if (leftMs <= 0) {
    return { state: 'cold' }
  }
  const minutesLeft = Math.ceil(leftMs / MINUTE_MS)
  return {
    state: leftMs <= ttlMs * EXPIRING_SHARE ? 'expiring' : 'warm',
    expiresAt,
    ttlSeconds: cache.ttlSeconds,
    minutesLeft,
    nextChangeAt: expiresAt - (minutesLeft - 1) * MINUTE_MS
  }
}

/** Twelve dashes tile a ring evenly, so the seam at the top never shows. */
const COLD_RING_DASH_COUNT = 12
const COLD_RING_DASH_SHARE = 0.6

/** A cold ring's track: even dashes all the way round. */
export function coldRingTrackDashes(circumference: number): number[] {
  const period = circumference / COLD_RING_DASH_COUNT
  return [period * COLD_RING_DASH_SHARE, period * (1 - COLD_RING_DASH_SHARE)]
}

/** A cold ring's fill: the track's dashes, cut off at the used share. */
export function coldRingFillDashes(circumference: number, filled: number): number[] {
  const period = circumference / COLD_RING_DASH_COUNT
  const dash = period * COLD_RING_DASH_SHARE
  const dashes: number[] = []
  let left = (circumference * filled) / 100
  while (left > 0) {
    dashes.push(Math.min(dash, left))
    left -= period
    dashes.push(left > 0 ? period - dash : circumference)
  }
  // An empty array would draw a solid ring.
  return dashes.length > 0 ? dashes : [0, circumference]
}

function rowPercentage(tokens: number, windowTokens: number): number {
  return windowTokens > 0 ? Math.round((tokens / windowTokens) * 1000) / 10 : 0
}

export function summarizeContextUsage(
  usage: StructuredAgentContextUsage
): NativeChatContextUsageSummary {
  return {
    usedTokens: usage.usedTokens,
    windowTokens: usage.windowTokens,
    percentage: usage.percentage,
    estimated: usage.estimated,
    ...(usage.promptCache ? { promptCache: usage.promptCache } : {}),
    rows: usage.categories
      .filter((row) => row.tokens > 0)
      .map((row) => ({
        name: row.name,
        tokens: row.tokens,
        percentage: rowPercentage(row.tokens, usage.windowTokens),
        ...(row.deferred === true ? { deferred: true as const } : {})
      }))
      .sort((left, right) => right.tokens - left.tokens)
  }
}

/** The CLI can repeat a category name, so a row's key counts which repeat it is. */
export function keyContextUsageRows(
  rows: NativeChatContextUsageSummary['rows']
): { key: string; row: NativeChatContextUsageSummary['rows'][number] }[] {
  const seen = new Map<string, number>()
  return rows.map((row) => {
    const repeat = seen.get(row.name) ?? 0
    seen.set(row.name, repeat + 1)
    return { key: `${repeat}:${row.name}`, row }
  })
}

/** `18.6k`, `981.4k`, `1M`: capital M, since a lowercase one reads as minutes. */
export function formatContextTokenCount(tokens: number): string {
  const safe = Math.max(0, tokens)
  // Compared after rounding, so 999,960 reads `1M` rather than `1000k`.
  if (Math.round(safe / 100) >= 10_000) {
    return `${trimZero((safe / 1_000_000).toFixed(1))}M`
  }
  if (safe >= 1_000) {
    return `${trimZero((safe / 1_000).toFixed(1))}k`
  }
  return String(Math.round(safe))
}

function trimZero(value: string): string {
  return value.endsWith('.0') ? value.slice(0, -2) : value
}
