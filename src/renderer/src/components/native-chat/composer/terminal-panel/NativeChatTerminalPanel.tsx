import { useEffect, useLayoutEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useTranslate } from '@/i18n/use-translate'
import { useAppStore } from '@/store'
import { clampSidebarResizeWidth, useSidebarResize } from '@/hooks/useSidebarResize'
import { cn } from '@/lib/class-names'
import { findChatDockTerminal } from '@/store/terminals/tabs/creation/chat-dock-terminal-creation'
import { claimChatDockTerminalPortal } from './chat-dock-terminal-portal'
import { FLOATING_TERMINAL_WORKTREE_ID } from '../../../../../../shared/workspace/identity/floating-workspace-id'

/** The chat that owns a docked shell, by the workspace it runs in. */
export type NativeChatTerminalDock = { worktreeId: string; ownerTabId: string }

// Per chat tab, so the panel survives the composer unmounting behind prompt cards and subagent views.
const openPanels = new Set<string>()
const openPanelSubscribers = new Set<() => void>()

function subscribeOpenPanels(onChange: () => void): () => void {
  openPanelSubscribers.add(onChange)
  return () => {
    openPanelSubscribers.delete(onChange)
  }
}

export function setNativeChatTerminalPanelOpen(ownerTabId: string, open: boolean): void {
  if (open === openPanels.has(ownerTabId)) {
    return
  }
  if (open) {
    openPanels.add(ownerTabId)
  } else {
    openPanels.delete(ownerTabId)
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

function findChatTabWorktreeId(
  unifiedTabsByWorktree: ReturnType<typeof useAppStore.getState>['unifiedTabsByWorktree'],
  chatTabId: string
): string | null {
  for (const [worktreeId, tabs] of Object.entries(unifiedTabsByWorktree)) {
    if (tabs.some((tab) => tab.id === chatTabId || tab.entityId === chatTabId)) {
      return worktreeId
    }
  }
  return null
}

/** Where a chat tab's shell would run; null where the chat has no workspace tab to dock under. */
export function useNativeChatTerminalDock(
  chatTabId: string | undefined
): NativeChatTerminalDock | null {
  const worktreeId = useAppStore((s) =>
    chatTabId ? findChatTabWorktreeId(s.unifiedTabsByWorktree, chatTabId) : null
  )
  return useMemo(
    () =>
      // The floating panel mounts its terminals outside the portal routing a dock needs.
      chatTabId && worktreeId && worktreeId !== FLOATING_TERMINAL_WORKTREE_ID
        ? { worktreeId, ownerTabId: chatTabId }
        : null,
    [chatTabId, worktreeId]
  )
}

const TERMINAL_PANEL_MIN_HEIGHT = 120
// The height the last panel was left at, so a panel in another chat opens at the same size.
let lastTerminalPanelHeight = 260

function terminalPanelMaxHeight(): number {
  return Math.max(TERMINAL_PANEL_MIN_HEIGHT, Math.round(window.innerHeight * 0.6))
}

function applyTerminalPanelHeight(container: HTMLElement, height: number): void {
  container.style.height = `${height}px`
}

/** Focuses the shell once its xterm has mounted in `host`. */
function focusWhenTerminalMounts(host: HTMLElement): () => void {
  const tryFocus = (): boolean => {
    const helper = host.querySelector<HTMLElement>('.xterm-helper-textarea')
    helper?.focus()
    return helper !== null
  }
  if (tryFocus()) {
    return () => {}
  }
  const observer = new MutationObserver(() => {
    if (tryFocus()) {
      observer.disconnect()
    }
  })
  observer.observe(host, { childList: true, subtree: true })
  return () => observer.disconnect()
}

/** A shell in the chat's workspace, above the composer. Its output never reaches the agent; it keeps
 *  running while the panel is closed and ends when the shell exits or the chat tab closes. */
export function NativeChatTerminalPanel({
  dock,
  onClose
}: {
  dock: NativeChatTerminalDock
  onClose: () => void
}): React.JSX.Element {
  const t = useTranslate()
  const { worktreeId, ownerTabId } = dock
  const createChatDockTerminal = useAppStore((s) => s.createChatDockTerminal)
  const tabId = useAppStore((s) => findChatDockTerminal(s, worktreeId, ownerTabId)?.id ?? null)
  // Created only by opening; a tab that vanishes afterwards means the shell exited.
  const [created, setCreated] = useState(false)
  useLayoutEffect(() => {
    createChatDockTerminal(worktreeId, ownerTabId)
    setCreated(true)
  }, [createChatDockTerminal, worktreeId, ownerTabId])
  useEffect(() => {
    if (created && tabId === null) {
      onClose()
    }
  }, [created, tabId, onClose])

  const [host, setHost] = useState<HTMLDivElement | null>(null)
  const [focused, setFocused] = useState(false)
  useLayoutEffect(() => {
    if (!host || !tabId) {
      return
    }
    return claimChatDockTerminalPortal({
      slotId: `chat-dock:${ownerTabId}`,
      target: host,
      worktreeId,
      tabId,
      active: focused
    })
  }, [host, tabId, ownerTabId, worktreeId, focused])
  useEffect(() => {
    if (!host) {
      return
    }
    // Native listeners: the shell is portaled in from the workspace, so React focus events skip this tree.
    const sync = (): void => setFocused(host.contains(document.activeElement))
    // focusout fires before the next element takes focus.
    const syncAfterBlur = (): void => queueMicrotask(sync)
    host.addEventListener('focusin', sync)
    host.addEventListener('focusout', syncAfterBlur)
    return () => {
      host.removeEventListener('focusin', sync)
      host.removeEventListener('focusout', syncAfterBlur)
    }
  }, [host])
  useEffect(() => (host ? focusWhenTerminalMounts(host) : undefined), [host])

  const [height, setHeight] = useState(lastTerminalPanelHeight)
  const updateHeight = (next: number): void => {
    lastTerminalPanelHeight = next
    setHeight(next)
  }
  const { containerRef, isResizing, onResizeStart } = useSidebarResize<HTMLDivElement>({
    isOpen: true,
    width: height,
    minWidth: TERMINAL_PANEL_MIN_HEIGHT,
    maxWidth: terminalPanelMaxHeight(),
    // Dragging the top edge up makes the panel taller.
    deltaSign: -1,
    axis: 'y',
    measureMaxSize: terminalPanelMaxHeight,
    measureStartSize: (container) => container.getBoundingClientRect().height,
    applyRenderedSize: applyTerminalPanelHeight,
    setWidth: updateHeight
  })
  const hideLabel = t('components.native-chat.terminal.hide', 'Hide shell')

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label={t('components.native-chat.terminal.title', 'Shell')}
      style={{ height }}
      className="relative mb-1.5 flex max-h-[60vh] flex-col overflow-hidden rounded-xl border border-chat-composer-border bg-chat-composer-surface shadow-xs"
    >
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label={t('components.native-chat.terminal.resize', 'Resize shell')}
        aria-valuenow={height}
        aria-valuemin={TERMINAL_PANEL_MIN_HEIGHT}
        tabIndex={0}
        className="group absolute inset-x-0 top-0 z-10 flex h-1.5 cursor-row-resize justify-center outline-none"
        onMouseDown={onResizeStart}
        onKeyDown={(event) => {
          const step = event.key === 'ArrowUp' ? 16 : event.key === 'ArrowDown' ? -16 : 0
          if (step) {
            event.preventDefault()
            updateHeight(
              clampSidebarResizeWidth(
                height + step,
                TERMINAL_PANEL_MIN_HEIGHT,
                terminalPanelMaxHeight()
              )
            )
          }
        }}
      >
        <div
          className={cn(
            'mt-0.5 h-0.5 w-10 rounded-full bg-transparent transition-colors group-hover:bg-ring/50 group-focus-visible:bg-ring',
            isResizing && 'bg-ring'
          )}
        />
      </div>
      <div className="flex h-7 shrink-0 items-center gap-1 border-b border-chat-composer-border pr-1 pl-2.5">
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {t('components.native-chat.terminal.title', 'Shell')}
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={hideLabel}
              onClick={onClose}
            >
              <X className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={4}>
            {hideLabel}
          </TooltipContent>
        </Tooltip>
      </div>
      <div ref={setHost} className="relative min-h-0 flex-1 bg-background" />
    </div>
  )
}
