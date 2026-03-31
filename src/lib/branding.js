// ============== BRANDING ==============
// Reads branding config from client data and applies CSS custom properties.

const DEFAULT_BRANDING = {
  logo_url: null,
  primary_color: '#4338ca',  // default accent
  accent_color: '#4a6cf7',
  font_family: null          // uses default --font-display
}

export function getBranding(client) {
  if (!client?.branding) return DEFAULT_BRANDING
  return { ...DEFAULT_BRANDING, ...client.branding }
}

export function applyBranding(branding) {
  const root = document.documentElement
  if (branding.primary_color) {
    root.style.setProperty('--color-accent', branding.primary_color)
    root.style.setProperty('--color-accent-light', branding.primary_color + '18')
    root.style.setProperty('--color-accent-muted', branding.primary_color + '12')
  }
  if (branding.font_family) {
    root.style.setProperty('--font-display', branding.font_family)
  }
}

export function resetBranding() {
  const root = document.documentElement
  root.style.removeProperty('--color-accent')
  root.style.removeProperty('--color-accent-light')
  root.style.removeProperty('--color-accent-muted')
  root.style.removeProperty('--font-display')
}
