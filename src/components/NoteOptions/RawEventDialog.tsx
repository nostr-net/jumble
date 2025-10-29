import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { Event } from 'nostr-tools'

export default function RawEventDialog({
  event,
  isOpen,
  onClose
}: {
  event: Event
  isOpen: boolean
  onClose: () => void
}) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="h-[60vh] w-[95vw] max-w-[400px] sm:w-[90vw] sm:max-w-[600px] md:w-[85vw] md:max-w-[800px] lg:w-[80vw] lg:max-w-[1000px] xl:w-[75vw] xl:max-w-[1200px] 2xl:w-[70vw] 2xl:max-w-[1400px]">
        <DialogHeader>
          <DialogTitle>Raw Event</DialogTitle>
          <DialogDescription className="sr-only">View the raw event data</DialogDescription>
        </DialogHeader>
        <ScrollArea className="h-full">
          <pre className="text-sm text-muted-foreground select-text whitespace-pre-wrap break-words">
            {JSON.stringify(event, null, 2)}
          </pre>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
