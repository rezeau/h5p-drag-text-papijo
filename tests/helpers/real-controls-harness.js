require('@babel/register')({
  ignore: [filePath => filePath.includes('node_modules') && !filePath.includes('h5p-lib-controls')],
  presets: [['@babel/preset-env', { modules: 'commonjs' }]],
  sourceType: 'unambiguous'
});

const {
  FakeElement,
  createParentHarness
} = require('./drag-drop-dom-harness');

const Controls = require('h5p-lib-controls/src/scripts/controls').default;
const AriaDrag = require('h5p-lib-controls/src/scripts/aria/drag').default;
const AriaDrop = require('h5p-lib-controls/src/scripts/aria/drop').default;
const UIKeyboard = require('h5p-lib-controls/src/scripts/ui/keyboard').default;
const Mouse = require('h5p-lib-controls/src/scripts/ui/mouse').default;

const createElement = () => {
  const element = new FakeElement('button');
  element.setAttribute('tabindex', '-1');
  return element;
};

const createKeyboardControls = () => {
  const controls = new Controls([new UIKeyboard()]);
  controls.useNegativeTabIndex();
  return controls;
};

const wireRealControls = instance => {
  instance.ariaDragControls = new AriaDrag();
  instance.ariaDropControls = new AriaDrop();
  instance.dragControls = new Controls([new UIKeyboard(), new Mouse(), instance.ariaDragControls]);
  instance.dragControls.useNegativeTabIndex();
  instance.dropControls = new Controls([new UIKeyboard(), new Mouse(), instance.ariaDropControls]);
  instance.dropControls.useNegativeTabIndex();

  instance.dragControls.on('before-select', event => !instance.isElementDisabled(event.element));
  instance.dragControls.on('select', instance.keyboardDraggableSelected, instance);
  instance.dropControls.on('select', instance.keyboardDroppableSelected, instance);
  instance.dropControls.on('close', () => instance.cancelKeyboardDrag(true));

  instance.on('start', instance.addAllDroppablesToControls, instance);
  instance.on('revert', instance.removeControlsFromEmptyDropZones, instance);
  instance.on('stop', event => {
    if (!event.data.target) {
      instance.removeControlsFromDropZonesIfAllEmpty();
    }
  }, instance);
  instance.on('drop', instance.removeControlsFromEmptyDropZones, instance);

  instance.on('start', event => {
    const element = event.data.element;
    instance.toggleDropEffect();
    element.setAttribute('aria-grabbed', 'true');
    instance.setDraggableAriaLabel(instance.getDraggableByElement(element));
  });
  instance.on('stop', event => {
    const element = event.data.element;
    instance.toggleDropEffect();
    element.setAttribute('aria-grabbed', 'false');
    instance.setDraggableAriaLabel(instance.getDraggableByElement(element));
  });
  instance.on('drop', instance.ariaDropControls.setAllToNone, instance.ariaDropControls);
  instance.on('drop', event => {
    instance.dragControls.removeElement(event.data.element);
    event.data.element.setAttribute('tabindex', '-1');
  });
  instance.on('revert', event => {
    const draggable = instance.getDraggableByElement(event.data.element);
    if (draggable) {
      instance.addDraggableToControls(instance.dragControls, draggable, 0);
    }
  });
  instance.on('drop', instance.updateDroppableElement, instance);
  instance.on('revert', instance.updateDroppableElement, instance);
};

const createRealTask = (options = {}) => {
  const harness = createParentHarness({ ...options, wireLifecycle: false });
  const { instance } = harness;
  wireRealControls(instance);

  const draggables = ['one', 'two', 'other'].map(answer => instance.createDraggable(answer));
  const droppables = [
    instance.createDroppable(1, ['one'], undefined, undefined, undefined, undefined, false),
    instance.createDroppable(2, ['two'], undefined, undefined, undefined, undefined, false)
  ];

  draggables.forEach(draggable => {
    draggable.appendDraggableTo(instance.$draggables);
    instance.addDraggableToControls(instance.dragControls, draggable);
  });
  instance.addButtons();

  return { ...harness, draggables, droppables };
};

const createKeyEvent = (element, which) => ({
  defaultPrevented: false,
  propagationStopped: false,
  target: element,
  type: 'keydown',
  which,
  preventDefault() {
    this.defaultPrevented = true;
  },
  stopPropagation() {
    this.propagationStopped = true;
  }
});

const dispatchKey = (element, which) => {
  const event = createKeyEvent(element, which);
  element.dispatchEvent(event);
  return event;
};

const tabindexOwners = elements => elements
  .filter(element => element.getAttribute('tabindex') === '0');

module.exports = {
  AriaDrag,
  AriaDrop,
  Controls,
  FakeElement,
  Mouse,
  UIKeyboard,
  createElement,
  createKeyboardControls,
  createParentHarness,
  createRealTask,
  dispatchKey,
  tabindexOwners,
  wireRealControls
};
