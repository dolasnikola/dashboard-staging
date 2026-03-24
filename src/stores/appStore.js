import { create } from 'zustand'
import { fetchClients, fetchHomepageSummary, dbGetSheetLinks } from '../lib/db'
import { getSheetLinks } from '../lib/cache'
import { syncAllSheets, syncGA4Sheet } from '../lib/sync'

export const useAppStore = create((set, get) => ({
  clients: {},
  activeDateRange: 'this_month',
  customDateFrom: null,
  customDateTo: null,
  isInitialized: false,
  isInitializing: false,
  notification: null,

  initDashboard: async () => {
    const { isInitialized, isInitializing } = get()
    if (isInitialized || isInitializing) return
    set({ isInitializing: true })

    try {
      const clients = await fetchClients()
      set({ clients })

      if (Object.keys(clients).length === 0) {
        set({ isInitialized: true, isInitializing: false })
        return
      }

      const now = new Date()
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      await Promise.all([fetchHomepageSummary(currentMonth), dbGetSheetLinks()])
      set({ isInitialized: true, isInitializing: false })

      // Auto-sync from sheets after dashboard loads
      const links = getSheetLinks()
      if (Object.keys(links).length > 0) {
        setTimeout(() => syncAllSheets(null, get().notify), 1000)
      }
      if (links['nlb_ga4']) {
        setTimeout(() => syncGA4Sheet(get().notify), 2000)
      }
    } catch (err) {
      console.error('[initDashboard] error:', err)
      set({ isInitializing: false })
    }
  },

  setDateRange: (range) => {
    set({ activeDateRange: range })
  },

  setCustomDates: (from, to) => {
    set({ customDateFrom: from, customDateTo: to })
  },

  notify: (message, type = 'success') => {
    set({ notification: { message, type } })
    setTimeout(() => set({ notification: null }), 3000)
  },

  refreshClients: async () => {
    const clients = await fetchClients()
    set({ clients })
  }
}))
