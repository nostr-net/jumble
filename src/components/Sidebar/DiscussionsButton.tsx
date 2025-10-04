import { usePrimaryPage } from '@/PageManager'
import { MessageCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import SidebarItem from './SidebarItem'

export default function DiscussionsButton() {
  const { t } = useTranslation()
  const { navigate, current } = usePrimaryPage()

  return (
    <SidebarItem
      title={t('Discussions')}
      onClick={() => navigate('discussions')}
      active={current === 'discussions'}
    >
      <MessageCircle strokeWidth={3} />
    </SidebarItem>
  )
}
