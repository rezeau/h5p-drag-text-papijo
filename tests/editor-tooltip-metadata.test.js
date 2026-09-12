import fs from 'node:fs';

import test from 'ava';

global.H5PEditor = {};
require('../editor/drag-text-papijo-tooltip-sanitizer');
require('../editor/drag-text-papijo-tooltip-model');

const model = H5PEditor.DragTextPapiJoTooltipModel;
const editorLibrary = JSON.parse(fs.readFileSync('editor/library.json', 'utf8'));
const semantics = JSON.parse(fs.readFileSync('semantics.json', 'utf8'));
const english = JSON.parse(fs.readFileSync('editor/language/en.json', 'utf8')).libraryStrings;
const french = JSON.parse(fs.readFileSync('editor/language/fr.json', 'utf8')).libraryStrings;

const placeholders = value => (value.match(/:[a-z]+/gi) || []).sort();

test('editor helper manifest contains only the minimum scripts, styles and languages', t => {
  t.is(editorLibrary.machineName, 'H5PEditor.DragTextPapiJoTooltip');
  t.deepEqual([
    editorLibrary.majorVersion,
    editorLibrary.minorVersion,
    editorLibrary.patchVersion,
    editorLibrary.runnable
  ], [1, 0, 0, 0]);
  t.deepEqual(editorLibrary.preloadedJs.map(item => item.path), [
    'drag-text-papijo-tooltip-sanitizer.js',
    'drag-text-papijo-tooltip-model.js',
    'drag-text-papijo-tooltip.js'
  ]);
  t.deepEqual(editorLibrary.preloadedCss, [{ path: 'drag-text-papijo-tooltip.css' }]);
});

test('English and French editor strings have identical keys and placeholders', t => {
  t.deepEqual(Object.keys(french).sort(), Object.keys(english).sort());
  Object.keys(english).forEach(key => {
    t.deepEqual(placeholders(french[key]), placeholders(english[key]), key);
  });
  t.is(english.tooltipImage, 'Tooltip image');
  t.is(french.tooltipImage, 'Image de l’infobulle');
  t.false(Object.values(english).some(value => /Managed tooltip \d/.test(value)));
  t.false(Object.values(french).some(value => /Infobulle gérée \d/.test(value)));
});

test('only the main textField uses tooltip controls and distractors remain ordinary text', t => {
  const textField = semantics.find(field => field.name === 'textField');
  const distractors = semantics.find(field => field.name === 'distractors');
  t.is(textField.widget, 'dragTextPapiJoTooltip');
  t.not(distractors.widget, 'dragTextPapiJoTooltip');
});

test('fallback UUID generation always produces canonical lowercase UUID v4 values', t => {
  for (let index = 0; index < 20; index++) {
    t.true(model.UUID_V4.test(model.createUuid()));
  }
});

test('editor source declares keyboard-native controls, labels and live warnings', t => {
  const source = fs.readFileSync('editor/drag-text-papijo-tooltip.js', 'utf8');
  t.true(source.includes("type: 'button'"));
  t.true(source.includes("'aria-label'"));
  t.true(source.includes("'aria-live': 'polite'"));
  t.true(source.includes("role: 'alert'"));
  t.false(source.includes(".on('mousedown"));
});
