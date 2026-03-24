import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'
import { useAppStore } from '../../stores/appStore'
import { dbGetAllUsers, dbGetAllClientAccess, dbUpdateUserRole, dbSetClientAccess, dbCreateClient, dbUpdateClient, dbDeleteClient, dbSaveSheetLinks } from '../../lib/db'
import { PLATFORM_NAMES } from '../../lib/data'
import ClientForm from './ClientForm'

const TABS = [
  { id: 'users', label: 'Korisnici' },
  { id: 'clients', label: 'Klijenti' }
]

export default function AdminPanel() {
  const { currentUserRole } = useAuthStore()
  const { clients, notify, refreshClients } = useAppStore()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('users')
  const [users, setUsers] = useState([])
  const [accessMap, setAccessMap] = useState({})
  const [loading, setLoading] = useState(true)

  // Client management state
  const [editingClient, setEditingClient] = useState(null) // null=list, 'new'=forma, {id,...}=edit
  const [deleteConfirm, setDeleteConfirm] = useState(null)

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

  const handleSaveClient = async (formData) => {
    const { sheetLinks, ...clientData } = formData
    let ok
    if (editingClient === 'new') {
      ok = await dbCreateClient(clientData)
    } else {
      ok = await dbUpdateClient(clientData.id, clientData)
    }

    if (!ok) {
      notify('Greška pri čuvanju klijenta', 'warning')
      return
    }

    // Save sheet links if provided
    const linksToSave = {}
    Object.entries(sheetLinks).forEach(([platform, url]) => {
      if (url?.trim()) {
        linksToSave[`${clientData.id}_${platform}`] = url.trim()
      }
    })
    if (Object.keys(linksToSave).length > 0) {
      await dbSaveSheetLinks(linksToSave)
    }

    notify(editingClient === 'new' ? 'Klijent kreiran' : 'Klijent ažuriran')
    setEditingClient(null)
    await refreshClients()
  }

  const handleDeleteClient = async (clientId) => {
    const ok = await dbDeleteClient(clientId)
    if (ok) {
      notify('Klijent obrisan')
      setDeleteConfirm(null)
      await refreshClients()
    } else {
      notify('Greška pri brisanju klijenta', 'warning')
    }
  }

  const tabStyle = (id) => ({
    padding: '8px 20px',
    fontSize: 13,
    fontWeight: activeTab === id ? 600 : 400,
    color: activeTab === id ? 'var(--color-accent)' : 'var(--color-text-secondary)',
    background: 'none',
    border: 'none',
    boxShadow: activeTab === id ? 'inset 0 -2px 0 var(--color-accent)' : 'none',
    cursor: 'pointer',
    transition: 'all 0.15s ease'
  })

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '28px 32px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--color-border)' }}>
          {TABS.map(tab => (
            <button key={tab.id} style={tabStyle(tab.id)} onClick={() => { setActiveTab(tab.id); setEditingClient(null) }}>
              {tab.label}
            </button>
          ))}
        </div>
        <button className="btn" onClick={() => navigate('/')}>← Nazad</button>
      </div>

      {activeTab === 'users' && (
        <>
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
        </>
      )}

      {activeTab === 'clients' && (
        <>
          {editingClient ? (
            <div style={{
              background: 'var(--color-card)', borderRadius: 'var(--radius-default)',
              padding: 24, boxShadow: 'var(--shadow-default)', border: '1px solid var(--color-border)'
            }}>
              <ClientForm
                client={editingClient === 'new' ? null : clients[editingClient] ? { id: editingClient, ...clients[editingClient] } : null}
                onSave={handleSaveClient}
                onCancel={() => setEditingClient(null)}
              />
            </div>
          ) : (
            <>
              <div style={{ marginBottom: 16 }}>
                <button className="btn" onClick={() => setEditingClient('new')}
                  style={{ background: 'var(--color-accent)', color: 'white', borderColor: 'var(--color-accent)' }}>
                  + Novi klijent
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {clientIds.map(cid => {
                  const c = clients[cid]
                  return (
                    <div key={cid} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '14px 20px', background: 'var(--color-card)',
                      borderRadius: 'var(--radius-default)', border: '1px solid var(--color-border)',
                      boxShadow: 'var(--shadow-default)'
                    }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{c.name}</div>
                        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2 }}>
                          ID: {cid} · {c.currency}
                        </div>
                        <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                          {(c.platforms || []).map(p => (
                            <span key={p} style={{
                              fontSize: 11, padding: '2px 8px', borderRadius: 4,
                              background: 'var(--color-accent-muted)', color: 'var(--color-accent)'
                            }}>
                              {PLATFORM_NAMES[p] || p}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn" style={{ padding: '5px 14px', fontSize: 12 }}
                          onClick={() => setEditingClient(cid)}>
                          Izmeni
                        </button>
                        {deleteConfirm === cid ? (
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button className="btn" style={{ padding: '5px 10px', fontSize: 11, color: 'var(--color-red)', borderColor: 'var(--color-red)' }}
                              onClick={() => handleDeleteClient(cid)}>
                              Potvrdi
                            </button>
                            <button className="btn" style={{ padding: '5px 10px', fontSize: 11 }}
                              onClick={() => setDeleteConfirm(null)}>
                              Ne
                            </button>
                          </div>
                        ) : (
                          <button className="btn" style={{ padding: '5px 14px', fontSize: 12, color: 'var(--color-red)' }}
                            onClick={() => setDeleteConfirm(cid)}>
                            Obriši
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
