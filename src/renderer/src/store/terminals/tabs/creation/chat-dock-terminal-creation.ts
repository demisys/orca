import { createNonSecureContextUuid } from '../../../../../../shared/identifiers/non-secure-context-uuid'
import type { TerminalTab } from '../../../../../../shared/workspace-layout/terminal-tab-types'
import { singlePaneLayoutSnapshot } from '../../layout/terminal-single-pane-layout'
import { replaceTabBuckets } from '../../../record-transitions/keyed-record-transitions'
import { applyRecordOperations } from './terminal-companion-record-operations'
import { resolveTerminalCreatedShell } from './terminal-created-shell'
import type { TerminalSlice, TerminalStoreGet, TerminalStoreSet } from '../../terminal-state'
import type { AppState } from '../../../types'

export function findChatDockTerminal(
  state: Pick<AppState, 'tabsByWorktree'>,
  worktreeId: string,
  ownerTabId: string
): TerminalTab | null {
  return (
    (state.tabsByWorktree[worktreeId] ?? []).find(
      (tab) => tab.chatDock?.ownerTabId === ownerTabId
    ) ?? null
  )
}

/** A terminal row without a tab-bar entry: the workspace mounts it and a chat portals it in. */
export function createChatDockTerminalActions(
  set: TerminalStoreSet,
  get: TerminalStoreGet
): Pick<TerminalSlice, 'createChatDockTerminal'> {
  return {
    createChatDockTerminal: (worktreeId, ownerTabId) => {
      const existing = findChatDockTerminal(get(), worktreeId, ownerTabId)
      if (existing) {
        return existing
      }
      const state = get()
      const { createdShellOverride } = resolveTerminalCreatedShell(
        state,
        worktreeId,
        undefined,
        undefined,
        undefined
      )
      const id = createNonSecureContextUuid()
      const title = 'Chat terminal'
      const tab: TerminalTab = {
        id,
        ptyId: null,
        worktreeId,
        title,
        defaultTitle: title,
        customTitle: null,
        color: null,
        sortOrder: (state.tabsByWorktree[worktreeId] ?? []).length,
        createdAt: Date.now(),
        ...(createdShellOverride !== undefined ? { shellOverride: createdShellOverride } : {}),
        chatDock: { ownerTabId }
      }
      set((current) => ({
        tabsByWorktree: replaceTabBuckets(current.tabsByWorktree, [
          [worktreeId, [...(current.tabsByWorktree[worktreeId] ?? []), tab]]
        ]),
        ptyIdsByTabId: applyRecordOperations(current.ptyIdsByTabId, [[id, []]]),
        terminalLayoutsByTabId: applyRecordOperations(current.terminalLayoutsByTabId, [
          [id, singlePaneLayoutSnapshot(createNonSecureContextUuid())]
        ])
      }))
      return tab
    }
  }
}
