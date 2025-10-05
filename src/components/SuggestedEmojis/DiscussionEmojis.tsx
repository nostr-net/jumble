import { TEmoji } from '@/types'

const DISCUSSION_EMOJIS = ['⬆️', '⬇️']

export default function DiscussionEmojis({
  onEmojiClick
}: {
  onEmojiClick: (emoji: string | TEmoji) => void
}) {
  return (
    <div className="flex gap-1 p-1" style={{ width: '60px', maxWidth: '60px' }} onClick={(e) => e.stopPropagation()}>
      {DISCUSSION_EMOJIS.map((emoji, index) => (
        <div
          key={index}
          className="w-6 h-6 rounded-lg clickable flex justify-center items-center text-base hover:bg-muted flex-shrink-0"
          onClick={() => onEmojiClick(emoji)}
        >
          {emoji}
        </div>
      ))}
    </div>
  )
}
