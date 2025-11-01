import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from '@/components/ui/drawer'
import { useScreenSize } from '@/providers/ScreenSizeProvider'
import { Dispatch } from 'react'
import AccountManager from '../AccountManager'

export default function LoginDialog({
  open,
  setOpen
}: {
  open: boolean
  setOpen: Dispatch<boolean>
}) {
  const { isSmallScreen } = useScreenSize()

  if (isSmallScreen) {
    return (
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent className="max-h-[90vh]">
          <DrawerHeader className="sr-only">
            <DrawerTitle>Account Manager</DrawerTitle>
            <DrawerDescription>Manage your Nostr account and settings</DrawerDescription>
          </DrawerHeader>
          <div className="flex flex-col p-4 gap-4 overflow-auto">
            <AccountManager close={() => setOpen(false)} />
          </div>
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="w-[520px] max-h-[90vh] py-8 overflow-auto">
        <DialogHeader className="sr-only">
          <DialogTitle>Account Manager</DialogTitle>
          <DialogDescription>Manage your Nostr account and settings</DialogDescription>
        </DialogHeader>
        <AccountManager close={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  )
}
