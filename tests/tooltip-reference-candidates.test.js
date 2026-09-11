import test from 'ava';

import { lex } from '../src/scripts/parse-text';
import {
  getTooltipReferenceMarker,
  insertTooltipReference,
  scanTextField
} from '../src/scripts/scan-text-field';

const ID = '550e8400-e29b-41d4-a716-446655440000';

test('plain bracket marker is parser-safe but remains visible answer text in the old runtime', t => {
  const marker = `[[papijo-tip-ref:v1:${ID}]]`;
  const result = lex(`*answer${marker}*`);

  t.is(result.text, `answer${marker}`);
  t.true(result.text.includes('[[papijo-tip-ref'));
});

test('encoded comment marker becomes inert HTML under the old runtime decoding step', t => {
  const marker = getTooltipReferenceMarker(ID);
  const authored = `*answer${marker}*`;
  const runtimeDecoded = authored.replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  const result = lex(runtimeDecoded);

  t.is(result.text, `answer<!--papijo-tip-ref:v1:${ID}-->`);
  t.regex(result.text, /^answer<!--papijo-tip-ref:v1:[0-9a-f-]+-->$/);
});

test('detached gap-index mapping follows the slot instead of a moved gap', t => {
  const original = '*first* then *second*';
  const detachedMapping = { gapIndex: 0, id: ID };
  const moved = '*second* then *first*';

  t.is(scanTextField(original).gaps[detachedMapping.gapIndex].runtime.text, 'first');
  t.is(scanTextField(moved).gaps[detachedMapping.gapIndex].runtime.text, 'second');
});

test('inline comment reference follows a moved whole expression instead of its old slot', t => {
  const marked = insertTooltipReference('*first* then *second*', 0, ID);
  const separator = marked.indexOf(' then ');
  const moved = `${marked.slice(separator + 6)} then ${marked.slice(0, separator)}`;
  const result = scanTextField(moved);

  t.is(result.gaps[0].runtime.text, 'second');
  t.is(result.gaps[0].references.length, 0);
  t.is(result.gaps[1].runtime.text.startsWith('first'), true);
  t.is(result.gaps[1].references[0].id, ID);
});
