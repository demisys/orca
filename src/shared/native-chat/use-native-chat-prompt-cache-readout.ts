// Re-reads the cache countdown only when its minute changes, on the desktop composer and the phone.
import type * as React from 'react'
import type { AgentSessionPromptCache } from '../agent-session/conversation-context/agent-session-context-usage'
import { promptCacheReadout, type PromptCacheReadout } from './native-chat-context-usage-summary'

export function createPromptCacheReadoutHook({
  useEffect,
  useState
}: Pick<typeof React, 'useEffect' | 'useState'>) {
  return function usePromptCacheReadout(
    cache: AgentSessionPromptCache | undefined
  ): PromptCacheReadout | null {
    const [now, setNow] = useState(() => Date.now())
    const readout = cache ? promptCacheReadout(cache, now) : null
    const nextChangeAt = readout?.state === 'cold' ? null : (readout?.nextChangeAt ?? null)
    useEffect(() => {
      if (nextChangeAt === null) {
        return
      }
      const timer = setTimeout(() => setNow(Date.now()), Math.max(0, nextChangeAt - Date.now()))
      return () => clearTimeout(timer)
    }, [nextChangeAt])
    // A fresh fact arrives with a stale clock; read it against now so it never starts cold.
    useEffect(() => setNow(Date.now()), [cache])
    return readout
  }
}
