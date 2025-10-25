import { toSettings } from '@/lib/link'
import { useSmartSettingsNavigation, usePrimaryNoteView } from '@/PageManager'
import { useUserPreferences } from '@/providers/UserPreferencesProvider'
import { Settings } from 'lucide-react'
import SidebarItem from './SidebarItem'

export default function SettingsButton() {
  const { navigateToSettings } = useSmartSettingsNavigation()
  const { primaryViewType } = usePrimaryNoteView()
  const { showRecommendedRelaysPanel } = useUserPreferences()

  // Settings is active when:
  // 1. primaryViewType is 'settings' or 'settings-sub' (when side panel is off)
  // 2. OR we're on a /settings URL (when side panel is on)
  const url = window.location.pathname
  const isActive = 
    primaryViewType === 'settings' || 
    primaryViewType === 'settings-sub' || 
    (showRecommendedRelaysPanel && url.startsWith('/settings'))

  return (
    <SidebarItem title="Settings" onClick={() => navigateToSettings(toSettings())} active={isActive}>
      <Settings strokeWidth={3} />
    </SidebarItem>
  )
}
