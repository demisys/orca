import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
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
import {
  getScreenSubmitShortcutLabel,
  isScreenSubmitShortcut
} from '@/lib/keyboard/screen-submit-shortcut'
import { isImeOwnedKeyboardEvent } from '@/lib/text-input/ime/ime-composition-keyboard-event'
import { useLatestHandler } from '@/lib/use-latest-handler'
import { useTranslate } from '@/i18n/use-translate'
import { useAppStore } from '@/store'
import type { NativeChatComposerInput } from '../editor/native-chat-composer-input'
import { createNativeChatComposePanelExtensions } from './native-chat-compose-panel-extensions'
import './native-chat-compose-panel.css'

/** Puts the drafted Markdown on lines of its own: at the caret the user left, else after the draft. */
function insertIntoComposer(
  input: NativeChatComposerInput | null,
  markdown: string,
  atCaret: boolean
): void {
  const text = markdown.trim()
  if (!input?.insertText || input.disabled || !text) {
    return
  }
  if (!atCaret) {
    input.setSelectionRange(input.value.length, input.value.length)
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
  onChange,
  onInsert,
  onClose
}: {
  initialContent: JSONContent | null
  onChange: (content: JSONContent | null) => void
  onInsert: (markdown: string) => void
  onClose: () => void
}): React.JSX.Element {
  const t = useTranslate()
  const spellcheck = useAppStore((s) => s.settings?.nativeChatComposerSpellcheck !== false)
  const extensions = useMemo(
    () => createNativeChatComposePanelExtensions(createRichMarkdownEditorCodec()),
    []
  )
  const insert = useLatestHandler((target: Editor | null) => {
    if (target && !target.isEmpty) {
      onInsert(target.getMarkdown())
    }
  })
  const close = useLatestHandler(onClose)
  // The key handler is created with the editor, so it reads the editor through this ref.
  const editorRef = useRef<Editor | null>(null)
  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions,
      ...(initialContent ? { content: initialContent } : {}),
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
          const plainEscape =
            event.key === 'Escape' &&
            !event.altKey &&
            !event.ctrlKey &&
            !event.metaKey &&
            !event.shiftKey
          if (plainEscape && !isImeOwnedKeyboardEvent(event)) {
            event.preventDefault()
            close()
            return true
          }
          return false
        }
      },
      // The document, not its Markdown, so reopening restores exactly what was written.
      onUpdate: ({ editor: next }) => onChange(next.isEmpty ? null : next.getJSON())
    },
    [extensions]
  )
  useEffect(() => {
    editorRef.current = editor
  }, [editor])
  const empty = useEditorState({ editor, selector: ({ editor: e }) => e?.isEmpty ?? true }) ?? true
  const closeLabel = t('components.native-chat.compose.close', 'Close')

  return (
    <div
      role="region"
      aria-label={t('components.native-chat.compose.title', 'Compose prompt')}
      className="native-chat-compose-panel mb-1.5 flex h-80 max-h-[50vh] flex-col overflow-hidden rounded-xl border border-chat-composer-border bg-chat-composer-surface shadow-xs"
    >
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

/** A rich editor above the composer for a longer prompt; Insert adds its Markdown to the composer. */
export function NativeChatComposePanel({
  open,
  onOpenChange,
  inputRef
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  inputRef: RefObject<NativeChatComposerInput | null>
}): React.JSX.Element | null {
  // Kept while closed, so Escape or × never loses a draft; Insert clears it.
  const [draft, setDraft] = useState<JSONContent | null>(null)
  // Why: a composer the user was not typing in shows its caret at the start, so its draft would end up after the insert.
  const atCaret = useRef(false)
  // Before the panel's editor takes focus.
  useLayoutEffect(() => {
    if (open) {
      atCaret.current = inputRef.current?.contains?.(document.activeElement) === true
    }
  }, [open, inputRef])
  if (!open) {
    return null
  }
  const close = (): void => {
    onOpenChange(false)
    inputRef.current?.focus()
  }
  return (
    <NativeChatComposePanelEditor
      initialContent={draft}
      onChange={setDraft}
      onInsert={(markdown) => {
        insertIntoComposer(inputRef.current, markdown, atCaret.current)
        setDraft(null)
        close()
      }}
      onClose={close}
    />
  )
}
