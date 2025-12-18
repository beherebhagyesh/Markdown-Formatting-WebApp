function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatHeadings(line) {
  const text = line.trimEnd();
  const headingLevels = [
    { prefix: '####', tag: 'h4' },
    { prefix: '###', tag: 'h3' },
    { prefix: '##', tag: 'h2' },
    { prefix: '#', tag: 'h1' },
  ];

  for (const level of headingLevels) {
    if (text.startsWith(level.prefix + ' ')) {
      const content = text.slice(level.prefix.length + 1).trim();
      if (content) {
        return `<${level.tag}>${formatInlineStyles(escapeHtml(content))}</${level.tag}>`;
      }
      return '';
    }
  }
  return line;
}

function formatUnorderedListItem(line) {
  const match = line.match(/^\s*([*\-+])\s+(.*)$/);
  if (!match) return null;
  const content = match[2].trimEnd();
  return `<li>${formatInlineStyles(escapeHtml(content))}</li>`;
}

function formatInlineStyles(text) {
  // The input should already be HTML-escaped.
  let out = text;

  // Order matters: code first to avoid formatting inside inline code.
  out = out.replace(/`([^`]+?)`/g, '<code>$1</code>');
  out = out.replace(/~~(.+?)~~/g, '<del>$1</del>');
  out = out.replace(/(\*\*|__)(.+?)\1/g, '<strong>$2</strong>');
  out = out.replace(/\*([^*]+?)\*/g, '<em>$1</em>');
  out = out.replace(/_([^_]+?)_/g, '<em>$1</em>');

  return out;
}

function processMarkdown(text) {
  const lines = String(text).replace(/\r\n/g, '\n').split('\n');
  const processed = [];
  let inList = false;

  for (const rawLine of lines) {
    const line = rawLine ?? '';

    if (!line.trim()) {
      if (inList) {
        processed.push('</ul>');
        inList = false;
      }
      processed.push('<br>');
      continue;
    }

    const listItem = formatUnorderedListItem(line);
    if (listItem) {
      if (!inList) {
        processed.push('<ul>');
        inList = true;
      }
      processed.push(listItem);
      continue;
    }

    if (inList) {
      processed.push('</ul>');
      inList = false;
    }

    const heading = formatHeadings(line);
    if (heading !== line) {
      if (heading) processed.push(heading);
      continue;
    }

    processed.push(`<p>${formatInlineStyles(escapeHtml(line.trimEnd()))}</p>`);
  }

  if (inList) processed.push('</ul>');
  return processed.join('\n');
}

module.exports = {
  processMarkdown,
  formatHeadings,
  formatInlineStyles,
};
