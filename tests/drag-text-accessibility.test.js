import test from 'ava';

import { DragText, createHarness } from './helpers/drag-text-harness';

const createControls = (elements = []) => ({
  added: [],
  elements: [...elements],
  inserted: [],
  removed: [],
  addElement(element) {
    this.added.push(element);
    this.elements.push(element);
  },
  count() {
    return this.elements.length;
  },
  insertElementAt(element, position) {
    this.inserted.push(element);
    this.elements.splice(position, 0, element);
  },
  removeElement(element) {
    this.removed.push(element);
    this.elements = this.elements.filter(candidate => candidate !== element);
  },
  setTabbable(element) {
    this.elements.forEach(candidate => candidate.setAttribute('tabindex', '-1'));
    element.setAttribute('tabindex', '0');
    this.tabbableElement = element;
  }
});

test('Check removes every draggable from keyboard controls', t => {
  const { draggables, instance } = createHarness();
  const elements = draggables.map(draggable => draggable.getElement());
  instance.dragControls = createControls(elements);

  instance.removeAllElementsFromDragControl();

  t.deepEqual(instance.dragControls.elements, []);
  t.deepEqual(instance.dragControls.removed, elements);
  t.true(elements.every(element => element.getAttribute('tabindex') === '-1'));
});

test('Check removes every drop zone from keyboard controls', t => {
  const { buttons, droppables, instance } = createHarness();
  const elements = droppables.map(droppable => droppable.getElement());
  elements[0].setAttribute('tabindex', '0');
  instance.dropControls = createControls(elements);
  instance.addButtons();

  buttons['check-answer']();

  t.deepEqual(instance.dropControls.elements, []);
  t.true(elements.every(element => element.getAttribute('tabindex') === '-1'));
});

test('adding a draggable to controls does not duplicate its registration', t => {
  const { draggables, instance } = createHarness();
  const controls = createControls();

  instance.addDraggableToControls(controls, draggables[0]);
  instance.addDraggableToControls(controls, draggables[0]);

  t.deepEqual(controls.elements, [draggables[0].getElement()]);
});

test('disabled drop zones are excluded from keyboard drop controls', t => {
  const { droppables, instance } = createHarness();
  droppables[0].getElement().setAttribute('aria-disabled', 'true');
  instance.dropControls = createControls();

  instance.addAllDroppablesToControls();

  t.deepEqual(instance.dropControls.elements, [
    droppables[1].getElement(),
    droppables[2].getElement()
  ]);
});

test('removing an empty drop zone clears its stale tab stop', t => {
  const { droppables, instance } = createHarness();
  const element = droppables[0].getElement();
  element.setAttribute('tabindex', '0');
  instance.dropControls = createControls(droppables.map(droppable => droppable.getElement()));

  instance.removeControlsFromEmptyDropZones();

  t.is(element.getAttribute('tabindex'), '-1');
  t.deepEqual(instance.dropControls.elements, []);
});

test('a full task focuses the first replaceable drop zone', t => {
  const { draggables, droppables, instance } = createHarness();
  draggables.forEach((draggable, index) => droppables[index].setDraggable(draggable));
  instance.dropControls = createControls(droppables.map(droppable => droppable.getElement()));

  instance.focusOnFirstEmptyDropZone();

  t.is(instance.dropControls.tabbableElement, droppables[0].getElement());
  t.true(droppables[0].getElement().focused);
});

test('a completed keyboard drop focuses its drop zone', t => {
  const { draggables, droppables, instance } = createHarness();

  instance.drop(draggables[0], droppables[0]);

  t.true(droppables[0].getElement().focused);
});

test('cancelling a keyboard drag clears selection and restores draggable focus', t => {
  const { draggables, droppables, events, instance } = createHarness();
  const element = draggables[0].getElement();
  instance.dragControls = createControls([element]);
  droppables[1].setDraggable(draggables[1]);
  instance.dropControls = createControls(droppables.map(droppable => droppable.getElement()));
  droppables[0].getElement().setAttribute('tabindex', '0');
  instance.selectedElement = element;

  instance.cancelKeyboardDrag(true);

  t.is(instance.selectedElement, undefined);
  t.is(instance.dragControls.tabbableElement, element);
  t.true(element.focused);
  t.deepEqual(instance.dropControls.elements, [droppables[1].getElement()]);
  t.is(droppables[0].getElement().getAttribute('tabindex'), '-1');
  t.deepEqual(events.at(-1), {
    event: 'stop',
    data: { element }
  });
});

