import { sanitizeTooltipText, tooltipTextContent } from './tooltip-sanitizer';

const buildStructuredTooltip = (tooltip, doc = document) => {
  tooltip = tooltip || {};
  const text = sanitizeTooltipText(tooltip.text);
  const plainText = tooltipTextContent(text).trim();
  const image = tooltip.image && typeof tooltip.image.src === 'string' &&
    tooltip.image.src !== '' && typeof tooltip.image.alt === 'string' &&
    tooltip.image.alt.trim() !== '' ? tooltip.image : null;

  if (plainText === '' && !image) {
    return null;
  }

  const container = doc.createElement('div');
  container.className = 'papijo-structured-tooltip';
  if (plainText !== '') {
    const textElement = doc.createElement('div');
    textElement.className = 'papijo-structured-tooltip-text';
    textElement.innerHTML = text;
    container.appendChild(textElement);
  }
  if (image) {
    const imageElement = doc.createElement('img');
    imageElement.className = 'papijo-structured-tooltip-image';
    imageElement.src = image.src;
    imageElement.alt = image.alt.trim();
    container.appendChild(imageElement);
  }

  return {
    hasImage: Boolean(image),
    html: container.outerHTML,
    text: plainText || image.alt.trim()
  };
};

export default buildStructuredTooltip;
