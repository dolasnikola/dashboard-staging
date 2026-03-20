// ============== SUPABASE AUTH ==============

async function checkLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const pw = document.getElementById('loginPassword').value;
  const errorEl = document.getElementById('loginError');

  if (!email || !pw) {
    errorEl.textContent = 'Unesi email i šifru';
    errorEl.style.display = 'block';
    return;
  }

  errorEl.style.display = 'none';

  const { data, error } = await sb.auth.signInWithPassword({
    email: email,
    password: pw
  });

  if (error) {
    errorEl.textContent = 'Pogrešan email ili šifra';
    errorEl.style.display = 'block';
    document.getElementById('loginPassword').value = '';
    document.getElementById('loginPassword').focus();
    return;
  }

  currentUser = data.user;
  await loadUserProfile();
  await unlockDashboard();
}

async function loadUserProfile() {
  if (!currentUser) return;

  const { data, error } = await sb
    .from('user_profiles')
    .select('role, full_name')
    .eq('id', currentUser.id)
    .single();

  if (data) {
    currentUserRole = data.role;
  }
}

async function unlockDashboard() {
  document.getElementById('loginGate').style.display = 'none';
  document.getElementById('appContent').style.display = 'block';

  // Apply role-based UI visibility
  applyRolePermissions();

  // Show loading state
  const grid = document.getElementById('clientsGrid');
  if (grid) grid.innerHTML = '<div style="padding:60px;text-align:center;color:var(--text-secondary);"><div style="font-size:24px;margin-bottom:12px;">⏳</div>Učitavanje podataka...</div>';

  // Load clients from DB and initialize
  await initDashboard();

  // Route based on current hash
  const hash = window.location.hash || '';
  const match = hash.match(/^#\/(\w+)$/);
  if (match && CLIENTS[match[1]]) {
    openClient(match[1]);
  }
}

function applyRolePermissions() {
  const actions = document.getElementById('headerActions');
  if (!actions) return;

  // Show Admin button only for admins
  const adminBtn = document.getElementById('adminBtn');
  if (adminBtn) adminBtn.style.display = currentUserRole === 'admin' ? '' : 'none';

  if (currentUserRole === 'viewer') {
    // Hide data management actions for viewers
    actions.querySelectorAll('button').forEach(btn => {
      const text = btn.textContent.trim();
      if (text === 'Import CSV' || text === 'Budget' || text === 'Sheets Sync') {
        btn.style.display = 'none';
      }
    });
  }
}

async function handleLogout() {
  await sb.auth.signOut();
  currentUser = null;
  currentUserRole = 'viewer';
  _initDone = false;
  _syncInProgress = false;
  clearCache();
  document.getElementById('appContent').style.display = 'none';
  document.getElementById('loginGate').style.display = 'flex';
  document.getElementById('loginEmail').value = '';
  document.getElementById('loginPassword').value = '';
  document.getElementById('loginEmail').focus();
}

// Listen for auth state changes (session expiry, etc.)
sb.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT') {
    currentUser = null;
    currentUserRole = 'viewer';
    clearCache();
    document.getElementById('appContent').style.display = 'none';
    document.getElementById('loginGate').style.display = 'flex';
  }
});

// Auto-unlock if session exists
(async function checkSession() {
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    currentUser = session.user;
    await loadUserProfile();
    await unlockDashboard();
  } else {
    document.getElementById('loginEmail').focus();
  }
})();
