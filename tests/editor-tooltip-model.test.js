import test from 'ava';

import { scanTextField } from '../src/scripts/scan-text-field';
import {
  sanitizeTooltipText,
  tooltipTextContent
} from '../src/scripts/tooltip-sanitizer';
import harness from './helpers/drag-drop-dom-harness';

global.H5PEditor = {};
require('../editor/drag-text-papijo-tooltip-sanitizer');
require('../editor/drag-text-papijo-tooltip-model');

const model = H5PEditor.DragTextPapiJoTooltipModel;
const ID = '550e8400-e29b-41d4-a716-446655440000';
const SECOND_ID = '6ba7b810-9dad-41d1-80b4-00c04fd430c8';
const marker = model.getMarker(ID);
const image = { path: 'images/one.png', mime: 'image/png', width: 640 };

const apply = options => model.applyTooltip(Object.assign({
  definitions: [],
  idFactory: () => ID
}, options));

test('editor sanitizer stays in lockstep with the runtime sanitizer', t => {
  const fixtures = [
    'Plain & already &amp; encoded',
    '<em title="removed">Emphasis</em><br><strong>Strong</strong>',
    '<script>alert(1)</script><img src=x onerror=alert(2)>Safe',
    '<svg><script>alert(3)</script></svg><sup>2</sup>',
    '<unknown>Text</unknown><sub>n</sub>'
  ];

  fixtures.forEach(value => {
    t.is(
      H5PEditor.DragTextPapiJoTooltipSanitizer.sanitize(value),
      sanitizeTooltipText(value)
    );
    t.is(
      H5PEditor.DragTextPapiJoTooltipSanitizer.textContent(value),
      tooltipTextContent(value)
    );
  });
});

test('editor gap discovery preserves Phase 2B ranges and source order', t => {
  const fixtures = [
    'Before *one* after',
    '*_old_Hi/Hello::Tip\\+Yes \\-No* and *-ending*',
    '*2\\*3 and 12\\:3*',
    `*same${marker}* and *same*`
  ];
  fixtures.forEach(source => {
    const production = scanTextField(source);
    const editor = model.scan(source);
    t.deepEqual(editor.gaps.map(gap => gap.outer), production.gaps.map(gap => gap.outer));
    t.deepEqual(editor.gaps.map(gap => gap.inner), production.gaps.map(gap => gap.inner));
  });
});

test('discovers existing text, alternatives, feedback, removable blocks and continuation syntax', t => {
  const result = model.analyze(
    '*_old_Hi/Hello::Less formal\\+Correct \\-No* then *-ending*', []
  );
  t.is(result.gaps[0].tips[0].content, 'Less formal');
  t.is(result.gaps[0].preview, 'Hi/Hello');
  t.is(result.gaps[0].tooltipState, 'text');
  t.is(result.gaps[1].preview, 'ending');
});

test('adds, edits and removes text with exact range replacements', t => {
  const original = 'Before *_old_Hi/Hello\\:there\\+Yes \\-No* after';
  const added = apply({ source: original, gapIndex: 0, text: 'Helpful <em>tip</em>' });
  t.true(added.valid);
  t.is(added.source,
    'Before *_old_Hi/Hello\\:there::Helpful <em>tip</em>\\+Yes \\-No* after');

  const edited = apply({
    source: added.source, gapIndex: 0, text: 'Changed <strong onclick="x">tip</strong>'
  });
  t.is(edited.source,
    'Before *_old_Hi/Hello\\:there::Changed <strong>tip</strong>\\+Yes \\-No* after');

  const removed = apply({ source: edited.source, gapIndex: 0, text: '' });
  t.is(removed.source, original);
});

test('creates image-only and combined tooltips with stable UUID and cloned image metadata', t => {
  const originalImage = Object.assign({}, image);
  const imageOnly = apply({
    source: '*answer*', gapIndex: 0, image: originalImage, alt: 'Diagram'
  });
  t.is(imageOnly.source, `*answer${marker}*`);
  t.deepEqual(imageOnly.definitions, [{ id: ID, image, alt: 'Diagram' }]);
  originalImage.width = 1;
  t.is(imageOnly.definitions[0].image.width, 640);

  const combined = apply({
    source: imageOnly.source,
    definitions: imageOnly.definitions,
    gapIndex: 0,
    text: 'Read this',
    image: { path: 'images/two.png', copyright: { author: 'Author' } },
    alt: 'Replacement'
  });
  t.is(combined.id, ID);
  t.is((combined.source.match(/papijo-tip-ref/g) || []).length, 1);
  t.is(combined.source, `*answer::Read this${marker}*`);
  t.is(combined.definitions[0].image.path, 'images/two.png');
});

test('image removal keeps text, removes marker and deletes only its unique definition', t => {
  const result = apply({
    source: `*answer::Text${marker}*`,
    definitions: [{ id: ID, image, alt: 'Diagram' }],
    gapIndex: 0,
    text: 'Text'
  });
  t.is(result.source, '*answer::Text*');
  t.deepEqual(result.definitions, []);
});

test('requires nonblank alt and rejects malformed, duplicate and ambiguous associations', t => {
  t.is(apply({ source: '*answer*', gapIndex: 0, text: '' }).reason, 'tooltip-required');
  t.is(apply({
    source: '*answer*', gapIndex: 0, image, alt: '   '
  }).reason, 'alt-required');
  t.is(apply({
    source: `*one${marker}* *two${marker}*`, gapIndex: 0, image, alt: 'Alt'
  }).reason, 'ambiguous-gap');
  t.is(apply({
    source: '*one&lt;!--papijo-tip-ref:v1:bad--&gt;*', gapIndex: 0, image, alt: 'Alt'
  }).reason, 'ambiguous-gap');
});

