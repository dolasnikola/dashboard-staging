import { create } from 'zustand'
import { apiLogin, apiLogout, apiGetUser } from '../lib/api'
import { dbSelect } from '../lib/api'
import { clearCache } from '../lib/cache'

export const useAuthStore = create((set, get) => ({
  currentUser: null,
  currentUserRole: 'viewer',
  isAuthenticated: false,
  isLoading: true,

  login: async (email, password) => {
    const user = await apiLogin(email, password)
    set({ currentUser: user, isAuthenticated: true })
    await get().loadProfile()
  },

  loadProfile: async () => {
    const { currentUser } = get()
    if (!currentUser) return
    const { data } = await dbSelect('user_profiles', {
      filters: [{ column: 'id', op: 'eq', value: currentUser.id }],
      single: true,
      columns: 'role, full_name'
    })
    if (data) {
      set({ currentUserRole: data.role })
    }
  },

  logout: async () => {
    await apiLogout()
    clearCache()
    set({ currentUser: null, currentUserRole: 'viewer', isAuthenticated: false })
  },

  checkSession: async () => {
    try {
      const user = await apiGetUser()
      if (user) {
        set({ currentUser: user, isAuthenticated: true })
        const { data } = await dbSelect('user_profiles', {
          filters: [{ column: 'id', op: 'eq', value: user.id }],
          single: true,
          columns: 'role, full_name'
        })
        if (data) set({ currentUserRole: data.role })
      }
    } finally {
      set({ isLoading: false })
    }
  },

  setupAuthListener: () => {
    // With httpOnly cookies, auth state changes are detected via API polling.
    // The browser no longer has direct access to auth tokens.
    // We check session validity on visibility change (tab focus).
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && get().isAuthenticated) {
        const user = await apiGetUser()
        if (!user) {
          clearCache()
          set({ currentUser: null, currentUserRole: 'viewer', isAuthenticated: false })
        }
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }
}))
