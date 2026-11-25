import { Extension } from '@tiptap/core'
import { closeHistory, isHistoryTransaction } from '@tiptap/pm/history'
import { Plugin, TextSelection, type EditorState } from '@tiptap/pm/state'
import {
  classifyNativeChatMarkdown,
  nativeChatMarkdownFenceBlocks
} from './native-chat-composer-markdown-syntax'
import {
  nativeChatMarkdownLineText,
  nativeChatMarkdownParagraphs
} from './native-chat-composer-markdown-styling'

const OPENING_FENCE = /^ {0,3}```$/

function caretLine(state: EditorState): string | null {
  const { selection } = state
  const { $head } = selection
  if (!selection.empty || $head.parentOffset !== $head.parent.content.size) {
    return null
  }
  return nativeChatMarkdownLineText($head.parent)
}

/** Typing the third backtick of a fence that nothing closes adds its closing fence two lines down. */
export const NativeChatComposerCodeFenceAutoclose = Extension.create({
  name: 'nativeChatComposerCodeFenceAutoclose',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction: (transactions, oldState, state) => {
          // Why: one typed character (a dead key's too); paste, drop, undo and adopted drafts keep their text.
          if (
            !transactions.some((tr) => tr.docChanged) ||
            transactions.some(
              (tr) =>
                isHistoryTransaction(tr) ||
                tr.getMeta('uiEvent') !== undefined ||
                tr.getMeta('preventUpdate') === true
            )
          ) {
            return null
          }
          const line = caretLine(state)
          if (!line || !OPENING_FENCE.test(line) || caretLine(oldState) !== line.slice(0, -1)) {
            return null
          }
          const paragraphs = nativeChatMarkdownParagraphs(state.doc)
          const caret = state.selection.$head
          const index = paragraphs.findIndex(({ pos }) => pos === caret.before(caret.depth))
          const lines = classifyNativeChatMarkdown(
            paragraphs.map(({ node }) => nativeChatMarkdownLineText(node))
          )
          const opensUnclosed = nativeChatMarkdownFenceBlocks(lines).some(
            (block) => block.open === index && block.close === null
          )
          if (index === -1 || !opensUnclosed) {
            return null
          }
          const end = caret.pos
          const tr = state.tr.split(end).split(end + 2)
          // The closing fence is the opening one, indent included.
          tr.insertText(line, end + 4)
          tr.setSelection(TextSelection.create(tr.doc, end + 2)).scrollIntoView()
          // Why: its own undo step, between the typed fence and the code typed next; time 0 makes that code start a new one.
          return closeHistory(tr).setTime(0)
        }
      })
    ]
  }
})
