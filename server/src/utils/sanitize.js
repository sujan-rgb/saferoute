import sanitizeHtml from 'sanitize-html';

// Reports are stored as PLAIN TEXT. Strip any markup, drop control characters, collapse whitespace.
// The UI must still escape on output (React does by default); never render this with dangerouslySetInnerHTML.
export function cleanText(input) {
  return sanitizeHtml(String(input), { allowedTags: [], allowedAttributes: {} })
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
