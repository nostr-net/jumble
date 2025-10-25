import Sidebar from '@/components/Sidebar'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ChevronLeft } from 'lucide-react'
import NoteListPage from '@/pages/secondary/NoteListPage'
import HomePage from '@/pages/secondary/HomePage'
import NotePage from '@/pages/secondary/NotePage'
import SettingsPage from '@/pages/secondary/SettingsPage'
import RelaySettingsPage from '@/pages/secondary/RelaySettingsPage'
import WalletPage from '@/pages/secondary/WalletPage'
import PostSettingsPage from '@/pages/secondary/PostSettingsPage'
import GeneralSettingsPage from '@/pages/secondary/GeneralSettingsPage'
import TranslationPage from '@/pages/secondary/TranslationPage'
import SecondaryProfilePage from '@/pages/secondary/ProfilePage'
import { CurrentRelaysProvider } from '@/providers/CurrentRelaysProvider'
import { NotificationProvider } from '@/providers/NotificationProvider'
import { useUserPreferences } from '@/providers/UserPreferencesProvider'
import { TPageRef } from '@/types'
import {
  cloneElement,
  createContext,
  createRef,
  ReactNode,
  RefObject,
  useContext,
  useEffect,
  useRef,
  useState
} from 'react'
import BottomNavigationBar from './components/BottomNavigationBar'
import TooManyRelaysAlertDialog from './components/TooManyRelaysAlertDialog'
import { normalizeUrl } from './lib/url'
import ExplorePage from './pages/primary/ExplorePage'
import MePage from './pages/primary/MePage'
import NotificationListPage from './pages/primary/NotificationListPage'
import ProfilePage from './pages/primary/ProfilePage'
import RelayPage from './pages/primary/RelayPage'
import SearchPage from './pages/primary/SearchPage'
import DiscussionsPage from './pages/primary/DiscussionsPage'
import { useScreenSize } from './providers/ScreenSizeProvider'
import { routes } from './routes'
import modalManager from './services/modal-manager.service'
import CreateWalletGuideToast from './components/CreateWalletGuideToast'

export type TPrimaryPageName = keyof typeof PRIMARY_PAGE_MAP

type TPrimaryPageContext = {
  navigate: (page: TPrimaryPageName, props?: object) => void
  current: TPrimaryPageName | null
  display: boolean
}

type TSecondaryPageContext = {
  push: (url: string) => void
  pop: () => void
  currentIndex: number
}

type TStackItem = {
  index: number
  url: string
  component: React.ReactElement | null
  ref: RefObject<TPageRef> | null
}

const PRIMARY_PAGE_REF_MAP = {
  home: createRef<TPageRef>(),
  explore: createRef<TPageRef>(),
  notifications: createRef<TPageRef>(),
  me: createRef<TPageRef>(),
  profile: createRef<TPageRef>(),
  relay: createRef<TPageRef>(),
  search: createRef<TPageRef>(),
  discussions: createRef<TPageRef>()
}

const PRIMARY_PAGE_MAP = {
  home: <NoteListPage ref={PRIMARY_PAGE_REF_MAP.home} />,
  explore: <ExplorePage ref={PRIMARY_PAGE_REF_MAP.explore} />,
  notifications: <NotificationListPage ref={PRIMARY_PAGE_REF_MAP.notifications} />,
  me: <MePage ref={PRIMARY_PAGE_REF_MAP.me} />,
  profile: <ProfilePage ref={PRIMARY_PAGE_REF_MAP.profile} />,
  relay: <RelayPage ref={PRIMARY_PAGE_REF_MAP.relay} />,
  search: <SearchPage ref={PRIMARY_PAGE_REF_MAP.search} />,
  discussions: <DiscussionsPage ref={PRIMARY_PAGE_REF_MAP.discussions} />
}

const PrimaryPageContext = createContext<TPrimaryPageContext | undefined>(undefined)

const SecondaryPageContext = createContext<TSecondaryPageContext | undefined>(undefined)

const PrimaryNoteViewContext = createContext<{
  setPrimaryNoteView: (view: ReactNode | null, type?: 'note' | 'settings' | 'settings-sub' | 'profile' | 'hashtag') => void
  primaryViewType: 'note' | 'settings' | 'settings-sub' | 'profile' | 'hashtag' | null
} | undefined>(undefined)

