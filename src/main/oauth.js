// "Continue with Google" — OAuth 2.0 for desktop apps (loopback redirect + PKCE).
// Google blocks sign-in inside embedded webviews, so this opens the system browser.
//
// Needs a Google Cloud OAuth client of type "Desktop app". Provide it via either:
//   - Settings → Account → OAuth client ID, or
//   - env SLICE_GOOGLE_CLIENT_ID / SLICE_GOOGLE_CLIENT_SECRET, or
//   - src/main/oauth.config.json  { "clientId": "...", "clientSecret": "..." }  (git-ignored)
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { shell, safeStorage } = require('electron');

const SCOPES = ['openid', 'email', 'profile'];

function clientConfig(settings) {
  let file = {};
  try { file = JSON.parse(fs.readFileSync(path.join(__dirname, 'oauth.config.json'), 'utf8')); } catch { /* optional */ }
  return {
    clientId: settings.oauthClientId || process.env.SLICE_GOOGLE_CLIENT_ID || file.clientId || '',
    // Desktop-app client secrets are not confidential (Google documents this); still optional.
    clientSecret: process.env.SLICE_GOOGLE_CLIENT_SECRET || file.clientSecret || '',
  };
}

const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const DONE_PAGE = (ok) => `<!doctype html><meta charset="utf-8"><title>Slice</title>
<body style="margin:0;height:100vh;display:grid;place-items:center;background:#0b0d12;color:#e8ecf3;font:16px system-ui">
<div style="text-align:center"><svg width="56" viewBox="0 0 1254 1254"><path fill="#fff" d="M319.3 110.9A594 594 0 1 0 934.7 110.9A311 311 0 0 1 319.3 110.9Z"/></svg>
<h2 style="font-weight:600">${ok ? "You're in. Head back to Slice." : 'Sign-in was cancelled.'}</h2><p style="opacity:.6">You can close this tab.</p></div></body>`;

async function signIn(settings) {
  const { clientId, clientSecret } = clientConfig(settings);
  if (!clientId) {
    const err = new Error('Google sign-in needs an OAuth client ID (Settings → Account).');
    err.code = 'NO_CLIENT_ID';
    throw err;
  }
  const verifier = b64url(crypto.randomBytes(48));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  const state = b64url(crypto.randomBytes(16));

  const { code, redirectUri } = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://127.0.0.1');
      if (u.pathname !== '/') { res.writeHead(404).end(); return; }
      const ok = u.searchParams.get('state') === state && u.searchParams.get('code');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(DONE_PAGE(!!ok));
      server.close();
      clearTimeout(timer);
      if (ok) resolve({ code: u.searchParams.get('code'), redirectUri });
      else reject(new Error(u.searchParams.get('error') || 'Sign-in cancelled'));
    });
    let redirectUri = '';
    const timer = setTimeout(() => { server.close(); reject(new Error('Sign-in timed out')); }, 5 * 60_000);
    server.listen(0, '127.0.0.1', () => {
      redirectUri = `http://127.0.0.1:${server.address().port}`;
      const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      auth.search = new URLSearchParams({
        client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: SCOPES.join(' '),
        code_challenge: challenge, code_challenge_method: 'S256', state, prompt: 'select_account',
      });
      shell.openExternal(auth.toString());
    });
  });

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, client_id: clientId, ...(clientSecret ? { client_secret: clientSecret } : {}),
      redirect_uri: redirectUri, grant_type: 'authorization_code', code_verifier: verifier,
    }),
  });
  const tokens = await tokenRes.json();
  if (!tokenRes.ok) throw new Error(tokens.error_description || tokens.error || 'Token exchange failed');

  const info = await (await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  })).json();

  const refresh = tokens.refresh_token
    ? (safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(tokens.refresh_token).toString('base64') : '')
    : '';
  return {
    profile: { name: info.name || info.given_name || '', givenName: info.given_name || '', email: info.email || '', picture: info.picture || '' },
    refresh,
  };
}

module.exports = { signIn, clientConfig };
