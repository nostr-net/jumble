import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import storage from '@/services/local-storage.service'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

export default function QuietSettings() {
  const { t } = useTranslation()
  const [enabled, setEnabled] = useState(false)
  const [days, setDays] = useState(7)
  const [respectQuietTags, setRespectQuietTags] = useState(true)
  const [globalQuietMode, setGlobalQuietMode] = useState(false)

  useEffect(() => {
    setEnabled(storage.getDefaultQuietEnabled())
    setDays(storage.getDefaultQuietDays())
    setRespectQuietTags(storage.getRespectQuietTags())
    setGlobalQuietMode(storage.getGlobalQuietMode())
  }, [])

  const handleEnabledChange = (checked: boolean) => {
    setEnabled(checked)
    storage.setDefaultQuietEnabled(checked)
  }

  const handleDaysChange = (value: string) => {
    const num = parseInt(value)
    if (!isNaN(num) && num >= 0 && Number.isInteger(num)) {
      setDays(num)
      storage.setDefaultQuietDays(num)
    }
  }

  const handleRespectQuietTagsChange = (checked: boolean) => {
    setRespectQuietTags(checked)
    storage.setRespectQuietTags(checked)
  }

  const handleGlobalQuietModeChange = (checked: boolean) => {
    setGlobalQuietMode(checked)
    storage.setGlobalQuietMode(checked)
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center space-x-2">
          <Label htmlFor="quiet-enabled">{t('Add quiet tags by default')}</Label>
          <Switch
            id="quiet-enabled"
            checked={enabled}
            onCheckedChange={handleEnabledChange}
          />
        </div>
        <div className="text-muted-foreground text-xs">
          {t('Posts will automatically include quiet tags')}
        </div>
      </div>

      {enabled && (
        <div className="space-y-2">
          <Label htmlFor="quiet-days">{t('Default quiet period (days)')}</Label>
          <Input
            id="quiet-days"
            type="number"
            min="0"
            step="1"
            value={days}
            onChange={(e) => handleDaysChange(e.target.value)}
            className="w-24"
          />
          <div className="text-muted-foreground text-xs">
            {t('Posts will be quiet for this many days')}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center space-x-2">
          <Label htmlFor="respect-quiet-tags">{t('Respect quiet tags')}</Label>
          <Switch
            id="respect-quiet-tags"
            checked={respectQuietTags}
            onCheckedChange={handleRespectQuietTagsChange}
          />
        </div>
        <div className="text-muted-foreground text-xs">
          {t('Hide interactions on posts with quiet tags')}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center space-x-2">
          <Label htmlFor="global-quiet-mode">{t('Global quiet mode')}</Label>
          <Switch
            id="global-quiet-mode"
            checked={globalQuietMode}
            onCheckedChange={handleGlobalQuietModeChange}
          />
        </div>
        <div className="text-muted-foreground text-xs">
          {t('Hide interactions on all posts')}
        </div>
      </div>
    </div>
  )
}
