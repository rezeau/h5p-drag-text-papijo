import { lex } from './parse-text';

const REFERENCE_NAME = 'papijo-tip-ref:v1:';
const ENCODED_REFERENCE_OPEN = `&lt;!--${REFERENCE_NAME}`;
const ENCODED_REFERENCE_CLOSE = '--&gt;';
const RAW_REFERENCE_OPEN = `<!--${REFERENCE_NAME}`;
const RAW_REFERENCE_CLOSE = '-->';
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const isEscapedAt = (source, index) => {
  let slashCount = 0;
  for (let position = index - 1; position >= 0 && source[position] === '\\'; position--) {
    slashCount++;
  }
  return slashCount % 2 === 1;
};

const range = (start, end) => ({ start, end });

const findMatches = (source, expression, offset) => Array.from(source.matchAll(expression))
  .map(match => ({
    content: match[1],
    range: range(offset + match.index, offset + match.index + match[0].length),
    raw: match[0]
  }));

const findReferences = (source, offset) => {
  const references = [];
  const formats = [
    { close: ENCODED_REFERENCE_CLOSE, encoding: 'entity', open: ENCODED_REFERENCE_OPEN },
    { close: RAW_REFERENCE_CLOSE, encoding: 'raw', open: RAW_REFERENCE_OPEN }
  ];

  formats.forEach(format => {
    let from = 0;
    while (from < source.length) {
      const start = source.indexOf(format.open, from);
      if (start === -1) {
        break;
      }
      const idStart = start + format.open.length;
      const close = source.indexOf(format.close, idStart);
      const end = close === -1 ? source.length : close + format.close.length;
      const id = close === -1 ? source.slice(idStart) : source.slice(idStart, close);
      const valid = close !== -1 && UUID_V4.test(id);
      references.push({
        encoding: format.encoding,
        id: valid ? id : null,
        rawId: id,
        range: range(offset + start, offset + end),
        raw: source.slice(start, end),
        reason: close === -1 ? 'unterminated-reference' :
          (valid ? null : 'invalid-reference-id'),
        valid
      });
      from = Math.max(end, start + format.open.length);
    }
  });

  return references.sort((left, right) => left.range.start - right.range.start);
};

const isInsideAny = (position, ranges) => ranges.some(candidate =>
  position >= candidate.start && position < candidate.end
);

const scanGap = (source, start, end, index, kind) => {
  const innerStart = start + 1;
  const innerEnd = end - 1;
  const inner = source.slice(innerStart, innerEnd);
  const references = findReferences(inner, innerStart);
  const tips = findMatches(inner, /::([^\\*]+)/g, innerStart);
  const correctFeedback = findMatches(inner, /\\\+([^\\*:]+)/g, innerStart);
  const incorrectFeedback = findMatches(inner, /\\-([^\\*:]+)/g, innerStart);
  const removableBlocks = findMatches(inner, /_([^\\*]+)_/g, innerStart);
  const occupiedRanges = [
    ...tips,
    ...correctFeedback,
    ...incorrectFeedback,
    ...removableBlocks,
    ...references
  ].map(item => item.range);
  const alternativeSeparators = [];

  for (let position = innerStart; position < innerEnd; position++) {
    if (source[position] === '/' && source[position - 1] !== '<' &&
        !isEscapedAt(source, position) && !isInsideAny(position, occupiedRanges)) {
      alternativeSeparators.push(position);
    }
  }

  const diagnostics = [];
  if (tips.length > 1) {
    diagnostics.push({ code: 'multiple-tooltip-segments', count: tips.length });
  }
  references.filter(reference => !reference.valid).forEach(reference => {
    diagnostics.push({ code: reference.reason, range: reference.range });
  });

  return {
    alternativeSeparators,
    correctFeedback,
    diagnostics,
    index,
    inner: range(innerStart, innerEnd),
    isTooltipTarget: kind === 'textField',
    kind,
    incorrectFeedback,
    outer: range(start, end),
    raw: source.slice(start, end),
    references,
    removableBlocks,
    runtime: lex(source.slice(start, end)),
    tips
  };
};

/**
 * Scan DragText source without changing it. All ranges use zero-based,
 * end-exclusive offsets into the original source string.
 *
 * @param {string} source DragText textField or distractors value.
 * @param {Object} [options]
 * @param {'textField'|'distractors'} [options.kind='textField'] Source role.
 * @returns {{diagnostics: Object[], gaps: Object[], kind: string, source: string}}
 */
