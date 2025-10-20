import { toSettings } from '@/lib/link'
import { useSmartSettingsNavigation } from '@/PageManager'
import { Settings } from 'lucide-react'
import SidebarItem from './SidebarItem'

export default function SettingsButton() {
  const { navigateToSettings } = useSmartSettingsNavigation()

  return (
    <SidebarItem title="Settings" onClick={() => navigateToSettings(toSettings())}>
      <Settings strokeWidth={3} />
    </SidebarItem>
  )
}
