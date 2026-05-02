import { chromium } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

function readAuthStateFromEnvFile(): string | undefined {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return undefined;
  const content = fs.readFileSync(envPath, 'utf8');
  const match = content.match(/^SUPABASE_AUTH_STATE=(.*)/m);
  if (!match) return undefined;
  // Strip surrounding double or single quotes that the .env format may add
  return match[1].replace(/^["']|["']$/g, '');
}

async function globalSetup() {
  const raw = readAuthStateFromEnvFile() ?? process.env.SUPABASE_AUTH_STATE;
  if (!raw) {
    throw new Error(
      'SUPABASE_AUTH_STATE is not set.\n' +
      'While logged in to the app, run this in DevTools console:\n\n' +
      '  JSON.stringify(Object.fromEntries(\n' +
      '    Object.entries(localStorage).filter(([k]) => k.startsWith("sb-"))\n' +
      '  ))\n\n' +
      'Then add the output to .env as:\n' +
      '  SUPABASE_AUTH_STATE=\'<paste here>\''
    );
  }

  let authState: Record<string, string>;
  try {
    authState = JSON.parse(raw);
  } catch {
    throw new Error('SUPABASE_AUTH_STATE is not valid JSON. Re-copy the DevTools output.');
  }

  const authDir = path.join(__dirname, '.auth');
  fs.mkdirSync(authDir, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({
    baseURL: process.env.PW_BASE_URL || 'http://localhost:8080',
  });

  // Seed Supabase localStorage tokens before the page loads
  await context.addInitScript((state) => {
    for (const [key, value] of Object.entries(state)) {
      localStorage.setItem(key, value as string);
    }
  }, authState);

  // Load the app once to let Supabase restore the session from localStorage
  const page = await context.newPage();
  await page.goto('/');
  // Condition wait — not a sleep. Supabase JS reads localStorage synchronously on
  // page load and fires onAuthStateChange before DOMContentLoaded completes, so this
  // typically resolves in < 1s. If it times out, the token is expired or malformed.
  // PW02: if flakiness appears here, add a fallback that checks currentUserId instead.
  await page.waitForFunction(
    () => (document.getElementById('auth-overlay') as HTMLElement)?.style.display === 'none'
  );

  await context.storageState({ path: path.join(authDir, 'state.json') });
  await browser.close();
}

export default globalSetup;
