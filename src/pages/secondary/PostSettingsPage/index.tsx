import SecondaryPageLayout from '@/layouts/SecondaryPageLayout'
import { forwardRef } from 'react'
import { useTranslation } from 'react-i18next'
import MediaUploadServiceSetting from './MediaUploadServiceSetting'

const PostSettingsPage = forwardRef(({ index, hideTitlebar = false }: { index?: number; hideTitlebar?: boolean }, ref) => {
  const { t } = useTranslation()

  return (
    <SecondaryPageLayout ref={ref} index={index} title={hideTitlebar ? undefined : t('Post settings')}>
      <div className="px-4 pt-3 space-y-4">
        <MediaUploadServiceSetting />
      </div>
    </SecondaryPageLayout>
  )
})
PostSettingsPage.displayName = 'PostSettingsPage'
export default PostSettingsPage
