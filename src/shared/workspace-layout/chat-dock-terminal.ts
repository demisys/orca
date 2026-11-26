import type { TerminalTab } from './terminal-tab-types'
import type { Tab } from './tab-groups/tab-types'

/** A chat names its docked shell by either its unified tab id or the entity behind it. */
export function isChatDockOwner(tab: Pick<Tab, 'id' | 'entityId'>, ownerTabId: string): boolean {
  return tab.id === ownerTabId || tab.entityId === ownerTabId
}

export function findChatDockOwnerTab<T extends Pick<Tab, 'id' | 'entityId'>>(
  unifiedTabs: readonly T[] | undefined,
  ownerTabId: string
): T | undefined {
  return unifiedTabs?.find((tab) => isChatDockOwner(tab, ownerTabId))
}

/** A docked shell whose chat is still open in the same workspace; once the chat is gone it surfaces as a plain tab. */
export function isAttachedChatDock(
  tab: Pick<TerminalTab, 'chatDock'>,
  unifiedTabs: readonly Pick<Tab, 'id' | 'entityId'>[] | undefined
): boolean {
  return tab.chatDock !== undefined && !!findChatDockOwnerTab(unifiedTabs, tab.chatDock.ownerTabId)
}

/** The first terminal a user can see in the tab bar; docked shells never receive workspace commands. */
export function firstTabBarTerminal<T extends { chatDock?: unknown }>(
  tabs: readonly T[] | undefined
): T | undefined {
  return tabs?.find((tab) => !tab.chatDock)
}
