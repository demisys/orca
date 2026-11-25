import { useCallback, useEffect, useRef, useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Progress } from '@/components/ui/progress'
import { useIntlLocale, useTranslate } from '@/i18n/use-translate'
import { cn } from '@/lib/class-names'
import {
  coldRingFillDashes,
  coldRingTrackDashes,
  contextUsageRingReadout,
  formatContextTokenCount,
  keyContextUsageRows,
  type NativeChatContextUsageSummary,
  type PromptCacheReadout
} from '../../../../../shared/native-chat/native-chat-context-usage-summary'
import { createPromptCacheReadoutHook } from '../../../../../shared/native-chat/use-native-chat-prompt-cache-readout'

const RING_SIZE = 16
const RING_STROKE = 2
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS
const COLD_TRACK_DASHES = coldRingTrackDashes(RING_CIRCUMFERENCE).join(' ')
/** Long enough that a pointer crossing the ring toward dictation doesn't flash the card. */
const HOVER_OPEN_DELAY_MS = 150
/** Long enough for the pointer to cross the gap between the ring and the card. */
const HOVER_CLOSE_DELAY_MS = 100

const usePromptCacheReadout = createPromptCacheReadoutHook({ useEffect, useState })

/** `1h` or `5m`. */
function formatCacheTtl(ttlSeconds: number): string {
  return ttlSeconds >= 3600
    ? `${Math.round(ttlSeconds / 3600)}h`
    : `${Math.round(ttlSeconds / 60)}m`
}

/** Card open state where only mouse hover waits, to open and to close; any explicit change drops a pending hover. */
function useContextCardOpen(): {
  open: boolean
  setOpen: (next: boolean) => void
  setOpenAfterHover: (next: boolean) => void
} {
  const [open, setOpenState] = useState(false)
  const cancelPendingHover = useRef<(() => void) | null>(null)
  const dropPendingHover = useCallback((): void => {
    cancelPendingHover.current?.()
    cancelPendingHover.current = null
  }, [])
  useEffect(() => dropPendingHover, [dropPendingHover])
  const setOpen = useCallback(
    (next: boolean): void => {
      dropPendingHover()
      setOpenState(next)
    },
    [dropPendingHover]
  )
  const setOpenAfterHover = useCallback(
    (next: boolean): void => {
      dropPendingHover()
      // The card isn't mounted yet, so its own Escape handling can't cancel a pending open.
      const onKeyDown = (event: KeyboardEvent): void => {
        if (event.key === 'Escape') {
          dropPendingHover()
        }
      }
      const timer = setTimeout(
        () => setOpen(next),
        next ? HOVER_OPEN_DELAY_MS : HOVER_CLOSE_DELAY_MS
      )
      document.addEventListener('keydown', onKeyDown, true)
      cancelPendingHover.current = () => {
        clearTimeout(timer)
        document.removeEventListener('keydown', onKeyDown, true)
      }
    },
    [dropPendingHover, setOpen]
  )
  return { open, setOpen, setOpenAfterHover }
}

/** Deferred rows sit outside the window, so they show tokens rather than a share of it. */
function ContextUsageRowList({
  rows,
  className
}: {
  rows: ReturnType<typeof keyContextUsageRows>
  className: string
}): React.JSX.Element {
  return (
    <ul className={cn('space-y-1 text-xs', className)}>
      {rows.map(({ key, row }) => (
        <li key={key} className="flex items-baseline justify-between gap-3">
          <span
            className={cn(
              'min-w-0 truncate',
              row.deferred ? 'text-muted-foreground' : 'text-foreground'
            )}
          >
            {row.name}
          </span>
          <span className="shrink-0 tabular-nums text-muted-foreground">
            {row.deferred ? formatContextTokenCount(row.tokens) : `${row.percentage}%`}
          </span>
        </li>
      ))}
    </ul>
  )
}

function PromptCacheSection({ cache }: { cache: PromptCacheReadout }): React.JSX.Element {
  const t = useTranslate()
  const locale = useIntlLocale()
  const cold = cache.state === 'cold'
  return (
    <div className="mt-3 border-t border-border pt-3 text-xs">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-foreground">
          {t('components.native-chat.contextUsage.cacheTitle', 'Prompt cache')}
        </span>
        <span
          className={cn(
            'shrink-0 tabular-nums',
            cache.state === 'expiring' ? 'text-status-warning-text' : 'text-muted-foreground'
          )}
        >
          {cold
            ? t('components.native-chat.contextUsage.cacheCold', 'Cold')
            : t('components.native-chat.contextUsage.cacheMinutesLeft', '{{minutes}}m left', {
                minutes: String(cache.minutesLeft)
              })}
        </span>
      </div>
      <p className="mt-1 text-2xs text-muted-foreground">
        {cold
          ? t(
              'components.native-chat.contextUsage.cacheColdNote',
              'The next message rebuilds the cache, so it costs more.'
            )
          : t(
              'components.native-chat.contextUsage.cacheExpires',
              'Expires {{time}} · {{ttl}} TTL',
              {
                time: new Intl.DateTimeFormat(locale, {
                  hour: 'numeric',
                  minute: '2-digit'
                }).format(cache.expiresAt),
                ttl: formatCacheTtl(cache.ttlSeconds)
              }
            )}
      </p>
    </div>
  )
}