test('Check cancels an active keyboard drag before disabling controls', t => {
  const { buttons, draggables, events, instance } = createHarness();
  const element = draggables[0].getElement();
  instance.dragControls = createControls([element]);
  instance.dropControls = createControls();
  instance.selectedElement = element;
  instance.addButtons();

  buttons['check-answer']();

  t.is(instance.selectedElement, undefined);
  t.true(events.some(entry => entry.event === 'stop' && entry.data.element === element));
});

test('Retry excludes a retained correct drop zone from keyboard targets', t => {
  const { buttons, draggables, droppables, instance } = createHarness({
    keepCorrectAnswers: true
  });
  instance.drop(draggables[0], droppables[0]);
  instance.drop(draggables[1], droppables[2]);
  instance.dropControls = createControls([
    droppables[0].getElement(),
    droppables[2].getElement()
  ]);
  instance.addButtons();
  buttons['check-answer']();
  buttons['try-again']();

  t.is(droppables[0].getElement().getAttribute('aria-disabled'), 'true');
  t.false(instance.dropControls.elements.includes(droppables[0].getElement()));
});

test('instant-feedback correct zones leave keyboard controls when disabled', t => {
  const { draggables, droppables, instance } = createHarness({
    instantFeedback: true
  });
  instance.dragControls = createControls(draggables.map(draggable => draggable.getElement()));
  instance.dropControls = createControls(droppables.map(droppable => droppable.getElement()));
  const recordEvent = instance.trigger;
  instance.trigger = (event, data) => {
    if (event === 'drop') {
      instance.dragControls.removeElement(data.element);
    }
    recordEvent(event, data);
  };

  instance.drop(draggables[0], droppables[0]);

  t.is(droppables[0].getElement().getAttribute('aria-disabled'), 'true');
  t.false(instance.dropControls.elements.includes(droppables[0].getElement()));
  t.is(droppables[0].getElement().getAttribute('tabindex'), '-1');
  t.is(instance.dragControls.tabbableElement, draggables[1].getElement());
  t.true(draggables[1].getElement().focused);
});

test('instant feedback moves focus to the task after disabling the final draggable', t => {
  const { draggables, droppables, instance } = createHarness({
    answers: ['one'],
    instantFeedback: true
  });
  let introductionFocused = false;
  instance.$introduction = {
    parent: () => ({
      focus() {
        introductionFocused = true;
      }
    })
  };
  instance.dragControls = createControls(draggables.map(draggable => draggable.getElement()));
  instance.dropControls = createControls(droppables.map(droppable => droppable.getElement()));
  const recordEvent = instance.trigger;
  instance.trigger = (event, data) => {
    if (event === 'drop') {
      instance.dragControls.removeElement(data.element);
    }
    recordEvent(event, data);
  };

  instance.drop(draggables[0], droppables[0]);

  t.true(introductionFocused);
  t.false(droppables[0].getElement().focused);
});

test('drop zone labels distinguish empty, occupied, correct, and incorrect states', t => {
  const { draggables, droppables, instance } = createHarness();
  const element = droppables[0].getElement();
  instance.setDroppableLabel = DragText.prototype.setDroppableLabel.bind(instance);

  instance.setDroppableLabel(element, '', 1);
  t.is(element.getAttribute('aria-label'), 'Drop Zone 1 is empty.');

  droppables[0].setDraggable(draggables[0]);
  element.childNodes = [{ attributes: [{ value: 'draggable' }] }];
  instance.setDroppableLabel(element, 'one', 1);
  t.is(element.getAttribute('aria-label'), 'Drop Zone 1 contains draggable one.');

  element.classList.add('h5p-drag-correct-feedback');
  instance.setDroppableLabel(element, 'one', 1);
  t.is(element.getAttribute('aria-label'), 'Drop Zone 1 contains draggable one. Correct!.');
  t.is(draggables[0].ariaDescription, 'Correct!');

  element.classList.remove('h5p-drag-correct-feedback');
  element.classList.add('h5p-drag-wrong-feedback');
  instance.setDroppableLabel(element, 'one', 1);
  t.is(element.getAttribute('aria-label'), 'Drop Zone 1 contains draggable one. Incorrect!.');
  t.is(draggables[0].ariaDescription, 'Incorrect!');
});

test('occupied drop zones do not receive the nonstandard aria-dropped attribute', t => {
  const { draggables, droppables, instance } = createHarness();
  const element = droppables[0].getElement();
  droppables[0].setDraggable(draggables[0]);
  element.childNodes = [draggables[0].getElement()];

  DragText.prototype.updateDroppableElement.call(instance, {
    data: {
      element: draggables[0].getElement(),
      target: element
    }
  });

  t.false(element.hasAttribute('aria-dropped'));
});
