import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';

import test from 'ava';

class Element {
  constructor(tag, attributes = {}) {
    this.tag = tag;
    this.attributes = Object.assign({}, attributes);
    this.children = [];
    this.events = {};
    this.parentElement = null;
    this.value = tag === 'input' && attributes.value !== undefined ?
      String(attributes.value) : '';
  }
}

class Query {
  constructor(elements = []) {
    this.elements = elements;
    this.length = elements.length;
  }

  append(...items) {
    items.flatMap(item => item instanceof Query ? item.elements : [])
      .forEach(child => {
        const parent = this.elements[0];
        child.parentElement = parent;
        parent.children.push(child);
      });
    return this;
  }

  appendTo(target) { target.append(this); return this; }
  children() { return new Query(this.elements[0] ? this.elements[0].children : []); }
  empty() { if (this.elements[0]) { this.elements[0].children = []; } return this; }
  eq(index) { return new Query(this.elements[index] ? [this.elements[index]] : []); }
  find() { return new Query([]); }
  first() { return this.eq(0); }
  html() { return this; }
  insertBefore() { return this; }
  off() { return this; }
  on(name, handler) { if (this.elements[0]) { this.elements[0].events[name] = handler; } return this; }
  parent() { return new Query(this.elements[0]?.parentElement ? [this.elements[0].parentElement] : []); }
  prependTo(target) { target.elements[0]?.children.unshift(...this.elements); return this; }
  prop(name, value) {
    if (value === undefined) {
      return this.elements[0]?.[name];
    }
    if (this.elements[0]) {
      this.elements[0][name] = value;
    }
    return this;
  }
  remove() { return this; }
  text(value) { if (this.elements[0]) { this.elements[0].text = value; } return this; }
  toggleClass() { return this; }
  trigger(name) {
    if (this.elements[0]) {
      Object.keys(this.elements[0].events)
        .filter(eventName => eventName.split('.')[0] === name)
        .forEach(eventName => this.elements[0].events[eventName]({
          preventDefault() {}
        }));
    }
    return this;
  }
  val(value) {
    if (value === undefined) {
      return this.elements[0]?.value || '';
    }
    if (this.elements[0]) {
      this.elements[0].value = String(value);
    }
    return this;
  }
}

const $ = (markup, attributes = {}) => {
  const tag = typeof markup === 'string' ?
    (markup.match(/^<([a-z0-9]+)/i)?.[1] || 'div').toLowerCase() : 'div';
  const query = new Query([new Element(tag, attributes)]);
  if (attributes.text !== undefined) {
    query.text(attributes.text);
  }
  return query;
};

const decodeEntities = value => String(value || '')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")
  .replace(/&amp;/g, '&');

const encodeEntities = value => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const createdImageWidgets = [];
global.document = {
  createElement(tag) {
    if (tag !== 'textarea') {
      return new Element(tag);
    }
    return {
      set innerHTML(value) { this.value = decodeEntities(value); },
      value: ''
    };
  }
};
global.H5PEditor = {
  $,
  Textarea: function (parent, field, params, setValue) {
    this.parent = parent;
    this.field = field;
    this.value = params;
    this.setValue = setValue;
  },
  createError: value => value,
  htmlspecialchars: encodeEntities,
  t: (_library, key, replacements = {}) => Object.keys(replacements).reduce(
    (value, token) => value.replace(token, replacements[token]),
    key === 'gapLabel' ? 'Gap :index' :
      (key === 'tooltipImage' ? 'Tooltip image' : key)
  ),
  widgets: {}
};
H5PEditor.Textarea.prototype.appendTo = function ($wrapper) {
  this.$item = $('<div>').appendTo($wrapper);
  this.$input = $('<textarea>').val(decodeEntities(this.value));
  this.$errors = $('<div>');
  this.$item.append(this.$input, this.$errors);
};
H5PEditor.Textarea.prototype.remove = function () {};
H5PEditor.widgets.image = function (parent, field, params, callback) {
  this.parent = parent;
  this.field = field;
  this.params = params;
  this.callback = callback;
  this.$editImage = {
    removed: false,
    remove() { this.removed = true; }
  };
  this.appendTo = () => {};
  this.remove = () => {};
  createdImageWidgets.push(this);
};

