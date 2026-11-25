import { useRef } from 'react'
import type { Editor } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'
import { defineFixture } from '../../../../component-fixtures/component-fixture'
import type { NativeChatComposerInput } from './native-chat-composer-input'
import { NativeChatPromptEditor } from './NativeChatPromptEditor'

const DRAFT = [
  '# Plan',
  '## Steps',
  '### Notes',
  '> quoted **reply** from the bot',
  '> second quoted line',
  '- first point',
  '* second point with `code`',
  '1. numbered one',
  '2. numbered **two**',
  '---',
  'Plain with **bold**, *italic*, _italic_, ~~gone~~ and `inline`.',
  '```ts',
  'const answer = 42 // **not bold**',
  '```',
  'after the block'
].join('\n')

function Composer({ draft = DRAFT }: { draft?: string }): React.JSX.Element {
  const inputRef = useRef<NativeChatComposerInput>(null)
  return (
    <div className="native-chat-appearance p-4">
      <div className="rounded-xl border border-chat-composer-border bg-chat-composer-surface p-1.5 shadow-xs">
        <NativeChatPromptEditor
          inputRef={inputRef}
          initialValue={draft}
          disabled={false}
          placeholder="Ask anything"
          onChange={() => {}}
          onSelect={() => {}}
          className="min-h-14 w-full bg-transparent px-2 py-1 text-sm text-foreground outline-none"
        />
      </div>
    </div>
  )
}

/** A draft with every markdown block the chat renders, styled in place while typing. */
export const markdownDraft = defineFixture({
  width: 560,
  render: () => <Composer />
})

function fixtureEditor(frame: HTMLElement): Editor {
  // Tiptap keeps its editor on the view's DOM node.
  const dom: (Element & { editor?: Editor }) | null = frame.querySelector('.ProseMirror')
  if (!dom?.editor) {
    throw new Error('The composer editor is not mounted')
  }
  return dom.editor
}

/** Puts the caret just after the first occurrence of `text`. */
function caretAfter(frame: HTMLElement, text: string): void {
  const editor = fixtureEditor(frame)
  let at = -1
  editor.state.doc.descendants((node, pos) => {
    const index = at === -1 && node.isText ? (node.text ?? '').indexOf(text) : -1
    if (index !== -1) {
      at = pos + index + text.length
    }
  })
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, at)))
}

/** The caret inside the code block shows its fences. */
export const caretInCodeBlock = defineFixture({
  width: 560,
  render: () => <Composer />,
  interact: (frame) => caretAfter(frame, 'const answer')
})

/** The caret inside an inline code span shows its backticks. */
export const caretInInlineCode = defineFixture({
  width: 560,
  render: () => <Composer />,
  interact: (frame) => caretAfter(frame, 'and `inl')
})

/** Typing a fence's third backtick adds the closing fence and puts the caret between them. */
export const typedFence = defineFixture({
  width: 560,
  render: () => <Composer draft={'Run this:\n'} />,
  interact: (frame) => {
    const editor = fixtureEditor(frame)
    editor.commands.focus('end')
    for (const character of '```echo hi') {
      editor.view.dispatch(editor.state.tr.insertText(character))
    }
  }
})
