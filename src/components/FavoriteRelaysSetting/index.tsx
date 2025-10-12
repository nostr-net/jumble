import AddBlockedRelay from './AddBlockedRelay'
import AddNewRelay from './AddNewRelay'
import AddNewRelaySet from './AddNewRelaySet'
import BlockedRelayList from './BlockedRelayList'
import FavoriteRelayList from './FavoriteRelayList'
import { RelaySetsSettingComponentProvider } from './provider'
import RelaySetList from './RelaySetList'

export default function FavoriteRelaysSetting() {
  return (
    <RelaySetsSettingComponentProvider>
      <div className="space-y-4">
        <RelaySetList />
        <AddNewRelaySet />
        <FavoriteRelayList />
        <AddNewRelay />
        <BlockedRelayList />
        <AddBlockedRelay />
      </div>
    </RelaySetsSettingComponentProvider>
  )
}
