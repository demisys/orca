import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import {
  EditorContent,
  useEditor,
  useEditorState,
  type Editor,
  type JSONContent
} from '@tiptap/react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { LinearIssueMarkdownToolbar } from '@/components/task-page/linear/issue-workspace/LinearIssueMarkdownToolbar'
import { createRichMarkdownEditorCodec } from '@/components/editor/rich-markdown/document/rich-markdown-source-transport'
import { encodeRawMarkdownHtmlForRichEditor } from '@/components/editor/rich-markdown/raw-source/raw-markdown-html'
import {
  getScreenSubmitShortcutLabel,
  isScreenSubmitShortcut
} from '@/lib/keyboard/screen-submit-shortcut'
import { isImeOwnedKeyboardEvent } from '@/lib/text-input/ime/ime-composition-keyboard-event'
import { useLatestHandler } from '@/lib/use-latest-handler'
import { useTranslate } from '@/i18n/use-translate'
import { useAppStore } from '@/store'
import { useSidebarResize } from '@/hooks/useSidebarResize'
import { cn } from '@/lib/class-names'
import type { NativeChatComposerInput } from '../editor/native-chat-composer-input'
import { createNativeChatComposePanelExtensions } from './native-chat-compose-panel-extensions'
import './native-chat-compose-panel.css'

/** Where Insert puts the panel's Markdown, decided when the panel opens. */
export type NativeChatComposeTarget =
  | { kind: 'caret' }
  | { kind: 'end' }
  | { kind: 'selection'; from: number; to: number; original: string }

/** A highlighted range is edited in the panel; a composer the user was not typing in shows its caret
 *  at the start, so a new draft goes after its text instead. */
export function nativeChatComposeTarget(
  input: NativeChatComposerInput | null
): NativeChatComposeTarget {
  const from = input?.selectionStart ?? 0
  const to = input?.selectionEnd ?? 0
  if (input && to > from) {
    return { kind: 'selection', from, to, original: input.value.slice(from, to) }
  }
  return input?.contains?.(document.activeElement) ? { kind: 'caret' } : { kind: 'end' }
}

