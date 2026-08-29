import fs from 'node:fs';

import test from 'ava';

import harness from './helpers/drag-drop-dom-harness.js';

const { DragText } = harness;
const semantics = JSON.parse(fs.readFileSync('semantics.json', 'utf8'));

const createTask = removeExtraLineBreaks => {
  const params = {
    distractors: '',
    textField: 'First line\n*answer*'
  };

  if (removeExtraLineBreaks !== undefined) {
    params.removeExtraLineBreaks = removeExtraLineBreaks;
  }

  return new DragText(params, 1, {});
};

test('removeExtraLineBreaks remains a hidden compatibility parameter', t => {
  const field = semantics.find(candidate => candidate.name === 'removeExtraLineBreaks');

  t.truthy(field);
  t.is(field.type, 'boolean');
  t.is(field.default, false);
  t.true(field.optional);
  t.is(field.widget, 'none');
});

test('legacy removeExtraLineBreaks true still removes authored newlines', t => {
  const task = createTask(true);

  t.is(task.textFieldHtml, 'First line*answer*');
});

test('legacy removeExtraLineBreaks false still converts authored newlines', t => {
  const task = createTask(false);

  t.is(task.textFieldHtml, 'First line<br />*answer*');
});

test('default-like content without removeExtraLineBreaks remains supported', t => {
  const task = createTask();

  t.is(task.params.removeExtraLineBreaks, undefined);
  t.is(task.textFieldHtml, 'First line<br />*answer*');
});

test('media semantics characterize the currently supported selector versions', t => {
  const options = semantics.find(field => field.name === 'media').fields
    .find(field => field.name === 'type').options;

  t.deepEqual(options, [
    'H5P.Image 1.1',
    'H5P.Video 1.6',
    'H5P.Audio 1.5'
  ]);
});
