import { cn } from '@/lib/utils'
import { useTranslation } from 'react-i18next'
import { useRef, useEffect, useState } from 'react'

export type TTabValue = 'replies' | 'quotes' | 'reactions' | 'reposts' | 'zaps'
const TABS = [
  { value: 'replies', label: 'Replies' },
  { value: 'zaps', label: 'Zaps' },
  { value: 'reposts', label: 'Reposts' },
  { value: 'reactions', label: 'Reactions' },
  { value: 'quotes', label: 'Quotes' }
] as { value: TTabValue; label: string }[]

export function Tabs({
  selectedTab,
  onTabChange,
  hideRepostsAndQuotes = false
}: {
  selectedTab: TTabValue
  onTabChange: (tab: TTabValue) => void
  hideRepostsAndQuotes?: boolean
}) {
  const { t } = useTranslation()
  const tabRefs = useRef<(HTMLDivElement | null)[]>([])
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [indicatorStyle, setIndicatorStyle] = useState({ width: 0, left: 0, top: 0 })

  // Filter tabs based on hideRepostsAndQuotes
  const visibleTabs = hideRepostsAndQuotes 
    ? TABS.filter(tab => tab.value !== 'reposts' && tab.value !== 'quotes')
    : TABS

  useEffect(() => {
    setTimeout(() => {
      const activeIndex = visibleTabs.findIndex((tab) => tab.value === selectedTab)
      if (activeIndex >= 0 && tabRefs.current[activeIndex] && containerRef.current) {
        const activeTab = tabRefs.current[activeIndex]
        const container = containerRef.current
        const { offsetWidth, offsetLeft, offsetHeight } = activeTab
        
        // Get the container's top position relative to the viewport
        const containerTop = container.getBoundingClientRect().top
        const tabTop = activeTab.getBoundingClientRect().top
        
        // Calculate the indicator's top position relative to the container
        // Position it at the bottom of the active tab's row
        const relativeTop = tabTop - containerTop + offsetHeight
        const padding = 32 // 16px padding on each side
        
        setIndicatorStyle({
          width: offsetWidth - padding,
          left: offsetLeft + padding / 2,
          top: relativeTop - 4 // 4px for the indicator height (1px) + spacing
        })
      }
    }, 20) // ensure tabs are rendered before calculating
  }, [selectedTab, visibleTabs])

  return (
    <div className="w-full">
      <div ref={containerRef} className="flex flex-wrap relative gap-1">
        {visibleTabs.map((tab, index) => (
          <div
            key={tab.value}
            ref={(el) => (tabRefs.current[index] = el)}
            className={cn(
              `text-center px-4 py-2 font-semibold whitespace-nowrap clickable cursor-pointer rounded-lg`,
              selectedTab === tab.value ? '' : 'text-muted-foreground'
            )}
            onClick={() => onTabChange(tab.value)}
          >
            {t(tab.label)}
          </div>
        ))}
        <div
          className="absolute h-1 bg-primary rounded-full transition-all duration-500"
          style={{
            width: `${indicatorStyle.width}px`,
            left: `${indicatorStyle.left}px`,
            top: `${indicatorStyle.top}px`
          }}
        />
      </div>
    </div>
  )
}
