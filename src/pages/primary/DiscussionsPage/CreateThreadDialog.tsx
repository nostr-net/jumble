import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Hash, X, Users, Code, Coins, Newspaper, BookOpen, Scroll, Cpu, Trophy, Film, Heart, TrendingUp, Utensils, MapPin, Home, PawPrint, Shirt, Image, Zap } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNostr } from '@/providers/NostrProvider'
import { TDraftEvent } from '@/types'
import dayjs from 'dayjs'

// Utility functions for thread creation
function extractImagesFromContent(content: string): string[] {
  const imageRegex = /(https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp|svg)(\?[^\s]*)?)/gi
  return content.match(imageRegex) || []
}

function generateImetaTags(imageUrls: string[]): string[][] {
  return imageUrls.map(url => ['imeta', 'url', url])
}

function buildNsfwTag(): string[] {
  return ['content-warning', '']
}

function buildClientTag(): string[] {
  return ['client', 'jumble']
}

interface CreateThreadDialogProps {
  topic: string
  availableRelays: string[]
  selectedRelay?: string | null
  onClose: () => void
  onThreadCreated: () => void
}

export const DISCUSSION_TOPICS = [
  { id: 'general', label: 'General', icon: Hash },
  { id: 'meetups', label: 'Meetups', icon: Users },
  { id: 'devs', label: 'Developers', icon: Code },
  { id: 'finance', label: 'Bitcoin, Finance & Economics', icon: Coins },
  { id: 'politics', label: 'Politics & Breaking News', icon: Newspaper },
  { id: 'literature', label: 'Literature & Art', icon: BookOpen },
  { id: 'philosophy', label: 'Philosophy & Theology', icon: Scroll },
  { id: 'tech', label: 'Technology & Science', icon: Cpu },
  { id: 'sports', label: 'Sports and Gaming', icon: Trophy },
  { id: 'entertainment', label: 'Entertainment & Pop Culture', icon: Film },
  { id: 'health', label: 'Health & Wellness', icon: Heart },
  { id: 'lifestyle', label: 'Lifestyle & Personal Development', icon: TrendingUp },
  { id: 'food', label: 'Food & Cooking', icon: Utensils },
  { id: 'travel', label: 'Travel & Adventure', icon: MapPin },
  { id: 'home', label: 'Home & Garden', icon: Home },
  { id: 'pets', label: 'Pets & Animals', icon: PawPrint },
  { id: 'fashion', label: 'Fashion & Beauty', icon: Shirt }
]