export function usePrimaryPage() {
  const context = useContext(PrimaryPageContext)
  if (!context) {
    throw new Error('usePrimaryPage must be used within a PrimaryPageContext.Provider')
  }
  return context
}

export function useSecondaryPage() {
  const context = useContext(SecondaryPageContext)
  if (!context) {
    throw new Error('usePrimaryPage must be used within a SecondaryPageContext.Provider')
  }
  return context
}

export function usePrimaryNoteView() {
  const context = useContext(PrimaryNoteViewContext)
  if (!context) {
    throw new Error('usePrimaryNoteView must be used within a PrimaryNoteViewContext.Provider')
  }
  return context
}

// Custom hook for intelligent note navigation
export function useSmartNoteNavigation() {
  const { showRecommendedRelaysPanel } = useUserPreferences()
  const { push: pushSecondary } = useSecondaryPage()
  const { setPrimaryNoteView } = usePrimaryNoteView()
  
  const navigateToNote = (url: string) => {
    if (!showRecommendedRelaysPanel) {
      // When right panel is hidden, show note in primary area
      // Extract note ID from URL (e.g., "/notes/note1..." -> "note1...")
      const noteId = url.replace('/notes/', '')
      window.history.replaceState(null, '', url)
      setPrimaryNoteView(<NotePage id={noteId} index={0} hideTitlebar={true} />, 'note')
    } else {
      // Normal behavior - use secondary navigation
      pushSecondary(url)
    }
  }
  
  return { navigateToNote }
}

// Custom hook for intelligent relay navigation
export function useSmartRelayNavigation() {
  const { showRecommendedRelaysPanel } = useUserPreferences()
  const { push: pushSecondary } = useSecondaryPage()
  const { navigate: navigatePrimary } = usePrimaryPage()
  
  const navigateToRelay = (url: string) => {
    if (!showRecommendedRelaysPanel) {
      // When right panel is hidden, navigate to relay page in primary area
      // Extract relay URL from the path (e.g., "/relays/wss%3A%2F%2F..." -> "wss://...")
      const relayUrl = url.startsWith('/relays/') ? decodeURIComponent(url.replace('/relays/', '')) : url
      navigatePrimary('relay', { url: relayUrl })
    } else {
      // Normal behavior - use secondary navigation
      pushSecondary(url)
    }
  }
  
  return { navigateToRelay }
}

// Custom hook for intelligent profile navigation
export function useSmartProfileNavigation() {
  const { showRecommendedRelaysPanel } = useUserPreferences()
  const { push: pushSecondary } = useSecondaryPage()
  const { setPrimaryNoteView } = usePrimaryNoteView()
  
  const navigateToProfile = (url: string) => {
    if (!showRecommendedRelaysPanel) {
      // When right panel is hidden, show profile in primary area
      // Extract profile ID from URL (e.g., "/users/npub1..." -> "npub1...")
      const profileId = url.replace('/users/', '')
      window.history.replaceState(null, '', url)
      setPrimaryNoteView(<SecondaryProfilePage id={profileId} index={0} hideTitlebar={true} />, 'profile')
    } else {
      // Normal behavior - use secondary navigation
      pushSecondary(url)
    }
  }
  
  return { navigateToProfile }
}

// Custom hook for intelligent hashtag navigation
export function useSmartHashtagNavigation() {
  const { showRecommendedRelaysPanel } = useUserPreferences()
  const { push: pushSecondary } = useSecondaryPage()
  const { setPrimaryNoteView } = usePrimaryNoteView()
  
  const navigateToHashtag = (url: string) => {
    if (!showRecommendedRelaysPanel) {
      // When right panel is hidden, show hashtag feed in primary area
      // Extract hashtag from URL (e.g., "/notes?t=hashtag" -> "hashtag")
      const urlObj = new URL(url, window.location.origin)
      const hashtag = urlObj.searchParams.get('t')
      if (hashtag) {
        window.history.replaceState(null, '', url)
        setPrimaryNoteView(<NoteListPage index={0} hideTitlebar={true} />, 'hashtag')
      }
    } else {
      // Normal behavior - use secondary navigation
      pushSecondary(url)
    }
  }
  
  return { navigateToHashtag }
}

