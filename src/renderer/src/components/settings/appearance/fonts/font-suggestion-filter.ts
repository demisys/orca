import { normalizeSettingsFormOptionQuery } from '../../form-controls/settings-form-option-filter'

export function filterFontSuggestions(
  suggestions: readonly string[],
  query: string,
  defaultOptionLabel = ''
): string[] {
  const normalizedQuery = normalizeSettingsFormOptionQuery(query)
  if (normalizedQuery === null) {
    return []
  }
  if (!normalizedQuery) {
    return [...suggestions]
  }

  const startsWith: string[] = []
  const includes: string[] = []
  for (const font of suggestions) {
    const normalizedFont = (font || defaultOptionLabel).toLowerCase()
    if (normalizedFont.startsWith(normalizedQuery)) {
      startsWith.push(font)
    } else if (normalizedFont.includes(normalizedQuery)) {
      includes.push(font)
    }
  }
  return [...startsWith, ...includes]
}
