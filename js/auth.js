// Supabase Auth Module
// Loaded as a regular script before module scripts so globals are available.

const SUPABASE_URL = 'https://yxvcjnlbekzchbuvzfis.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_XtVYkTNQt8p6IC9CJfvDOQ_aYMDtnHr';

// window.supabase is the library object from CDN at this point
const _supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
// Replace library reference with the client instance for use in db.js
window.supabase = _supabaseClient;

// initAuth returns a Promise that resolves only once a user session is active.
// DB.init() awaits this before any DB operations run.
window.initAuth = function initAuth() {
  return new Promise(async (resolve) => {
    let resolved = false;
    function done() {
      if (!resolved) { resolved = true; resolve(); }
    }

    const { data: { session } } = await _supabaseClient.auth.getSession();

    if (session) {
      _onSignedIn(session.user);
      done();
    } else {
      _showAuthOverlay();
    }

    _supabaseClient.auth.onAuthStateChange((_event, session) => {
      if (session) {
        _onSignedIn(session.user);
        done();
        // Re-initialize app data after sign-in (if already booted)
        if (window.app && typeof window.app.loadData === 'function') {
          if (window.DB) {
            window.DB.preloadAll().then(() => window.app.loadData());
          } else {
            window.app.loadData();
          }
        }
      } else {
        window.currentUserId = null;
        _resetCache();
        _showAuthOverlay();
      }
    });

    // Allow Enter key to submit
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && document.getElementById('auth-overlay').style.display !== 'none') {
        authSubmit();
      }
    });
  });
};

function _showAuthOverlay() {
  const overlay = document.getElementById('auth-overlay');
  if (overlay) overlay.style.display = 'flex';
  const btn = document.getElementById('signout-btn');
  if (btn) btn.style.display = 'none';
  const pwField = document.getElementById('auth-password');
  if (pwField) pwField.value = '';
  const status = document.getElementById('auth-status');
  if (status) status.textContent = '';
}

function _onSignedIn(user) {
  window.currentUserId = user.id;
  const overlay = document.getElementById('auth-overlay');
  if (overlay) overlay.style.display = 'none';
  const btn = document.getElementById('signout-btn');
  if (btn) btn.style.display = 'inline-block';
}

window.authSubmit = async function authSubmit() {
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value.trim();
  const status = document.getElementById('auth-status');

  if (!email || !password) {
    status.textContent = 'Please enter your email and password.';
    return;
  }

  status.textContent = 'Signing in...';
  document.getElementById('auth-submit-btn').disabled = true;

  const { error } = await _supabaseClient.auth.signInWithPassword({ email, password });

  if (error) {
    status.textContent = 'Error: ' + error.message;
    document.getElementById('auth-submit-btn').disabled = false;
  }
  // onAuthStateChange in initAuth() handles the rest on success
};

function _resetCache() {
  if (!window.DB) return;
  window.DB._cache = {
    calendar:         null,
    priorities:       null,
    subFocuses:       null,
    epics:            null,
    stories:          null,
    dailyLogs:        null,
    monthlyPlans:     null,
    focuses:          null,
    sprints:          null,
    travelSegments:   null,
    locationPeriods:  null,
    dayTypeOverrides: null,
  };
  window.DB._cacheReady = false;
}

window.authSignOut = async function authSignOut() {
  await _supabaseClient.auth.signOut();
  window.currentUserId = null;
  _resetCache();
};

window.migrateFromIDB = async function migrateFromIDB() {
  const btn = document.getElementById('migrate-idb-btn');
  btn.disabled = true;
  btn.textContent = 'Migrating...';

  const result = await window.DB.migrateFromIndexedDB((store, count) => {
    btn.textContent = `Migrating ${store} (${count})...`;
  });

  if (!result.ok) {
    alert('Migration failed: ' + result.reason);
    btn.disabled = false;
    btn.textContent = 'Migrate Local Data';
    return;
  }

  const summary = Object.entries(result.counts)
    .filter(([, n]) => n > 0)
    .map(([s, n]) => `${s}: ${n}`)
    .join(', ');

  btn.textContent = `Done (${result.total} records)`;
  alert(`Migration complete!\n${summary || 'No records found.'}\n\nThe page will reload to show your data.`);
  location.reload(); // guarded: only fires after successful migrateFromIDB() + user-confirmed alert
};
