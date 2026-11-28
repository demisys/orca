import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useTranslate } from '@/i18n/use-translate'
import { useAppStore } from '@/store'
import { clampSidebarResizeWidth, useSidebarResize } from '@/hooks/useSidebarResize'
import { cn } from '@/lib/class-names'
import { findChatDockTerminal } from '@/store/terminals/tabs/creation/chat-dock-terminal-creation'
import {
  CHAT_DOCK_TERMINAL_ATTRIBUTE,
  CHAT_DOCK_TERMINAL_HOST_ATTRIBUTE,
  claimChatDockTerminalPortal
} from './chat-dock-terminal-portal'
import { FLOATING_TERMINAL_WORKTREE_ID } from '../../../../../../shared/workspace/identity/floating-workspace-id'
import { findChatDockOwnerTab } from '../../../../../../shared/workspace-layout/chat-dock-terminal'
import {
  consumeChatDockFocusOnMount,
  chatDockCreatedWorktree,
  recordChatDockCreated,
  wantsChatDockFocusOnMount
} from './native-chat-terminal-panel-state'

/** The chat that owns a docked shell, by the workspace it runs in. */
export type NativeChatTerminalDock = { worktreeId: string; ownerTabId: string }

function findChatTabWorktreeId(
  unifiedTabsByWorktree: ReturnType<typeof useAppStore.getState>['unifiedTabsByWorktree'],
  chatTabId: string
): string | null {
  for (const [worktreeId, tabs] of Object.entries(unifiedTabsByWorktree)) {
    if (findChatDockOwnerTab(tabs, chatTabId)) {
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

/** Focuses the shell once its xterm has mounted in `host`, if the user just opened the panel. */
function focusWhenTerminalMounts(host: HTMLElement, ownerTabId: string): () => void {
  if (!wantsChatDockFocusOnMount(ownerTabId)) {
    return () => {}
  }
  const tryFocus = (): boolean => {
    const helper = host.querySelector<HTMLElement>('.xterm-helper-textarea')
    helper?.focus()
    if (helper) {
      consumeChatDockFocusOnMount(ownerTabId)
    }
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

/** Whether `element` is laid out; a chat behind another tab, view or prompt card has a zero-size panel. */
function useElementRendered(element: HTMLElement | null): boolean {
  const [rendered, setRendered] = useState(false)
  useLayoutEffect(() => {
    if (!element) {
      return
    }
    const sync = (): void => {
      const { width, height } = element.getBoundingClientRect()
      setRendered(width > 0 && height > 0)
    }
    sync()
    const observer = new ResizeObserver(sync)
    observer.observe(element)
    return () => observer.disconnect()
  }, [element])
  return rendered
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
  useLayoutEffect(() => {
    if (chatDockCreatedWorktree(ownerTabId) !== worktreeId) {
      createChatDockTerminal(worktreeId, ownerTabId)
      recordChatDockCreated(ownerTabId, worktreeId)
    }
  }, [createChatDockTerminal, worktreeId, ownerTabId])
  useEffect(() => {
    // Live state: the render that ran this effect can predate the layout effect's create.
    if (
      tabId === null &&
      chatDockCreatedWorktree(ownerTabId) === worktreeId &&
      !findChatDockTerminal(useAppStore.getState(), worktreeId, ownerTabId)
    ) {
      onClose()
    }
  }, [tabId, worktreeId, ownerTabId, onClose])

  const [host, setHost] = useState<HTMLDivElement | null>(null)
  const [focused, setFocused] = useState(false)
  // A hidden chat must release its shell, or the shell counts as visible and its workspace never parks.
  const rendered = useElementRendered(host)
  useLayoutEffect(() => {
    if (!host || !tabId || !rendered) {
      return
    }
    return claimChatDockTerminalPortal({
      slotId: `chat-dock:${ownerTabId}`,
      target: host,
      worktreeId,
      tabId,
      active: focused
    })
  }, [host, tabId, ownerTabId, worktreeId, focused, rendered])
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
  useEffect(
    () => (host ? focusWhenTerminalMounts(host, ownerTabId) : undefined),
    [host, ownerTabId]
  )

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
      {...{ [CHAT_DOCK_TERMINAL_ATTRIBUTE]: ownerTabId }}
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
      <div
        ref={setHost}
        {...{ [CHAT_DOCK_TERMINAL_HOST_ATTRIBUTE]: '' }}
        className="relative min-h-0 flex-1 bg-background"
      />
    </div>
  )
}
