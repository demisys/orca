import { defineFixture } from '../../../component-fixtures/component-fixture'
import { summarizeContextUsage } from '../../../../../shared/native-chat/native-chat-context-usage-summary'
import { NativeChatContextUsageRing } from './NativeChatContextUsageRing'

const usage = summarizeContextUsage({
  usedTokens: 607_700,
  windowTokens: 1_000_000,
  percentage: 61,
  estimated: false,
  categories: [
    { name: 'System prompt', tokens: 4_100 },
    { name: 'System tools', tokens: 8_900 },
    { name: 'MCP tools (deferred)', tokens: 542_000, deferred: true },
    { name: 'System tools (deferred)', tokens: 17_000, deferred: true },
    { name: 'Memory files', tokens: 5_700 },
    { name: 'Messages', tokens: 589_000 },
    { name: 'Free space', tokens: 359_300 },
    { name: 'Autocompact buffer', tokens: 33_000 }
  ]
})

export const deferredTools = defineFixture({
  width: 360,
  render: () => (
    <div className="flex h-96 items-end justify-end bg-background p-4">
      <NativeChatContextUsageRing usage={usage} />
    </div>
  ),
  interact: (frame) => {
    frame.querySelector<HTMLButtonElement>('button[data-native-chat-context-usage]')?.click()
  }
})

const MINUTE = 60_000
const cacheUsage = (
  promptCache: NonNullable<Parameters<typeof summarizeContextUsage>[0]['promptCache']>
) =>
  summarizeContextUsage({
    usedTokens: 120_400,
    windowTokens: 1_000_000,
    percentage: 12,
    estimated: true,
    categories: [],
    promptCache
  })

function cacheFixture(make: () => Parameters<typeof cacheUsage>[0]) {
  return defineFixture({
    width: 360,
    render: () => (
      <div className="flex h-48 items-end justify-end bg-background p-4">
        <NativeChatContextUsageRing usage={cacheUsage(make())} />
      </div>
    ),
    interact: (frame) => {
      frame.querySelector<HTMLButtonElement>('button[data-native-chat-context-usage]')?.click()
    }
  })
}

export const cacheWarm = cacheFixture(() => ({
  kind: 'warm',
  ttlSeconds: 3600,
  refreshedAt: Date.now() - 8 * MINUTE
}))

export const cacheExpiring = cacheFixture(() => ({
  kind: 'warm',
  ttlSeconds: 3600,
  refreshedAt: Date.now() - 56 * MINUTE
}))

export const cacheCold = cacheFixture(() => ({ kind: 'cold', capturedAt: Date.now() }))
