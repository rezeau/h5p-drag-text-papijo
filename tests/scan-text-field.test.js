import test from 'ava';

import {
  analyzeTooltipReferences,
  getTooltipReferenceMarker,
  insertTooltipReference,
  prepareTooltipReferences,
  removeTooltipReferences,
  scanDragTextSources,
  scanTextField
} from '../src/scripts/scan-text-field';

const FIRST_ID = '550e8400-e29b-41d4-a716-446655440000';
const SECOND_ID = '6ba7b810-9dad-41d1-80b4-00c04fd430c8';

test('returns exact end-exclusive source ranges without rewriting text', t => {
  const source = 'Before *first answer* between *second* after';
  const result = scanTextField(source);

  t.is(result.source, source);
  t.deepEqual(result.gaps.map(gap => gap.outer), [
    { start: 7, end: 21 },
    { start: 30, end: 38 }
  ]);
  result.gaps.forEach(gap => t.is(source.slice(gap.outer.start, gap.outer.end), gap.raw));
});

test('escaped asterisks stay inside one real gap and escaped colons stay ordinary text', t => {
  const source = 'Maths: *2\\*3 and 12\\:3* done';
  const result = scanTextField(source);

  t.is(result.gaps.length, 1);
  t.is(result.gaps[0].raw, '*2\\*3 and 12\\:3*');
  t.is(result.gaps[0].tips.length, 0);
});

test('characterizes tips, alternatives, feedback, removable blocks and continuation syntax', t => {
  const source = '*_old_Hi/Hello::Less formal\\+Correct \\-Try again* then *-ending*';
  const result = scanTextField(source);
  const first = result.gaps[0];

  t.is(first.tips.length, 1);
  t.is(first.tips[0].content, 'Less formal');
  t.is(first.correctFeedback[0].content, 'Correct ');
  t.is(first.incorrectFeedback[0].content, 'Try again');
  t.is(first.removableBlocks[0].content, 'old');
  t.deepEqual(first.alternativeSeparators, [8]);
  t.is(first.runtime.text, 'Hi/Hello');
  t.true(result.gaps[1].runtime.isPartOfWord);
  t.is(result.gaps[1].runtime.text, 'ending');
});

test('keeps duplicate answer text as distinct positional records', t => {
  const source = '*same* and *same*';
  const result = scanTextField(source);

  t.is(result.gaps.length, 2);
  t.deepEqual(result.gaps.map(gap => gap.runtime.text), ['same', 'same']);
  t.notDeepEqual(result.gaps[0].outer, result.gaps[1].outer);
});

test('marks distractor expressions as ineligible tooltip targets', t => {
  const result = scanDragTextSources({
    distractors: '*wrong::ignored tip*',
    textField: '*right::real tip*'
  });

  t.true(result.textField.gaps[0].isTooltipTarget);
  t.false(result.distractors.gaps[0].isTooltipTarget);
  t.is(result.distractors.gaps[0].runtime.text, 'wrong');
  t.is(result.distractors.gaps[0].runtime.tip, 'ignored tip');
});

test('reports unclosed gaps and preserves the current multiple-tip characterization', t => {
  const unclosed = scanTextField('Before *answer::tip');
  const multiple = scanTextField('*answer::first\\+yes::second*');

  t.deepEqual(unclosed.diagnostics, [{
    code: 'unclosed-gap', range: { start: 7, end: 19 }
  }]);
  t.is(multiple.gaps[0].tips.length, 2);
  t.is(multiple.gaps[0].diagnostics[0].code, 'multiple-tooltip-segments');
  t.is(multiple.gaps[0].runtime.tip, 'first');
  t.is(multiple.gaps[0].runtime.text, 'answer::first::second');
});

test('inserts and removes the encoded comment marker without reconstructing source', t => {
  const source = 'Before *_old_Hi/Hello::Tip\\+Yes \\-No* after';
  const marker = getTooltipReferenceMarker(FIRST_ID);
  const inserted = insertTooltipReference(source, 0, FIRST_ID);

  t.is(inserted, `Before *_old_Hi/Hello::Tip\\+Yes \\-No${marker}* after`);
  t.is(removeTooltipReferences(inserted, 0), source);
});