/** Composer ring for context-window usage; hover, click, tap, or Enter shows the provider's breakdown. */
export function NativeChatContextUsageRing({
  usage
}: {
  usage: NativeChatContextUsageSummary
}): React.JSX.Element {
  const t = useTranslate()
  const { filled, critical, used, window } = contextUsageRingReadout(usage)
  const cache = usePromptCacheReadout(usage.promptCache)
  const cold = cache?.state === 'cold'
  const contextLabel = t(
    'components.native-chat.contextUsage.label',
    'Context {{used}} of {{window}} tokens, {{percent}}% used',
    { used, window, percent: String(usage.percentage) }
  )
  const cacheLabel = !cache
    ? null
    : cold
      ? t('components.native-chat.contextUsage.cacheColdLabel', 'prompt cache cold')
      : t('components.native-chat.contextUsage.cacheWarmLabel', 'prompt cache {{minutes}}m left', {
          minutes: String(cache.minutesLeft)
        })
  const label = cacheLabel ? `${contextLabel}, ${cacheLabel}` : contextLabel
  const { open, setOpen, setOpenAfterHover } = useContextCardOpen()
  const rows = keyContextUsageRows(usage.rows)
  const counted = rows.filter(({ row }) => !row.deferred)
  const deferred = rows.filter(({ row }) => row.deferred)
  return (
    <div
      className="flex"
      // Only mouse hover drives delays; touch leaves before click, and portal entry must cancel pending close.
      onPointerEnter={(event) => {
        if (event.pointerType === 'mouse') {
          setOpenAfterHover(true)
        }
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === 'mouse') {
          setOpenAfterHover(false)
        }
      }}
      onContextMenu={() => setOpen(false)}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={label}
            aria-expanded={open}
            data-native-chat-context-usage={usage.percentage}
            data-native-chat-context-usage-estimated={usage.estimated ? 'true' : undefined}
            data-native-chat-prompt-cache={cache?.state}
            className={cn(
              'flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:size-11',
              cache?.state === 'expiring' && 'text-status-warning hover:text-status-warning',
              critical && 'text-destructive hover:text-destructive'
            )}
            // A read-only readout: clicking it must not pull focus out of the composer.
            onMouseDown={(event) => event.preventDefault()}
            onClick={(event) => {
              // Open, never toggle: a hover already opened it, and a click must not close it.
              event.preventDefault()
              setOpen(true)
            }}
          >
            <svg
              width={RING_SIZE}
              height={RING_SIZE}
              viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
              aria-hidden="true"
              className={cn('-rotate-90', cold && 'opacity-70')}
            >
              <circle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RING_RADIUS}
                fill="none"
                stroke="currentColor"
                strokeWidth={RING_STROKE}
                strokeDasharray={cold ? COLD_TRACK_DASHES : undefined}
                className="opacity-25"
              />
              <circle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RING_RADIUS}
                fill="none"
                stroke="currentColor"
                strokeWidth={RING_STROKE}
                {...(cold
                  ? { strokeDasharray: coldRingFillDashes(RING_CIRCUMFERENCE, filled).join(' ') }
                  : {
                      strokeLinecap: 'round' as const,
                      strokeDasharray: RING_CIRCUMFERENCE,
                      strokeDashoffset: RING_CIRCUMFERENCE * (1 - filled / 100)
                    })}
              />
            </svg>
          </button>
        </PopoverTrigger>
        <PopoverContent
          aria-label={label}
          side="top"
          align="end"
          sideOffset={8}
          className="w-72"
          onOpenAutoFocus={(event) => event.preventDefault()}
          // Closing on pointer leave or Escape would otherwise focus the ring and strand typing.
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          <div className="p-4">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium text-foreground">
                {t('components.native-chat.contextUsage.title', 'Context')}
              </span>
              <span className="tabular-nums text-muted-foreground">
                {used}/{window}
              </span>
            </div>
            <Progress value={filled} aria-label={label} className="mt-2 h-1.5" />
            {counted.length > 0 ? <ContextUsageRowList rows={counted} className="mt-3" /> : null}
            {deferred.length > 0 ? (
              <div className="mt-3 border-t border-border pt-3">
                <p className="text-2xs text-muted-foreground">
                  {t(
                    'components.native-chat.contextUsage.deferredNote',
                    'Loaded on demand. Not counted in the used total.'
                  )}
                </p>
                <ContextUsageRowList rows={deferred} className="mt-2" />
              </div>
            ) : null}
            {cache ? <PromptCacheSection cache={cache} /> : null}
            {usage.estimated ? (
              <p className="mt-3 text-2xs text-muted-foreground">
                {t(
                  'components.native-chat.contextUsage.estimated',
                  'Estimated from the last response.'
                )}
              </p>
            ) : null}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