// Custom hook for intelligent settings navigation
export function useSmartSettingsNavigation() {
  const { showRecommendedRelaysPanel } = useUserPreferences()
  const { push: pushSecondary } = useSecondaryPage()
  const { setPrimaryNoteView } = usePrimaryNoteView()
  
  const navigateToSettings = (url: string) => {
    if (!showRecommendedRelaysPanel) {
      // When right panel is hidden, show settings page in primary area
      if (url === '/settings') {
        window.history.replaceState(null, '', url)
        setPrimaryNoteView(<SettingsPage index={0} hideTitlebar={true} />, 'settings')
      } else if (url === '/settings/relays') {
        window.history.replaceState(null, '', url)
        setPrimaryNoteView(<RelaySettingsPage index={0} hideTitlebar={true} />, 'settings-sub')
      } else if (url === '/settings/wallet') {
        window.history.replaceState(null, '', url)
        setPrimaryNoteView(<WalletPage index={0} hideTitlebar={true} />, 'settings-sub')
      } else if (url === '/settings/posts') {
        window.history.replaceState(null, '', url)
        setPrimaryNoteView(<PostSettingsPage index={0} hideTitlebar={true} />, 'settings-sub')
      } else if (url === '/settings/general') {
        window.history.replaceState(null, '', url)
        setPrimaryNoteView(<GeneralSettingsPage index={0} hideTitlebar={true} />, 'settings-sub')
      } else if (url === '/settings/translation') {
        window.history.replaceState(null, '', url)
        setPrimaryNoteView(<TranslationPage index={0} hideTitlebar={true} />, 'settings-sub')
      }
    } else {
      // Normal behavior - use secondary navigation
      pushSecondary(url)
    }
  }
  
  return { navigateToSettings }
}

function ConditionalHomePage() {
  const { showRecommendedRelaysPanel } = useUserPreferences()
  
  if (!showRecommendedRelaysPanel) {
    return null
  }
  
  return <HomePage />
}

function MainContentArea({ 
  primaryPages, 
  currentPrimaryPage, 
  secondaryStack,
  primaryNoteView,
  primaryViewType,
  setPrimaryNoteView
}: {
  primaryPages: { name: TPrimaryPageName; element: ReactNode; props?: any }[]
  currentPrimaryPage: TPrimaryPageName
  secondaryStack: { index: number; component: ReactNode }[]
  primaryNoteView: ReactNode | null
  primaryViewType: 'note' | 'settings' | 'settings-sub' | 'profile' | 'hashtag' | null
  setPrimaryNoteView: (view: ReactNode | null, type?: 'note' | 'settings' | 'settings-sub' | 'profile' | 'hashtag') => void
}) {
  const { showRecommendedRelaysPanel } = useUserPreferences()
  
  // If recommended relays panel is shown, use two-column layout
  // Otherwise use single column layout
  const gridClass = showRecommendedRelaysPanel ? "grid-cols-2" : "grid-cols-1"
  
  return (
    <div className={`grid ${gridClass} gap-2 w-full pr-2 py-2`}>
      <div className="rounded-lg shadow-lg bg-background overflow-hidden">
        {!showRecommendedRelaysPanel && primaryNoteView ? (
          // Show note view with back button when right panel is hidden
          <div className="flex flex-col h-full w-full">
            <div className="flex gap-1 p-1 items-center justify-between font-semibold border-b">
              <div className="flex items-center flex-1 w-0">
                <Button
                  className="flex gap-1 items-center w-fit max-w-full justify-start pl-2 pr-3"
                  variant="ghost"
                  size="titlebar-icon"
                  title="Back to feed"
                  onClick={() => setPrimaryNoteView(null)}
                >
                  <ChevronLeft />
                  <div className="truncate text-lg font-semibold">
                    {primaryViewType === 'settings' ? 'Settings' : 
                     primaryViewType === 'settings-sub' ? 'Settings' : 
                     primaryViewType === 'profile' ? 'Back' : 
                     primaryViewType === 'hashtag' ? 'Hashtag' : 'Note'}
                  </div>
                </Button>
              </div>
            </div>
            <div className="flex-1 overflow-auto">
              {primaryNoteView}
            </div>
          </div>
        ) : (
          // Show normal primary pages
          primaryPages.map(({ name, element, props }) => (
            <div
              key={name}
              className="flex flex-col h-full w-full"
              style={{
                display: currentPrimaryPage === name ? 'block' : 'none'
              }}
            >
              {props ? cloneElement(element as React.ReactElement, props) : element}
            </div>
          ))
        )}
      </div>
      {showRecommendedRelaysPanel && (
        <div className="rounded-lg shadow-lg bg-background overflow-hidden">
          {secondaryStack.map((item, index) => (
            <div
              key={item.index}
              className="flex flex-col h-full w-full"
              style={{ display: index === secondaryStack.length - 1 ? 'block' : 'none' }}
            >
              {item.component}
            </div>
          ))}
          <div
            key="home"
            className="w-full"
            style={{ display: secondaryStack.length === 0 ? 'block' : 'none' }}
          >
            <ConditionalHomePage />
          </div>
        </div>
      )}
    </div>
  )
}

