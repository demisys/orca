import { Extension } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'
import {
  classifyNativeChatMarkdown,
  nativeChatMarkdownFenceBlocks,
  type NativeChatMarkdownBlock,
  type NativeChatMarkdownSpanKind
} from './native-chat-composer-markdown-syntax'
import './native-chat-composer-markdown.css'

// Why: a pasted log must not make every keystroke restyle thousands of lines.
const MAX_STYLED_SIZE = 30_000
export const NATIVE_CHAT_MARKDOWN_PILL = '￼'

const SPAN_CLASS: Record<NativeChatMarkdownSpanKind, string> = {
  marker: 'native-chat-md-marker',
  'code-marker': 'native-chat-md-marker',
  'bullet-marker': 'native-chat-md-list-marker',
  bold: 'native-chat-md-bold',
  italic: 'native-chat-md-italic',
  strike: 'native-chat-md-strike',
  code: 'native-chat-md-code'
}

const BLOCK_CLASS: Record<Exclude<NativeChatMarkdownBlock['kind'], 'text' | 'heading'>, string> = {
  quote: 'native-chat-md-quote',
  bullet: 'native-chat-md-bullet',
  ordered: 'native-chat-md-ordered',
  rule: 'native-chat-md-rule',
  fence: 'native-chat-md-fence',
  code: 'native-chat-md-code-line'
}

/** Syntax shown only while the selection touches `from`..`to` (inclusive, document positions). */
type HideableCode = {
  from: number
  to: number
  hide: { from: number; to: number; node: boolean; className: string }[]
}

type StylingState = { decorations: DecorationSet; code: HideableCode[] }

function blockClass(block: NativeChatMarkdownBlock): string | null {
  if (block.kind === 'text') {
    return null
  }
  return block.kind === 'heading'
    ? `native-chat-md-heading native-chat-md-h${block.level}`
    : BLOCK_CLASS[block.kind]
}

export function nativeChatMarkdownParagraphs(
  doc: ProseMirrorNode
): { node: ProseMirrorNode; pos: number }[] {
  const paragraphs: { node: ProseMirrorNode; pos: number }[] = []
  doc.forEach((node, offset) => {
    if (node.isTextblock) {
      paragraphs.push({ node, pos: offset })
    }
  })
  return paragraphs
}

// A pill is one placeholder character, so it is never syntax and spans keep their document offsets.
export function nativeChatMarkdownLineText(node: ProseMirrorNode): string {
  return node.textBetween(0, node.content.size, '', NATIVE_CHAT_MARKDOWN_PILL)
}

/** Styles the markdown a draft already contains; the text is unchanged, so what is sent is too. */
function styleDraft(doc: ProseMirrorNode): StylingState {
  if (doc.content.size > MAX_STYLED_SIZE) {
    return { decorations: DecorationSet.empty, code: [] }
  }
  const paragraphs = nativeChatMarkdownParagraphs(doc)
  const classified = classifyNativeChatMarkdown(
    paragraphs.map(({ node }) => nativeChatMarkdownLineText(node))
  )
  const decorations: Decoration[] = []
  const code: HideableCode[] = []
  paragraphs.forEach(({ node, pos }, index) => {
    const { block, spans } = classified[index]
    const className = blockClass(block)
    if (className) {
      decorations.push(Decoration.node(pos, pos + node.nodeSize, { class: className }))
    }
    const start = pos + 1
    spans.forEach((span, spanIndex) => {
      if (span.to > span.from) {
        decorations.push(
          Decoration.inline(start + span.from, start + span.to, { class: SPAN_CLASS[span.kind] })
        )
      }
      // The classifier emits a code span as opening ticks, code, closing ticks.
      const closing = spans[spanIndex + 2]
      if (
        span.kind === 'code-marker' &&
        spans[spanIndex + 1]?.kind === 'code' &&
        closing?.kind === 'code-marker'
      ) {
        code.push({
          // Why: revealed one character early, so an arrow press never skips a position beside a hidden tick.
          from: start + span.from - 1,
          to: start + closing.to + 1,
          hide: [span, closing].map((tick) => ({
            from: start + tick.from,
            to: start + tick.to,
            node: false,
            className: 'native-chat-md-hidden'
          }))
        })
      }
    })
  })
  for (const { open, close } of nativeChatMarkdownFenceBlocks(classified)) {
    const opening = paragraphs[open]
    decorations.push(
      Decoration.node(opening.pos, opening.pos + opening.node.nodeSize, {
        class: 'native-chat-md-block-start'
      })
    )
    if (close === null) {
      continue
    }
    const closing = paragraphs[close]
    decorations.push(
      Decoration.node(closing.pos, closing.pos + closing.node.nodeSize, {
        class: 'native-chat-md-block-end'
      })
    )
    // An empty block keeps its fences, or nothing of it would show.
    if (close - open < 2) {
      continue
    }
    const first = paragraphs[open + 1]
    const last = paragraphs[close - 1]
    const node = (paragraph: (typeof paragraphs)[number], className: string) => ({
      from: paragraph.pos,
      to: paragraph.pos + paragraph.node.nodeSize,
      node: true,
      className
    })
    code.push({
      from: opening.pos + 1,
      to: closing.pos + closing.node.nodeSize - 1,
      hide: [
        node(opening, 'native-chat-md-hidden'),
        node(closing, 'native-chat-md-hidden'),
        node(first, 'native-chat-md-block-start'),
        node(last, 'native-chat-md-block-end')
      ]
    })
  }
  return { decorations: DecorationSet.create(doc, decorations), code }
}

