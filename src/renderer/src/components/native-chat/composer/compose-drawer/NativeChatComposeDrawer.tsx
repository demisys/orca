import { useMemo, useRef, useState, type RefObject } from 'react'
import { EditorContent, useEditor, useEditorState, type JSONContent } from '@tiptap/react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet'
import { LinearIssueMarkdownToolbar } from '@/components/task-page/linear/issue-workspace/LinearIssueMarkdownToolbar'
import { createRichMarkdownEditorCodec } from '@/components/editor/rich-markdown/document/rich-markdown-source-transport'
import {
  getScreenSubmitShortcutLabel,
  isScreenSubmitShortcut
} from '@/lib/keyboard/screen-submit-shortcut'
import { useLatestHandler } from '@/lib/use-latest-handler'
import { useTranslate } from '@/i18n/use-translate'
import { useAppStore } from '@/store'
import type { NativeChatComposerInput } from '../editor/native-chat-composer-input'
import { createNativeChatComposeDrawerExtensions } from './native-chat-compose-drawer-extensions'

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

function NativeChatComposeDrawerEditor({
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
    () => createNativeChatComposeDrawerExtensions(createRichMarkdownEditorCodec()),
    []
  )
  const submit = useLatestHandler(() => {
    if (editor && !editor.isEmpty) {
      onInsert(editor.getMarkdown())
    }
  })
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
          if (!isScreenSubmitShortcut(event)) {
            return false
          }
          event.preventDefault()
          submit()
          return true
        }
      },
      // The document, not its Markdown, so reopening restores exactly what was written.
      onUpdate: ({ editor: next }) => onChange(next.isEmpty ? null : next.getJSON())
    },
    [extensions]
  )
  const empty = useEditorState({ editor, selector: ({ editor: e }) => e?.isEmpty ?? true }) ?? true

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col gap-3 px-4 pb-4">
      <div className="linear-issue-markdown-editor linear-issue-markdown-editor-drawer min-h-0 flex-1">
        <LinearIssueMarkdownToolbar editor={editor} disabled={false} />
        <div className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto">
          <EditorContent editor={editor} className="h-full [&_.rich-markdown-editor]:min-h-full" />
        </div>
      </div>
      <div className="flex items-center justify-end gap-2">
        <span className="mr-auto text-xs text-muted-foreground">
          {t('components.native-chat.compose.insertHint', '{{shortcut}} to insert', {
            shortcut: getScreenSubmitShortcutLabel()
          })}
        </span>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          {t('components.native-chat.compose.close', 'Close')}
        </Button>
        <Button type="button" size="sm" disabled={empty} onClick={submit}>
          {t('components.native-chat.compose.insert', 'Insert')}
        </Button>
      </div>
    </div>
  )
}

/** A rich editor for a longer prompt; Insert adds its Markdown to the composer, which still sends it. */
export function NativeChatComposeDrawer({
  open,
  onOpenChange,
  inputRef
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  inputRef: RefObject<NativeChatComposerInput | null>
}): React.JSX.Element {
  const t = useTranslate()
  // Kept while closed, so Escape or Close never loses a draft; Insert clears it.
  const [draft, setDraft] = useState<JSONContent | null>(null)
  // Why: a composer the user was not typing in shows its caret at the start, so its draft would end up after the insert.
  const atCaret = useRef(false)
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="h-[min(44rem,85vh)]"
        onOpenAutoFocus={() => {
          atCaret.current = inputRef.current?.contains?.(document.activeElement) === true
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          inputRef.current?.focus()
        }}
      >
        <SheetHeader className="mx-auto w-full max-w-4xl">
          <SheetTitle>{t('components.native-chat.compose.title', 'Compose prompt')}</SheetTitle>
          <SheetDescription>
            {t(
              'components.native-chat.compose.description',
              'Draft with lists, code blocks and headings. Insert adds it to your message as Markdown.'
            )}
          </SheetDescription>
        </SheetHeader>
        <NativeChatComposeDrawerEditor
          initialContent={draft}
          onChange={setDraft}
          onInsert={(markdown) => {
            insertIntoComposer(inputRef.current, markdown, atCaret.current)
            setDraft(null)
            onOpenChange(false)
          }}
          onClose={() => onOpenChange(false)}
        />
      </SheetContent>
    </Sheet>
  )
}
