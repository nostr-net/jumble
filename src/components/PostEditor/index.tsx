import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet'
import { useScreenSize } from '@/providers/ScreenSizeProvider'
import postEditor from '@/services/post-editor.service'
import { Event } from 'nostr-tools'
import { Dispatch, useMemo } from 'react'
import PostContent from './PostContent'

export default function PostEditor({
  defaultContent = '',
  parentEvent,
  open,
  setOpen,
  openFrom,
  initialHighlightData
}: {
  defaultContent?: string
  parentEvent?: Event
  open: boolean
  setOpen: Dispatch<boolean>
  openFrom?: string[]
  initialHighlightData?: import('./HighlightEditor').HighlightData
}) {
  const { isSmallScreen } = useScreenSize()

  // If initialHighlightData is provided and we're creating a highlight from an event,
  // we need to pass the event content as defaultContent for the main editor
  // Note: This is handled separately - we'll pass the event content when opening from menu
  const effectiveDefaultContent = defaultContent

  const content = useMemo(() => {
    return (
      <PostContent
        defaultContent={effectiveDefaultContent}
        parentEvent={parentEvent}
        close={() => setOpen(false)}
        openFrom={openFrom}
        initialHighlightData={initialHighlightData}
      />
    )
  }, [effectiveDefaultContent, parentEvent, openFrom, setOpen, initialHighlightData])

  if (isSmallScreen) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          className="h-full w-full p-0 border-none"
          side="bottom"
          hideClose
          onEscapeKeyDown={(e) => {
            if (postEditor.isSuggestionPopupOpen) {
              e.preventDefault()
              postEditor.closeSuggestionPopup()
            }
          }}
        >
          <ScrollArea className="px-4 h-full max-h-screen" scrollBarClassName="opacity-100">
            <div className="space-y-4 px-2 py-6">
              <SheetHeader className="sr-only">
                <SheetTitle>Post Editor</SheetTitle>
                <SheetDescription>Create a new post or reply</SheetDescription>
              </SheetHeader>
              {content}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="p-0 max-w-2xl"
        withoutClose
        onEscapeKeyDown={(e) => {
          if (postEditor.isSuggestionPopupOpen) {
            e.preventDefault()
            postEditor.closeSuggestionPopup()
          }
        }}
      >
        <ScrollArea className="px-4 h-full max-h-screen" scrollBarClassName="opacity-100">
          <div className="space-y-4 px-2 py-6">
            <DialogHeader className="sr-only">
              <DialogTitle>Post Editor</DialogTitle>
              <DialogDescription>Create a new post or reply</DialogDescription>
            </DialogHeader>
            {content}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