const stylingKey = new PluginKey<StylingState>('nativeChatComposerMarkdownStyling')
const hidingKey = new PluginKey<DecorationSet>('nativeChatComposerCodeSyntaxHiding')

// Why: restyling mid-composition re-renders the IME's text node; restyle once it ends.
function requestRestyle(view: EditorView): void {
  setTimeout(() => {
    if (!view.isDestroyed && !view.composing) {
      view.dispatch(view.state.tr.setMeta(stylingKey, true).setMeta('addToHistory', false))
    }
  })
}

function mapStyling(previous: StylingState, tr: Transaction): StylingState {
  const map = (position: number) => tr.mapping.map(position)
  return {
    decorations: previous.decorations.map(tr.mapping, tr.doc),
    code: previous.code.map((code) => ({
      from: map(code.from),
      to: map(code.to),
      hide: code.hide.map((range) => ({ ...range, from: map(range.from), to: map(range.to) }))
    }))
  }
}

/** Code fences and backticks stay out of sight unless the selection is in their span or block. */
function hideCodeSyntax(state: EditorState): DecorationSet {
  const { from, to } = state.selection
  const size = state.doc.content.size
  const decorations: Decoration[] = []
  for (const code of stylingKey.getState(state)?.code ?? []) {
    if (from <= code.to && to >= code.from) {
      continue
    }
    for (const range of code.hide) {
      if (range.from < range.to && range.to <= size) {
        const attrs = { class: range.className }
        decorations.push(
          range.node
            ? Decoration.node(range.from, range.to, attrs)
            : Decoration.inline(range.from, range.to, attrs)
        )
      }
    }
  }
  return DecorationSet.create(state.doc, decorations)
}

export const NativeChatComposerMarkdownStyling = Extension.create({
  name: 'nativeChatComposerMarkdownStyling',
  addProseMirrorPlugins() {
    return [
      new Plugin<StylingState>({
        key: stylingKey,
        state: {
          init: (_, state) => styleDraft(state.doc),
          apply: (tr, previous) => {
            if (!tr.docChanged && tr.getMeta(stylingKey) !== true) {
              return previous
            }
            if (tr.getMeta('composition') !== undefined) {
              return mapStyling(previous, tr)
            }
            return styleDraft(tr.doc)
          }
        },
        props: {
          decorations: (state) => stylingKey.getState(state)?.decorations,
          handleDOMEvents: {
            compositionend: (view) => {
              requestRestyle(view)
              return false
            }
          }
        }
      }),
      new Plugin<DecorationSet>({
        key: hidingKey,
        state: {
          init: (_, state) => hideCodeSyntax(state),
          apply: (tr, previous, oldState, state) => {
            if (tr.getMeta('composition') !== undefined) {
              return previous.map(tr.mapping, tr.doc)
            }
            const restyled = stylingKey.getState(state) !== stylingKey.getState(oldState)
            return restyled || tr.selectionSet || tr.docChanged ? hideCodeSyntax(state) : previous
          }
        },
        props: {
          decorations: (state) => hidingKey.getState(state)
        }
      })
    ]
  }
})
