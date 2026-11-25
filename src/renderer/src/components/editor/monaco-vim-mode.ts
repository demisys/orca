import type { editor } from 'monaco-editor'
import type { initVimMode as InitVimMode, VimAdapterInstance } from 'monaco-vim'
import { addAppKeyListener, removeAppKeyListener } from '@/lib/keyboard/app-keyboard-router'
import { getShortcutPlatform } from '@/lib/keyboard/shortcut-platform'
import { vimPriorityCtrlLetter } from '../../../../shared/editor/keybindings/vim-priority-ctrl-chords'

// monaco-vim is a keymap emulator, not Neovim. Verified working against the live editor: motions,
// operators, registers (yank/paste), visual mode, macros (`qa`…`q` / `@a`), and `:%s` substitution.
// Editor-display `:set` options (wrap/number/tabstop) aren't vim-engine concerns, so Orca maps them
// onto Monaco here. Documented monaco-vim quirks (Orca's save/sync are verified clean, so these are
// the vendored engine's): `gd` and `:%s` live-preview (`inccommand`) are unsupported; Backspace in a
// recorded macro isn't replayed; and linewise paste of a newline-terminated buffer adds one trailing
// blank line. See tests/e2e/editor/vim-keybindings-file-editor.spec.ts.
export type VimModeController = { dispose: () => void }

/** The hooks an editor's Ex commands route to: save, close, and the editor for `:set`. */
export type VimEditorActions = {
  /** Persist the buffer; resolves `false` (or rejects) when the save fails, so `:wq` can stay open. */
  onWrite: () => void | Promise<boolean>
  onClose: () => void
  /** Whether the buffer has edits not yet written to disk; `:q` refuses to close while true. */
  isDirty: () => boolean
  editor: editor.IStandaloneCodeEditor
}

type VimEntry = { actions: VimEditorActions; insertMode: boolean; textFocused: boolean }
type VimExParams = { args?: string[]; argString?: string }
type VimRuntime = {
  Vim: {
    defineEx: (
      name: string,
      shorthand: string,
      handler: (cm: VimAdapterInstance, params: VimExParams) => void
    ) => void
  }
  keyMap: { vim?: { call: (key: string, cm: VimAdapterInstance) => unknown } }
}

// Why: monaco-vim's Ex commands and keymap are process-global, so key everything by the adapter
// that ran them; a focus change can then never redirect `:w`/`:q` to another split.
const entries = new Map<VimAdapterInstance, VimEntry>()
let runtime: VimRuntime | null = null
let reportedChordFocus = false

/**
 * Apply one `:set` token (e.g. `nowrap`, `number`, `tabstop=4`) to the Monaco editor. Monaco has no
 * terminal-style paste-mangling to disable, so `:set paste`/`nopaste` and any unrecognized option
 * are accepted as no-ops rather than erroring.
 */
function applySetOption(ed: editor.IStandaloneCodeEditor, token: string): void {
  const [rawName, rawValue] = token.split('=')
  const name = rawName.trim()
  const size = Number.parseInt(rawValue ?? '', 10)
  const hasSize = Number.isFinite(size) && size > 0
  switch (name) {
    case 'wrap':
      ed.updateOptions({ wordWrap: 'on' })
      break
    case 'nowrap':
      ed.updateOptions({ wordWrap: 'off' })
      break
    case 'number':
    case 'nu':
      ed.updateOptions({ lineNumbers: 'on' })
      break
    case 'nonumber':
    case 'nonu':
      ed.updateOptions({ lineNumbers: 'off' })
      break
    case 'tabstop':
    case 'ts':
      if (hasSize) {
        ed.getModel()?.updateOptions({ tabSize: size })
      }
      break
    case 'shiftwidth':
    case 'sw':
      if (hasSize) {
        ed.getModel()?.updateOptions({ indentSize: size })
      }
      break
    case 'expandtab':
    case 'et':
      ed.getModel()?.updateOptions({ insertSpaces: true })
      break
    case 'noexpandtab':
    case 'noet':
      ed.getModel()?.updateOptions({ insertSpaces: false })
      break
    default:
      break
  }
}

// Only where Mod is Ctrl (Linux/Windows) do vim's Ctrl chords collide with app shortcuts.
function claimsCtrlChords(): boolean {
  return getShortcutPlatform() !== 'darwin'
}

// Why: main resolves window shortcuts before the renderer sees keydown, so mirror vim normal-mode focus.
function syncChordFocus(): void {
  let focused = false
  for (const entry of entries.values()) {
    focused ||= entry.textFocused && !entry.insertMode
  }
  if (focused !== reportedChordFocus) {
    reportedChordFocus = focused
    window.api?.ui?.setVimNormalModeFocused?.(focused)
  }
}

// Runs ahead of app shortcuts: a vim chord in normal/visual mode wins; insert mode keeps app shortcuts.
function claimVimCtrlChord(event: KeyboardEvent): void {
  if (event.defaultPrevented || event.isComposing || !runtime) {
    return
  }
  const letter = vimPriorityCtrlLetter({
    control: event.ctrlKey,
    meta: event.metaKey,
    alt: event.altKey,
    shift: event.shiftKey,
    key: event.key,
    code: event.code
  })
  if (!letter) {
    return
  }
  for (const [adapter, entry] of entries) {
    if (!entry.actions.editor.hasTextFocus() || entry.insertMode) {
      continue
    }
    // Why consume even unmapped chords: vim ignores them in normal mode, and passing the key on
    // would make monaco-vim run findKey (and record macros) a second time.
    event.preventDefault()
    event.stopImmediatePropagation()
    const command = runtime.keyMap.vim?.call(`Ctrl-${letter}`, adapter)
    if (typeof command === 'function') {
      command()
    }
    return
  }
}

