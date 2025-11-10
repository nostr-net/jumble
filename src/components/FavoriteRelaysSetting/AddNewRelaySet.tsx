import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useFavoriteRelays } from '@/providers/FavoriteRelaysProvider'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import logger from '@/lib/logger'

export default function AddNewRelaySet() {
  const { t } = useTranslation()
  const { createRelaySet } = useFavoriteRelays()
  const [newRelaySetName, setNewRelaySetName] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const saveRelaySet = async () => {
    if (!newRelaySetName || isLoading) return
    
    setIsLoading(true)
    setErrorMsg('')
    
    try {
      await createRelaySet(newRelaySetName)
      setNewRelaySetName('')
    } catch (error) {
      logger.error('Failed to create relay set', { error, name: newRelaySetName })
      setErrorMsg(t('Failed to create relay set. Please try again.'))
    } finally {
      setIsLoading(false)
    }
  }

  const handleNewRelaySetNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewRelaySetName(e.target.value)
    setErrorMsg('')
  }

  const handleNewRelaySetNameKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      saveRelaySet()
    }
  }

  return (
    <div className="space-y-1">
      <div className="flex gap-2 items-center">
        <Input
          placeholder={t('Add a new relay set')}
          value={newRelaySetName}
          onChange={handleNewRelaySetNameChange}
          onKeyDown={handleNewRelaySetNameKeyDown}
          className={errorMsg ? 'border-destructive' : ''}
        />
        <Button onClick={saveRelaySet} disabled={isLoading || !newRelaySetName.trim()}>
          {isLoading ? t('Adding...') : t('Add')}
        </Button>
      </div>
      {errorMsg && <div className="text-destructive text-sm pl-8">{errorMsg}</div>}
    </div>
  )
}
