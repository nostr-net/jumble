import Collapsible from '@/components/Collapsible'
import FollowButton from '@/components/FollowButton'
import Nip05 from '@/components/Nip05'
import NpubQrCode from '@/components/NpubQrCode'
import ProfileAbout from '@/components/ProfileAbout'
import ProfileBanner from '@/components/ProfileBanner'
import ProfileOptions from '@/components/ProfileOptions'
import ProfileZapButton from '@/components/ProfileZapButton'
import PubkeyCopy from '@/components/PubkeyCopy'
import Tabs from '@/components/Tabs'
import RetroRefreshButton from '@/components/ui/RetroRefreshButton'
import ProfileSearchBar from '@/components/ui/ProfileSearchBar'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useFetchProfile } from '@/hooks'
import { toProfileEditor } from '@/lib/link'
import { generateImageByPubkey } from '@/lib/pubkey'
import { useSecondaryPage } from '@/PageManager'
import { useNostr } from '@/providers/NostrProvider'
import client from '@/services/client.service'
import { Link, Zap } from 'lucide-react'
import { useEffect, useMemo, useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import logger from '@/lib/logger'
import NotFound from '../NotFound'
import FollowedBy from './FollowedBy'
import ProfileFeed from './ProfileFeed'
import ProfileBookmarksAndHashtags from './ProfileBookmarksAndHashtags'
import SmartFollowings from './SmartFollowings'
import SmartMuteLink from './SmartMuteLink'
import SmartRelays from './SmartRelays'

type ProfileTabValue = 'posts' | 'pins' | 'bookmarks' | 'interests'

export default function Profile({ id }: { id?: string }) {
  const { t } = useTranslation()
  const { push } = useSecondaryPage()
  const { profile, isFetching } = useFetchProfile(id)
  const { pubkey: accountPubkey } = useNostr()
  const [activeTab, setActiveTab] = useState<ProfileTabValue>('posts')
  const [searchQuery, setSearchQuery] = useState('')
  
  // Refs for child components
  const profileFeedRef = useRef<{ refresh: () => void }>(null)
  const profileBookmarksRef = useRef<{ refresh: () => void }>(null)
  
  const isFollowingYou = useMemo(() => {
    // This will be handled by the FollowedBy component
    return false
  }, [profile, accountPubkey])
  const defaultImage = useMemo(
    () => (profile?.pubkey ? generateImageByPubkey(profile?.pubkey) : ''),
    [profile]
  )
  const isSelf = accountPubkey === profile?.pubkey

  // Refresh functions for each tab
  const handleRefresh = () => {
    if (activeTab === 'posts') {
      profileFeedRef.current?.refresh()
    } else {
      profileBookmarksRef.current?.refresh()
    }
  }

  // Define tabs with refresh buttons
  const tabs = useMemo(() => [
    {
      value: 'posts',
      label: 'Posts'
    },
    {
      value: 'pins',
      label: 'Pins'
    },
    {
      value: 'bookmarks',
      label: 'Bookmarks'
    },
    {
      value: 'interests',
      label: 'Interests'
    }
  ], [])

  useEffect(() => {
    if (!profile?.pubkey) return

    const forceUpdateCache = async () => {
      await Promise.all([
        client.forceUpdateRelayListEvent(profile.pubkey),
        client.fetchProfile(profile.pubkey, true)
      ])
    }
    forceUpdateCache()
  }, [profile?.pubkey])


  if (!profile && isFetching) {
    return (
      <>
        <div>
          <div className="relative bg-cover bg-center mb-2">
            <Skeleton className="w-full aspect-[3/1] rounded-none" />
            <Skeleton className="w-24 h-24 absolute bottom-0 left-3 translate-y-1/2 border-4 border-background rounded-full" />
          </div>
        </div>
        <div className="px-4">
          <Skeleton className="h-5 w-28 mt-14 mb-1" />
          <Skeleton className="h-5 w-56 mt-2 my-1 rounded-full" />
        </div>
      </>
    )
  }
  if (!profile) return <NotFound />

  const { banner, username, about, avatar, pubkey, website, lightningAddress } = profile
  
  logger.component('Profile', 'Profile data loaded', { 
    pubkey, 
    username, 
    hasProfile: !!profile, 
    isFetching,
    id 
  })
  return (
    <>
      <div>
        <div className="relative bg-cover bg-center mb-2">
          <ProfileBanner banner={banner} pubkey={pubkey} className="w-full aspect-[3/1]" />
          <Avatar className="w-24 h-24 absolute left-3 bottom-0 translate-y-1/2 border-4 border-background">
            <AvatarImage src={avatar} className="object-cover object-center" />
            <AvatarFallback>
              <img src={defaultImage} />
            </AvatarFallback>
          </Avatar>
        </div>
        <div className="px-4">
          <div className="flex justify-end h-8 gap-2 items-center">
            <ProfileOptions pubkey={pubkey} />
            {isSelf ? (
              <Button
                className="w-20 min-w-20 rounded-full"
                variant="secondary"
                onClick={() => push(toProfileEditor())}
              >
                {t('Edit')}
              </Button>
            ) : (
              <>
                {!!lightningAddress && <ProfileZapButton pubkey={pubkey} />}
                <FollowButton pubkey={pubkey} />
              </>
            )}
          </div>
          <div className="pt-2">
            <div className="flex gap-2 items-center">
              <div className="text-xl font-semibold truncate select-text">{username}</div>
              {isFollowingYou && (
                <div className="text-muted-foreground rounded-full bg-muted text-xs h-fit px-2 shrink-0">
                  {t('Follows you')}
                </div>
              )}
            </div>
            <Nip05 pubkey={pubkey} />
            {lightningAddress && (
              <div className="text-sm text-yellow-400 flex gap-1 items-center select-text">
                <Zap className="size-4 shrink-0" />
                <div className="flex-1 max-w-fit w-0 truncate">{lightningAddress}</div>
              </div>
            )}
            <div className="flex gap-1 mt-1">
              <PubkeyCopy pubkey={pubkey} />
              <NpubQrCode pubkey={pubkey} />
            </div>
            <Collapsible>
              <ProfileAbout
                about={about}
                className="text-wrap break-words whitespace-pre-wrap mt-2 select-text"
              />
            </Collapsible>
            {website && (
              <div className="flex gap-1 items-center text-primary mt-2 truncate select-text">
                <Link size={14} className="shrink-0" />
                <a
                  href={website}
                  target="_blank"
                  className="hover:underline truncate flex-1 max-w-fit w-0"
                >
                  {website}
                </a>
              </div>
            )}
            <div className="flex justify-between items-center mt-2 text-sm">
              <div className="flex gap-4 items-center">
                <SmartFollowings pubkey={pubkey} />
                <SmartRelays pubkey={pubkey} />
                {isSelf && <SmartMuteLink />}
              </div>
              {!isSelf && <FollowedBy pubkey={pubkey} />}
            </div>
          </div>
        </div>
      </div>
      <div>
        <Tabs
          value={activeTab}
          tabs={tabs}
          onTabChange={(tab) => setActiveTab(tab as ProfileTabValue)}
          threshold={800}
          options={
            <div className="flex items-center gap-2 pr-2">
              <ProfileSearchBar
                onSearch={setSearchQuery}
                placeholder={`Search ${activeTab}...`}
                className="w-64"
              />
              <RetroRefreshButton
                onClick={handleRefresh}
                size="sm"
                className="flex-shrink-0"
              />
            </div>
          }
        />
        {activeTab === 'posts' && (
          <ProfileFeed 
            ref={profileFeedRef} 
            pubkey={pubkey} 
            topSpace={0} 
            searchQuery={searchQuery}
          />
        )}
        {(activeTab === 'pins' || activeTab === 'bookmarks' || activeTab === 'interests') && (
          <ProfileBookmarksAndHashtags 
            ref={profileBookmarksRef}
            pubkey={pubkey} 
            initialTab={activeTab === 'pins' ? 'pins' : activeTab === 'bookmarks' ? 'bookmarks' : 'hashtags'}
            searchQuery={searchQuery}
          />
        )}
      </div>
    </>
  )
}
