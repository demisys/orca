import type { PaneManager } from '@/lib/pane-manager/pane-manager'
import { focusNativeChatPromptCard } from '../../native-chat/prompts/use-native-chat-prompt-card-focus'
import { findChatDockTerminalHost } from '../../native-chat/composer/terminal-panel/chat-dock-terminal-portal'

const NATIVE_CHAT_COVER_SELECTOR = '.native-chat-pane-shell'

/** Exclude only the chat-covered leaf; sibling terminal leaves in the same chat-mode tab still accept focus. */
export const UNCOVERED_TERMINAL_LEAF_SELECTOR = `[data-leaf-id]:not(:has(${NATIVE_CHAT_COVER_SELECTOR}))`

export function paneIsCoveredByNativeChat(
  pane: { container: Pick<Element, 'querySelector'> } | null | undefined
): boolean {
  return pane?.container.querySelector(NATIVE_CHAT_COVER_SELECTOR) != null
}

/** Focus the covered leaf’s chat, which forwards to its composer; return false if the leaf has no chat cover. */
export function focusNativeChatCover(pane: { container: Pick<Element, 'querySelector'> }): boolean {
  const cover = pane.container.querySelector<HTMLElement>(NATIVE_CHAT_COVER_SELECTOR)
  if (!cover) {
    return false
  }
  const active = cover.ownerDocument.activeElement
  if (active === cover || !cover.contains(active)) {
    if (!focusNativeChatPromptCard(cover, null)) {
      cover.focus({ preventScroll: true })
    }
  }
  return true
}

/** True inside a docked shell that `ownScope` (a terminal pane) is not part of. */
export function isInsideForeignChatDock(target: EventTarget | null, ownScope: Element): boolean {
  const host = findChatDockTerminalHost(target)
  return host !== null && !host.contains(ownScope)
}

/** True inside a chat cover (even before its chat root mounts), except within ownScope's own docked shell. */
export function isInsideNativeChatCover(
  target: EventTarget | null,
  ownScope: Element | null
): boolean {
  if (!(target instanceof Element)) {
    return false
  }
  if (ownScope && findChatDockTerminalHost(target)?.contains(ownScope)) {
    return false
  }
  return target.closest(NATIVE_CHAT_COVER_SELECTOR) !== null
}

/** Mirrors focusActivePane's target so the guard tracks exactly the pane that would take focus. */
export function activePaneIsCoveredByNativeChat(manager: PaneManager): boolean {
  return paneIsCoveredByNativeChat(manager.getActivePane() ?? manager.getPanes()[0])
}
