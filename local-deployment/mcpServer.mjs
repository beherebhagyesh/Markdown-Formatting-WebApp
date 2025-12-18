import { createRequire } from 'module';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const require = createRequire(import.meta.url);

const { processMarkdown } = require('./markdownProcessor');
const mammoth = require('mammoth');
const {
  clearTokens,
  getAuthUrl,
  getAuthedClient,
  getConnectionStatus,
} = require('./googleAuth');
const { getDriveFileAccess } = require('./googleDriveAccess');
const { cleanGoogleDocInPlace, extractGoogleDocId } = require('./googleDocsCleaner');

function asText(content) {
  return { type: 'text', text: typeof content === 'string' ? content : JSON.stringify(content, null, 2) };
}

function requireString(value, name) {
  if (typeof value !== 'string' || !value.trim()) {
    const err = new Error(`Missing required string: ${name}`);
    err.code = 'INVALID_INPUT';
    throw err;
  }
  return value;
}

function maybeString(value) {
  return typeof value === 'string' ? value : '';
}

function decodeBase64ToBuffer(b64) {
  const data = requireString(b64, 'docx_base64');
  return Buffer.from(data, 'base64');
}

const server = new Server(
  {
    name: 'markdown-formatting-app',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'format_markdown',
        description: 'Convert Markdown text to HTML using the app\'s formatter.',
        inputSchema: {
          type: 'object',
          properties: {
            markdown: { type: 'string' },
          },
          required: ['markdown'],
        },
      },
      {
        name: 'import_docx',
        description: 'Convert a .docx file (base64) to HTML using mammoth.',
        inputSchema: {
          type: 'object',
          properties: {
            docx_base64: { type: 'string', description: 'Base64 encoded .docx file bytes' },
            filename: { type: 'string', description: 'Optional original filename' },
          },
          required: ['docx_base64'],
        },
      },
      {
        name: 'google_status',
        description: 'Return Google OAuth connection status for this MCP server instance.',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'google_auth_url',
        description: 'Generate the Google OAuth URL. Open it in a browser to connect.',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'google_disconnect',
        description: 'Clear stored OAuth tokens for this MCP server instance.',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'google_clean_doc',
        description: 'Clean a Google Doc (in place) using the connected account. Requires prior OAuth connect.',
        inputSchema: {
          type: 'object',
          properties: {
            doc_url: { type: 'string' },
          },
          required: ['doc_url'],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const name = req.params.name;
  const args = req.params.arguments || {};

  try {
    if (name === 'format_markdown') {
      const markdown = requireString(args.markdown, 'markdown');
      const html = processMarkdown(markdown);
      return { content: [asText({ html })] };
    }

    if (name === 'import_docx') {
      const buffer = decodeBase64ToBuffer(args.docx_base64);
      const result = await mammoth.convertToHtml({ buffer });
      const html = result?.value || '';
      const messages = Array.isArray(result?.messages) ? result.messages : [];
      return {
        content: [
          asText({
            filename: maybeString(args.filename),
            html,
            warnings: messages.map((m) => m?.message).filter(Boolean),
          }),
        ],
      };
    }

    if (name === 'google_status') {
      return { content: [asText(getConnectionStatus())] };
    }

    if (name === 'google_auth_url') {
      const url = getAuthUrl();
      return { content: [asText({ url })] };
    }

    if (name === 'google_disconnect') {
      clearTokens();
      return { content: [asText({ ok: true })] };
    }

    if (name === 'google_clean_doc') {
      const docUrl = requireString(args.doc_url, 'doc_url');
      const documentId = extractGoogleDocId(docUrl);
      if (!documentId) {
        return { content: [asText({ ok: false, error: 'Invalid Google Doc link.' })] };
      }

      const authClient = await getAuthedClient();
      const access = await getDriveFileAccess({ authClient, fileId: documentId });
      if (!access.canEdit) {
        return {
          content: [
            asText({
              ok: false,
              code: 'NO_EDIT_ACCESS',
              error: 'No edit access to this document.',
              file: {
                id: access.id,
                name: access.name,
                canEdit: access.canEdit,
                canShare: access.canShare,
                ownedByMe: access.ownedByMe,
              },
              guidance:
                'In Google Docs: Share -> General access -> set to “Anyone with the link” and Role “Editor” (or add your account as Editor). After cleaning, lock it again if needed.',
            }),
          ],
        };
      }

      const result = await cleanGoogleDocInPlace({ authClient, documentId });
      return { content: [asText({ ok: true, documentId, result })] };
    }

    return { content: [asText({ ok: false, error: `Unknown tool: ${name}` })] };
  } catch (e) {
    return {
      content: [
        asText({
          ok: false,
          error: e?.message || String(e),
          code: e?.code || 'TOOL_ERROR',
        }),
      ],
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
