// Ctrl chords vim relies on that Orca's Mod shortcuts (Ctrl on Linux/Windows) would otherwise take.
const VIM_PRIORITY_CTRL_KEYS = new Set(['a', 'b', 'd', 'e', 'f', 'i', 'o', 'r', 'u', 'v', 'x', 'y'])

export type VimCtrlChordInput = {
  control: boolean
  meta: boolean
  alt: boolean
  shift: boolean
  key: string
  code: string
}

/** The lowercase letter of a bare Ctrl+letter chord vim takes over in normal/visual mode, else null. */
export function vimPriorityCtrlLetter(input: VimCtrlChordInput): string | null {
  if (!input.control || input.meta || input.alt || input.shift) {
    return null
  }
  // Why the code fallback: non-Latin layouts report a localized `key` for the same physical letter.
  const fromCode = /^Key([A-Z])$/.exec(input.code)?.[1]?.toLowerCase()
  const letter = /^[a-z]$/i.test(input.key) ? input.key.toLowerCase() : fromCode
  return letter && VIM_PRIORITY_CTRL_KEYS.has(letter) ? letter : null
}
