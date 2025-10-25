import { usePrimaryPage, usePrimaryNoteView } from '@/PageManager'
import { useNostr } from '@/providers/NostrProvider'
import { UserRound } from 'lucide-react'
import SidebarItem from './SidebarItem'

export default function ProfileButton() {
  const { navigate, current, display } = usePrimaryPage()
  const { primaryViewType } = usePrimaryNoteView()
  const { checkLogin } = useNostr()

  return (
    <SidebarItem
      title="Profile"
      onClick={() => checkLogin(() => navigate('profile'))}
      active={display && current === 'profile' && primaryViewType === 'profile'}
    >
      <UserRound strokeWidth={3} />
    </SidebarItem>
  )
}
