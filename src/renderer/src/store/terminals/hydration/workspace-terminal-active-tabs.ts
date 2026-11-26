import type { TerminalTab } from '../../../../../shared/workspace-layout/terminal-tab-types'
import { firstTabBarTerminal } from '../../../../../shared/workspace-layout/chat-dock-terminal'
import type { WorkspaceSessionState } from '../../../../../shared/workspace-session/workspace-session-state-types'

/** Restore per-worktree active tab; validate ids when the map exists, else derive for legacy sessions. */
export function restoreActiveTabIdByWorktree({
  session,
  validWorktreeIds,
  validTabIds,
  canonicalTabIdBySubsumedTabId,
  tabsByWorktree,
  activeWorktreeId,
  activeTabId
}: {
  session: Pick<WorkspaceSessionState, 'activeTabIdByWorktree'>
  validWorktreeIds: ReadonlySet<string>
  validTabIds: ReadonlySet<string>
  canonicalTabIdBySubsumedTabId: ReadonlyMap<string, string>
  tabsByWorktree: Readonly<Record<string, TerminalTab[]>>
  /** The restored active workspace and terminal, already validated. */
  activeWorktreeId: string | null
  activeTabId: string | null
}): Record<string, string | null> {
  const activeTabIdByWorktree: Record<string, string | null> = {}
  if (session.activeTabIdByWorktree) {
    for (const [wId, tabId] of Object.entries(session.activeTabIdByWorktree)) {
      if (!validWorktreeIds.has(wId) || !tabId) {
        continue
      }
      // Follow subsumed rows to the canonical twin holding their PTY so workspace focus survives.
      const restored = validTabIds.has(tabId) ? tabId : canonicalTabIdBySubsumedTabId.get(tabId)
      if (restored && validTabIds.has(restored)) {
        activeTabIdByWorktree[wId] = restored
      }
    }
  } else {
    // Legacy sessions: best-effort derivation
    if (activeWorktreeId && activeTabId) {
      activeTabIdByWorktree[activeWorktreeId] = activeTabId
    }
    for (const [wId, tabs] of Object.entries(tabsByWorktree)) {
      const first = firstTabBarTerminal(tabs)
      if (!activeTabIdByWorktree[wId] && first) {
        activeTabIdByWorktree[wId] = first.id
      }
    }
  }
  return activeTabIdByWorktree
}
