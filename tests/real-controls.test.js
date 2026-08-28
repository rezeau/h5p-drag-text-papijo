import test from 'ava';

import {
  AriaDrag,
  AriaDrop,
  Controls,
  Mouse,
  UIKeyboard,
  createElement,
  createKeyboardControls,
  createRealTask,
  dispatchKey,
  tabindexOwners
} from './helpers/real-controls-harness';

test('real Controls keeps exactly one tabindex owner after keyboard navigation', t => {
  const controls = createKeyboardControls();
  const elements = [createElement(), createElement(), createElement()];
  elements.forEach(element => controls.addElement(element));
  elements[0].focus();

  dispatchKey(elements[0], 39);

  t.is(global.document.activeElement, elements[1]);
  t.deepEqual(tabindexOwners(elements), [elements[1]]);
});

test('real Controls preserves one tabindex owner through wrapping, Home, and End', t => {
  const controls = createKeyboardControls();
  const elements = [createElement(), createElement(), createElement()];
  elements.forEach(element => controls.addElement(element));
  elements[0].focus();

  const transitions = [
    [elements[0], 37, elements[2]],
    [elements[2], 39, elements[0]],
    [elements[0], 35, elements[2]],
    [elements[2], 36, elements[0]],
    [elements[0], 40, elements[1]],
    [elements[1], 38, elements[0]]
  ];

  transitions.forEach(([from, key, expected]) => {
    dispatchKey(from, key);
    t.is(global.document.activeElement, expected);
    t.deepEqual(tabindexOwners(elements), [expected]);
  });
});

test('real Controls demotes stale non-first additions and insertions', t => {
  const controls = createKeyboardControls();
  const first = createElement();
  controls.addElement(first);

  const added = createElement();
  added.setAttribute('tabindex', '0');
  controls.addElement(added);

  const inserted = createElement();
  inserted.setAttribute('tabindex', '0');
  controls.insertElementAt(inserted, 0);

  t.deepEqual(tabindexOwners([first, added, inserted]), [first]);
});

test('real Controls remains coherent through repeated remove and front reinsert cycles', t => {
  const controls = createKeyboardControls();
  const elements = [createElement(), createElement(), createElement()];
  elements.forEach(element => controls.addElement(element));

  for (let cycle = 0; cycle < 3; cycle++) {
    controls.removeElement(elements[1]);
    elements[1].setAttribute('tabindex', '-1');
    controls.insertElementAt(elements[1], 0);
  }

  t.is(controls.elements.length, 3);
  t.is(new Set(controls.elements).size, 3);
  t.is(tabindexOwners(elements).length, 1);
});

test('real Keyboard and Mouse listeners remain single after remove and re-add', t => {
  const controls = new Controls([new UIKeyboard(), new Mouse()]);
  controls.useNegativeTabIndex();
  const element = createElement();
  let selections = 0;
  controls.on('select', () => {
    selections++;
  });

  for (let cycle = 0; cycle < 3; cycle++) {
    controls.addElement(element);
    controls.removeElement(element);
  }
  controls.addElement(element);

  t.is(element.eventListeners.keydown.length, 1);
  t.is(element.eventListeners.click.length, 1);
  element.dispatchEvent({ target: element, type: 'click' });
  t.is(selections, 1);
});

test('real AriaDrag and AriaDrop preserve selection and drop-effect behavior', t => {
  const ariaDrag = new AriaDrag();
  const dragControls = new Controls([new UIKeyboard(), ariaDrag]);
  const draggables = [createElement(), createElement()];
  draggables.forEach(element => {
    element.setAttribute('aria-grabbed', 'false');
    dragControls.addElement(element);
  });

  dispatchKey(draggables[0], 13);
  t.is(draggables[0].getAttribute('aria-grabbed'), 'true');
  t.is(draggables[1].getAttribute('aria-grabbed'), 'false');
  dispatchKey(draggables[1], 32);
  t.is(draggables[0].getAttribute('aria-grabbed'), 'false');
  t.is(draggables[1].getAttribute('aria-grabbed'), 'true');

  const ariaDrop = new AriaDrop();
  const dropControls = new Controls([ariaDrop]);
  const zones = [createElement(), createElement()];
  zones.forEach(element => {
    element.setAttribute('aria-dropeffect', 'none');
    dropControls.addElement(element);
  });
  ariaDrop.setAllToMove();
  t.true(zones.every(element => element.getAttribute('aria-dropeffect') === 'move'));
  ariaDrop.setAllToNone();
  t.true(zones.every(element => element.getAttribute('aria-dropeffect') === 'none'));
});

