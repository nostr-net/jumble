import { usePrimaryPage, usePrimaryNoteView } from '@/PageManager'
import { Home } from 'lucide-react'
import BottomNavigationBarItem from './BottomNavigationBarItem'

export default function HomeButton() {
  const { navigate, current, display } = usePrimaryPage()
  const { primaryViewType, setPrimaryNoteView } = usePrimaryNoteView()

  return (
    <BottomNavigationBarItem
      active={current === 'home' && display && primaryViewType === null}
      onClick={() => {
        // If there's an overlay open, clear it first
        if (primaryViewType !== null) {
          setPrimaryNoteView(null)
        } else {
          navigate('home')
        }
      }}
    >
      <Home />
    </BottomNavigationBarItem>
  )
}