const scanTextField = (source, options = {}) => {
  source = typeof source === 'string' ? source : '';
  const kind = options.kind === 'distractors' ? 'distractors' : 'textField';
  const gaps = [];
  const diagnostics = [];
  let open = null;

  for (let position = 0; position < source.length; position++) {
    if (source[position] !== '*' || isEscapedAt(source, position)) {
      continue;
    }
    if (open === null) {
      open = position;
      continue;
    }
    gaps.push(scanGap(source, open, position + 1, gaps.length, kind));
    open = null;
  }

  if (open !== null) {
    diagnostics.push({ code: 'unclosed-gap', range: range(open, source.length) });
  }

  return { diagnostics, gaps, kind, source };
};

const scanDragTextSources = ({ textField = '', distractors = '' } = {}) => ({
  distractors: scanTextField(distractors, { kind: 'distractors' }),
  textField: scanTextField(textField)
});

const getTooltipReferenceMarker = id => {
  if (!UUID_V4.test(id)) {
    throw new Error('Tooltip reference id must be a lowercase RFC 4122 UUID v4');
  }
  return `${ENCODED_REFERENCE_OPEN}${id}${ENCODED_REFERENCE_CLOSE}`;
};

/**
 * Prototype insertion helper. The scanner remains read-only; this helper
 * demonstrates that a marker can be inserted without reconstructing a gap.
 */
const insertTooltipReference = (source, gapIndex, id) => {
  const scan = scanTextField(source);
  const gap = scan.gaps[gapIndex];
  if (!gap) {
    throw new Error('Unknown gap index');
  }
  if (gap.references.length > 0) {
    throw new Error('Gap already contains a tooltip reference candidate');
  }
  const marker = getTooltipReferenceMarker(id);
  return source.slice(0, gap.inner.end) + marker + source.slice(gap.inner.end);
};

const removeTooltipReferences = (source, gapIndex) => {
  const scan = scanTextField(source);
  const gap = scan.gaps[gapIndex];
  if (!gap) {
    throw new Error('Unknown gap index');
  }
  return gap.references
    .slice()
    .sort((left, right) => right.range.start - left.range.start)
    .reduce((result, reference) =>
      result.slice(0, reference.range.start) + result.slice(reference.range.end), source
    );
};

/**
 * Resolve only unambiguous document-wide associations. Consumers must ignore
 * every malformed, multi-reference, or duplicated-id result.
 */
const analyzeTooltipReferences = scan => {
  const counts = Object.create(null);
  scan.gaps.forEach(gap => gap.references.forEach(reference => {
    if (reference.valid) {
      counts[reference.id] = (counts[reference.id] || 0) + 1;
    }
  }));

  return scan.gaps.map(gap => {
    if (gap.references.some(reference => !reference.valid)) {
      return { gapIndex: gap.index, id: null, status: 'malformed' };
    }
    if (gap.references.length === 0) {
      return { gapIndex: gap.index, id: null, status: 'missing' };
    }
    if (gap.references.length !== 1) {
      return { gapIndex: gap.index, id: null, status: 'ambiguous' };
    }
    const id = gap.references[0].id;
    if (counts[id] !== 1) {
      return { gapIndex: gap.index, id: null, status: 'duplicate' };
    }
    return { gapIndex: gap.index, id, status: 'valid' };
  });
};

const stripTooltipReferences = (source, scan = scanTextField(source)) => scan.gaps
  .flatMap(gap => gap.references)
  .sort((left, right) => right.range.start - left.range.start)
  .reduce((result, reference) =>
    result.slice(0, reference.range.start) + result.slice(reference.range.end), source
  );

const prepareTooltipReferences = (source, options = {}) => {
  const scan = scanTextField(source, options);
  return {
    associations: analyzeTooltipReferences(scan),
    diagnostics: scan.diagnostics.concat(
      scan.gaps.flatMap(gap => gap.diagnostics)
    ),
    source: stripTooltipReferences(scan.source, scan)
  };
};

export {
  analyzeTooltipReferences,
  getTooltipReferenceMarker,
  insertTooltipReference,
  prepareTooltipReferences,
  removeTooltipReferences,
  scanDragTextSources,
  scanTextField,
  stripTooltipReferences
};