export function PageManager({ maxStackSize = 5 }: { maxStackSize?: number }) {
  const { isSmallScreen } = useScreenSize()
  const { showRecommendedRelaysPanel } = useUserPreferences()
  const [currentPrimaryPage, setCurrentPrimaryPage] = useState<TPrimaryPageName>('home')
  const [primaryPages, setPrimaryPages] = useState<
    { name: TPrimaryPageName; element: ReactNode; props?: any }[]
  >([
    {
      name: 'home',
      element: PRIMARY_PAGE_MAP.home
    }
  ])
  const [secondaryStack, setSecondaryStack] = useState<TStackItem[]>([])
  const [primaryNoteView, setPrimaryNoteViewState] = useState<ReactNode | null>(null)
  const [primaryViewType, setPrimaryViewType] = useState<'note' | 'settings' | 'settings-sub' | 'profile' | 'hashtag' | null>(null)
  const [savedPrimaryPage, setSavedPrimaryPage] = useState<TPrimaryPageName | null>(null)
  
  const setPrimaryNoteView = (view: ReactNode | null, type?: 'note' | 'settings' | 'settings-sub' | 'profile' | 'hashtag') => {
    if (view && !primaryNoteView) {
      // Saving current primary page before showing overlay
      setSavedPrimaryPage(currentPrimaryPage)
    }
    
    setPrimaryNoteViewState(view)
    setPrimaryViewType(type || null)
    
    // If clearing the view, restore to the saved primary page
    if (!view && savedPrimaryPage) {
      const newUrl = savedPrimaryPage === 'home' ? '/' : `/?page=${savedPrimaryPage}`
      window.history.replaceState(null, '', newUrl)
    }
  }
  const ignorePopStateRef = useRef(false)

  useEffect(() => {
    if (['/npub1', '/nprofile1'].some((prefix) => window.location.pathname.startsWith(prefix))) {
      window.history.replaceState(
        null,
        '',
        '/users' + window.location.pathname + window.location.search + window.location.hash
      )
    } else if (
      ['/note1', '/nevent1', '/naddr1'].some((prefix) =>
        window.location.pathname.startsWith(prefix)
      )
    ) {
      window.history.replaceState(
        null,
        '',
        '/notes' + window.location.pathname + window.location.search + window.location.hash
      )
    }
    window.history.pushState(null, '', window.location.href)
    if (window.location.pathname !== '/') {
      const url = window.location.pathname + window.location.search + window.location.hash
      
      // If the side panel is off and we're on a settings page, don't add to secondary stack
      // The settings navigation will handle it via primary view
      if (!showRecommendedRelaysPanel && window.location.pathname.startsWith('/settings')) {
        // Skip secondary stack handling for settings when side panel is off
      } else {
        setSecondaryStack((prevStack) => {
          if (isCurrentPage(prevStack, url)) return prevStack

          const { newStack, newItem } = pushNewPageToStack(
            prevStack,
            url,
            maxStackSize,
            window.history.state?.index
          )
          if (newItem) {
            window.history.replaceState({ index: newItem.index, url }, '', url)
          }
          return newStack
        })
      }
    } else {
      const searchParams = new URLSearchParams(window.location.search)
      const r = searchParams.get('r')
      const page = searchParams.get('page')
      
      if (r) {
        const url = normalizeUrl(r)
        if (url) {
          navigatePrimaryPage('relay', { url })
        }
      } else if (page && page in PRIMARY_PAGE_MAP) {
        navigatePrimaryPage(page as TPrimaryPageName)
      }
    }

    const onPopState = (e: PopStateEvent) => {
      if (ignorePopStateRef.current) {
        ignorePopStateRef.current = false
        return
      }

      const closeModal = modalManager.pop()
      if (closeModal) {
        ignorePopStateRef.current = true
        window.history.forward()
        return
      }

      let state = e.state as { index: number; url: string } | null
      setSecondaryStack((pre) => {
        const currentItem = pre[pre.length - 1] as TStackItem | undefined
        const currentIndex = currentItem?.index
        if (!state) {
          if (window.location.pathname + window.location.search + window.location.hash !== '/') {
            // Just change the URL
            return pre
          } else {
            // Back to root
            state = { index: -1, url: '/' }
          }
        }

        // Go forward
        if (currentIndex === undefined || state.index > currentIndex) {
          const { newStack } = pushNewPageToStack(pre, state.url, maxStackSize)
          return newStack
        }

        if (state.index === currentIndex) {
          return pre
        }

        // Go back
        const newStack = pre.filter((item) => item.index <= state!.index)
        const topItem = newStack[newStack.length - 1] as TStackItem | undefined
        if (!topItem) {
          // Create a new stack item if it's not exist (e.g. when the user refreshes the page, the stack will be empty)
          const { component, ref } = findAndCreateComponent(state.url, state.index)
          if (component) {
            newStack.push({
              index: state.index,
              url: state.url,
              component,
              ref
            })
          }
        } else if (!topItem.component) {
          // Load the component if it's not cached
          const { component, ref } = findAndCreateComponent(topItem.url, state.index)
          if (component) {
            topItem.component = component
            topItem.ref = ref
          }
        }
        if (newStack.length === 0) {
          window.history.replaceState(null, '', '/')
        }
        return newStack
      })
    }

    window.addEventListener('popstate', onPopState)

    return () => {
      window.removeEventListener('popstate', onPopState)
    }
  }, [])

  const navigatePrimaryPage = (page: TPrimaryPageName, props?: any) => {
    const needScrollToTop = page === currentPrimaryPage
    setPrimaryPages((prev) => {
      const exists = prev.find((p) => p.name === page)
      if (exists && props) {
        exists.props = props
        return [...prev]
      } else if (!exists) {
        return [...prev, { name: page, element: PRIMARY_PAGE_MAP[page], props }]
      }
      return prev
    })
    setCurrentPrimaryPage(page)
    
    // Clear any primary note view when navigating to a new primary page
    setPrimaryNoteView(null)
    
    // Update URL for primary pages (except home)
    const newUrl = page === 'home' ? '/' : `/?page=${page}`
    window.history.pushState(null, '', newUrl)
    
    if (needScrollToTop) {
      PRIMARY_PAGE_REF_MAP[page].current?.scrollToTop('smooth')
    }
    if (isSmallScreen) {
      clearSecondaryPages()
    }
  }

  const pushSecondaryPage = (url: string, index?: number) => {
    setSecondaryStack((prevStack) => {
      if (isCurrentPage(prevStack, url)) {
        const currentItem = prevStack[prevStack.length - 1]
        if (currentItem?.ref?.current) {
          currentItem.ref.current.scrollToTop('instant')
        }
        return prevStack
      }

      const { newStack, newItem } = pushNewPageToStack(prevStack, url, maxStackSize, index)
      if (newItem) {
        window.history.pushState({ index: newItem.index, url }, '', url)
      }
      return newStack
    })
  }

  const popSecondaryPage = () => {
    if (secondaryStack.length === 1) {
      // back to home page
      window.history.replaceState(null, '', '/')
      setSecondaryStack([])
    } else {
      window.history.go(-1)
    }
  }

  const clearSecondaryPages = () => {
    if (secondaryStack.length === 0) return
    window.history.go(-secondaryStack.length)
  }

  if (isSmallScreen) {
    return (
      <PrimaryPageContext.Provider
        value={{
          navigate: navigatePrimaryPage,
          current: currentPrimaryPage,
          display: secondaryStack.length === 0
        }}
      >
        <SecondaryPageContext.Provider
          value={{
            push: pushSecondaryPage,
            pop: popSecondaryPage,
            currentIndex: secondaryStack.length
              ? secondaryStack[secondaryStack.length - 1].index
              : 0
          }}
        >
        <CurrentRelaysProvider>
          <NotificationProvider>
            <PrimaryNoteViewContext.Provider value={{ setPrimaryNoteView, primaryViewType }}>
            {!!secondaryStack.length &&
              secondaryStack.map((item, index) => (
                <div
                  key={item.index}
                  style={{
                    display: index === secondaryStack.length - 1 ? 'block' : 'none'
                  }}
                >
                  {item.component}
                </div>
              ))}
            {primaryPages.map(({ name, element, props }) => (
              <div
                key={name}
                style={{
                  display:
                    secondaryStack.length === 0 && currentPrimaryPage === name ? 'block' : 'none'
                }}
              >
                {props ? cloneElement(element as React.ReactElement, props) : element}
              </div>
            ))}
            <BottomNavigationBar />
            <TooManyRelaysAlertDialog />
            <CreateWalletGuideToast />
            </PrimaryNoteViewContext.Provider>
          </NotificationProvider>
        </CurrentRelaysProvider>
        </SecondaryPageContext.Provider>
      </PrimaryPageContext.Provider>
    )
  }

  return (
    <PrimaryPageContext.Provider
      value={{
        navigate: navigatePrimaryPage,
        current: currentPrimaryPage,
        display: true
      }}
    >
      <SecondaryPageContext.Provider
        value={{
          push: pushSecondaryPage,
          pop: popSecondaryPage,
          currentIndex: secondaryStack.length ? secondaryStack[secondaryStack.length - 1].index : 0
        }}
      >
        <CurrentRelaysProvider>
          <NotificationProvider>
            <PrimaryNoteViewContext.Provider value={{ setPrimaryNoteView, primaryViewType }}>
            <div className="flex flex-col items-center bg-surface-background">
              <div
                className="flex h-[var(--vh)] w-full bg-surface-background"
                style={{
                  maxWidth: '1920px'
                }}
              >
                <Sidebar />
                <MainContentArea 
                  primaryPages={primaryPages}
                  currentPrimaryPage={currentPrimaryPage}
                  secondaryStack={secondaryStack}
                  primaryNoteView={primaryNoteView}
                  primaryViewType={primaryViewType}
                  setPrimaryNoteView={setPrimaryNoteView}
                />
              </div>
            </div>
            <TooManyRelaysAlertDialog />
            <CreateWalletGuideToast />
            </PrimaryNoteViewContext.Provider>
          </NotificationProvider>
        </CurrentRelaysProvider>
      </SecondaryPageContext.Provider>
    </PrimaryPageContext.Provider>
  )
}

