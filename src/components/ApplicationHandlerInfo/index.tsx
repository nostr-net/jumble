import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ExternalLink, Globe, Smartphone, Monitor } from 'lucide-react'
import { Event } from 'nostr-tools'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import nip89Service from '@/services/nip89.service'

interface ApplicationHandlerInfoProps {
  event: Event
  className?: string
}

export default function ApplicationHandlerInfo({ event, className }: ApplicationHandlerInfoProps) {
  const { t } = useTranslation()
  
  const handlerInfo = useMemo(() => {
    return nip89Service.parseApplicationHandlerInfo(event)
  }, [event])

  if (!handlerInfo) {
    return null
  }

  const handlePlatformClick = (url: string) => {
    // Replace bech32 placeholder with actual event ID
    const actualUrl = url.replace('bech32', event.id)
    window.open(actualUrl, '_blank', 'noopener,noreferrer')
  }

  const platformButtons = Object.entries(handlerInfo.platforms)
    .filter(([_, url]) => url)
    .map(([platform, url]) => {
      const icons = {
        web: Globe,
        ios: Smartphone,
        android: Smartphone,
        desktop: Monitor
      }
      
      const Icon = icons[platform as keyof typeof icons]
      const platformName = platform.charAt(0).toUpperCase() + platform.slice(1)
      
      return (
        <Button
          key={platform}
          variant="outline"
          size="sm"
          onClick={() => handlePlatformClick(url)}
          className="flex items-center gap-2"
        >
          <Icon className="w-4 h-4" />
          {platformName}
        </Button>
      )
    })

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-start gap-4">
          {handlerInfo.picture && (
            <img
              src={handlerInfo.picture}
              alt={handlerInfo.name}
              className="w-16 h-16 rounded-lg object-cover"
            />
          )}
          <div className="flex-1 min-w-0">
            <CardTitle className="text-xl">{handlerInfo.name}</CardTitle>
            {handlerInfo.description && (
              <CardDescription className="mt-2">
                {handlerInfo.description}
              </CardDescription>
            )}
            {handlerInfo.website && (
              <a
                href={handlerInfo.website}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 mt-2"
              >
                <ExternalLink className="w-4 h-4" />
                {handlerInfo.website}
              </a>
            )}
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Supported Event Kinds */}
        <div>
          <h4 className="text-sm font-semibold mb-2">
            {t('Supported Event Types')}
          </h4>
          <div className="flex flex-wrap gap-1">
            {handlerInfo.supportedKinds.map(kind => (
              <Badge key={kind} variant="secondary">
                Kind {kind}
              </Badge>
            ))}
          </div>
        </div>

        {/* Platform Access */}
        {platformButtons.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold mb-2">
              {t('Access via')}
            </h4>
            <div className="flex flex-wrap gap-2">
              {platformButtons}
            </div>
          </div>
        )}

        {/* Relays */}
        {handlerInfo.relays.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold mb-2">
              {t('Recommended Relays')}
            </h4>
            <div className="space-y-1">
              {handlerInfo.relays.map((relay, index) => (
                <div key={index} className="text-sm text-muted-foreground font-mono">
                  {relay}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
