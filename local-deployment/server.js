const express = require('express');
const path = require('path');
const multer = require('multer');
const mammoth = require('mammoth');

const {
  clearTokens,
  getAuthUrl,
  getAuthedClient,
  getConnectionStatus,
  handleOAuthCallback,
} = require('./googleAuth');
const { getDriveFileAccess } = require('./googleDriveAccess');
const { cleanGoogleDocInPlace, extractGoogleDocId } = require('./googleDocsCleaner');
const { processMarkdown } = require('./markdownProcessor');

const app = express();
const PORT = Number(process.env.PORT) || 30777;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function sanitizeBaseName(name) {
  return String(name || 'document')
    .replace(/\.[^./\\]+$/u, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120) || 'document';
}

app.post('/api/import/docx', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file uploaded.' });

    const originalName = file.originalname || 'document.docx';
    const ext = path.extname(originalName).toLowerCase();
    if (ext !== '.docx') {
      return res.status(400).json({ error: 'Only .docx is supported right now.' });
    }

    const result = await mammoth.convertToHtml({ buffer: file.buffer });
    const html = result?.value || '';
    const messages = Array.isArray(result?.messages) ? result.messages : [];

    return res.json({
      ok: true,
      filenameBase: sanitizeBaseName(originalName),
      html,
      warnings: messages.map((m) => m?.message).filter(Boolean),
    });
  } catch (e) {
    return res.status(500).json({ error: e?.message || 'Failed to convert document.' });
  }
});

app.get('/api/google/status', (req, res) => {
  return res.json(getConnectionStatus());
});

app.get('/auth/google', (req, res) => {
  try {
    const url = getAuthUrl();
    return res.redirect(url);
  } catch (e) {
    return res.status(500).send(e?.message || 'Failed to start Google OAuth');
  }
});

app.get('/auth/google/callback', async (req, res) => {
  try {
    const code = typeof req.query?.code === 'string' ? req.query.code : '';
    if (!code) return res.status(400).send('Missing OAuth code');
    await handleOAuthCallback(code);
    return res.redirect('/');
  } catch (e) {
    return res.status(500).send(e?.message || 'Google OAuth failed');
  }
});

app.post('/api/google/disconnect', (req, res) => {
  clearTokens();
  return res.json({ ok: true });
});

app.post('/api/google/clean-doc', async (req, res) => {
  try {
    const docUrl = typeof req.body?.docUrl === 'string' ? req.body.docUrl : '';
    const mode = typeof req.body?.mode === 'string' ? req.body.mode : 'in_place';

    if (mode !== 'in_place') {
      return res.status(400).json({ error: 'Only in_place is implemented for Google Docs right now.' });
    }

    const documentId = extractGoogleDocId(docUrl);
    if (!documentId) return res.status(400).json({ error: 'Invalid Google Doc link.' });

    const authClient = await getAuthedClient();

    const access = await getDriveFileAccess({ authClient, fileId: documentId });
    if (!access.canEdit) {
      return res.status(403).json({
        error: 'No edit access to this document. Ask the owner to grant edit access, then retry.',
        code: 'NO_EDIT_ACCESS',
        file: { id: access.id, name: access.name, canEdit: access.canEdit, canShare: access.canShare, ownedByMe: access.ownedByMe },
        guidance:
          'In Google Docs: Share -> General access -> set to “Anyone with the link” and Role “Editor” (or add your account as Editor). After cleaning, lock it again if needed.',
      });
    }

    const result = await cleanGoogleDocInPlace({ authClient, documentId });
    return res.json({ ok: true, documentId, result });
  } catch (e) {
    if (e?.code === 'MISSING_OAUTH_CONFIG') {
      return res.status(400).json({ error: e.message, code: e.code });
    }
    if (e?.code === 'NOT_AUTHED') {
      return res.status(401).json({ error: e.message, code: e.code });
    }
    const apiStatus = e?.response?.status;
    if (apiStatus === 404) {
      return res.status(404).json({
        error: 'Document not found or you do not have access to it.',
        code: 'DOC_NOT_FOUND',
      });
    }
    if (apiStatus === 403) {
      return res.status(403).json({
        error: 'Access denied by Google. Ensure you are connected with the right account and have edit access.',
        code: 'GOOGLE_FORBIDDEN',
      });
    }
    return res.status(500).json({ error: e?.message || 'Failed to clean Google Doc' });
  }
});

app.post('/format', (req, res) => {
  try {
    const text = typeof req.body?.text === 'string' ? req.body.text : '';
    if (!text.trim()) return res.status(400).json({ error: 'No text provided' });

    const html = processMarkdown(text);
    return res.json({ html });
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(PORT, () => {
  console.log('Server running on port:', PORT);
});
