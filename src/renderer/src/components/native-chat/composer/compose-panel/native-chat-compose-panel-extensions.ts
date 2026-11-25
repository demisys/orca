import { Extension, type AnyExtension } from '@tiptap/core'
import { createRichMarkdownExtensions } from '@/components/editor/rich-markdown/schema/rich-markdown-extensions'
import type { RichMarkdownEditorCodec } from '@/components/editor/rich-markdown/document/rich-markdown-source-transport'

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

export function createNativeChatComposePanelExtensions(
  codec: RichMarkdownEditorCodec
): AnyExtension[] {
  return [...createRichMarkdownExtensions({ codec }), NativeChatComposePromptText]
}
