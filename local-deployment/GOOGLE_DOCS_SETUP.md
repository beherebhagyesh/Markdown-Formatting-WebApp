# Google Docs Setup (Local App)

## Goal
Connect your Google account to the local app so it can **edit Google Docs in place** (convert Markdown markers like `#`, `-`, `**bold**`, etc. into native Google Docs formatting).

## 1) Create OAuth credentials
In Google Cloud Console:

1. Enable APIs:
   - Google Docs API
   - Google Drive API
2. Create OAuth Client:
   - Type: Web application
3. Add Authorized redirect URI:
   - `http://localhost:30777/auth/google/callback`

## 2) Provide credentials to the app

### Option A (recommended): credentials file
1. Copy:
   - `google_oauth_credentials.example.json`
2. Rename to:
   - `google_oauth_credentials.json`
3. Edit the new `google_oauth_credentials.json` and paste:
   - `client_id`
   - `client_secret`

### Option B: environment variables
Set:
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI=http://localhost:30777/auth/google/callback`

## 3) Install deps and run
From `local-deployment/`:
- `npm install`
- `node server.js`
Open:
- `http://localhost:30777`

## 4) Using it
1. Click **Connect Google**
2. Approve permissions
3. Paste a Google Doc link you can edit
4. Click **Clean Doc**

## Notes about permissions and “any user”
- Any user can paste any Google Docs link, but **the Google account currently connected in the app** must have edit access.
- If the doc is view-only / locked, the app will tell you to temporarily enable editing access (e.g. “Anyone with the link can edit”), then retry.
- After cleaning, it’s recommended to lock sharing back down.
