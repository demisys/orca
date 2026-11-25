import { memo, useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Svg, { Circle } from 'react-native-svg'
import {
  contextUsageRingReadout,
  type NativeChatContextUsageSummary,
  type PromptCacheReadout
} from '../../../../../../src/shared/native-chat/native-chat-context-usage-summary'
import { createPromptCacheReadoutHook } from '../../../../../../src/shared/native-chat/use-native-chat-prompt-cache-readout'
import { ListGroup, ListRow, SectionHeader } from '../../../../components/list/ListGroup'
import { useMobileTranslation, useMobileUiLocale } from '../../../../i18n/use-mobile-translation'
import {
  pressedStyle,
  radii,
  spacing,
  typography,
  type MobilePalette
} from '../../../../theme/mobile-theme'
import { themedStyleSheet, useThemedStyles } from '../../../../theme/themed-styles'
import { useMobileColors } from '../../../../theme/use-mobile-color-scheme'

/** Below this share used, context is not worth a line in the composer. */
const NEAR_LIMIT_PERCENTAGE = 80
const RING_SIZE = 16
const RING_STROKE = 2
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

const usePromptCacheReadout = createPromptCacheReadoutHook({ useEffect, useState })

export type MobileNativeChatContext = {
  usage: NativeChatContextUsageSummary | null
  /** Sends the agent's /compact; absent where the agent has none. */
  onCompact?: () => void
}

/** The context line is showing, which keeps the composer whole so its warning and Compact stay in view. */
export function mobileNativeChatContextNearLimit(
  usage: NativeChatContextUsageSummary | null
): boolean {
  return usage !== null && usage.percentage >= NEAR_LIMIT_PERCENTAGE
}

function contextTint(percentage: number, colors: MobilePalette): string {
  return percentage >= NEAR_LIMIT_PERCENTAGE + 10
    ? colors.statusRed
    : percentage >= NEAR_LIMIT_PERCENTAGE
      ? colors.statusAmber
      : colors.textSecondary
}

/** The composer's one context line, shown only near the window's end; the options sheet has the rest. */
export const MobileNativeChatContextLimitLine = memo(function MobileNativeChatContextLimitLine({
  usage,
  onCompact
}: MobileNativeChatContext): React.JSX.Element | null {
  const styles = useThemedStyles(stylesSheet)
  const colors = useMobileColors()
  const t = useMobileTranslation()
  if (!usage || !mobileNativeChatContextNearLimit(usage)) {
    return null
  }
  const { filled } = contextUsageRingReadout(usage)
  const tint = contextTint(usage.percentage, colors)
  const left = String(Math.max(0, 100 - Math.round(filled)))
  return (
    <View style={styles.line} testID="native-chat-context-usage">
      <Svg
        width={RING_SIZE}
        height={RING_SIZE}
        viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
        style={ringStyles.ring}
        pointerEvents="none"
      >
        <Circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          fill="none"
          stroke={tint}
          strokeWidth={RING_STROKE}
          opacity={0.25}
        />
        <Circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          fill="none"
          stroke={tint}
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={RING_CIRCUMFERENCE * (1 - filled / 100)}
        />
      </Svg>
      <Text style={[styles.lineText, { color: tint }]} numberOfLines={1}>
        {t('chat.contextUsage.left', '{{percent}}% context left', { percent: left })}
      </Text>
      {onCompact ? (
        <Pressable
          accessibilityRole="button"
          hitSlop={HIT_SLOP}
          onPress={onCompact}
          style={({ pressed }) => pressed && pressedStyle}
        >
          <Text style={styles.compact}>{t('chat.contextUsage.compact', 'Compact')}</Text>
        </Pressable>
      ) : null}
    </View>
  )
})

// The line is 22 pt tall; the slop grows Compact to a 44 pt target.
const HIT_SLOP = { top: 11, bottom: 11, left: spacing.sm, right: spacing.sm }

/** The options sheet's Context section: the share used with its bar, then Compact. */
export function MobileNativeChatContextSection({
  usage,
  onCompact
}: MobileNativeChatContext): React.JSX.Element | null {
  const styles = useThemedStyles(stylesSheet)
  const colors = useMobileColors()
  const t = useMobileTranslation()
  const cache = usePromptCacheReadout(usage?.promptCache)
  if (!usage) {
    return null
  }
  const { filled } = contextUsageRingReadout(usage)
  return (
    <>
      <SectionHeader title={t('chat.contextUsage.title', 'Context')} />
      <ListGroup>
        <ListRow
          key="usage"
          title={t('chat.contextUsage.used', '{{percent}}% used', {
            percent: String(Math.round(filled))
          })}
          detail={
            <View style={styles.track}>
              <View
                style={[
                  styles.fill,
                  { width: `${filled}%`, backgroundColor: contextTint(usage.percentage, colors) }
                ]}
              />
            </View>
          }
        />
        {cache ? <PromptCacheRow key="cache" cache={cache} /> : null}
        {onCompact ? (
          <ListRow
            key="compact"
            title={t('chat.contextUsage.compact', 'Compact')}
            accent
            onPress={onCompact}
          />
        ) : null}
      </ListGroup>
    </>
  )
}

/** `1h` or `5m`. */
function formatCacheTtl(ttlSeconds: number): string {
  return ttlSeconds >= 3600
    ? `${Math.round(ttlSeconds / 3600)}h`
    : `${Math.round(ttlSeconds / 60)}m`
}

function PromptCacheRow({ cache }: { cache: PromptCacheReadout }): React.JSX.Element {
  const colors = useMobileColors()
  const t = useMobileTranslation()
  const locale = useMobileUiLocale()
  const cold = cache.state === 'cold'
  return (
    <ListRow
      title={t('chat.contextUsage.cacheTitle', 'Prompt cache')}
      subtitle={
        cold
          ? t(
              'chat.contextUsage.cacheColdNote',
              'The next message rebuilds the cache, so it costs more.'
            )
          : t('chat.contextUsage.cacheExpires', 'Expires {{time}} · {{ttl}} TTL', {
              time: new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(
                cache.expiresAt
              ),
              ttl: formatCacheTtl(cache.ttlSeconds)
            })
      }
      value={
        cold
          ? t('chat.contextUsage.cacheCold', 'Cold')
          : t('chat.contextUsage.cacheMinutesLeft', '{{minutes}}m left', {
              minutes: String(cache.minutesLeft)
            })
      }
      valueColor={cache.state === 'expiring' ? colors.statusAmber : undefined}
    />
  )
}

const ringStyles = StyleSheet.create({
  ring: { transform: [{ rotate: '-90deg' }] }
})

const stylesSheet = themedStyleSheet((colors) => ({
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 22,
    paddingHorizontal: 6,
    marginBottom: spacing.sm
  },
  lineText: {
    flex: 1,
    minWidth: 0,
    fontSize: typography.bodySize,
    fontWeight: '500'
  },
  compact: {
    color: colors.accentBlue,
    fontSize: typography.bodySize,
    fontWeight: '500'
  },
  track: {
    height: 4,
    marginTop: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.translucentFill,
    overflow: 'hidden'
  },
  fill: {
    height: '100%',
    borderRadius: radii.pill
  }
}))
