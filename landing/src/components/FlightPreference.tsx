import { useSyncExternalStore } from 'react'
import { readSkipFlightPreference, subscribeSkipFlightPreference, writeSkipFlightPreference } from '../../../shared/flight-preference'
import '../styles/flight-preference.css'

const serverSnapshot = () => false

export default function FlightPreference() {
  const skip = useSyncExternalStore(subscribeSkipFlightPreference, readSkipFlightPreference, serverSnapshot)
  return <label className="flight-preference">
    <input type="checkbox" checked={skip} onChange={event => writeSkipFlightPreference(event.target.checked)} />
    <span>Skip animation</span>
  </label>
}
