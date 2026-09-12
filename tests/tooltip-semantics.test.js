import fs from 'node:fs';

import test from 'ava';

const semantics = JSON.parse(fs.readFileSync('semantics.json', 'utf8'));
const tooltipImages = semantics.find(field => field.name === 'tooltipImages');

test('tooltipImages is an optional structured list owned by the custom editor', t => {
  t.truthy(tooltipImages);
  t.is(tooltipImages.type, 'list');
  t.true(tooltipImages.optional);
  t.is(tooltipImages.widget, 'dragTextPapiJoTooltipImagesStore');
  t.is(tooltipImages.field.type, 'group');
  t.deepEqual(tooltipImages.field.fields.map(field => [field.name, field.type]), [
    ['id', 'text'], ['image', 'image'], ['alt', 'text']
  ]);
});

test('textField and library metadata select the dedicated editor helper', t => {
  const library = JSON.parse(fs.readFileSync('library.json', 'utf8'));
  const textField = semantics.find(field => field.name === 'textField');
  const dependency = library.editorDependencies.find(item =>
    item.machineName === 'H5PEditor.DragTextPapiJoTooltip'
  );

  t.is(textField.widget, 'dragTextPapiJoTooltip');
  t.deepEqual(dependency, {
    machineName: 'H5PEditor.DragTextPapiJoTooltip',
    majorVersion: 1,
    minorVersion: 0
  });
});

test('tooltip image semantics requires a lowercase UUID v4 and meaningful alt text', t => {
  const fields = Object.fromEntries(
    tooltipImages.field.fields.map(field => [field.name, field])
  );
  const idPattern = new RegExp(fields.id.regexp.pattern);
  const altPattern = new RegExp(fields.alt.regexp.pattern);

  t.true(idPattern.test('550e8400-e29b-41d4-a716-446655440000'));
  t.false(idPattern.test('550E8400-E29B-41D4-A716-446655440000'));
  t.false(idPattern.test('550e8400-e29b-11d4-a716-446655440000'));
  t.true(altPattern.test('Diagram'));
  t.false(altPattern.test('   '));
  t.false(fields.id.optional === true);
  t.false(fields.image.optional === true);
  t.false(fields.alt.optional === true);
});
