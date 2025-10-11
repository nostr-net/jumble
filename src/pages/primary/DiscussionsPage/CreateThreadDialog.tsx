import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Hash, X, Users, Code, Coins, Newspaper, BookOpen, Scroll, Cpu, Trophy, Film, Heart, TrendingUp, Utensils, MapPin, Home, PawPrint, Shirt, Image, Zap, Settings, Book, Network, Car, Eye, Edit3 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNostr } from '@/providers/NostrProvider'
import { TDraftEvent } from '@/types'
import { NostrEvent } from 'nostr-tools'
import { prefixNostrAddresses } from '@/lib/nostr-address'
import { showPublishingError } from '@/lib/publishing-feedback'
import dayjs from 'dayjs'
import { extractHashtagsFromContent, normalizeTopic } from '@/lib/discussion-topics'
import DiscussionContent from '@/components/Note/DiscussionContent'

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
  onThreadCreated: (publishedEvent?: NostrEvent) => void
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
  { id: 'nostr', label: 'Nostr', icon: Network },
  { id: 'automotive', label: 'Automotive', icon: Car },
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
  const [errors, setErrors] = useState<{ title?: string; content?: string; relay?: string; author?: string; subject?: string }>({})
  const [isNsfw, setIsNsfw] = useState(false)
  const [addClientTag, setAddClientTag] = useState(true)
  const [minPow, setMinPow] = useState(0)
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false)
  
  // Readings options state
  const [isReadingGroup, setIsReadingGroup] = useState(false)
  const [author, setAuthor] = useState('')
  const [subject, setSubject] = useState('')
  const [showReadingsPanel, setShowReadingsPanel] = useState(false)

  const validateForm = () => {
    const newErrors: { title?: string; content?: string; relay?: string; author?: string; subject?: string } = {}
    
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
    
    // Validate readings fields if reading group is enabled
    if (isReadingGroup) {
      if (!author.trim()) {
        newErrors.author = t('Author is required for reading groups')
      }
      if (!subject.trim()) {
        newErrors.subject = t('Subject (book title) is required for reading groups')
      }
    }
    
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!pubkey) {
      showPublishingError(t('You must be logged in to create a thread'))
      return
    }
    
    if (!validateForm()) {
      return
    }
    
    setIsSubmitting(true)
    
    try {
      // Process content to prefix nostr addresses
      const processedContent = prefixNostrAddresses(content.trim())
      
      // Extract images from processed content
      const images = extractImagesFromContent(processedContent)
      
      // Extract hashtags from content
      const hashtags = extractHashtagsFromContent(processedContent)
      
      // Build tags array
      const tags = [
        ['title', title.trim()],
        ['t', normalizeTopic(selectedTopic)],
        ['-'] // Required tag for relay privacy
      ]
      
      // Add hashtags as t-tags (deduplicate with selectedTopic)
      const uniqueHashtags = hashtags.filter(
        hashtag => hashtag !== normalizeTopic(selectedTopic)
      )
      for (const hashtag of uniqueHashtags) {
        tags.push(['t', hashtag])
      }
      
      // Add readings tags if this is a reading group
      if (isReadingGroup) {
        // Only add if not already added from hashtags
        if (!uniqueHashtags.includes('readings')) {
          tags.push(['t', 'readings'])
        }
        tags.push(['author', author.trim()])
        tags.push(['subject', subject.trim()])
      }
      
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
        content: processedContent,
        tags,
        created_at: dayjs().unix()
      }
      
      
      // Publish to the selected relay only
      const publishedEvent = await publish(threadEvent, {
        specifiedRelayUrls: [selectedRelay],
        minPow
      })
      
      
      if (publishedEvent) {
        onThreadCreated(publishedEvent)
        onClose()
      } else {
        throw new Error(t('Failed to publish thread'))
      }
    } catch (error) {
      console.error('Error creating thread:', error)
      console.error('Error details:', {
        name: error instanceof Error ? error.name : 'Unknown',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      })
      
      let errorMessage = t('Failed to create thread')
      if (error instanceof Error) {
        if (error.message.includes('timeout')) {
          errorMessage = t('Thread creation timed out. Please try again.')
        } else if (error.message.includes('auth-required') || error.message.includes('auth required')) {
          errorMessage = t('Relay requires authentication for write access. Please try a different relay or contact the relay operator.')
        } else if (error.message.includes('blocked')) {
          errorMessage = t('Your account is blocked from posting to this relay.')
        } else if (error.message.includes('rate limit')) {
          errorMessage = t('Rate limited. Please wait before trying again.')
        } else if (error.message.includes('writes disabled')) {
          errorMessage = t('Some relays have temporarily disabled writes.')
        } else if (error.message && error.message.trim()) {
          errorMessage = `${t('Failed to create thread')}: ${error.message}`
        } else {
          errorMessage = t('Failed to create thread. Please try a different relay.')
        }
      } else if (error instanceof AggregateError) {
        errorMessage = t('Failed to publish to some relays. Please try again or use different relays.')
      }
      
      showPublishingError(errorMessage)
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

            {/* Content Input with Preview */}
            <div className="space-y-2">
              <Label htmlFor="content">{t('Thread Content')}</Label>
              <Tabs defaultValue="edit" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="edit" className="flex items-center gap-2">
                    <Edit3 className="w-4 h-4" />
                    {t('Edit')}
                  </TabsTrigger>
                  <TabsTrigger value="preview" className="flex items-center gap-2">
                    <Eye className="w-4 h-4" />
                    {t('Preview')}
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="edit" className="space-y-2">
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
                </TabsContent>
                <TabsContent value="preview" className="space-y-2">
                  <div className="border rounded-lg p-4 bg-muted/30 min-h-[200px]">
                    {content.trim() ? (
                      <div className="space-y-4">
                        {/* Preview of the thread */}
                        <div className="border-b pb-2">
                          <h3 className="text-lg font-semibold">{title || t('Untitled')}</h3>
                          <div className="flex items-center gap-2 mt-1">
                            <selectedTopicInfo.icon className="w-4 h-4" />
                            <Badge variant="secondary" className="text-xs">
                              {selectedTopicInfo.label}
                            </Badge>
                            {isReadingGroup && (
                              <>
                                <Badge variant="outline" className="text-xs">
                                  <Hash className="w-3 h-3 mr-1" />
                                  Readings
                                </Badge>
                                {author && (
                                  <span className="text-xs text-muted-foreground">
                                    {t('Author')}: {author}
                                  </span>
                                )}
                                {subject && (
                                  <span className="text-xs text-muted-foreground">
                                    {t('Book')}: {subject}
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                        {/* Preview of the content */}
                        <div className="prose prose-sm max-w-none dark:prose-invert">
                          <DiscussionContent 
                            event={{
                              id: 'preview',
                              pubkey: pubkey || '',
                              created_at: Math.floor(Date.now() / 1000),
                              kind: 11,
                              tags: [
                                ['title', title],
                                ['t', selectedTopic],
                                ...(isReadingGroup ? [['t', 'readings']] : []),
                                ...(author ? [['author', author]] : []),
                                ...(subject ? [['subject', subject]] : [])
                              ],
                              content: content,
                              sig: ''
                            }}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="text-center text-muted-foreground py-8">
                        <Edit3 className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p>{t('Start typing to see a preview...')}</p>
                      </div>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {content.length}/5000 {t('characters')}
                  </p>
                </TabsContent>
              </Tabs>
            </div>

            {/* Readings Options - Only show for literature topic */}
            {selectedTopic === 'literature' && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Book className="w-4 h-4" />
                  <Label className="text-sm font-medium">{t('Readings Options')}</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowReadingsPanel(!showReadingsPanel)}
                    className="ml-auto"
                  >
                    {showReadingsPanel ? t('Hide') : t('Configure')}
                  </Button>
                </div>
                
                {showReadingsPanel && (
                  <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Book className="w-4 h-4 text-primary" />
                        <Label htmlFor="reading-group" className="text-sm">
                          {t('Reading group entry')}
                        </Label>
                      </div>
                      <Switch
                        id="reading-group"
                        checked={isReadingGroup}
                        onCheckedChange={setIsReadingGroup}
                      />
                    </div>
                    
                    {isReadingGroup && (
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="author">{t('Author')}</Label>
                          <Input
                            id="author"
                            value={author}
                            onChange={(e) => setAuthor(e.target.value)}
                            placeholder={t('Enter the author name')}
                            className={errors.author ? 'border-destructive' : ''}
                          />
                          {errors.author && (
                            <p className="text-sm text-destructive">{errors.author}</p>
                          )}
                        </div>
                        
                        <div className="space-y-2">
                          <Label htmlFor="subject">{t('Subject (Book Title)')}</Label>
                          <Input
                            id="subject"
                            value={subject}
                            onChange={(e) => setSubject(e.target.value)}
                            placeholder={t('Enter the book title')}
                            className={errors.subject ? 'border-destructive' : ''}
                          />
                          {errors.subject && (
                            <p className="text-sm text-destructive">{errors.subject}</p>
                          )}
                        </div>
                        
                        <p className="text-xs text-muted-foreground">
                          {t('This will add additional tags for author and subject to help organize reading group discussions.')}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

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

            {/* Advanced Options Toggle */}
            <div className="border-t pt-4">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
              >
                <Settings className="w-4 h-4" />
                {t('Advanced Options')}
              </Button>
              
              {showAdvancedOptions && (
                <div className="space-y-4 mt-4">
                  {/* NSFW Toggle */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Hash className="w-4 h-4 text-foreground" />
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
                      <Image className="w-4 h-4 text-foreground" />
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
                      <Zap className="w-4 h-4 text-foreground" />
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
              )}
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
