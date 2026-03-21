import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'
import { useAppStore } from './stores/appStore'
import LoginGate from './components/auth/LoginGate'
import Header from './components/layout/Header'
import HomePage from './components/home/HomePage'
import ClientDetail from './components/client/ClientDetail'
import AdminPanel from './components/admin/AdminPanel'
import Notification from './components/ui/Notification'
import ImportModal from './components/modals/ImportModal'
import BudgetModal from './components/modals/BudgetModal'
import SheetsModal from './components/modals/SheetsModal'
import { useState } from 'react'

export default function App() {
  const { isAuthenticated, isLoading, checkSession, setupAuthListener } = useAuthStore()
  const initDashboard = useAppStore(s => s.initDashboard)
  const [importOpen, setImportOpen] = useState(false)
  const [budgetOpen, setBudgetOpen] = useState(false)
  const [sheetsOpen, setSheetsOpen] = useState(false)

  useEffect(() => {
    checkSession()
    setupAuthListener()
  }, [])

  useEffect(() => {
    if (isAuthenticated) {
      initDashboard()
    }
  }, [isAuthenticated])

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
        onSheetsClick={() => setSheetsOpen(true)}
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
      {sheetsOpen && <SheetsModal onClose={() => setSheetsOpen(false)} />}
    </>
  )
}
