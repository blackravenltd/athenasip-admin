import { useEffect } from 'react'
import useAppEvents from './useAppEvents'

export default function useEvent(event, callback) {
  const appEvents = useAppEvents()

  useEffect(() => {
    appEvents.addListener(event, callback)

    return () => {
      appEvents.removeListener(event, callback)
    }
  })
}
