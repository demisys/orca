import { SquarePen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useTranslate } from '@/i18n/use-translate'

/** Toggles the compose panel for a longer, formatted prompt. */
export function NativeChatComposeButton({
  onCompose
}: {
  onCompose: () => void
}): React.JSX.Element {
  const t = useTranslate()
  const label = t('components.native-chat.compose.open', 'Compose in editor')
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          // Keeps focus, and so the caret, in the composer; the panel inserts there.
          onMouseDown={(event) => event.preventDefault()}
          onClick={onCompose}
          className="pointer-coarse:size-11"
        >
          <SquarePen className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}
