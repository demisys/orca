import { useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'
import { defineFixture } from '../../../../component-fixtures/component-fixture'
import type { NativeChatComposerInput } from '../editor/native-chat-composer-input'
import { NativeChatPromptEditor } from '../editor/NativeChatPromptEditor'
import { NativeChatComposeDrawer } from './NativeChatComposeDrawer'
import { NativeChatComposeButton } from './NativeChatComposeButton'

const DRAFTED = [
  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Fix the loader' }] },
  {
    type: 'orderedList',
    attrs: { start: 1 },
    content: ['Read C:\\Users\\me\\config.json', 'Rename __init__ helpers'].map((text) => ({
      type: 'listItem',
      content: [{ type: 'paragraph', content: [{ type: 'text', text }] }]
    }))
  },
  {
    type: 'codeBlock',
    attrs: { language: 'ts' },
    content: [{ type: 'text', text: 'const config = load("C:\\\\x")' }]
  }
]

function Composer({ initiallyOpen = true }: { initiallyOpen?: boolean }): React.JSX.Element {
  const inputRef = useRef<NativeChatComposerInput>(null)
  const [open, setOpen] = useState(initiallyOpen)
  return (
    <div className="native-chat-appearance p-4">
      <div className="rounded-xl border border-chat-composer-border bg-chat-composer-surface p-1.5 shadow-xs">
        <NativeChatPromptEditor
          inputRef={inputRef}
          initialValue="Please do this:"
          disabled={false}
          placeholder="Ask anything"
          onChange={() => {}}
          onSelect={() => {}}
          className="min-h-14 w-full bg-transparent px-2 py-1 text-sm text-foreground outline-none"
        />
        <NativeChatComposeButton onCompose={() => setOpen(true)} />
      </div>
      <NativeChatComposeDrawer open={open} onOpenChange={setOpen} inputRef={inputRef} />
    </div>
  )
}

async function fillDrawer(): Promise<void> {
  // The sheet portals out of the frame; its editor is the second one on the page.
  await new Promise((resolve) => setTimeout(resolve, 100))
  const doms = document.querySelectorAll<Element & { editor?: Editor }>('.ProseMirror')
  doms[1]?.editor?.commands.setContent({ type: 'doc', content: DRAFTED }, { emitUpdate: true })
}

/** The drawer open over the composer, with a drafted prompt. */
export const drafted = defineFixture({
  width: 760,
  render: () => <Composer />,
  interact: fillDrawer
})

/** After Insert: the Markdown sits in the composer on lines of its own, styled there. */
export const inserted = defineFixture({
  width: 760,
  render: () => <Composer />,
  interact: async () => {
    await fillDrawer()
    const insert = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Insert')
    insert?.click()
    await new Promise((resolve) => setTimeout(resolve, 400))
  }
})

/** Closed, for opening from the composer's button with its caret kept. */
export const closed = defineFixture({
  width: 760,
  render: () => <Composer initiallyOpen={false} />
})