export default function CreateThreadDialog({ 
  topic: initialTopic, 
  availableRelays, 
  selectedRelay: initialRelay, 
  onClose, 
  onThreadCreated 
}: CreateThreadDialogProps) {
  const { t } = useTranslation()
  const { pubkey, publish } = useNostr()
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [selectedTopic] = useState(initialTopic)
  const [selectedRelay, setSelectedRelay] = useState<string>(initialRelay || '')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errors, setErrors] = useState<{ title?: string; content?: string; relay?: string }>({})
  const [isNsfw, setIsNsfw] = useState(false)
  const [addClientTag, setAddClientTag] = useState(true)
  const [minPow, setMinPow] = useState(0)

  const validateForm = () => {
    const newErrors: { title?: string; content?: string; relay?: string } = {}
    
    if (!title.trim()) {
      newErrors.title = t('Title is required')
    } else if (title.length > 100) {
      newErrors.title = t('Title must be 100 characters or less')
    }
    
    if (!content.trim()) {
      newErrors.content = t('Content is required')
    } else if (content.length > 5000) {
      newErrors.content = t('Content must be 5000 characters or less')
    }
    
    if (!selectedRelay) {
      newErrors.relay = t('Please select a relay')
    }
    
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!pubkey) {
      alert(t('You must be logged in to create a thread'))
      return
    }
    
    if (!validateForm()) {
      return
    }
    
    setIsSubmitting(true)
    
    try {
      // Extract images from content
      const images = extractImagesFromContent(content.trim())
      
      // Build tags array
      const tags = [
        ['title', title.trim()],
        ['t', selectedTopic],
        ['-'] // Required tag for relay privacy
      ]
      
      // Add image metadata tags if images are found
      if (images && images.length > 0) {
        tags.push(...generateImetaTags(images))
      }
      
      // Add NSFW tag if enabled
      if (isNsfw) {
        tags.push(buildNsfwTag())
      }
      
      // Add client tag if enabled
      if (addClientTag) {
        tags.push(buildClientTag())
      }
      
      // Create the thread event (kind 11)
      const threadEvent: TDraftEvent = {
        kind: 11,
        content: content.trim(),
        tags,
        created_at: dayjs().unix()
      }
      
      // Publish to the selected relay only
      const publishedEvent = await publish(threadEvent, {
        specifiedRelayUrls: [selectedRelay],
        minPow
      })
      
      if (publishedEvent) {
        onThreadCreated()
        onClose()
      } else {
        throw new Error(t('Failed to publish thread'))
      }
    } catch (error) {
      console.error('Error creating thread:', error)
      alert(t('Failed to create thread. Please try again.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const selectedTopicInfo = DISCUSSION_TOPICS.find(t => t.id === selectedTopic) || DISCUSSION_TOPICS[0]

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-xl font-semibold">{t('Create New Thread')}</CardTitle>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8"
          >
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Topic Selection */}
            <div className="space-y-2">
              <Label htmlFor="topic">{t('Topic')}</Label>
              <div className="flex items-center gap-2">
                <selectedTopicInfo.icon className="w-4 h-4" />
                <Badge variant="secondary" className="text-sm">
                  {selectedTopicInfo.label}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {t('Threads are organized by topics. You can change this after creation.')}
              </p>
            </div>

            {/* Title Input */}
            <div className="space-y-2">
              <Label htmlFor="title">{t('Thread Title')}</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('Enter a descriptive title for your thread')}
                maxLength={100}
                className={errors.title ? 'border-destructive' : ''}
              />
              {errors.title && (
                <p className="text-sm text-destructive">{errors.title}</p>
              )}
              <p className="text-sm text-muted-foreground">
                {title.length}/100 {t('characters')}
              </p>
            </div>

            {/* Content Input */}
            <div className="space-y-2">
              <Label htmlFor="content">{t('Thread Content')}</Label>
              <Textarea
                id="content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={t('Share your thoughts, ask questions, or start a discussion...')}
                rows={8}
                maxLength={5000}
                className={errors.content ? 'border-destructive' : ''}
              />
              {errors.content && (
                <p className="text-sm text-destructive">{errors.content}</p>
              )}
              <p className="text-sm text-muted-foreground">
                {content.length}/5000 {t('characters')}
              </p>
            </div>

            {/* Relay Selection */}
            <div className="space-y-2">
              <Label htmlFor="relay">{t('Publish to Relay')}</Label>
              <Select value={selectedRelay} onValueChange={setSelectedRelay}>
                <SelectTrigger className={errors.relay ? 'border-destructive' : ''}>
                  <SelectValue placeholder={t('Select a relay to publish to')} />
                </SelectTrigger>
                <SelectContent>
                  {availableRelays.map(relay => (
                    <SelectItem key={relay} value={relay}>
                      {relay.replace('wss://', '').replace('ws://', '')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.relay && (
                <p className="text-sm text-destructive">{errors.relay}</p>
              )}
              <p className="text-sm text-muted-foreground">
                {t('Choose the relay where this discussion will be hosted.')}
              </p>
            </div>

            {/* Advanced Options */}
            <div className="space-y-4 border-t pt-4">
              <h4 className="text-sm font-medium">{t('Advanced Options')}</h4>
              
              {/* NSFW Toggle */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Hash className="w-4 h-4 text-red-500" />
                  <Label htmlFor="nsfw" className="text-sm">
                    {t('Mark as NSFW')}
                  </Label>
                </div>
                <Switch
                  id="nsfw"
                  checked={isNsfw}
                  onCheckedChange={setIsNsfw}
                />
              </div>

              {/* Client Tag Toggle */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Image className="w-4 h-4 text-blue-500" />
                  <Label htmlFor="client-tag" className="text-sm">
                    {t('Add client identifier')}
                  </Label>
                </div>
                <Switch
                  id="client-tag"
                  checked={addClientTag}
                  onCheckedChange={setAddClientTag}
                />
              </div>

              {/* PoW Setting */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-yellow-500" />
                  <Label className="text-sm">
                    {t('Proof of Work')}: {minPow}
                  </Label>
                </div>
                <div className="px-2">
                  <Slider
                    value={[minPow]}
                    onValueChange={(value) => setMinPow(value[0])}
                    max={20}
                    min={0}
                    step={1}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>{t('No PoW')}</span>
                    <span>{t('High PoW')}</span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('Higher values make your thread harder to mine but more unique.')}
                </p>
              </div>
            </div>

            {/* Form Actions */}
            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                className="flex-1"
              >
                {t('Cancel')}
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="flex-1"
              >
                {isSubmitting ? t('Creating...') : t('Create Thread')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
