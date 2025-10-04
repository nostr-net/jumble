import { usePrimaryPage } from '@/PageManager'
import { MessageCircle } from 'lucide-react'
import BottomNavigationBarItem from './BottomNavigationBarItem'

export default function DiscussionsButton() {
  const { navigate, current, display } = usePrimaryPage()

  return (
    <BottomNavigationBarItem
      active={current === 'discussions' && display}
      onClick={() => navigate('discussions')}
    >
      <MessageCircle />
    </BottomNavigationBarItem>
  )
}
