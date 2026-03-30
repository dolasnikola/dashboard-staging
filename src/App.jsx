import { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'
import { useAppStore } from './stores/appStore'
import LoginGate from './components/auth/LoginGate'
import SetPassword from './components/auth/SetPassword'
import Header from './components/layout/Header'
import HomePage from './components/home/HomePage'
import ClientDetail from './components/client/ClientDetail'
import AdminPanel from './components/admin/AdminPanel'
import Notification from './components/ui/Notification'
import ImportModal from './components/modals/ImportModal'
import BudgetModal from './components/modals/BudgetModal'

export default function App() {
  const { isAuthenticated, isLoading, checkSession, setupAuthListener } = useAuthStore()
  const initDashboard = useAppStore(s => s.initDashboard)
  const [importOpen, setImportOpen] = useState(false)
  const [budgetOpen, setBudgetOpen] = useState(false)
  const [showSetPassword, setShowSetPassword] = useState(false)

  useEffect(() => {
    // Detect invite or recovery token in URL hash
    const hash = window.location.hash
    if (hash && (hash.includes('type=invite') || hash.includes('type=recovery'))) {
      setShowSetPassword(true)
    }
    checkSession()
    const unsubscribe = setupAuthListener()
    return () => unsubscribe()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isAuthenticated) {
      initDashboard()
    }
  }, [isAuthenticated]) // eslint-disable-line react-hooks/exhaustive-deps

  if (showSetPassword) {
    return (
      <SetPassword onComplete={() => {
        setShowSetPassword(false)
        window.location.hash = ''
        checkSession()
      }} />
    )
  }

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div style={{ textAlign: 'center', color: 'var(--color-text-secondary)' }}>
          <div style={{ fontSize: 24, marginBottom: 12 }}>⏳</div>
          Učitavanje...
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <LoginGate />
  }

  return (
    <>
      <Header
        onImportClick={() => setImportOpen(true)}
        onBudgetClick={() => setBudgetOpen(true)}
      />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/:clientId" element={<ClientDetail />} />
        <Route path="/admin" element={<AdminPanel />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Notification />
      {importOpen && <ImportModal onClose={() => setImportOpen(false)} />}
      {budgetOpen && <BudgetModal onClose={() => setBudgetOpen(false)} />}
    </>
  )
}
