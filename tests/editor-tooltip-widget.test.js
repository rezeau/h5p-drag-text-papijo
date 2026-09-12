import test from 'ava';

global.H5PEditor = {
  Textarea: function (parent, field, params, setValue) {
    this.parent = parent;
    this.field = field;
    this.value = params;
    this.setValue = setValue;
  },
  widgets: {},
  t: (_library, key) => key
};
H5PEditor.Textarea.prototype = {
  appendTo() {},
  remove() {}
};

require('../editor/drag-text-papijo-tooltip-sanitizer');
require('../editor/drag-text-papijo-tooltip-model');
require('../editor/drag-text-papijo-tooltip');

const Widget = H5PEditor.DragTextPapiJoTooltip;
const Store = Widget.TooltipImagesStore;
const ID = '550e8400-e29b-41d4-a716-446655440000';

const imageField = () => ({
  emptyCount: 0,
  empty() { this.emptyCount++; }
});

test('image widget callbacks deep-clone current values and reject stale async uploads', t => {
  const created = [];
  H5PEditor.widgets.image = function (parent, field, params, callback) {
    this.parent = parent;
    this.params = params;
    this.callback = callback;
    this.appendTo = target => { this.target = target; };
    this.remove = () => { this.removed = true; };
    created.push(this);
  };
  const parent = { library: 'Nested.Library', children: [] };
  const widget = new Widget(parent, { name: 'textField' }, '*one*', () => {});
  widget.formMode = 'edit';
  widget.$imageField = imageField();
  widget.mountImageWidget();
  const stale = created[0];
  widget.mountImageWidget();
  const current = created[1];
  const value = { path: 'images/current.png', width: 320 };

  stale.callback(null, { path: 'images/stale.png' });
  t.is(widget.imageDraft, undefined);
  current.callback(null, value);
  value.width = 1;
  t.deepEqual(widget.imageDraft, { path: 'images/current.png', width: 320 });
  t.is(current.parent.library, 'Nested.Library');
});

test('destroy and recreate invalidates the old upload callback', t => {
  const created = [];
  H5PEditor.widgets.image = function (_parent, _field, _params, callback) {
    this.callback = callback;
    this.appendTo = () => {};
    this.remove = () => {};
    created.push(this);
  };
  const widget = new Widget({}, { name: 'textField' }, '*one*', () => {});
  widget.formMode = 'edit';
  widget.$imageField = imageField();
  widget.mountImageWidget();
  widget.remove();
  created[0].callback(null, { path: 'images/late.png' });
  t.is(widget.imageDraft, undefined);

  widget.formMode = 'edit';
  widget.mountImageWidget();
  created[1].callback(null, { path: 'images/new.png' });
  t.is(widget.imageDraft.path, 'images/new.png');
});

test('image stores preserve metadata by value and remain instance-local', t => {
  const writes = [];
  const first = new Store({}, { name: 'tooltipImages' }, [], (_field, value) => {
    writes.push(value);
  });
  const second = new Store({}, { name: 'tooltipImages' }, [], () => {});
  const definitions = [{
    id: ID,
    image: { path: 'images/one.png', copyright: { author: 'Author' } },
    alt: 'One'
  }];
  first.replaceAll(definitions);
  definitions[0].image.copyright.author = 'Changed';

  t.is(first.params[0].image.copyright.author, 'Author');
  t.deepEqual(second.params, []);
  t.not(first.params, writes[0]);
});