test('missing definitions can be repaired while duplicate definitions remain fail closed', t => {
  const missing = apply({
    source: `*answer::Text${marker}*`, gapIndex: 0, image, alt: 'Restored'
  });
  t.true(missing.valid);
  t.is(missing.id, ID);
  t.is(missing.definitions[0].alt, 'Restored');

  const duplicated = [
    { id: ID, image, alt: 'One' },
    { id: ID, image: { path: 'images/two.png' }, alt: 'Two' }
  ];
  t.is(apply({
    source: `*answer${marker}*`, definitions: duplicated,
    gapIndex: 0, image, alt: 'Changed'
  }).reason, 'ambiguous-gap');
  t.is(model.removeTooltip({
    source: `*answer${marker}*`, definitions: duplicated, gapIndex: 0
  }).reason, 'ambiguous-gap');
});

test('duplicate visible answers remain independently editable', t => {
  const first = apply({ source: '*same* and *same*', gapIndex: 0, image, alt: 'First' });
  const second = model.applyTooltip({
    source: first.source,
    definitions: first.definitions,
    gapIndex: 1,
    image: { path: 'images/two.png' },
    alt: 'Second',
    idFactory: () => SECOND_ID
  });
  t.deepEqual(model.analyze(second.source, second.definitions).gaps.map(gap =>
    gap.definition.alt
  ), ['First', 'Second']);
});

test('source projection hides markers and is byte-for-byte reversible', t => {
  const source = `Before *one${marker}* and *two${model.getMarker(SECOND_ID)}* after`;
  const projected = model.projectSource(source, 'Tooltip image');
  const visible = projected.display.replace(/\u2063/g, '');
  t.false(projected.display.includes('papijo-tip-ref'));
  t.is((visible.match(/⟦Tooltip image⟧/g) || []).length, 2);
  t.false(visible.includes('Managed tooltip'));
  t.notRegex(visible, /Tooltip image\s+\d/);
  t.is(model.restoreSource(projected.display, projected.mappings), source);
  const reversedDefinitions = [
    { id: SECOND_ID, image: { path: 'images/two.png' }, alt: 'Second' },
    { id: ID, image, alt: 'First' }
  ];
  t.deepEqual(model.analyze(source, reversedDefinitions).gaps.map(gap =>
    gap.definition.id
  ), [ID, SECOND_ID]);
});

test('moving, deleting and duplicating a projected whole gap is deterministic and fail closed', t => {
  const source = `*one${marker}* then *two*`;
  const projection = model.projectSource(source, 'Tooltip image');
  const parts = projection.display.split(' then ');
  const moved = model.restoreSource(parts[1] + ' then ' + parts[0], projection.mappings);
  t.is(model.analyze(moved, [{ id: ID, image, alt: 'One' }]).gaps[1].association.id, ID);

  const deleted = model.restoreSource(parts[1], projection.mappings);
  t.is(model.analyze(deleted, [{ id: ID, image, alt: 'One' }]).orphans.length, 1);

  const duplicated = model.restoreSource(parts[0] + ' then ' + parts[0], projection.mappings);
  t.deepEqual(model.analyze(duplicated, [{ id: ID, image, alt: 'One' }]).gaps
    .map(gap => gap.association.status), ['duplicate', 'duplicate']);
});

test('manual gap insertion does not move an existing UUID association', t => {
  const source = `*one${marker}* then *two*`;
  const inserted = '*new* before ' + source;
  const gaps = model.analyze(inserted, [{ id: ID, image, alt: 'One' }]).gaps;
  t.deepEqual(gaps.map(gap => gap.association.id), [null, ID, null]);
});

test('orphan reconciliation waits for a safe validation boundary', t => {
  const definitions = [{ id: ID, image, alt: 'One' }];
  t.deepEqual(model.reconcileOrphans('*unclosed', definitions), definitions);
  t.deepEqual(model.reconcileOrphans('*answer*', definitions), []);
});

test('legacy URL and base64 tips are preserved unless explicitly replaced', t => {
  [
    '*answer::\u200B<img src="https://example.com/a.png">*',
    '*answer::\u200B<img src="data:image/png;base64,AA==">*'
  ].forEach(source => {
    const text = model.scan(source).gaps[0].tips[0].content;
    const unchanged = apply({ source, gapIndex: 0, text });
    t.is(unchanged.source, source);
  });

  const legacy = '*answer::Text <img src="https://example.com/a.png">*';
  t.is(apply({
    source: legacy, gapIndex: 0, text: 'Text', image, alt: 'Alt'
  }).reason, 'legacy-replacement-required');
  const replaced = apply({
    source: legacy,
    gapIndex: 0,
    text: 'Text <img src="https://example.com/a.png">',
    image,
    alt: 'Alt',
    replaceLegacy: true
  });
  t.is(replaced.source, `*answer::Text${marker}*`);
});

test('a saved editor result is consumed by the Phase 2C runtime without marker leakage', t => {
  const authored = apply({
    source: '*answer*', gapIndex: 0, text: 'Help', image, alt: 'Diagram'
  });
  H5P.getPath = (path, contentId) => `/content/${contentId}/${path}`;
  const task = new harness.DragText({
    textField: authored.source,
    tooltipImages: authored.definitions,
    distractors: ''
  }, 41, {});
  t.is(task.draggables[0].getAnswerText(), 'answer');
  t.deepEqual(task.droppables[0].structuredTooltip, {
    image: { alt: 'Diagram', src: '/content/41/images/one.png' },
    text: 'Help'
  });
  t.false(JSON.stringify(task.getxAPIDefinition()).includes('papijo-tip-ref'));
});