/** Register `:w`/`:q`/`:q!`/`:wq`/`:x`/`:set` once on monaco-vim's process-global Vim singleton. */
function defineExCommands(vim: VimRuntime['Vim']): void {
  // Why: defer close so monaco-vim finishes dispatching the Ex command before the editor (and this
  // adapter) unmounts.
  const closeNow = (entry: VimEntry | undefined): void => {
    queueMicrotask(() => entry?.actions.onClose())
  }
  // Why: close only after the save resolves — Orca's save is async, so closing immediately would
  // tear the model down mid-write and drop the file. A failed or rejected write keeps the buffer open.
  const writeThenClose = (cm: VimAdapterInstance): void => {
    const entry = entries.get(cm)
    if (!entry) {
      return
    }
    void (async () => {
      try {
        if ((await entry.actions.onWrite()) === false) {
          return
        }
      } catch {
        return
      }
      entry.actions.onClose()
    })()
  }
  vim.defineEx('write', 'w', (cm) => entries.get(cm)?.actions.onWrite())
  // Why: `:q` refuses to close a buffer with unsaved edits (Orca does not autosave, so closing would
  // drop them); `:q!` forces the close. monaco-vim leaves the trailing `!` in `argString`.
  vim.defineEx('quit', 'q', (cm, params) => {
    const entry = entries.get(cm)
    const forced = (params.argString ?? '').trim().startsWith('!')
    if (!forced && entry?.actions.isDirty()) {
      // Thrown so monaco-vim surfaces it on the Vim status line, mirroring Vim's E37.
      throw new Error('No write since last change (add ! to override)')
    }
    closeNow(entry)
  })
  vim.defineEx('wq', 'wq', writeThenClose)
  vim.defineEx('xit', 'x', writeThenClose)
  vim.defineEx('set', 'se', (cm, params) => {
    const ed = entries.get(cm)?.actions.editor
    if (!ed) {
      return
    }
    const tokens = params.args?.length
      ? params.args
      : (params.argString ?? '').split(/\s+/).filter(Boolean)
    for (const token of tokens) {
      applySetOption(ed, token)
    }
  })
}

async function loadVimMode(): Promise<typeof InitVimMode> {
  const { initVimMode, VimMode } = await import('monaco-vim')
  if (!runtime) {
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: monaco-vim 0.4.4 attaches CodeMirror's Vim API and vim keymap to the exported adapter class at import; its published types omit them.
    const candidate = VimMode as unknown as VimRuntime
    // Assign only after registering, so a monaco-vim without `.Vim` fails every install, not just the first.
    defineExCommands(candidate.Vim)
    runtime = candidate
  }
  return initVimMode
}

/**
 * Enable Vim keybindings on a Monaco editor, writing mode/keystroke feedback into
 * `statusBarNode`. This editor's Ex commands route to `actions`: `:w`/`:wq`/`:x` run `onWrite`;
 * `:q` closes via `onClose` only when `isDirty()` is false, `:q!` closes regardless, and `:wq`/`:x`
 * close only after the write resolves; `:set` adjusts the editor. monaco-vim is imported lazily so
 * loading the editor (in tests, or on the default keymap) never pulls in the adapter.
 */
export async function installMonacoVimMode(
  editorInstance: editor.IStandaloneCodeEditor,
  statusBarNode: HTMLElement,
  actions: VimEditorActions
): Promise<VimModeController> {
  const initVimMode = await loadVimMode()
  const adapter = initVimMode(editorInstance, statusBarNode)
  const entry: VimEntry = { actions, insertMode: false, textFocused: editorInstance.hasTextFocus() }
  const claims = claimsCtrlChords()
  adapter.on('vim-mode-change', (event: { mode: string }) => {
    entry.insertMode = event.mode === 'insert' || event.mode === 'replace'
    if (claims) {
      syncChordFocus()
    }
  })
  const focusSubs = claims
    ? [
        editorInstance.onDidFocusEditorText(() => {
          entry.textFocused = true
          syncChordFocus()
        }),
        editorInstance.onDidBlurEditorText(() => {
          entry.textFocused = false
          syncChordFocus()
        })
      ]
    : []
  if (claims && entries.size === 0) {
    addAppKeyListener('keydown', claimVimCtrlChord, { first: true })
  }
  entries.set(adapter, entry)
  if (claims) {
    syncChordFocus()
  }
  let disposed = false
  return {
    dispose: (): void => {
      if (disposed) {
        return
      }
      disposed = true
      entries.delete(adapter)
      for (const sub of focusSubs) {
        sub.dispose()
      }
      if (claims) {
        syncChordFocus()
        if (entries.size === 0) {
          removeAppKeyListener('keydown', claimVimCtrlChord)
        }
      }
      adapter.dispose()
    }
  }
}
