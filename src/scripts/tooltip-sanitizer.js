const ALLOWED_TAGS = ['em', 'strong', 'sup', 'sub', 's', 'br'];
const DROP_WITH_CONTENT = [
  'script', 'style', 'template', 'iframe', 'object', 'embed',
  'svg', 'math', 'noscript'
];

const escapeText = value => value
  .replace(/&(?!(?:amp|lt|gt|quot|#39|#[0-9]+|#x[0-9a-f]+);)/gi, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

const removeDangerousBlocks = value => {
  let result = value;
  DROP_WITH_CONTENT.forEach(tag => {
    const paired = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, 'gi');
    const single = new RegExp(`<\\/?${tag}\\b[^>]*>`, 'gi');
    result = result.replace(paired, '').replace(single, '');
  });
  return result;
};

const sanitizeTooltipText = value => {
  value = removeDangerousBlocks(typeof value === 'string' ? value : '');
  const tokens = value.match(/<[^>]*>|[^<]+|</g) || [];
  return tokens.map(token => {
    if (token[0] !== '<') {
      return escapeText(token);
    }
    const match = token.match(/^<\s*(\/?)\s*(em|strong|sup|sub|s|br)\b[^>]*>$/i);
    if (!match) {
      return '';
    }
    const closing = match[1] === '/';
    const tag = match[2].toLowerCase();
    if (tag === 'br') {
      return closing ? '' : '<br>';
    }
    return closing ? `</${tag}>` : `<${tag}>`;
  }).join('');
};

const tooltipTextContent = value => sanitizeTooltipText(value)
  .replace(/<br>/g, '\n')
  .replace(/<[^>]+>/g, '')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")
  .replace(/&amp;/g, '&');

export { ALLOWED_TAGS, sanitizeTooltipText, tooltipTextContent };
