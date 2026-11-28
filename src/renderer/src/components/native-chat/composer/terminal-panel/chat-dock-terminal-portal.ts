import { useMemo, useSyncExternalStore } from 'react'
import type { ActivityTerminalPortalTarget } from '../../../activity/terminal-portal/activity-terminal-portal'

/** Marks the panel root so app shortcuts can leave docked-shell keys to the shell. */
export const CHAT_DOCK_TERMINAL_ATTRIBUTE = 'data-chat-dock-terminal'

export function isChatDockTerminalElement(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(`[${CHAT_DOCK_TERMINAL_ATTRIBUTE}]`) !== null
}

/** Marks where the docked shell's terminal draws, apart from the panel's header and resize edge. */
export const CHAT_DOCK_TERMINAL_HOST_ATTRIBUTE = 'data-chat-dock-terminal-host'

export function findChatDockTerminalHost(target: EventTarget | null): Element | null {
  return target instanceof Element ? target.closest(`[${CHAT_DOCK_TERMINAL_HOST_ATTRIBUTE}]`) : null
}

// Chat panels publish where their docked shell should draw; the workspace keeps owning its TerminalPane.
let targets: ActivityTerminalPortalTarget[] = []
const subscribers = new Set<() => void>()

function publish(next: ActivityTerminalPortalTarget[]): void {
  targets = next
  for (const subscriber of subscribers) {
    subscriber()
  }
}

/** Shows the docked shell in `target` until the returned release runs. */
export function claimChatDockTerminalPortal(
  target: Omit<ActivityTerminalPortalTarget, 'requestToken' | 'paneKey' | 'forceUnavailable'>
): () => void {
  const entry: ActivityTerminalPortalTarget = { ...target, requestToken: '', paneKey: null }
  publish([...targets.filter((other) => other.slotId !== target.slotId), entry])
  return () => publish(targets.filter((other) => other !== entry))
}

function subscribe(onChange: () => void): () => void {
  subscribers.add(onChange)
  return () => {
    subscribers.delete(onChange)
  }
}

function getSnapshot(): ActivityTerminalPortalTarget[] {
  return targets
}

/** The given terminal portals plus every open chat panel's docked shell. */
export function useWithChatDockTerminalPortals(
  portals: ActivityTerminalPortalTarget[]
): ActivityTerminalPortalTarget[] {
  const docked = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  return useMemo(
    () => (docked.length === 0 ? portals : portals.length === 0 ? docked : [...portals, ...docked]),
    [docked, portals]
  )
}
