import { MessageCircle } from 'lucide-react'
import BottomNavigationBarItem from './BottomNavigationBarItem'

export default function DiscussionsButton() {
  // TODO: Implement discussions navigation when the component is built
  const handleClick = () => {
    // Placeholder for future discussions functionality
    console.log('Discussions button clicked - component to be implemented')
  }

  return (
    <BottomNavigationBarItem onClick={handleClick}>
      <MessageCircle />
    </BottomNavigationBarItem>
  )
}
