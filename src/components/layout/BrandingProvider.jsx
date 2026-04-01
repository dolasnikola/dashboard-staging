import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useAppStore } from '../../stores/appStore'
import { getBranding, applyBranding, resetBranding } from '../../lib/branding'

export default function BrandingProvider({ children }) {
  const { clientId } = useParams()
  const clients = useAppStore(s => s.clients)
  const client = clientId ? clients[clientId] : null

  useEffect(() => {
    if (client) {
      const branding = getBranding(client)
      applyBranding(branding)
    } else {
      resetBranding()
    }
    return () => resetBranding()
  }, [client])

  return children
}
