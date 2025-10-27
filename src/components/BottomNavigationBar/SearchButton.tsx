import { usePrimaryPage, usePrimaryNoteView } from '@/PageManager'
import { Search } from 'lucide-react'
import BottomNavigationBarItem from './BottomNavigationBarItem'

export default function SearchButton() {
  const { navigate, current, display } = usePrimaryPage()
  const { primaryViewType } = usePrimaryNoteView()

  return (
    <BottomNavigationBarItem
      active={current === 'search' && display && primaryViewType === null}
      onClick={() => navigate('search')}
    >
      <Search />
    </BottomNavigationBarItem>
  )
}