export function SecondaryPageLink({
  to,
  children,
  className,
  onClick
}: {
  to: string
  children: React.ReactNode
  className?: string
  onClick?: (e: React.MouseEvent) => void
}) {
  const { push } = useSecondaryPage()

  return (
    <span
      className={cn('cursor-pointer', className)}
      onClick={(e) => {
        if (onClick) {
          onClick(e)
        }
        push(to)
      }}
    >
      {children}
    </span>
  )
}

function isCurrentPage(stack: TStackItem[], url: string) {
  const currentPage = stack[stack.length - 1]
  if (!currentPage) return false

  return currentPage.url === url
}

function findAndCreateComponent(url: string, index: number) {
  const path = url.split('?')[0].split('#')[0]
  for (const { matcher, element } of routes) {
    const match = matcher(path)
    if (!match) continue

    if (!element) return {}
    const ref = createRef<TPageRef>()
    return { component: cloneElement(element, { ...match.params, index, ref } as any), ref }
  }
  return {}
}

function pushNewPageToStack(
  stack: TStackItem[],
  url: string,
  maxStackSize = 5,
  specificIndex?: number
) {
  const currentItem = stack[stack.length - 1]
  const currentIndex = specificIndex ?? (currentItem ? currentItem.index + 1 : 0)

  const { component, ref } = findAndCreateComponent(url, currentIndex)
  if (!component) return { newStack: stack, newItem: null }

  const newItem = { component, ref, url, index: currentIndex }
  const newStack = [...stack, newItem]
  const lastCachedIndex = newStack.findIndex((stack) => stack.component)
  // Clear the oldest cached component if there are too many cached components
  if (newStack.length - lastCachedIndex > maxStackSize) {
    newStack[lastCachedIndex].component = null
  }
  return { newStack, newItem }
}
