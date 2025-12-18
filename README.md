 # Markdown Formatting App (Local)

 Local Node.js/Express version of the Markdown formatting tool.

 It includes:
 - Markdown -> HTML formatting (live preview)
 - Google Docs “clean in place” (OAuth2 + Docs API)
 - `.docx` import (upload -> convert to HTML -> preview + download)

 ## Project layout
 - `local-deployment/`
   - `server.js` (Express server)
   - `markdownProcessor.js` (Markdown -> HTML)
   - `googleAuth.js` (Google OAuth client + token storage)
   - `googleDriveAccess.js` (Drive metadata permission checks)
   - `googleDocsCleaner.js` (Docs batchUpdate request builder)
   - `public/index.html` (UI)
   - `GOOGLE_DOCS_SETUP.md` (OAuth setup guide)

 ## Prerequisites
 - Node.js 18+ recommended
 - A Google Cloud project (only needed for Google Docs cleaning)

 ## Install
 From `local-deployment/`:

 ```bash
 npm install
 ```

 ## Run
 From `local-deployment/`:

 ```bash
 node server.js
 ```

 Then open:
 - `http://localhost:30777`

 ## Features
 ### 1) Markdown -> HTML
 - Type Markdown in the left editor
 - Click **Format** to update the HTML preview
 - Use **Copy HTML** / **Download HTML** as needed

 ### 2) Google Docs (clean in place)
 This edits the Google Doc directly.

- Follow `local-deployment/GOOGLE_DOCS_SETUP.md`
- Create `local-deployment/google_oauth_credentials.json`
- Start the server and click **Connect Google** in the UI
- Paste a Google Doc link you can edit, then click **Clean Doc**

Notes:
- The redirect URI must match what you configure in Google Cloud:
  - `http://localhost:30777/auth/google/callback`
- For live hosting (Render/Vercel/etc.) set `GOOGLE_REDIRECT_URI` to:
  - `https://YOUR_DOMAIN/auth/google/callback`
- Environment variables supported:
  - `GOOGLE_OAUTH_CLIENT_ID` (or legacy `GOOGLE_CLIENT_ID`)
  - `GOOGLE_OAUTH_CLIENT_SECRET` (or legacy `GOOGLE_CLIENT_SECRET`)
  - `GOOGLE_REDIRECT_URI`
- The app checks Drive metadata to confirm you have edit access and will guide you if you don’t.

### 3) Document Import (.docx)
- Choose a `.docx` file
- Click **Import**
- The HTML preview updates
- Click **Download HTML** to download the converted file named after the original

 ## Security / Git
 Sensitive local files should never be committed:
 - `local-deployment/google_oauth_credentials.json`
 - `local-deployment/.google_tokens.json`

 They are expected to be ignored by `.gitignore`.

 ## Troubleshooting
 - If Google connection fails, verify OAuth consent + redirect URI in Google Cloud.
 - If the server port is in use, stop the other process using `30777`.

