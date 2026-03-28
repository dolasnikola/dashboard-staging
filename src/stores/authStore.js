import { create } from 'zustand'
import { sb } from '../lib/supabase'
import { clearCache } from '../lib/cache'

export const useAuthStore = create((set, get) => ({
  currentUser: null,
  currentUserRole: 'viewer',
  isAuthenticated: false,
  isLoading: true,

  login: async (email, password) => {
    const { data, error } = await sb.auth.signInWithPassword({ email, password })
    if (error) throw error
    set({ currentUser: data.user, isAuthenticated: true })
    await get().loadProfile()
  },

  loadProfile: async () => {
    const { currentUser } = get()
    if (!currentUser) return
    const { data } = await sb.from('user_profiles')
      .select('role, full_name')
      .eq('id', currentUser.id)
      .single()
    if (data) {
      set({ currentUserRole: data.role })
    }
  },

  logout: async () => {
    await sb.auth.signOut()
    clearCache()
    set({ currentUser: null, currentUserRole: 'viewer', isAuthenticated: false })
  },

  checkSession: async () => {
    try {
      const { data: { session } } = await sb.auth.getSession()
      if (session) {
        set({ currentUser: session.user, isAuthenticated: true })
        const { data } = await sb.from('user_profiles')
          .select('role, full_name')
          .eq('id', session.user.id)
          .single()
        if (data) set({ currentUserRole: data.role })
      }
    } finally {
      set({ isLoading: false })
    }
  },

  setupAuthListener: () => {
    const { data: { subscription } } = sb.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        clearCache()
        set({ currentUser: null, currentUserRole: 'viewer', isAuthenticated: false })
      }
    })
    return () => subscription.unsubscribe()
  }
}))
