import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'
import { useAppStore } from '../../stores/appStore'
import { dbGetAllUsers, dbGetAllClientAccess, dbUpdateUserRole, dbSetClientAccess } from '../../lib/db'

export default function AdminPanel() {
  const { currentUserRole } = useAuthStore()
  const { clients, notify } = useAppStore()
  const navigate = useNavigate()
  const [users, setUsers] = useState([])
  const [accessMap, setAccessMap] = useState({})
  const [loading, setLoading] = useState(true)

  const loadData = async () => {
    setLoading(true)
    const [u, accessList] = await Promise.all([dbGetAllUsers(), dbGetAllClientAccess()])
    setUsers(u)
    const map = {}
    accessList.forEach(a => {
      if (!map[a.user_id]) map[a.user_id] = {}
      map[a.user_id][a.client_id] = true
    })
    setAccessMap(map)
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  if (currentUserRole !== 'admin') {
    return (
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '28px 32px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
        Nemate pristup admin panelu.
      </div>
    )
  }

  const clientIds = Object.keys(clients)

  const handleRoleChange = async (userId, newRole) => {
    const ok = await dbUpdateUserRole(userId, newRole)
    if (ok) { notify('Rola ažurirana'); loadData() }
    else notify('Greška pri promeni role', 'warning')
  }

  const handleToggleAccess = async (userId, clientId, grant) => {
    const ok = await dbSetClientAccess(userId, clientId, grant)
    if (ok) notify(grant ? 'Pristup dodat' : 'Pristup uklonjen')
    else notify('Greška pri promeni pristupa', 'warning')
    loadData()
  }

  const handleGrantAll = async (userId) => {
    for (const cid of clientIds) {
      await dbSetClientAccess(userId, cid, true)
    }
    notify('Svi klijenti dodati')
    loadData()
  }

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '28px 32px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, color: 'var(--color-text-secondary)' }}>Upravljanje korisnicima</h2>
        <button className="btn" onClick={() => navigate('/')}>← Nazad</button>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-secondary)' }}>Učitavanje korisnika...</div>
      ) : users.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-secondary)' }}>Nema korisnika u bazi.</div>
      ) : (
        <table className="data-table admin-table">
          <thead>
            <tr>
              <th>Korisnik</th>
              <th>Rola</th>
              <th>Klijenti</th>
            </tr>
          </thead>
          <tbody>
            {users.map(user => {
              const isAdmin = user.role === 'admin'
              const userAccess = accessMap[user.id] || {}
              const accessCount = Object.keys(userAccess).length
              const availableClients = clientIds.filter(cid => !userAccess[cid])

              return (
                <tr key={user.id}>
                  <td>
                    <div style={{ fontWeight: 500 }}>{user.full_name || '—'}</div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{user.email}</div>
                  </td>
                  <td>
                    <select
                      className="admin-role-select"
                      value={user.role}
                      onChange={e => handleRoleChange(user.id, e.target.value)}
                      disabled={isAdmin}
                    >
                      <option value="viewer">Viewer</option>
                      <option value="account_manager">Account Manager</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {isAdmin ? (
                          <span className="admin-client-tag all">Svi klijenti</span>
                        ) : (
                          <>
                            {clientIds.filter(cid => userAccess[cid]).map(cid => (
                              <span key={cid} className="admin-client-tag">
                                {clients[cid].name}
                                <button onClick={() => handleToggleAccess(user.id, cid, false)}>×</button>
                              </span>
                            ))}
                            {accessCount === 0 && <span style={{ color: 'var(--color-text-secondary)', fontSize: 12 }}>Nema pristupa</span>}
                          </>
                        )}
                      </div>
                      {!isAdmin && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <select className="admin-role-select" id={`addClient_${user.id}`} disabled={availableClients.length === 0}>
                            <option value="">+ Dodaj klijenta</option>
                            {availableClients.map(cid => <option key={cid} value={cid}>{clients[cid].name}</option>)}
                          </select>
                          <button className="btn" style={{ padding: '5px 10px', fontSize: 11 }}
                            disabled={availableClients.length === 0}
                            onClick={() => {
                              const sel = document.getElementById(`addClient_${user.id}`)
                              if (sel?.value) handleToggleAccess(user.id, sel.value, true)
                            }}>
                            Dodaj
                          </button>
                          <button className="btn" style={{ padding: '5px 10px', fontSize: 11, background: 'var(--color-accent-muted)', borderColor: 'var(--color-border)' }}
                            disabled={accessCount === clientIds.length}
                            onClick={() => handleGrantAll(user.id)}>
                            Svi
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
