const { google } = require('googleapis');

function extractGoogleDocId(input) {
  if (!input) return null;
  const s = String(input).trim();

  const m1 = s.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
  if (m1) return m1[1];

  const m2 = s.match(/^[a-zA-Z0-9_-]{20,}$/);
  if (m2) return s;

  return null;
}

function buildDeleteRange(startIndex, endIndexExclusive) {
  return {
    deleteContentRange: {
      range: {
        startIndex,
        endIndex: endIndexExclusive,
      },
    },
  };
}

function buildUpdateTextStyle(startIndex, endIndexExclusive, textStyle) {
  const fields = Object.keys(textStyle).join(',');
  return {
    updateTextStyle: {
      range: {
        startIndex,
        endIndex: endIndexExclusive,
      },
      textStyle,
      fields: fields || '*',
    },
  };
}

function buildUpdateParagraphStyle(startIndex, endIndexExclusive, paragraphStyle, fields) {
  return {
    updateParagraphStyle: {
      range: {
        startIndex,
        endIndex: endIndexExclusive,
      },
      paragraphStyle,
      fields,
    },
  };
}

function buildCreateBullets(startIndex, endIndexExclusive) {
  return {
    createParagraphBullets: {
      range: {
        startIndex,
        endIndex: endIndexExclusive,
      },
      bulletPreset: 'BULLET_DISC_CIRCLE_SQUARE',
    },
  };
}

function getParagraphTextAndRange(paragraph) {
  const elements = paragraph?.elements || [];
  let text = '';
  let startIndex = null;
  let endIndex = null;

  for (const el of elements) {
    const tr = el.textRun;
    if (!tr || typeof tr.content !== 'string') continue;
    if (startIndex == null) startIndex = el.startIndex;
    text += tr.content;
    endIndex = el.endIndex;
  }

  if (startIndex == null || endIndex == null) return null;
  return { text, startIndex, endIndex };
}

function computeHeadingInfo(line) {
  const trimmed = line.replace(/\t/g, '    ');
  const levels = [
    { prefix: '#### ', namedStyleType: 'HEADING_4', removeLen: 5 },
    { prefix: '### ', namedStyleType: 'HEADING_3', removeLen: 4 },
    { prefix: '## ', namedStyleType: 'HEADING_2', removeLen: 3 },
    { prefix: '# ', namedStyleType: 'HEADING_1', removeLen: 2 },
  ];

  for (const lvl of levels) {
    if (trimmed.startsWith(lvl.prefix)) return lvl;
  }

  return null;
}

function computeListInfo(line) {
  const m = line.match(/^\s*([*\-+])\s+/);
  if (!m) return null;
  return { removeLen: m[0].length };
}

function applyInlineMarkdownRequests(text, baseStartIndex) {
  const requests = [];

  const patterns = [
    { type: 'code', open: '`', close: '`', re: /`([^`]+?)`/g, style: { weightedFontFamily: { fontFamily: 'Consolas' }, backgroundColor: { color: { rgbColor: { red: 0.95, green: 0.95, blue: 0.95 } } } } },
    { type: 'strike', open: '~~', close: '~~', re: /~~(.+?)~~/g, style: { strikethrough: true } },
    { type: 'bold', open: '**', close: '**', re: /\*\*(.+?)\*\*/g, style: { bold: true } },
    { type: 'bold', open: '__', close: '__', re: /__(.+?)__/g, style: { bold: true } },
    { type: 'italic', open: '*', close: '*', re: /\*([^*\n]+?)\*/g, style: { italic: true } },
    { type: 'italic', open: '_', close: '_', re: /_([^_\n]+?)_/g, style: { italic: true } },
  ];

  for (const p of patterns) {
    const matches = [];
    let m;
    while ((m = p.re.exec(text)) !== null) {
      matches.push({ start: m.index, full: m[0], inner: m[1] });
    }

    for (let i = matches.length - 1; i >= 0; i--) {
      const cur = matches[i];
      const openLen = p.open.length;
      const closeLen = p.close.length;

      const start = baseStartIndex + cur.start;
      const endExclusive = baseStartIndex + cur.start + cur.full.length;

      const closeStart = endExclusive - closeLen;
      requests.push(buildDeleteRange(closeStart, endExclusive));
      requests.push(buildDeleteRange(start, start + openLen));

      const styledStart = start;
      const styledEnd = endExclusive - openLen - closeLen;
      if (styledEnd > styledStart) {
        requests.push(buildUpdateTextStyle(styledStart, styledEnd, p.style));
      }

      text = text.slice(0, cur.start) + cur.inner + text.slice(cur.start + cur.full.length);
    }
  }

  return requests;
}

function buildParagraphCleanupRequests(paragraph) {
  const info = getParagraphTextAndRange(paragraph);
  if (!info) return [];

  const raw = info.text;
  const line = raw.replace(/\n/g, '');

  const requests = [];

  const heading = computeHeadingInfo(line);
  const list = !heading ? computeListInfo(line) : null;

  const paragraphStart = info.startIndex;
  const paragraphEnd = info.endIndex;

  if (heading) {
    requests.push(buildDeleteRange(paragraphStart, paragraphStart + heading.removeLen));
    requests.push(buildUpdateParagraphStyle(paragraphStart, paragraphEnd, { namedStyleType: heading.namedStyleType }, 'namedStyleType'));
    const afterRemove = line.slice(heading.removeLen);
    requests.push(...applyInlineMarkdownRequests(afterRemove, paragraphStart));
    return requests;
  }

  if (list) {
    requests.push(buildDeleteRange(paragraphStart, paragraphStart + list.removeLen));
    requests.push(buildCreateBullets(paragraphStart, paragraphEnd));
    const afterRemove = line.slice(list.removeLen);
    requests.push(...applyInlineMarkdownRequests(afterRemove, paragraphStart));
    return requests;
  }

  requests.push(...applyInlineMarkdownRequests(line, paragraphStart));
  return requests;
}

async function cleanGoogleDocInPlace({ authClient, documentId }) {
  const docs = google.docs({ version: 'v1', auth: authClient });

  const doc = await docs.documents.get({ documentId });
  const content = doc.data?.body?.content || [];

  const requests = [];
  for (const item of content) {
    const paragraph = item.paragraph;
    if (!paragraph) continue;
    requests.push(...buildParagraphCleanupRequests(paragraph));
  }

  if (requests.length === 0) {
    return { updated: false, requestCount: 0, chunks: 0 };
  }

  const chunkSize = 450;
  let chunks = 0;
  for (let i = 0; i < requests.length; i += chunkSize) {
    const chunk = requests.slice(i, i + chunkSize);
    await docs.documents.batchUpdate({
      documentId,
      requestBody: { requests: chunk },
    });
    chunks += 1;
  }

  return { updated: true, requestCount: requests.length, chunks };
}

module.exports = {
  cleanGoogleDocInPlace,
  extractGoogleDocId,
};
