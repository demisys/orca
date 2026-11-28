import type { TerminalTab } from '../../../../../shared/workspace-layout/terminal-tab-types'
import { parseExecutionHostId } from '../../../../../shared/execution-host/execution-host'
import { getPtyExecutionHost } from '../../../../../shared/terminal/pty/lifecycle/terminal-execution-host'
import { findChatDockOwnerTab } from '../../../../../shared/workspace-layout/chat-dock-terminal'
import { toHostSessionTabId } from '../../../../../shared/workspace-layout/terminal-surface-id'
import { recordWebSessionCloseIntent } from '@/runtime/web-session-tabs-sync/closing/web-session-close-intent'
import { isServerFrameDrawnWorkspace } from '@/runtime/web-session-tabs-sync/frame-drawn/frame-drawn-server-workspace-set'
import type { TerminalStoreGet } from '../terminal-state'
import type { AppState } from '../../types'
import type { TerminalTabCloseReason } from './terminal-tab-retirement'
import { setNativeChatTerminalPanelOpen } from '@/components/native-chat/composer/terminal-panel/native-chat-terminal-panel-state'

/** The runtime a docked shell runs on: its bound PTY's, else its chat's, which must still be open. */
function chatDockRuntimeEnvironmentId(
  state: Pick<AppState, 'unifiedTabsByWorktree'>,
  worktreeId: string,
  tab: TerminalTab
): string | null {
  const host =
    parseExecutionHostId(getPtyExecutionHost(tab.ptyId)) ??
    parseExecutionHostId(
      tab.chatDock
        ? findChatDockOwnerTab(state.unifiedTabsByWorktree[worktreeId], tab.chatDock.ownerTabId)
            ?.executionHostId
        : undefined
    )
  return host?.kind === 'runtime' ? host.environmentId : null
}

/** Retires the shells docked in a chat tab that is closing; call before the chat's own tab is removed. */
export function closeChatDockTerminalsOwnedBy(
  get: TerminalStoreGet,
  ownerTabId: string,
  ownerCloseReason: TerminalTabCloseReason
): void {
  setNativeChatTerminalPanelOpen(ownerTabId, false)
  const state = get()
  const docked = Object.entries(state.tabsByWorktree).flatMap(([worktreeId, tabs]) =>
    tabs
      .filter((tab) => tab.chatDock?.ownerTabId === ownerTabId)
      .map((tab) => ({ tab, worktreeId }))
  )
  for (const { tab, worktreeId } of docked) {
    // A user close must reach the host's tab too; other closes just retire the terminal, as before.
    const environmentId =
      ownerCloseReason === 'user' ? chatDockRuntimeEnvironmentId(state, worktreeId, tab) : null
    if (environmentId && !isServerFrameDrawnWorkspace(environmentId, worktreeId)) {
      // Before the async close, so a snapshot already in flight cannot revive it as a plain tab.
      recordWebSessionCloseIntent(
        { environmentId },
        worktreeId,
        toHostSessionTabId(tab.id),
        Date.now()
      )
    }
    get().closeTab(tab.id, {
      reason: 'cleanup',
      recordInteraction: false,
      captureRecentlyClosed: false,
      ...(environmentId ? { remoteCloseOwnedByHost: true } : {})
    })
    if (environmentId) {
      // Lazy import avoids store → session → store cyclic initialization.
      void import('@/runtime/web-session-tabs-sync/actions/web-runtime-session-tab-lifecycle').then(
        ({ closeWebRuntimeSessionTab }) =>
          closeWebRuntimeSessionTab({ worktreeId, tabId: tab.id, environmentId, reason: 'user' })
      )
    }
  }
}
