import { createContext, useContext, useState } from 'react'
import storage from '@/services/local-storage.service'
import { SUPPORTED_KINDS } from '@/constants'
import { kinds } from 'nostr-tools'

type TKindFilterContext = {
  showKinds: number[]
  updateShowKinds: (kinds: number[]) => void
}

const KindFilterContext = createContext<TKindFilterContext | undefined>(undefined)

export const useKindFilter = () => {
  const context = useContext(KindFilterContext)
  if (!context) {
    throw new Error('useKindFilter must be used within a KindFilterProvider')
  }
  return context
}

export function KindFilterProvider({ children }: { children: React.ReactNode }) {
  // Ensure we always have a default value - show all supported kinds except reposts
  const defaultShowKinds = SUPPORTED_KINDS.filter(kind => kind !== kinds.Repost)
  const storedShowKinds = storage.getShowKinds()
  const [showKinds, setShowKinds] = useState<number[]>(
    storedShowKinds.length > 0 ? storedShowKinds : defaultShowKinds
  )

  // Debug logging
  // console.log('KindFilterProvider initialized:', {
  //   defaultShowKinds,
  //   storedShowKinds,
  //   finalShowKinds: showKinds,
  //   showKindsLength: showKinds.length
  // })

  const updateShowKinds = (kinds: number[]) => {
    storage.setShowKinds(kinds)
    setShowKinds(kinds)
  }

  return (
    <KindFilterContext.Provider value={{ showKinds, updateShowKinds }}>
      {children}
    </KindFilterContext.Provider>
  )
}