require('../editor/drag-text-papijo-tooltip-sanitizer');
require('../editor/drag-text-papijo-tooltip-model');
require('../editor/drag-text-papijo-tooltip');

const Widget = H5PEditor.DragTextPapiJoTooltip;
const Store = Widget.TooltipImagesStore;
const model = H5PEditor.DragTextPapiJoTooltipModel;
const ID = '550e8400-e29b-41d4-a716-446655440000';
const SECOND_ID = '6ba7b810-9dad-41d1-80b4-00c04fd430c8';
const image = {
  path: 'images/diagram.png',
  mime: 'image/png',
  width: 640,
  height: 360,
  copyright: { author: 'Author', license: 'CC BY' }
};

const clone = value => JSON.parse(JSON.stringify(value));
const renderedText = element => [element?.text || '']
  .concat((element?.children || []).flatMap(renderedText));

const reopen = savedParams => {
  const params = clone(savedParams);
  const callbacks = [];
  const parent = {
    children: [],
    library: 'H5P.DragTextPapiJo',
    params: { params },
    ready(callback) { callbacks.push(callback); }
  };
  const $root = $('<div>');
  const setValue = (field, value) => {
    if (value === undefined) {
      delete params[field.name];
    }
    else {
      params[field.name] = value;
    }
  };

  const text = new Widget(parent, { name: 'textField' }, params.textField, setValue);
  text.appendTo($root);
  parent.children.push(text);
  const store = new Store(
    parent, { name: 'tooltipImages' }, params.tooltipImages, setValue
  );
  store.appendTo($root);
  parent.children.push(store);
  callbacks.forEach(callback => callback());
  return { params, parent, store, text };
};

const assertEditorForm = (t, reopened, expected) => {
  createdImageWidgets.length = 0;
  reopened.text.openForm(expected.gapIndex || 0);
  t.is(reopened.text.$textInput.val(), expected.text);
  t.is(reopened.text.$altInput.val(), expected.alt || '');
  if (expected.image) {
    t.deepEqual(createdImageWidgets.at(-1).params, expected.image);
  }
};

test('save/reopen populates pre-Phase-2D and newly authored text tooltips', t => {
  const legacy = reopen({ textField: '*word::existing tooltip*' });
  assertEditorForm(t, legacy, { text: 'existing tooltip' });

  const authored = model.applyTooltip({
    source: '*word*', definitions: [], gapIndex: 0, text: 'new tooltip'
  });
  const saved = JSON.parse(JSON.stringify({ textField: authored.source }));
  assertEditorForm(t, reopen(saved), { text: 'new tooltip' });
});

test('save/reopen rehydrates image-only and combined tooltip values after sibling attach', t => {
  const marker = model.getMarker(ID);
  [
    { source: `*word${marker}*`, text: '' },
    { source: `*word::Helpful${marker}*`, text: 'Helpful' }
  ].forEach(fixture => {
    const saved = {
      textField: fixture.source,
      tooltipImages: [{ id: ID, image, alt: 'Diagram description' }]
    };
    const reopened = reopen(JSON.parse(JSON.stringify(saved)));
    const gap = model.analyze(
      reopened.text.getCanonicalSource(), reopened.store.params
    ).gaps[0];
    const panelText = renderedText(reopened.text.$gapList.elements[0]);
    t.is(gap.definitionStatus, 'valid');
    t.true(panelText.includes('editTooltip'));
    t.false(panelText.includes('missingDefinition'));
    assertEditorForm(t, reopened, {
      alt: 'Diagram description', image, text: fixture.text
    });
    t.deepEqual(reopened.params.tooltipImages, saved.tooltipImages);
    t.true(reopened.text.getCanonicalSource().includes(ID));
  });
});

