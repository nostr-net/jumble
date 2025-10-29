import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Event } from 'nostr-tools'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import nip89Service from '@/services/nip89.service'

interface ApplicationHandlerRecommendationProps {
  event: Event
  className?: string
}

export default function ApplicationHandlerRecommendation({ 
  event, 
  className 
}: ApplicationHandlerRecommendationProps) {
  const { t } = useTranslation()
  
  const recommendation = useMemo(() => {
    return nip89Service.parseApplicationHandlerRecommendation(event)
  }, [event])

  if (!recommendation) {
    return null
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-lg">
          {t('Application Recommendations')}
        </CardTitle>
        <CardDescription>
          {t('Recommended applications for handling events of kind {{kind}}', { 
            kind: recommendation.supportedKind 
          })}
        </CardDescription>
      </CardHeader>
      
      <CardContent>
        <div className="space-y-3">
          {recommendation.handlers.map((handler, index) => (
            <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">
                  {t('Handler {{index}}', { index: index + 1 })}
                </div>
                <div className="text-xs text-muted-foreground font-mono">
                  {handler.pubkey.substring(0, 16)}...{handler.pubkey.substring(-8)}
                </div>
                {handler.identifier && (
                  <div className="text-xs text-muted-foreground">
                    ID: {handler.identifier}
                  </div>
                )}
                {handler.relay && (
                  <div className="text-xs text-muted-foreground font-mono">
                    {handler.relay}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                {handler.platform && (
                  <Badge variant="outline">
                    {handler.platform}
                  </Badge>
                )}
                <Badge variant="secondary">
                  Kind {recommendation.supportedKind}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
