import { MessageCircle } from 'lucide-react'
import { Event } from 'nostr-tools'
import { useTranslation } from 'react-i18next'
import Notification from './Notification'

export function DiscussionNotification({
  notification,
  isNew = false
}: {
  notification: Event
  isNew?: boolean
}) {
  const { t } = useTranslation()

  // Get the topic from t-tags
  const topicTags = notification.tags.filter(tag => tag[0] === 't' && tag[1])
  const topics = topicTags.map(tag => tag[1])
  const topicString = topics.length > 0 ? topics.join(', ') : t('general')

  return (
    <Notification
      notificationId={notification.id}
      sender={notification.pubkey}
      sentAt={notification.created_at}
      description={t('started a discussion in {{topic}}', { topic: topicString })}
      icon={<MessageCircle className="w-4 h-4 text-primary" />}
      targetEvent={notification}
      isNew={isNew}
      showStats={false}
    />
  )
}