test('save/reopen preserves multiple images, duplicate answers and nested params', t => {
  const source = `*same${model.getMarker(ID)}* and ` +
    `*same::Second${model.getMarker(SECOND_ID)}*`;
  const definitions = [
    { id: ID, image, alt: 'First image' },
    { id: SECOND_ID, image: { path: 'images/second.png', mime: 'image/png' }, alt: 'Second image' }
  ];
  const reopened = reopen({ textField: source, tooltipImages: definitions });
  const analysis = model.analyze(reopened.text.getCanonicalSource(), reopened.store.params);
  t.deepEqual(analysis.gaps.map(gap => gap.definition.alt), ['First image', 'Second image']);
  assertEditorForm(t, reopened, {
    alt: 'Second image', image: definitions[1].image, gapIndex: 1, text: 'Second'
  });
});

test('initial attach and no-op reopen never perform orphan cleanup', t => {
  const orphan = { id: ID, image, alt: 'Retained until validation' };
  const saved = { textField: '*word*', tooltipImages: [orphan] };
  const reopened = reopen(saved);
  t.deepEqual(reopened.params, saved);
  t.deepEqual(reopened.store.params, [orphan]);
});

test('reopen preserves legacy raw image tips and projected valid definitions', t => {
  const legacySource = '*word::Text <img src="https://example.com/legacy.png">*';
  const legacy = reopen({ textField: legacySource });
  assertEditorForm(t, legacy, {
    text: 'Text <img src="https://example.com/legacy.png">'
  });
  t.is(legacy.text.getCanonicalSource(), legacySource);

  const marker = model.getMarker(ID);
  const managed = {
    textField: `*word${marker}*`,
    tooltipImages: [{ id: ID, image, alt: 'Managed image' }]
  };
  const reopened = reopen(managed);
  t.true(reopened.text.$input.val().includes('Tooltip image'));
  t.true(reopened.store.validate());
  t.deepEqual(reopened.params, managed);
});

test('compact gap rows keep the gap number and answer on one line without filler', t => {
  const reopened = reopen({ textField: '*black* and *black*' });
  const rows = reopened.text.$gapList.elements[0].children;
  t.is(rows.length, 2);
  rows.forEach((row, index) => {
    const heading = row.children[0];
    t.is(heading.tag, 'h4');
    t.is(heading.attributes.class, 'papijo-dragtext-tooltip-gap-heading');
    t.deepEqual(heading.children.map(child => child.tag), ['span', 'code']);
    t.deepEqual(heading.children.map(child => child.text), [
      `Gap ${index + 1}`, 'black'
    ]);
    t.is(heading.attributes.id,
      `${reopened.text.panelHeadingId}-gap-${index + 1}`);
    t.false(renderedText(row).includes('state_none'));
    t.false(row.children.some(child =>
      child.attributes.class === 'papijo-dragtext-tooltip-context' ||
      child.attributes.class === 'papijo-dragtext-tooltip-kind'
    ));
  });
});

test('tooltip text remains a compact two-line vertically resizable textarea', t => {
  const reopened = reopen({ textField: '*word::Existing text*' });
  assertEditorForm(t, reopened, { text: 'Existing text' });
  t.is(reopened.text.$textInput.elements[0].tag, 'textarea');
  t.is(reopened.text.$textInput.elements[0].attributes.rows, 2);
  const css = fs.readFileSync('editor/drag-text-papijo-tooltip.css', 'utf8');
  t.regex(css, /\.papijo-dragtext-tooltip-text\s*\{[^}]*resize:\s*vertical/s);
});