test('real controls support keyboard select, zone navigation, drop, revert, and Escape', t => {
  const { draggables, droppables, instance } = createRealTask();
  const [first, second] = draggables;

  first.getElement().focus();
  dispatchKey(first.getElement(), 13);
  t.is(instance.selectedElement, first.getElement());
  t.is(global.document.activeElement, droppables[0].getElement());
  t.deepEqual(tabindexOwners(instance.dropControls.elements), [droppables[0].getElement()]);

  dispatchKey(droppables[0].getElement(), 39);
  t.is(global.document.activeElement, droppables[1].getElement());
  t.deepEqual(tabindexOwners(instance.dropControls.elements), [droppables[1].getElement()]);
  dispatchKey(droppables[1].getElement(), 13);
  t.is(droppables[1].containedDraggable, first);
  t.is(instance.selectedElement, undefined);

  instance.revert(first);
  t.is(first.getInsideDropzone(), null);
  t.is(new Set(instance.dragControls.elements).size, instance.dragControls.elements.length);
  t.is(tabindexOwners(instance.dragControls.elements).length, 1);

  second.getElement().focus();
  instance.dragControls.setTabbable(second.getElement());
  dispatchKey(second.getElement(), 13);
  const activeZone = global.document.activeElement;
  dispatchKey(activeZone, 27);
  t.is(instance.selectedElement, undefined);
  t.is(global.document.activeElement, second.getElement());
  t.deepEqual(tabindexOwners(instance.dragControls.elements), [second.getElement()]);
});

test('real controls survive Check and Retry without stale registrations', t => {
  const { buttons, draggables, droppables, instance } = createRealTask();
  instance.drop(draggables[0], droppables[0]);
  instance.drop(draggables[2], droppables[1]);

  buttons['check-answer']();
  t.deepEqual(instance.dragControls.elements, []);
  t.deepEqual(instance.dropControls.elements, []);
  buttons['try-again']();

  t.is(instance.getScore(), 0);
  t.is(new Set(instance.dragControls.elements).size, draggables.length);
  t.is(tabindexOwners(instance.dragControls.elements).length, 1);
});

test('real controls survive Show Solution and Retry', t => {
  const { buttons, draggables, droppables, instance } = createRealTask();
  instance.drop(draggables[2], droppables[0]);
  buttons['check-answer']();
  buttons['show-solution']();
  t.deepEqual(instance.dragControls.elements, []);
  t.deepEqual(instance.dropControls.elements, []);

  buttons['try-again']();
  t.is(instance.getScore(), 0);
  t.is(new Set(instance.dragControls.elements).size, draggables.length);
  t.is(tabindexOwners(instance.dragControls.elements).length, 1);
});

test('real controls keep instant-feedback retained answers and distractors coherent', t => {
  const { buttons, draggables, droppables, instance } = createRealTask({
    instantFeedback: true,
    keepCorrectAnswers: true
  });
  draggables[0].getElement().focus();
  instance.drop(draggables[0], droppables[0]);
  t.is(global.document.activeElement, draggables[1].getElement());
  t.deepEqual(tabindexOwners(instance.dragControls.elements), [draggables[1].getElement()]);

  instance.drop(draggables[2], droppables[1]);
  buttons['try-again']();

  t.is(droppables[0].containedDraggable, draggables[0]);
  t.is(droppables[1].containedDraggable, null);
  t.false(instance.dragControls.elements.includes(draggables[0].getElement()));
  t.true(instance.dragControls.elements.includes(draggables[2].getElement()));
  t.is(new Set(instance.dragControls.elements).size, instance.dragControls.elements.length);
  t.is(tabindexOwners(instance.dragControls.elements).length, 1);
});
