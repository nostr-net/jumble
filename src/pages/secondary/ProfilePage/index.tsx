import Profile from '@/components/Profile'
import { useFetchProfile } from '@/hooks'
import SecondaryPageLayout from '@/layouts/SecondaryPageLayout'
import { forwardRef } from 'react'

const ProfilePage = forwardRef(({ id, index, hideTitlebar = false }: { id?: string; index?: number; hideTitlebar?: boolean }, ref) => {
  const { profile } = useFetchProfile(id)

  return (
    <SecondaryPageLayout index={index} title={hideTitlebar ? undefined : profile?.username} displayScrollToTopButton ref={ref}>
      <Profile id={id} />
    </SecondaryPageLayout>
  )
})
ProfilePage.displayName = 'ProfilePage'
export default ProfilePage
