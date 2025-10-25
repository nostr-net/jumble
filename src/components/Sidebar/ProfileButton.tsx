import { usePrimaryPage, usePrimaryNoteView } from '@/PageManager'
import { useNostr } from '@/providers/NostrProvider'
import { UserRound } from 'lucide-react'
import SidebarItem from './SidebarItem'

export default function ProfileButton() {
  const { navigate, current, display } = usePrimaryPage()
  const { primaryViewType } = usePrimaryNoteView()
  const { checkLogin } = useNostr()

  // Profile button is active when:
  // 1. Profile is the current primary page AND there's no overlay (primaryViewType === null)
  // 2. OR primaryViewType is 'profile' (overlay profile)
  const isActive = 
    (display && current === 'profile' && primaryViewType === null) ||
    primaryViewType === 'profile'

  return (
    <SidebarItem
      title="Profile"
      onClick={() => checkLogin(() => navigate('profile'))}
      active={isActive}
    >
      <UserRound strokeWidth={3} />
    </SidebarItem>
  )
}
