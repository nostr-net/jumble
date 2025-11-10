import { Event } from 'nostr-tools'
import Content from '../Content'

export default function PictureNote({ event, className }: { event: Event; className?: string }) {
  // Content component already handles all image rendering (from content and tags)
  // with proper deduplication, so we don't need to add anything extra
  return (
    <div className={className}>
      <Content event={event} />
    </div>
  )
}