test('a moved whole gap carries its stable reference', t => {
  const first = insertTooltipReference('*first* and *second*', 0, FIRST_ID);
  const firstGap = first.slice(0, first.indexOf(' and '));
  const moved = `*second* and ${firstGap}`;
  const result = scanTextField(moved);

  t.is(result.gaps[1].references[0].id, FIRST_ID);
  t.is(analyzeTooltipReferences(result)[1].status, 'valid');
});

test('reference syntax coexists with every metadata feature', t => {
  const marker = getTooltipReferenceMarker(FIRST_ID);
  const fixtures = [
    `*answer${marker}*`,
    `*answer::text${marker}*`,
    `*a/b${marker}*`,
    `*answer\\+yes \\-no${marker}*`,
    `*_old_answer${marker}*`,
    `*-ending${marker}*`,
    `*2\\*3 and 12\\:3${marker}*`
  ];

  fixtures.forEach(source => {
    const result = scanTextField(source);
    t.is(result.gaps.length, 1);
    t.is(result.gaps[0].references.length, 1);
    t.is(analyzeTooltipReferences(result)[0].status, 'valid');
  });
});

test('accepts the decoded runtime form but always emits the canonical encoded form', t => {
  const raw = `*answer<!--papijo-tip-ref:v1:${FIRST_ID}-->*`;
  const result = scanTextField(raw);

  t.is(result.gaps[0].references[0].encoding, 'raw');
  t.is(result.gaps[0].references[0].id, FIRST_ID);
  t.true(getTooltipReferenceMarker(FIRST_ID).startsWith('&lt;!--'));
});

test('fails closed for malformed, multiple and document-wide duplicate references', t => {
  const marker = getTooltipReferenceMarker(FIRST_ID);
  const other = getTooltipReferenceMarker(SECOND_ID);
  const malformed = scanTextField('*answer&lt;!--papijo-tip-ref:v1:not-a-uuid--&gt;*');
  const multiple = scanTextField(`*answer${marker}${other}*`);
  const duplicate = scanTextField(`*first${marker}* *second${marker}*`);

  t.is(analyzeTooltipReferences(malformed)[0].status, 'malformed');
  t.is(analyzeTooltipReferences(multiple)[0].status, 'ambiguous');
  t.deepEqual(analyzeTooltipReferences(duplicate).map(item => item.status), [
    'duplicate', 'duplicate'
  ]);
  t.throws(() => insertTooltipReference(`*answer${marker}*`, 0, SECOND_ID));
});

test('rejects non-v4 and non-lowercase reference ids', t => {
  t.throws(() => getTooltipReferenceMarker('550E8400-E29B-41D4-A716-446655440000'));
  t.throws(() => getTooltipReferenceMarker('550e8400-e29b-11d4-a716-446655440000'));
  t.throws(() => getTooltipReferenceMarker('not-an-id'));
});

test('JSON save and reopen preserves the marker byte-for-byte', t => {
  const textField = insertTooltipReference('*browser::Helpful text*', 0, FIRST_ID);
  const reopened = JSON.parse(JSON.stringify({ textField })).textField;

  t.is(reopened, textField);
  t.is(analyzeTooltipReferences(scanTextField(reopened))[0].id, FIRST_ID);
});

test('runtime preparation strips valid, malformed, duplicate and decoded markers losslessly', t => {
  const valid = getTooltipReferenceMarker(FIRST_ID);
  const malformed = '&lt;!--papijo-tip-ref:v1:not-a-uuid--&gt;';
  const raw = `<!--papijo-tip-ref:v1:${SECOND_ID}-->`;
  const source = `Before *one${valid}* *two${malformed}* *three${valid}* *four${raw}* after`;
  const prepared = prepareTooltipReferences(source);

  t.is(prepared.source, 'Before *one* *two* *three* *four* after');
  t.deepEqual(prepared.associations.map(item => item.status), [
    'duplicate', 'malformed', 'duplicate', 'valid'
  ]);
  t.is(prepared.associations[3].id, SECOND_ID);
});
