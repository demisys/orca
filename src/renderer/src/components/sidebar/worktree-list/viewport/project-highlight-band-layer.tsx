import { useMemo } from 'react'
import type { Virtualizer } from '@tanstack/react-virtual'
import type { WorktreeGroupBy } from '../../../../../../shared/sidebar-list/row-types'
import { useRepoMarkColorResolver } from '../../../repo/RepoMark'
import type { RenderRow } from '../listing/render-row'
import {
  getProjectHighlightBands,
  getProjectHighlightSections,
  getProjectHighlightStyle,
  type ProjectHighlightBand,
  type ProjectHighlightSection
} from './project-highlight-bands'

export type ProjectHighlight = {
  /** Section color by header render-row key, for the pinned header. */
  colorByHeaderKey: ReadonlyMap<string, string>
  /** Measured bottom of each visible section by header render-row key, so its pinned header pushes off. */
  bottomByHeaderKey: ReadonlyMap<string, number>
  /** Painted behind the virtual rows so one band spans a project's header, cards and row gaps. */
  bands: React.ReactNode
}

export type ProjectHighlightLookup = Pick<
  ProjectHighlight,
  'colorByHeaderKey' | 'bottomByHeaderKey'
>

/** Keeps a highlighted project's pinned header inside its box, so the box's rounded bottom pushes
 * it off before it hides those corners or overlays the next project. */
export function renderProjectHighlightStickyBounds(args: {
  key: React.Key
  start: number
  /** Only while pinned; otherwise the wrapper is box-less so the header keeps its own transform. */
  sectionBottom: number | undefined
  header: React.ReactNode
}): React.JSX.Element {
  // Why: one wrapper element in both states so the header doesn't remount on sticky handoff.
  if (args.sectionBottom === undefined) {
    return (
      <div key={args.key} role="presentation" className="contents">
        {args.header}
      </div>
    )
  }
  // Why: starts 1px up to match the pinned header's -top-px, so bounding never moves it down.
  return (
    <div
      key={args.key}
      role="presentation"
      className="pointer-events-none absolute left-0 right-0"
      style={{
        top: args.start - 1,
        height: `calc(${args.sectionBottom - args.start + 1}px - var(--radius-xl))`
      }}
    >
      {args.header}
    </div>
  )
}

export function useProjectHighlight(
  rows: readonly RenderRow[],
  groupBy: WorktreeGroupBy,
  firstHeaderIndex: number,
  virtualization: {
    virtualizer: Pick<Virtualizer<HTMLDivElement, Element>, 'getVirtualItems' | 'measurementsCache'>
  }
): ProjectHighlight {
  const resolveRepoColor = useRepoMarkColorResolver()
  const sections = useMemo(
    () => getProjectHighlightSections(rows, groupBy, resolveRepoColor),
    [rows, groupBy, resolveRepoColor]
  )
  const colorByHeaderKey = useMemo(
    () => new Map(sections.map((section) => [section.key, section.color])),
    [sections]
  )
  const bands = measureBands(sections, rows, firstHeaderIndex, virtualization.virtualizer)
  return {
    colorByHeaderKey,
    bottomByHeaderKey: new Map(bands.map((band) => [band.key, band.top + band.height])),
    bands: bands.map((band) => (
      <div
        key={band.key}
        aria-hidden
        data-project-highlight-band
        // Why: -1 spans the scroller's 4px side padding so cards keep a gap inside the border.
        className="worktree-project-highlight pointer-events-none absolute -left-1 -right-1"
        style={{ ...getProjectHighlightStyle(band.color), top: band.top, height: band.height }}
      />
    ))
  }
}

function measureBands(
  sections: readonly ProjectHighlightSection[],
  rows: readonly RenderRow[],
  firstHeaderIndex: number,
  virtualizer: Pick<Virtualizer<HTMLDivElement, Element>, 'getVirtualItems' | 'measurementsCache'>
): ProjectHighlightBand[] {
  const virtualItems = virtualizer.getVirtualItems()
  if (sections.length === 0 || virtualItems.length === 0) {
    return []
  }
  return getProjectHighlightBands({
    sections,
    rows,
    firstHeaderIndex,
    measurements: virtualizer.measurementsCache,
    visibleStartIndex: Math.min(...virtualItems.map((item) => item.index)),
    visibleEndIndex: Math.max(...virtualItems.map((item) => item.index))
  })
}
