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
          window.app.loadData();
        }
      } else {
        window.currentUserId = null;
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

window.authSignOut = async function authSignOut() {
  await _supabaseClient.auth.signOut();
  window.currentUserId = null;
};
