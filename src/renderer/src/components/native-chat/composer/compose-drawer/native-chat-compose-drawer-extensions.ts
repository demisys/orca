import { Extension, type AnyExtension } from '@tiptap/core'
import Placeholder from '@tiptap/extension-placeholder'
import { createRichMarkdownExtensions } from '@/components/editor/rich-markdown/schema/rich-markdown-extensions'
import type { RichMarkdownEditorCodec } from '@/components/editor/rich-markdown/document/rich-markdown-source-transport'
import { translate } from '@/i18n/i18n'

/** Text reaches the agent as typed: escaping `\`, `_`, `*` or `<` would change the paths and names it reads. */
const NativeChatComposePromptText = Extension.create({
  name: 'nativeChatComposePromptText',
  // After the rich-markdown extension, which wraps the same encoder.
  priority: 50,
  onBeforeCreate() {
    const manager = this.editor.markdown
    if (manager) {
      // Depends on @tiptap/markdown's private per-text-node encoder, as rich-markdown-prose-entities does.
      manager['encodeTextForMarkdown'] = (text: string): string => text
    }
  }
})

export function createNativeChatComposeDrawerExtensions(
  codec: RichMarkdownEditorCodec
): AnyExtension[] {
  return [
    ...createRichMarkdownExtensions({ codec }),
    Placeholder.configure({
      placeholder: translate(
        'components.native-chat.compose.placeholder',
        'Write a longer prompt with lists, code blocks and headings…'
      )
    }),
    NativeChatComposePromptText
  ]
}
