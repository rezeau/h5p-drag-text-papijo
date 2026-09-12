(function (H5PEditor) {
  'use strict';

  var ALLOWED_TAGS = ['em', 'strong', 'sup', 'sub', 's', 'br'];
  var DROP_WITH_CONTENT = [
    'script', 'style', 'template', 'iframe', 'object', 'embed',
    'svg', 'math', 'noscript'
  ];

  function escapeText(value) {
    return value
      .replace(/&(?!(?:amp|lt|gt|quot|#39|#[0-9]+|#x[0-9a-f]+);)/gi, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function removeDangerousBlocks(value) {
    var result = value;
    DROP_WITH_CONTENT.forEach(function (tag) {
      var paired = new RegExp('<' + tag + '\\b[^>]*>[\\s\\S]*?<\\/' + tag + '\\s*>', 'gi');
      var single = new RegExp('<\\/?' + tag + '\\b[^>]*>', 'gi');
      result = result.replace(paired, '').replace(single, '');
    });
    return result;
  }

  function sanitize(value) {
    value = removeDangerousBlocks(typeof value === 'string' ? value : '');
    var tokens = value.match(/<[^>]*>|[^<]+|</g) || [];
    return tokens.map(function (token) {
      if (token.charAt(0) !== '<') {
        return escapeText(token);
      }
      var match = token.match(/^<\s*(\/?)\s*(em|strong|sup|sub|s|br)\b[^>]*>$/i);
      if (!match) {
        return '';
      }
      var closing = match[1] === '/';
      var tag = match[2].toLowerCase();
      if (tag === 'br') {
        return closing ? '' : '<br>';
      }
      return closing ? '</' + tag + '>' : '<' + tag + '>';
    }).join('');
  }

  function textContent(value) {
    return sanitize(value)
      .replace(/<br>/g, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&');
  }

  H5PEditor.DragTextPapiJoTooltipSanitizer = {
    allowedTags: ALLOWED_TAGS.slice(),
    sanitize: sanitize,
    textContent: textContent,
    toAuthoringText: sanitize
  };
})(H5PEditor);
