import { usePrimaryPage } from '@/PageManager'
import { Button } from '@/components/ui/button'
import { Compass } from 'lucide-react'

export default function ExploreButton() {
  const { navigate, current, display } = usePrimaryPage()

  return (
    <Button
      variant="ghost"
      size="titlebar-icon"
      onClick={() => navigate('explore')}
      className={current === 'explore' && display ? 'bg-accent/50' : ''}
    >
      <Compass />
    </Button>
  )
}