// A line starting one of these blocks has to start its own line in the composer too.
const BLOCK_START = /^(?:#{1,6}\s|>|[-*+]\s|\d{1,9}[.)]\s|```|~~~)/

function selectTarget(input: NativeChatComposerInput, target: NativeChatComposeTarget): boolean {
  if (target.kind === 'selection') {
    // The composer may have changed while the panel was open; follow the selected text if it moved.
    const from =
      input.value.slice(target.from, target.to) === target.original
        ? target.from
        : input.value.indexOf(target.original)
    if (from !== -1) {
      input.setSelectionRange(from, from + target.original.length)
      return true
    }
  }
  if (target.kind !== 'caret') {
    input.setSelectionRange(input.value.length, input.value.length)
  }
  return false
}

/** Puts the panel's Markdown in the composer: over the edited selection (inline when it stays one
 *  line of text), else on lines of its own at the caret or after the draft. */
function insertIntoComposer(
  input: NativeChatComposerInput | null,
  markdown: string,
  target: NativeChatComposeTarget
): void {
  const text = markdown.trim()
  if (!input?.insertText || input.disabled || !text) {
    return
  }
  const replacing = selectTarget(input, target)
  if (replacing && target.kind === 'selection' && !text.includes('\n') && !BLOCK_START.test(text)) {
    // Keep the spaces the selection had around its words.
    const lead = /^\s*/.exec(target.original)?.[0] ?? ''
    const trail = /\s*$/.exec(target.original)?.[0] ?? ''
    input.insertText(`${lead}${text}${trail}`)
    return
  }
  const before = input.value.slice(0, input.selectionStart ?? input.value.length)
  const after = input.value.slice(input.selectionEnd ?? input.value.length)
  const leading = before && !before.endsWith('\n') ? '\n' : ''
  const trailing = after && !after.startsWith('\n') ? '\n' : ''
  input.insertText(`${leading}${text}${trailing}`)
  if (trailing) {
    // The caret stays at the end of the inserted text, not on the line after it.
    const end = (input.selectionStart ?? 1) - 1
    input.setSelectionRange(end, end)
  }
}

function NativeChatComposePanelEditor({
  initialContent,
  height,
  onHeightChange,
  onChange,
  onInsert,
  onClose
}: {
  height: number
  onHeightChange: (height: number) => void
  /** A saved draft's document, or composer text (Markdown) to edit. */
  initialContent: JSONContent | string | null
  onChange: (content: JSONContent | null) => void
  /** `unchanged` when the document is still what the panel opened with. */
  onInsert: (markdown: string, unchanged: boolean) => void
  onClose: () => void
}): React.JSX.Element {
  const t = useTranslate()
  const spellcheck = useAppStore((s) => s.settings?.nativeChatComposerSpellcheck !== false)
  const codec = useMemo(() => createRichMarkdownEditorCodec(), [])
  const extensions = useMemo(() => createNativeChatComposePanelExtensions(codec), [codec])
  // What the editor opened with, so inserting an untouched edit can leave the composer text alone.
  const openedWith = useRef<string | null>(null)
  const insert = useLatestHandler((target: Editor | null) => {
    if (target && !target.isEmpty) {
      onInsert(target.getMarkdown(), JSON.stringify(target.getJSON()) === openedWith.current)
    }
  })
  const close = useLatestHandler(onClose)
  // The key handler is created with the editor, so it reads the editor through this ref.
  const editorRef = useRef<Editor | null>(null)
  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions,
      ...(typeof initialContent === 'string'
        ? {
            content: encodeRawMarkdownHtmlForRichEditor(initialContent, codec),
            contentType: 'markdown' as const
          }
        : initialContent
          ? { content: initialContent }
          : {}),
      autofocus: 'end',
      editorProps: {
        attributes: {
          class: 'rich-markdown-editor',
          spellcheck: spellcheck ? 'true' : 'false',
          'aria-label': t('components.native-chat.compose.editorLabel', 'Prompt draft')
        },
        handleKeyDown: (_view, event) => {
          if (isScreenSubmitShortcut(event)) {
            event.preventDefault()
            insert(editorRef.current)
            return true
          }
          // Ahead of the rich-markdown keymap, which claims Escape before it reaches the panel.
          if (isPlainEscape(event)) {
            event.preventDefault()
            close()
            return true
          }
          return false
        }
      },
      onCreate: ({ editor: created }) => {
        openedWith.current = JSON.stringify(created.getJSON())
      },
      // The document, not its Markdown, so reopening restores exactly what was written.
      onUpdate: ({ editor: next }) => onChange(next.isEmpty ? null : next.getJSON())
    },
    [extensions]
  )
  useEffect(() => {
    editorRef.current = editor
  }, [editor])
  const { containerRef, isResizing, onResizeStart } = useSidebarResize<HTMLDivElement>({
    isOpen: true,
    width: height,
    minWidth: COMPOSE_PANEL_MIN_HEIGHT,
    maxWidth: composePanelMaxHeight(),
    // Dragging the top edge up makes the panel taller.
    deltaSign: -1,
    axis: 'y',
    measureMaxSize: composePanelMaxHeight,
    applyRenderedSize: (container, size) => {
      container.style.height = `${size}px`
    },
    setWidth: onHeightChange
  })
  const empty = useEditorState({ editor, selector: ({ editor: e }) => e?.isEmpty ?? true }) ?? true
  const closeLabel = t('components.native-chat.compose.close', 'Close')

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label={t('components.native-chat.compose.title', 'Compose prompt')}
      // Escape from the toolbar or resize handle closes it too; its draft stays.
      onKeyDown={(event) => {
        if (isPlainEscape(event) && !event.defaultPrevented) {
          event.preventDefault()
          close()
        }
      }}
      className="native-chat-compose-panel relative mb-1.5 flex max-h-[75vh] flex-col overflow-hidden rounded-xl border border-chat-composer-border bg-chat-composer-surface shadow-xs"
    >
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label={t('components.native-chat.compose.resize', 'Resize compose panel')}
        aria-valuenow={height}
        aria-valuemin={COMPOSE_PANEL_MIN_HEIGHT}
        tabIndex={0}
        className="group absolute inset-x-0 top-0 z-10 flex h-1.5 cursor-row-resize justify-center outline-none"
        onMouseDown={onResizeStart}
        onKeyDown={(event) => {
          const step = event.key === 'ArrowUp' ? 16 : event.key === 'ArrowDown' ? -16 : 0
          if (step) {
            event.preventDefault()
            onHeightChange(
              Math.min(composePanelMaxHeight(), Math.max(COMPOSE_PANEL_MIN_HEIGHT, height + step))
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
      <div className="flex shrink-0 items-center gap-1 border-b border-chat-composer-border pr-1.5 [&>.linear-issue-markdown-toolbar]:min-w-0 [&>.linear-issue-markdown-toolbar]:flex-1 [&>.linear-issue-markdown-toolbar]:border-0 [&>.linear-issue-markdown-toolbar]:bg-transparent">
        <LinearIssueMarkdownToolbar editor={editor} disabled={false} />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" size="xs" disabled={empty} onClick={() => insert(editor)}>
              {t('components.native-chat.compose.insert', 'Insert')}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={4}>
            {getScreenSubmitShortcutLabel()}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={closeLabel}
              onClick={onClose}
            >
              <X className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={4}>
            {closeLabel}
          </TooltipContent>
        </Tooltip>
      </div>
      <div className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto">
        <EditorContent editor={editor} className="h-full" />
      </div>
    </div>
  )
}

function isPlainEscape(event: KeyboardEvent | React.KeyboardEvent): boolean {
  return (
    event.key === 'Escape' &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    !isImeOwnedKeyboardEvent(event)
  )
}

const COMPOSE_PANEL_MIN_HEIGHT = 160
// The height the last panel was left at, so a panel in another chat opens at the same size.
let lastComposePanelHeight = 320

function composePanelMaxHeight(): number {
  return Math.max(COMPOSE_PANEL_MIN_HEIGHT, Math.round(window.innerHeight * 0.75))
}

/** A rich editor above the composer for a longer prompt, or for a highlighted part of it; Insert
 *  puts its Markdown in the composer. Open while `target` is set. */
export function NativeChatComposePanel({
  target,
  onClose,
  inputRef
}: {
  target: NativeChatComposeTarget | null
  onClose: () => void
  inputRef: RefObject<NativeChatComposerInput | null>
}): React.JSX.Element | null {
  // Kept while closed, so Escape or × never loses a draft; Insert clears it. Editing a selection
  // sets it aside rather than replacing it.
  const [draft, setDraft] = useState<JSONContent | null>(null)
  const [height, setHeight] = useState(lastComposePanelHeight)
  if (!target) {
    return null
  }
  const editing = target.kind === 'selection'
  const close = (): void => {
    onClose()
    inputRef.current?.focus()
  }
  return (
    <NativeChatComposePanelEditor
      initialContent={editing ? target.original : draft}
      height={height}
      onHeightChange={(next) => {
        lastComposePanelHeight = next
        setHeight(next)
      }}
      onChange={editing ? () => {} : setDraft}
      onInsert={(markdown, unchanged) => {
        if (!(editing && unchanged)) {
          insertIntoComposer(inputRef.current, markdown, target)
        }
        if (!editing) {
          setDraft(null)
        }
        close()
      }}
      onClose={close}
    />
  )
}
