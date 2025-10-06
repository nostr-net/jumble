import Note from '@/components/Note'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  createCommentDraftEvent,
  createPollDraftEvent,
  createPublicMessageDraftEvent,
  createPublicMessageReplyDraftEvent,
  createShortTextNoteDraftEvent,
  deleteDraftEventCache
} from '@/lib/draft-event'
import { ExtendedKind } from '@/constants'
import { isTouchDevice } from '@/lib/utils'
import { useNostr } from '@/providers/NostrProvider'
import { useReply } from '@/providers/ReplyProvider'
import postEditorCache from '@/services/post-editor-cache.service'
import { TPollCreateData } from '@/types'
import { ImageUp, ListTodo, LoaderCircle, MessageCircle, Settings, Smile, X } from 'lucide-react'
import { Event, kinds } from 'nostr-tools'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import EmojiPickerDialog from '../EmojiPickerDialog'
import Mentions, { extractMentions } from './Mentions'
import PollEditor from './PollEditor'
import PostOptions from './PostOptions'
import PostRelaySelector from './PostRelaySelector'
import PostTextarea, { TPostTextareaHandle } from './PostTextarea'
import Uploader from './Uploader'
import RelayStatusDisplay from '@/components/RelayStatusDisplay'

export default function PostContent({
  defaultContent = '',
  parentEvent,
  close,
  openFrom
}: {
  defaultContent?: string
  parentEvent?: Event
  close: () => void
  openFrom?: string[]
}) {
  const { t } = useTranslation()
  const { pubkey, publish, checkLogin } = useNostr()
  const { addReplies } = useReply()
  const [text, setText] = useState('')
  const textareaRef = useRef<TPostTextareaHandle>(null)
  const [posting, setPosting] = useState(false)
  const [uploadProgresses, setUploadProgresses] = useState<
    { file: File; progress: number; cancel: () => void }[]
  >([])
  const [showMoreOptions, setShowMoreOptions] = useState(false)
  const [addClientTag, setAddClientTag] = useState(false)
  const [mentions, setMentions] = useState<string[]>([])
  const [isNsfw, setIsNsfw] = useState(false)
  const [isPoll, setIsPoll] = useState(false)
  const [isPublicMessage, setIsPublicMessage] = useState(false)
  const [publicMessageRecipients, setPublicMessageRecipients] = useState<string[]>([])
  const [isProtectedEvent, setIsProtectedEvent] = useState(false)
  const [additionalRelayUrls, setAdditionalRelayUrls] = useState<string[]>([])
  const [pollCreateData, setPollCreateData] = useState<TPollCreateData>({
    isMultipleChoice: false,
    options: ['', ''],
    endsAt: undefined,
    relays: []
  })
  const [minPow, setMinPow] = useState(0)
  const [relayStatuses, setRelayStatuses] = useState<Array<{
    url: string
    success: boolean
    error?: string
    authAttempted?: boolean
  }>>([])
  const [showRelayStatus, setShowRelayStatus] = useState(false)
  const [lastPublishedEvent, setLastPublishedEvent] = useState<Event | null>(null)
  const isFirstRender = useRef(true)
  const canPost = useMemo(() => {
    const result = (
      !!pubkey &&
      !!text &&
      !posting &&
      !uploadProgresses.length &&
      (!isPoll || pollCreateData.options.filter((option) => !!option.trim()).length >= 2) &&
      (!isPublicMessage || publicMessageRecipients.length > 0 || parentEvent?.kind === ExtendedKind.PUBLIC_MESSAGE) &&
      (!isProtectedEvent || additionalRelayUrls.length > 0)
    )
    
    // Debug logging for public message replies
    if (parentEvent?.kind === ExtendedKind.PUBLIC_MESSAGE) {
      console.log('Public message reply debug:', {
        pubkey: !!pubkey,
        text: !!text,
        posting,
        uploadProgresses: uploadProgresses.length,
        isPoll,
        pollCreateDataValid: !isPoll || pollCreateData.options.filter((option) => !!option.trim()).length >= 2,
        publicMessageCheck: !isPublicMessage || publicMessageRecipients.length > 0 || parentEvent?.kind === ExtendedKind.PUBLIC_MESSAGE,
        protectedEventCheck: !isProtectedEvent || additionalRelayUrls.length > 0,
        canPost: result
      })
    }
    
    return result
  }, [
    pubkey,
    text,
    posting,
    uploadProgresses,
    isPoll,
    pollCreateData,
    isPublicMessage,
    publicMessageRecipients,
    parentEvent?.kind,
    isProtectedEvent,
    additionalRelayUrls
  ])

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      const cachedSettings = postEditorCache.getPostSettingsCache({
        defaultContent,
        parentEvent
      })
      if (cachedSettings) {
        setIsNsfw(cachedSettings.isNsfw ?? false)
        setIsPoll(cachedSettings.isPoll ?? false)
        setPollCreateData(
          cachedSettings.pollCreateData ?? {
            isMultipleChoice: false,
            options: ['', ''],
            endsAt: undefined,
            relays: []
          }
        )
        setAddClientTag(cachedSettings.addClientTag ?? false)
      }
      return
    }
    postEditorCache.setPostSettingsCache(
      { defaultContent, parentEvent },
      {
        isNsfw,
        isPoll,
        pollCreateData,
        addClientTag
      }
    )
  }, [defaultContent, parentEvent, isNsfw, isPoll, pollCreateData, addClientTag])

  // Extract mentions from content for public messages
  const extractMentionsFromContent = useCallback(async (content: string) => {
    try {
      // First try to extract nostr: protocol mentions
      const { pubkeys: nostrPubkeys } = await extractMentions(content, undefined)
      
      // Also extract regular @ mentions (simple pattern for now)
      const atMentions = content.match(/@[a-zA-Z0-9_]+/g) || []
      
      console.log('Nostr mentions:', nostrPubkeys)
      console.log('@ mentions:', atMentions)
      
      // For now, we'll use the nostr mentions and show that we detected @ mentions
      // In a real implementation, you'd resolve @ mentions to pubkeys
      setPublicMessageRecipients(nostrPubkeys)
    } catch (error) {
      console.error('Error extracting mentions:', error)
      setPublicMessageRecipients([])
    }
  }, [])

  useEffect(() => {
    if (!isPublicMessage) {
      setPublicMessageRecipients([])
      return
    }

    if (!text) {
      setPublicMessageRecipients([])
      return
    }

    // Debounce the mention extraction
    const timeoutId = setTimeout(() => {
      extractMentionsFromContent(text)
    }, 300)

    return () => {
      clearTimeout(timeoutId)
    }
  }, [text, isPublicMessage, extractMentionsFromContent])

  const post = async (e?: React.MouseEvent) => {
    e?.stopPropagation()
    checkLogin(async () => {
      if (!canPost) {
        console.log('❌ Cannot post - canPost is false')
        return
      }

      // console.log('🚀 Starting post process:', {
      //   isPublicMessage,
      //   parentEventKind: parentEvent?.kind,
      //   parentEventId: parentEvent?.id,
      //   text: text.substring(0, 50) + '...',
      //   mentions: mentions.length,
      //   canPost
      // })

      setPosting(true)
      try {
        
        let draftEvent
        if (isPublicMessage) {
          draftEvent = await createPublicMessageDraftEvent(text, publicMessageRecipients, {
            addClientTag,
            isNsfw
          })
        } else if (parentEvent && parentEvent.kind === ExtendedKind.PUBLIC_MESSAGE) {
          draftEvent = await createPublicMessageReplyDraftEvent(text, parentEvent, mentions, {
            addClientTag,
            isNsfw
          })
        } else if (parentEvent && parentEvent.kind !== kinds.ShortTextNote) {
          draftEvent = await createCommentDraftEvent(text, parentEvent, mentions, {
            addClientTag,
            protectedEvent: isProtectedEvent,
            isNsfw
          })
        } else if (isPoll) {
          draftEvent = await createPollDraftEvent(pubkey!, text, mentions, pollCreateData, {
            addClientTag,
            isNsfw
          })
        } else {
          draftEvent = await createShortTextNoteDraftEvent(text, mentions, {
            parentEvent,
            addClientTag,
            protectedEvent: isProtectedEvent,
            isNsfw
          })
        }

        // console.log('Publishing draft event:', draftEvent)
        const newEvent = await publish(draftEvent, {
          specifiedRelayUrls: isProtectedEvent ? additionalRelayUrls : undefined,
          additionalRelayUrls: isPoll ? pollCreateData.relays : additionalRelayUrls,
          minPow
        })
        // console.log('Published event:', newEvent)
        
        // Check if we have relay status information
        console.log('Published event:', newEvent)
        console.log('Relay statuses:', (newEvent as any).relayStatuses)
        
        if ((newEvent as any).relayStatuses) {
          setRelayStatuses((newEvent as any).relayStatuses)
          setLastPublishedEvent(newEvent)
          setShowRelayStatus(true)
          
          // Show success message with relay count
          const successCount = (newEvent as any).relayStatuses.filter((s: any) => s.success).length
          const totalCount = (newEvent as any).relayStatuses.length
          toast.success(t('Post successful - published to {{count}} of {{total}} relays', { 
            count: successCount, 
            total: totalCount 
          }), { duration: 4000 })
          
          // Don't close immediately if we have relay status to show
          setTimeout(() => {
            postEditorCache.clearPostCache({ defaultContent, parentEvent })
            deleteDraftEventCache(draftEvent)
            addReplies([newEvent])
            close()
          }, 8000) // Give user more time to see the relay status
        } else {
          toast.success(t('Post successful'), { duration: 2000 })
          postEditorCache.clearPostCache({ defaultContent, parentEvent })
          deleteDraftEventCache(draftEvent)
          addReplies([newEvent])
          close()
        }
      } catch (error) {
        console.error('Publishing error:', error)
        
        // Handle different types of errors with user-friendly messages
        let errorMessage = t('Failed to post')
        
        if (error instanceof Error) {
          if (error.message.includes('timeout')) {
            errorMessage = t('Posting timed out. Your post may have been published to some relays.')
          } else if (error.message.includes('auth-required') || error.message.includes('auth required')) {
            errorMessage = t('Some relays require authentication. Please try again or use different relays.')
          } else if (error.message.includes('blocked')) {
            errorMessage = t('You are blocked from posting to some relays.')
          } else if (error.message.includes('rate limit')) {
            errorMessage = t('Rate limited. Please wait before trying again.')
          } else if (error.message.includes('writes disabled')) {
            errorMessage = t('Some relays have temporarily disabled writes.')
          } else {
            errorMessage = `${t('Failed to post')}: ${error.message}`
          }
        } else if (error instanceof AggregateError) {
          // Handle multiple relay failures
          const hasAuthErrors = error.errors.some(err => 
            err instanceof Error && err.message.includes('auth-required')
          )
          const hasBlockedErrors = error.errors.some(err => 
            err instanceof Error && err.message.includes('blocked')
          )
          const hasWriteDisabledErrors = error.errors.some(err => 
            err instanceof Error && err.message.includes('writes disabled')
          )
          
          if (hasAuthErrors) {
            errorMessage = t('Some relays require authentication. Your post may have been published to other relays.')
          } else if (hasBlockedErrors) {
            errorMessage = t('You are blocked from some relays. Your post may have been published to other relays.')
          } else if (hasWriteDisabledErrors) {
            errorMessage = t('Some relays have disabled writes. Your post may have been published to other relays.')
          } else {
            errorMessage = t('Failed to publish to some relays. Your post may have been published to other relays.')
          }
        }
        
        toast.error(errorMessage, { duration: 8000 })
        return
      } finally {
        setPosting(false)
      }
    })
  }

  const handlePollToggle = () => {
    if (parentEvent) return

    setIsPoll((prev) => !prev)
  }

  const handlePublicMessageToggle = () => {
    if (parentEvent) return

    setIsPublicMessage((prev) => !prev)
    if (!isPublicMessage) {
      // When enabling public message mode, clear other modes
      setIsPoll(false)
    }
  }

  const handleUploadStart = (file: File, cancel: () => void) => {
    setUploadProgresses((prev) => [...prev, { file, progress: 0, cancel }])
  }

  const handleUploadProgress = (file: File, progress: number) => {
    setUploadProgresses((prev) =>
      prev.map((item) => (item.file === file ? { ...item, progress } : item))
    )
  }

  const handleUploadEnd = (file: File) => {
    setUploadProgresses((prev) => prev.filter((item) => item.file !== file))
  }

  return (
    <div className="space-y-2">
      {/* Dynamic Title based on mode */}
      <div className="text-lg font-semibold">
        {parentEvent ? (
          <div className="flex gap-2 items-center w-full">
            <div className="shrink-0">
              {parentEvent.kind === ExtendedKind.PUBLIC_MESSAGE 
                ? t('Reply to Public Message')
                : t('Reply to')
              }
            </div>
          </div>
        ) : isPoll ? (
          t('New Poll')
        ) : isPublicMessage ? (
          t('New Public Message')
        ) : (
          t('New Note')
        )}
      </div>
      
      {parentEvent && (
        <ScrollArea className="flex max-h-48 flex-col overflow-y-auto rounded-lg border bg-muted/40">
          <div className="p-2 sm:p-3 pointer-events-none">
            <Note size="small" event={parentEvent} hideParentNotePreview />
          </div>
        </ScrollArea>
      )}
      <PostTextarea
        ref={textareaRef}
        text={text}
        setText={setText}
        defaultContent={defaultContent}
        parentEvent={parentEvent}
        onSubmit={() => post()}
        className={isPoll ? 'min-h-20' : 'min-h-52'}
        onUploadStart={handleUploadStart}
        onUploadProgress={handleUploadProgress}
        onUploadEnd={handleUploadEnd}
        kind={isPublicMessage ? ExtendedKind.PUBLIC_MESSAGE : isPoll ? ExtendedKind.POLL : kinds.ShortTextNote}
      />
      {isPoll && (
        <PollEditor
          pollCreateData={pollCreateData}
          setPollCreateData={setPollCreateData}
          setIsPoll={setIsPoll}
        />
      )}
      {isPublicMessage && (
        <div className="rounded-lg border bg-muted/40 p-3">
          <div className="mb-2 text-sm font-medium">{t('Recipients')}</div>
          <div className="space-y-2">
            <Mentions
              content={text}
              parentEvent={undefined}
              mentions={publicMessageRecipients}
              setMentions={setPublicMessageRecipients}
            />
            {publicMessageRecipients.length > 0 ? (
              <div className="text-sm text-muted-foreground">
                {t('Recipients detected from your message:')} {publicMessageRecipients.length}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                {t('Add recipients using nostr: mentions (e.g., nostr:npub1...) or the recipient selector above')}
              </div>
            )}
          </div>
        </div>
      )}
      {uploadProgresses.length > 0 &&
        uploadProgresses.map(({ file, progress, cancel }, index) => (
          <div key={`${file.name}-${index}`} className="mt-2 flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs text-muted-foreground mb-1">
                {file.name ?? t('Uploading...')}
              </div>
              <div className="h-0.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary transition-[width] duration-200 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                cancel?.()
                handleUploadEnd(file)
              }}
              className="text-muted-foreground hover:text-foreground"
              title={t('Cancel')}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      {!isPoll && (
        <PostRelaySelector
          setIsProtectedEvent={setIsProtectedEvent}
          setAdditionalRelayUrls={setAdditionalRelayUrls}
          parentEvent={parentEvent}
          openFrom={openFrom}
        />
      )}
      <div className="flex items-center justify-between">
        <div className="flex gap-2 items-center">
          <Uploader
            onUploadSuccess={({ url }) => {
              textareaRef.current?.appendText(url, true)
            }}
            onUploadStart={handleUploadStart}
            onUploadEnd={handleUploadEnd}
            onProgress={handleUploadProgress}
            accept="image/*,video/*,audio/*"
          >
            <Button variant="ghost" size="icon">
              <ImageUp />
            </Button>
          </Uploader>
          {/* I'm not sure why, but after triggering the virtual keyboard,
              opening the emoji picker drawer causes an issue,
              the emoji I tap isn't the one that gets inserted. */}
          {!isTouchDevice() && (
            <EmojiPickerDialog
              onEmojiClick={(emoji) => {
                if (!emoji) return
                textareaRef.current?.insertEmoji(emoji)
              }}
            >
              <Button variant="ghost" size="icon">
                <Smile />
              </Button>
            </EmojiPickerDialog>
          )}
          {!parentEvent && (
            <Button
              variant="ghost"
              size="icon"
              title={t('Create Poll')}
              className={isPoll ? 'bg-accent' : ''}
              onClick={handlePollToggle}
            >
              <ListTodo />
            </Button>
          )}
          {!parentEvent && (
            <Button
              variant="ghost"
              size="icon"
              title={t('Send Public Message')}
              className={isPublicMessage ? 'bg-accent' : ''}
              onClick={handlePublicMessageToggle}
            >
              <MessageCircle />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className={showMoreOptions ? 'bg-accent' : ''}
            onClick={() => setShowMoreOptions((pre) => !pre)}
          >
            <Settings />
          </Button>
        </div>
        <div className="flex gap-2 items-center">
          <Mentions
            content={text}
            parentEvent={parentEvent}
            mentions={mentions}
            setMentions={setMentions}
          />
          <div className="flex gap-2 items-center max-sm:hidden">
            <Button
              variant="secondary"
              onClick={(e) => {
                e.stopPropagation()
                close()
              }}
            >
              {t('Cancel')}
            </Button>
            <Button type="submit" disabled={!canPost} onClick={post}>
              {posting && <LoaderCircle className="animate-spin" />}
              {parentEvent ? t('Reply') : isPublicMessage ? t('Send Public Message') : t('Post')}
            </Button>
          </div>
        </div>
      </div>
      <PostOptions
        posting={posting}
        show={showMoreOptions}
        addClientTag={addClientTag}
        setAddClientTag={setAddClientTag}
        isNsfw={isNsfw}
        setIsNsfw={setIsNsfw}
        minPow={minPow}
        setMinPow={setMinPow}
      />
      <div className="flex gap-2 items-center justify-around sm:hidden">
        <Button
          className="w-full"
          variant="secondary"
          onClick={(e) => {
            e.stopPropagation()
            close()
          }}
        >
          {t('Cancel')}
        </Button>
        <Button className="w-full" type="submit" disabled={!canPost} onClick={post}>
          {posting && <LoaderCircle className="animate-spin" />}
          {parentEvent ? t('Reply') : t('Post')}
        </Button>
      </div>
      
      {showRelayStatus && relayStatuses.length > 0 && (
        <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border-2 border-blue-200 dark:border-blue-800">
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-blue-800 dark:text-blue-200 mb-1">
              📡 Publishing Results
            </h3>
            <p className="text-xs text-blue-600 dark:text-blue-300">
              Your post has been published. Here's the status for each relay:
            </p>
          </div>
          <RelayStatusDisplay
            relayStatuses={relayStatuses}
            successCount={relayStatuses.filter(s => s.success).length}
            totalCount={relayStatuses.length}
          />
          <div className="mt-3 flex justify-between items-center">
            <div className="text-xs text-blue-600 dark:text-blue-300">
              This dialog will close automatically in a few seconds
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowRelayStatus(false)
                if (lastPublishedEvent) {
                  postEditorCache.clearPostCache({ defaultContent, parentEvent })
                  // Note: draftEvent is not available here, but that's okay since the event is already published
                  addReplies([lastPublishedEvent])
                }
                close()
              }}
            >
              {t('Close')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
