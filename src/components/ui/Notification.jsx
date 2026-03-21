import { useAppStore } from '../../stores/appStore'

export default function Notification() {
  const notification = useAppStore(s => s.notification)

  if (!notification) return null

  return (
    <div className={`notification ${notification.type} show`}>
      {notification.message}
    </div>
  )
}
