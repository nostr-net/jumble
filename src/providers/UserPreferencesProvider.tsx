import storage from '@/services/local-storage.service'
import { TNotificationStyle } from '@/types'
import { createContext, useContext, useState } from 'react'

type TUserPreferencesContext = {
  notificationListStyle: TNotificationStyle
  updateNotificationListStyle: (style: TNotificationStyle) => void
  showRecommendedRelaysPanel: boolean
  updateShowRecommendedRelaysPanel: (show: boolean) => void
}

const UserPreferencesContext = createContext<TUserPreferencesContext | undefined>(undefined)

export const useUserPreferences = () => {
  const context = useContext(UserPreferencesContext)
  if (!context) {
    throw new Error('useUserPreferences must be used within a UserPreferencesProvider')
  }
  return context
}

export function UserPreferencesProvider({ children }: { children: React.ReactNode }) {
  const [notificationListStyle, setNotificationListStyle] = useState(
    storage.getNotificationListStyle()
  )
  // DEPRECATED: Double-panel functionality removed for technical debt reduction
  // Keeping for backward compatibility in case we miss any references
  const [showRecommendedRelaysPanel] = useState(false)
  
  // DEPRECATED: Mobile panel forcing removed - double-panel functionality disabled

  const updateNotificationListStyle = (style: TNotificationStyle) => {
    setNotificationListStyle(style)
    storage.setNotificationListStyle(style)
  }

  // DEPRECATED: Double-panel functionality disabled - always returns false
  const updateShowRecommendedRelaysPanel = (_show: boolean) => {
    // No-op: double-panel functionality has been removed
  }

  return (
    <UserPreferencesContext.Provider
      value={{
        notificationListStyle,
        updateNotificationListStyle,
        showRecommendedRelaysPanel,
        updateShowRecommendedRelaysPanel
      }}
    >
      {children}
    </UserPreferencesContext.Provider>
  )
}
