import storage from '@/services/local-storage.service'
import { TNotificationStyle } from '@/types'
import { createContext, useContext, useState } from 'react'

type TUserPreferencesContext = {
  notificationListStyle: TNotificationStyle
  updateNotificationListStyle: (style: TNotificationStyle) => void
  hideRecommendedRelaysPanel: boolean
  updateHideRecommendedRelaysPanel: (hide: boolean) => void
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
  const [hideRecommendedRelaysPanel, setHideRecommendedRelaysPanel] = useState(
    storage.getHideRecommendedRelaysPanel()
  )

  const updateNotificationListStyle = (style: TNotificationStyle) => {
    setNotificationListStyle(style)
    storage.setNotificationListStyle(style)
  }

  const updateHideRecommendedRelaysPanel = (hide: boolean) => {
    setHideRecommendedRelaysPanel(hide)
    storage.setHideRecommendedRelaysPanel(hide)
  }

  return (
    <UserPreferencesContext.Provider
      value={{
        notificationListStyle,
        updateNotificationListStyle,
        hideRecommendedRelaysPanel,
        updateHideRecommendedRelaysPanel
      }}
    >
      {children}
    </UserPreferencesContext.Provider>
  )
}
