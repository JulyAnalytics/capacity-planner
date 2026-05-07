// Re-seeds SUPABASE_AUTH_STATE for Playwright tests.
// Uses the Supabase REST API — no browser or local server needed.
//
// Credentials: set SUPABASE_EMAIL and SUPABASE_PASSWORD in .env or env vars.
// Usage: node scripts/reauth.mjs   or   npm run reauth

import { readFileSync, writeFileSync, unlinkSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const ENV_PATH = resolve(ROOT, '.env');
const AUTH_STATE_PATH = resolve(ROOT, 'tests', '.auth', 'state.json');

const SUPABASE_URL = 'https://yxvcjnlbekzchbuvzfis.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_XtVYkTNQt8p6IC9CJfvDOQ_aYMDtnHr';
const PROJECT_REF = 'yxvcjnlbekzchbuvzfis';

function readEnvFile() {
  try {
    const content = readFileSync(ENV_PATH, 'utf8');
    const env = {};
    for (const line of content.split('\n')) {
      const m = line.match(/^([^=]+)=(.*)/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
    return env;
  } catch {
    return {};
  }
}

function writeEnvFile(env) {
  const lines = [];
  for (const [k, v] of Object.entries(env)) {
    lines.push(`${k}=${v}`);
  }
  writeFileSync(ENV_PATH, lines.join('\n') + '\n');
}

async function main() {
  const envFile = readEnvFile();
  const email = process.env.SUPABASE_EMAIL || envFile.SUPABASE_EMAIL;
  const password = process.env.SUPABASE_PASSWORD || envFile.SUPABASE_PASSWORD;

  if (!email || !password) {
    console.error([
      'Missing credentials.',
      'Set SUPABASE_EMAIL and SUPABASE_PASSWORD in .env or as environment variables.',
      '',
      'Example (.env):',
      '  SUPABASE_EMAIL=you@example.com',
      '  SUPABASE_PASSWORD=your_password',
    ].join('\n'));
    process.exit(1);
  }

  process.stdout.write('Signing in to Supabase... ');
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error(`\nAuth failed (${res.status}): ${err.error_description || err.msg || res.statusText}`);
    process.exit(1);
  }

  const session = await res.json();
  console.log('OK');

  const authState = {
    [`sb-${PROJECT_REF}-auth-token`]: JSON.stringify(session),
  };

  envFile.SUPABASE_AUTH_STATE = JSON.stringify(authState);
  if (!envFile.SUPABASE_EMAIL) envFile.SUPABASE_EMAIL = email;
  if (!envFile.SUPABASE_PASSWORD) envFile.SUPABASE_PASSWORD = password;
  writeEnvFile(envFile);

  const expires = new Date(session.expires_at * 1000).toISOString();
  console.log(`Token expires at ${expires}`);
  console.log('SUPABASE_AUTH_STATE written to .env');

  try { unlinkSync(AUTH_STATE_PATH); console.log('Deleted tests/.auth/state.json (regenerates on next run)'); }
  catch { /* doesn't exist, fine */ }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
