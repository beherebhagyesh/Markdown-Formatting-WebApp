const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const TOKENS_PATH = path.join(__dirname, '.google_tokens.json');
const CREDS_PATH = path.join(__dirname, 'google_oauth_credentials.json');

function readJsonIfExists(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function getOAuthConfig() {
  const creds = readJsonIfExists(CREDS_PATH);

  const clientId = process.env.GOOGLE_CLIENT_ID || creds?.installed?.client_id || creds?.web?.client_id;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || creds?.installed?.client_secret || creds?.web?.client_secret;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || creds?.installed?.redirect_uris?.[0] || creds?.web?.redirect_uris?.[0];

  if (!clientId || !clientSecret || !redirectUri) {
    return null;
  }

  return { clientId, clientSecret, redirectUri };
}

function createOAuthClient() {
  const cfg = getOAuthConfig();
  if (!cfg) return null;
  return new google.auth.OAuth2(cfg.clientId, cfg.clientSecret, cfg.redirectUri);
}

function saveTokens(tokens) {
  fs.writeFileSync(TOKENS_PATH, JSON.stringify(tokens, null, 2), 'utf8');
}

function loadTokens() {
  return readJsonIfExists(TOKENS_PATH);
}

function clearTokens() {
  try {
    if (fs.existsSync(TOKENS_PATH)) fs.unlinkSync(TOKENS_PATH);
  } catch {
    // ignore
  }
}

async function getAuthedClient() {
  const oauth2Client = createOAuthClient();
  if (!oauth2Client) {
    const err = new Error('Missing Google OAuth config. Provide google_oauth_credentials.json or env vars.');
    err.code = 'MISSING_OAUTH_CONFIG';
    throw err;
  }

  const tokens = loadTokens();
  if (!tokens) {
    const err = new Error('Not connected to Google.');
    err.code = 'NOT_AUTHED';
    throw err;
  }

  oauth2Client.setCredentials(tokens);
  return oauth2Client;
}

function getAuthUrl() {
  const oauth2Client = createOAuthClient();
  if (!oauth2Client) {
    const err = new Error('Missing Google OAuth config. Provide google_oauth_credentials.json or env vars.');
    err.code = 'MISSING_OAUTH_CONFIG';
    throw err;
  }

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/documents',
      'https://www.googleapis.com/auth/drive.metadata.readonly',
      'openid',
      'email',
      'profile',
    ],
  });
}

async function handleOAuthCallback(code) {
  const oauth2Client = createOAuthClient();
  if (!oauth2Client) {
    const err = new Error('Missing Google OAuth config. Provide google_oauth_credentials.json or env vars.');
    err.code = 'MISSING_OAUTH_CONFIG';
    throw err;
  }

  const { tokens } = await oauth2Client.getToken(code);
  saveTokens(tokens);
  oauth2Client.setCredentials(tokens);
  return tokens;
}

function getConnectionStatus() {
  const cfg = getOAuthConfig();
  const tokens = loadTokens();

  return {
    hasConfig: Boolean(cfg),
    connected: Boolean(tokens),
    redirectUri: cfg?.redirectUri || null,
  };
}

module.exports = {
  clearTokens,
  getAuthUrl,
  getAuthedClient,
  getConnectionStatus,
  handleOAuthCallback,
};
