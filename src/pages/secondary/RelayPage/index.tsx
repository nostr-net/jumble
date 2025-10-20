import Relay from '@/components/Relay'
import SecondaryPageLayout from '@/layouts/SecondaryPageLayout'
import { normalizeUrl, simplifyUrl } from '@/lib/url'
import { forwardRef, useMemo } from 'react'
import NotFoundPage from '../NotFoundPage'

const RelayPage = forwardRef(({ url, index, hideTitlebar = false }: { url?: string; index?: number; hideTitlebar?: boolean }, ref) => {
  const normalizedUrl = useMemo(() => (url ? normalizeUrl(url) : undefined), [url])
  const title = useMemo(() => (url ? simplifyUrl(url) : undefined), [url])

  if (!normalizedUrl) {
    return <NotFoundPage ref={ref} />
  }

  return (
    <SecondaryPageLayout ref={ref} index={index} title={hideTitlebar ? undefined : title} displayScrollToTopButton>
      <Relay url={normalizedUrl} />
    </SecondaryPageLayout>
  )
})
RelayPage.displayName = 'RelayPage'
export default RelayPage
