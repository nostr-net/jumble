import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import storage from '@/services/local-storage.service'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

export default function ExpirationSettings() {
  const { t } = useTranslation()
  const [enabled, setEnabled] = useState(false)
  const [months, setMonths] = useState(6)

  useEffect(() => {
    setEnabled(storage.getDefaultExpirationEnabled())
    setMonths(storage.getDefaultExpirationMonths())
  }, [])

  const handleEnabledChange = (checked: boolean) => {
    setEnabled(checked)
    storage.setDefaultExpirationEnabled(checked)
  }

  const handleMonthsChange = (value: string) => {
    const num = parseInt(value)
    if (!isNaN(num) && num >= 0 && Number.isInteger(num)) {
      setMonths(num)
      storage.setDefaultExpirationMonths(num)
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center space-x-2">
          <Label htmlFor="expiration-enabled">{t('Add expiration tags by default')}</Label>
          <Switch
            id="expiration-enabled"
            checked={enabled}
            onCheckedChange={handleEnabledChange}
          />
        </div>
        <div className="text-muted-foreground text-xs">
          {t('Posts will automatically include expiration tags')}
        </div>
      </div>

      {enabled && (
        <div className="space-y-2">
          <Label htmlFor="expiration-months">{t('Default expiration (months)')}</Label>
          <Input
            id="expiration-months"
            type="number"
            min="0"
            step="1"
            value={months}
            onChange={(e) => handleMonthsChange(e.target.value)}
            className="w-24"
          />
          <div className="text-muted-foreground text-xs">
            {t('Posts will expire after this many months')}
          </div>
        </div>
      )}
    </div>
  )
}