test('image controls follow image state and suppress copyright and Crop/Rotate UI', t => {
  const reopened = reopen({ textField: '*word*' });
  createdImageWidgets.length = 0;
  reopened.text.openForm(0);
  const emptyWidget = createdImageWidgets.at(-1);
  t.is(emptyWidget.field.label, 'Tooltip image');
  t.true(emptyWidget.field.disableCopyright);
  t.true(emptyWidget.$editImage.removed);
  t.true(reopened.text.$altField.prop('hidden'));
  t.true(reopened.text.$removeImage.prop('hidden'));

  const selected = clone(image);
  emptyWidget.callback(null, selected);
  selected.copyright.author = 'Changed outside';
  t.false(reopened.text.$altField.prop('hidden'));
  t.false(reopened.text.$removeImage.prop('hidden'));
  t.is(reopened.text.imageDraft.copyright.author, 'Author');

  reopened.text.$removeImage.trigger('click');
  t.true(reopened.text.$altField.prop('hidden'));
  t.true(reopened.text.$removeImage.prop('hidden'));

  const managed = reopen({
    textField: `*word${model.getMarker(ID)}*`,
    tooltipImages: [{ id: ID, image, alt: 'Existing alt' }]
  });
  assertEditorForm(t, managed, { alt: 'Existing alt', image, text: '' });
  const existingWidget = createdImageWidgets.at(-1);
  t.true(existingWidget.field.disableCopyright);
  t.is(existingWidget.field.label, 'Tooltip image');
  t.true(existingWidget.$editImage.removed);
  t.false(managed.text.$altField.prop('hidden'));
  t.false(managed.text.$removeImage.prop('hidden'));
  t.deepEqual(existingWidget.params.copyright, image.copyright);
  t.is(managed.text.$form.elements[0].attributes['aria-labelledby'],
    `${managed.text.panelHeadingId}-gap-1`);
});

test('legacy warning and accessibility status structures remain present', t => {
  const legacy = reopen({
    textField: '*word::Text <img src="https://example.com/legacy.png">*'
  });
  legacy.text.openForm(0);
  t.true(renderedText(legacy.text.$form.elements[0]).includes('legacyImageDetected'));
  t.is(legacy.text.$formStatus.elements[0].attributes['aria-live'], 'polite');
});

const phpBinary = process.env.PHP_BINARY || 'php';
const phpAvailable = spawnSync(phpBinary, ['--version'], { encoding: 'utf8' }).status === 0;
const cores = [
  'C:/wamp64/www/wp-h5p/wp-content/plugins/h5p/h5p-php-library/h5p.classes.php',
  'C:/wamp64/www/moodle/public/h5p/h5plib/v128/joubel/core/h5p.classes.php',
  'C:/wamp64/www/moodle/public/mod/hvp/library/h5p.classes.php'
].filter(file => fs.existsSync(file));

if (phpAvailable && cores.length) {
  test.serial('H5P filter, JSON save and fresh editor reopen preserve all tooltip data', t => {
    const marker = model.getMarker(ID);
    const fixtures = [
      {
        expected: { text: 'Text only' },
        params: { textField: '*word::Text only*' }
      },
      {
        expected: { alt: 'Image only', image, text: '' },
        params: {
          textField: `*word${marker}*`,
          tooltipImages: [{ id: ID, image, alt: 'Image only' }]
        }
      },
      {
        expected: { alt: 'Combined image', image, text: 'Combined' },
        params: {
          textField: `*word::Combined${marker}*`,
          tooltipImages: [{ id: ID, image, alt: 'Combined image' }]
        }
      }
    ];
    fixtures.forEach(fixture => cores.forEach(core => {
      const beforeSave = fixture.params;
      const result = JSON.parse(execFileSync(phpBinary, [
        'tests/helpers/h5p-tooltip-params-filter.php', core, 'semantics.json'
      ], { encoding: 'utf8', input: JSON.stringify(beforeSave) }));
      const afterFilter = result.value;
      const reopened = reopen(JSON.parse(JSON.stringify(afterFilter)));
      t.deepEqual(afterFilter, beforeSave);
      t.deepEqual(reopened.params, beforeSave);
      t.deepEqual(result.errors, []);
      assertEditorForm(t, reopened, fixture.expected);
    }));
  });
}
else {
  test.skip('H5P filter, JSON save and fresh editor reopen preserve all tooltip data', () => {});
}
