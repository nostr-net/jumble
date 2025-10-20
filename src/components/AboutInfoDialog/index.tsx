import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Drawer, DrawerContent, DrawerTrigger } from '@/components/ui/drawer'
import { CODY_PUBKEY, SILBERENGEL_PUBKEY } from '@/constants'
import { useScreenSize } from '@/providers/ScreenSizeProvider'
import { useState, useEffect } from 'react'
import Username from '../Username'
import client from '@/services/client.service'

export default function AboutInfoDialog({ children }: { children: React.ReactNode }) {
  const { isSmallScreen } = useScreenSize()
  const [open, setOpen] = useState(false)
  const [codyLightning, setCodyLightning] = useState<string | null>(null)
  const [silberengelLightning, setSilberengelLightning] = useState<string | null>(null)

  useEffect(() => {
    const fetchProfiles = async () => {
      const [codyProfile, silberengelProfile] = await Promise.all([
        client.fetchProfile(CODY_PUBKEY),
        client.fetchProfile(SILBERENGEL_PUBKEY)
      ])
      
      if (codyProfile?.lightningAddress) {
        setCodyLightning(codyProfile.lightningAddress)
      }
      
      if (silberengelProfile?.lightningAddress) {
        setSilberengelLightning(silberengelProfile.lightningAddress)
      }
    }
    fetchProfiles()
  }, [])

  const content = (
    <>
      <div className="text-xl font-semibold">Jumble 🌲</div>
      <div className="text-muted-foreground">
        A user-friendly Nostr client focused on relay feed browsing and relay discovery
      </div>
      <div className="space-y-2">
        <div>
          <div className="font-medium">Main developer:</div>
          <div className="ml-2">
            <Username userId={CODY_PUBKEY} className="inline-block text-primary" showAt />
            {codyLightning && (
              <div className="text-sm text-muted-foreground">⚡ {codyLightning}</div>
            )}
          </div>
        </div>
        <div>
          <div className="font-medium">Imwald branch:</div>
          <div className="ml-2">
            <Username userId={SILBERENGEL_PUBKEY} className="inline-block text-primary" showAt />
            {silberengelLightning && (
              <div className="text-sm text-muted-foreground">⚡ {silberengelLightning}</div>
            )}
          </div>
        </div>
      </div>
      <div>
        Source code:{' '}
        <a
          href="https://github.com/CodyTseng/jumble"
          target="_blank"
          rel="noreferrer"
          className="text-primary hover:underline"
        >
          Main repo
        </a>
        {' · '}
        <a
          href="https://github.com/Silberengel/jumble"
          target="_blank"
          rel="noreferrer"
          className="text-primary hover:underline"
        >
          Imwald fork
        </a>
        <div className="text-sm text-muted-foreground mt-1">
          If you like Jumble, please consider giving it a star ⭐
        </div>
      </div>
    </>
  )

  if (isSmallScreen) {
    return (
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerTrigger asChild>{children}</DrawerTrigger>
        <DrawerContent>
          <div className="p-4 space-y-4">{content}</div>
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader className="sr-only">
          <DialogTitle>About</DialogTitle>
          <DialogDescription>Information about the application</DialogDescription>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  )
}
