import { useSyncExternalStore } from 'react'

// Per chat tab, so the panel survives the composer unmounting behind prompt cards and subagent views.
const openPanels = new Set<string>()
const openPanelSubscribers = new Set<() => void>()
// The worktree each open panel created its shell in; a shell missing there has exited, even while unmounted.
const createdDockWorktreeByOwner = new Map<string, string>()
// Opening focuses the shell once; remounts from tab switches or subagent views leave focus alone.
const focusOnMountOwners = new Set<string>()

function subscribeOpenPanels(onChange: () => void): () => void {
  openPanelSubscribers.add(onChange)
  return () => {
    openPanelSubscribers.delete(onChange)
  }
}

/** Closing a chat calls this with false, so a reopened chat with the same tab id starts closed. */
export function setNativeChatTerminalPanelOpen(ownerTabId: string, open: boolean): void {
  if (open === openPanels.has(ownerTabId)) {
    return
  }
  if (open) {
    openPanels.add(ownerTabId)
    focusOnMountOwners.add(ownerTabId)
  } else {
    openPanels.delete(ownerTabId)
    focusOnMountOwners.delete(ownerTabId)
    createdDockWorktreeByOwner.delete(ownerTabId)
  }
  for (const subscriber of openPanelSubscribers) {
    subscriber()
  }
}

export function useNativeChatTerminalPanelOpen(ownerTabId: string | undefined): boolean {
  return useSyncExternalStore(subscribeOpenPanels, () =>
    ownerTabId ? openPanels.has(ownerTabId) : false
  )
}

export function chatDockCreatedWorktree(ownerTabId: string): string | undefined {
  return createdDockWorktreeByOwner.get(ownerTabId)
}

export function recordChatDockCreated(ownerTabId: string, worktreeId: string): void {
  createdDockWorktreeByOwner.set(ownerTabId, worktreeId)
}

export function wantsChatDockFocusOnMount(ownerTabId: string): boolean {
  return focusOnMountOwners.has(ownerTabId)
}

export function consumeChatDockFocusOnMount(ownerTabId: string): void {
  focusOnMountOwners.delete(ownerTabId)
}
