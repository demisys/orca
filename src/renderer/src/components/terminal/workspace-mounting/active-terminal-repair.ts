import type {
  Tab,
  WorkspaceVisibleTabType
} from '../../../../../shared/workspace-layout/tab-groups/tab-types'
import type { TerminalTab } from '../../../../../shared/workspace-layout/terminal-tab-types'
import { isAttachedChatDock } from '../../../../../shared/workspace-layout/chat-dock-terminal'

type ChatDockOwners = readonly Pick<Tab, 'id' | 'entityId'>[] | undefined

/** A shell docked in an open chat is never the workspace's active terminal. */
function repairCandidates(tabs: TerminalTab[], unifiedTabs: ChatDockOwners): TerminalTab[] {
  return tabs.filter((tab) => !isAttachedChatDock(tab, unifiedTabs))
}

export function shouldRepairActiveTerminalTab(args: {
  activeTabType: WorkspaceVisibleTabType
  activeTabId: string | null
  tabs: TerminalTab[]
  unifiedTabs?: ChatDockOwners
}): boolean {
  const candidates = repairCandidates(args.tabs, args.unifiedTabs)
  return (
    args.activeTabType === 'terminal' &&
    candidates.length > 0 &&
    (!args.activeTabId || !candidates.some((tab) => tab.id === args.activeTabId))
  )
}

export function resolveRepairedActiveTerminalTabId(args: {
  activeTabType: WorkspaceVisibleTabType
  activeTabId: string | null
  rememberedTabId: string | null | undefined
  tabs: TerminalTab[]
  unifiedTabs?: ChatDockOwners
}): string | null {
  if (!shouldRepairActiveTerminalTab(args)) {
    return null
  }
  const candidates = repairCandidates(args.tabs, args.unifiedTabs)
  if (args.rememberedTabId && candidates.some((tab) => tab.id === args.rememberedTabId)) {
    return args.rememberedTabId
  }
  return candidates[0].id
}
