import { describe, expect, it } from 'vitest'
import { parseWorkspaceSession } from '../../workspace-session/workspace-session-schema'
import { loadWorkspaceLayoutWithoutReport } from './workspace-layout-load'
import { saveWorkspaceLayout } from './workspace-layout-save'

const WT = 'repo1::/worktree'
const CHAT_LEAF = '11111111-1111-4111-8111-111111111111'
const DOCK_LEAF = '22222222-2222-4222-8222-222222222222'

function row(id: string, ptyId: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    ptyId,
    worktreeId: WT,
    title: id,
    customTitle: null,
    color: null,
    sortOrder: 0,
    createdAt: 1,
    ...extra
  }
}

function layout(leafId: string, ptyId: string) {
  return {
    root: { type: 'leaf', leafId },
    activeLeafId: leafId,
    expandedLeafId: null,
    ptyIdsByLeafId: { [leafId]: ptyId }
  }
}

describe('chat-docked terminal persistence', () => {
  it('restores a docked shell with its PTY and keeps it out of the tab bar', () => {
    const parsed = parseWorkspaceSession({
      activeRepoId: 'repo1',
      activeWorktreeId: WT,
      activeTabId: 'chat',
      tabsByWorktree: {
        [WT]: [
          row('chat', 'chat-pty'),
          row('dock', 'dock-pty', { chatDock: { ownerTabId: 'chat' } })
        ]
      },
      terminalLayoutsByTabId: {
        chat: layout(CHAT_LEAF, 'chat-pty'),
        dock: layout(DOCK_LEAF, 'dock-pty')
      },
      unifiedTabs: {
        [WT]: [
          {
            id: 'chat',
            entityId: 'chat',
            groupId: 'g1',
            worktreeId: WT,
            contentType: 'terminal',
            label: 'chat',
            customLabel: null,
            color: null,
            sortOrder: 0,
            createdAt: 1
          }
        ]
      },
      tabGroups: { [WT]: [{ id: 'g1', worktreeId: WT, activeTabId: 'chat', tabOrder: ['chat'] }] }
    })
    if (!parsed.ok) {
      throw new Error(parsed.error)
    }
    let minted = 0
    const saved = saveWorkspaceLayout(
      loadWorkspaceLayoutWithoutReport('local', parsed.value, {
        mintId: (seed) => `minted-${seed}-${minted++}`,
        mintLeafId: () => `33333333-3333-4333-8333-33333333333${minted++}`
      })
    )

    expect(saved.tabsByWorktree[WT]?.find((tab) => tab.id === 'dock')).toMatchObject({
      ptyId: 'dock-pty',
      chatDock: { ownerTabId: 'chat' }
    })
    expect(saved.unifiedTabs?.[WT]?.map((tab) => tab.entityId)).toEqual(['chat'])
    expect(saved.tabGroups?.[WT]?.flatMap((group) => group.tabOrder)).toEqual(['chat'])
  })
})
