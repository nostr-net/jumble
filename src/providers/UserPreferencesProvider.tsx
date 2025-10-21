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
  const [showRecommendedRelaysPanel, setShowRecommendedRelaysPanel] = useState(
    storage.getShowRecommendedRelaysPanel()
  )

  const updateNotificationListStyle = (style: TNotificationStyle) => {
    setNotificationListStyle(style)
    storage.setNotificationListStyle(style)
  }

  const updateShowRecommendedRelaysPanel = (show: boolean) => {
    setShowRecommendedRelaysPanel(show)
    storage.setShowRecommendedRelaysPanel(show)
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
