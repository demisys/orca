import { isInsideForeignChatDock } from '../../chat/native-chat-covered-pane'

/** A chat cover nests its docked shell inside the covered pane, but the shell's keys are its own. */
export function keyboardEventBelongsToScope(event: KeyboardEvent, scope: HTMLElement): boolean {
  const target = event.target
  if (target instanceof Node && scope.contains(target)) {
    return !isInsideForeignChatDock(target, scope)
  }
  const activeElement = scope.ownerDocument.activeElement
  return (
    activeElement instanceof Node &&
    scope.contains(activeElement) &&
    !isInsideForeignChatDock(activeElement, scope)
  )
}
