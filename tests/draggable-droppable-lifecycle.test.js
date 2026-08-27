import test from 'ava';

import {
  $,
  Draggable,
  Droppable,
  FakeElement,
  createParentHarness
} from './helpers/drag-drop-dom-harness';

const createTask = (options = {}) => {
  const harness = createParentHarness(options);
  const { instance } = harness;
  const draggables = ['one', 'two', 'other'].map(answer => instance.createDraggable(answer));
  const droppables = [
    instance.createDroppable(1, ['one'], undefined, undefined, undefined, undefined, false),
    instance.createDroppable(2, ['two'], undefined, undefined, undefined, undefined, false)
  ];

  draggables.forEach(draggable => {
    draggable.appendDraggableTo(instance.$draggables);
    instance.addDraggableToControls(instance.dragControls, draggable);
  });

  return { ...harness, draggables, droppables };
};

test('Draggable exposes its initial state and delegates enabled state to jQuery UI', t => {
  const element = new FakeElement();
  const hiddenRead = new FakeElement('span');
  hiddenRead.classes.add('h5p-hidden-read');
  $(element).append(hiddenRead);
  const draggable = new Draggable('answer', element, 3);

  t.is(draggable.getIndex(), 3);
  t.is(draggable.getInitialIndex(), 3);
  t.true(draggable.hasInitialIndex(3));
  t.is(draggable.getAnswerText(), 'answer');
  t.false(draggable.isInsideDropZone());

  t.is(draggable.setIndex(7), draggable);
  t.is(draggable.getIndex(), 7);
  t.is(draggable.getInitialIndex(), 3);

  draggable.disableDraggable();
  t.true(element.draggableOptions.disabled);
  t.is(element.getAttribute('aria-disabled'), 'true');
  draggable.enableDraggable();
  t.false(element.draggableOptions.disabled);
  t.is(element.getAttribute('aria-disabled'), 'false');
});

test('Draggable touch boundary suppresses propagation and leaves dragging to jQuery UI', t => {
  const element = new FakeElement();
  const draggable = new Draggable('answer', element, 0);

  ['touchstart', 'touchmove', 'touchend'].forEach(type => {
    let stopped = 0;
    element.dispatchEvent({
      type,
      stopPropagation() {
        stopped += 1;
      }
    });
    t.is(stopped, 1);
  });

  t.is(draggable.getElement(), element);
  t.false(element.hasAttribute('draggable'));
});

test('Draggable moves between containers, retains focus, and reverts to the pool', t => {
  const pool = $('<div/>');
  const zone = $('<div/>');
  const element = new FakeElement();
  const draggable = new Draggable('answer', element, 0);
  pool.append(element);
  element.focus();

  draggable.appendDraggableTo(zone);
  t.is(element.parent, zone.get(0));
  t.is(global.document.activeElement, element);
  t.deepEqual(element.style, { left: 0, top: 0 });

  element.offsetValue = { left: 25, top: 40 };
  pool.get(0).offsetValue = { left: 5, top: 10 };
  draggable.revertDraggableTo(pool);
  t.is(element.parent, pool.get(0));
  t.is(pool.get(0).children[0], element);
  t.deepEqual(element.style, { left: 0, top: 0 });
});

test('Droppable owns one draggable and clears relationships and feedback on removal', t => {
  const params = {
    correctAnswer: 'Correct answer:',
    correctText: 'Correct!',
    incorrectText: 'Incorrect!',
    tipLabel: 'Show tip',
    behaviour: { hideTips: false, transparentBackground: false }
  };
  const zoneElement = new FakeElement();
  const zoneContainer = new FakeElement();
  const draggableElement = new FakeElement();
  const draggable = new Draggable('one', draggableElement, 0);
  const droppable = new Droppable(
    ['one'], undefined, undefined, undefined, '___', false,
    zoneElement, zoneContainer, 1, params
  );

  droppable.setDraggable(draggable);
  t.is(droppable.containedDraggable, draggable);
  t.is(draggable.getInsideDropzone(), droppable);
  t.true(draggableElement.classes.has('h5p-drag-dropped'));
  t.true(droppable.$removableBlock.hasClass('hide') === false);

  droppable.hideRemovableBlock();
  droppable.addFeedback();
  t.true(droppable.isCorrect());
  t.true(droppable.hasCorrectFeedback());
  droppable.disableDropzoneAndContainedDraggable();
  t.true(zoneElement.droppableOptions.disabled);
  t.true(draggableElement.draggableOptions.disabled);
  droppable.enableDropzone();
  t.false(zoneElement.droppableOptions.disabled);

  t.is(draggable.removeFromZone(), droppable);
  t.is(droppable.containedDraggable, null);
  t.is(draggable.getInsideDropzone(), null);
  t.false(draggableElement.classes.has('h5p-drag-dropped'));
  t.is(draggableElement.getAttribute('aria-description'), '');
  t.false(droppable.hasFeedback());
  t.false(droppable.$removableBlock.hasClass('hide'));
});

test('occupied-zone replacement returns the old draggable without stale ownership', t => {
  const { instance, draggables, droppables } = createTask();
  const [first, replacement] = draggables;
  const [zone] = droppables;

  instance.drop(first, zone);
  instance.drop(replacement, zone);

  t.is(zone.containedDraggable, replacement);
  t.is(replacement.getInsideDropzone(), zone);
  t.is(replacement.getElement().parent, zone.getElement());
  t.is(first.getInsideDropzone(), null);
  t.is(first.getElement().parent, instance.$draggables.get(0));
  t.deepEqual(instance.getCurrentState(), [{ draggable: 1, droppable: 0 }]);
  t.deepEqual(instance.dragControls.elements, [first.getElement(), draggables[2].getElement()]);
});

test('repeated drop, move, revert, and drop cycles keep state and controls synchronized', t => {
  const { instance, draggables, droppables } = createTask();
  const [draggable] = draggables;
  const [firstZone, secondZone] = droppables;

  instance.drop(draggable, firstZone);
  t.deepEqual(instance.getCurrentState(), [{ draggable: 0, droppable: 0 }]);
  t.is(instance.getScore(), 1);
  t.true(instance.getAnswerGiven());

  instance.drop(draggable, secondZone);
  t.is(firstZone.containedDraggable, null);
  t.is(secondZone.containedDraggable, draggable);
  t.deepEqual(instance.getCurrentState(), [{ draggable: 0, droppable: 1 }]);
  t.is(instance.getScore(), 0);

  instance.revert(draggable);
  t.is(secondZone.containedDraggable, null);
  t.is(draggable.getInsideDropzone(), null);
  t.deepEqual(instance.getCurrentState(), []);
  t.deepEqual(instance.dragControls.elements, [
    draggable.getElement(),
    draggables[1].getElement(),
    draggables[2].getElement()
  ]);

  instance.drop(draggable, firstZone);
  t.deepEqual(instance.getCurrentState(), [{ draggable: 0, droppable: 0 }]);
  t.is(new Set(instance.dragControls.elements).size, instance.dragControls.elements.length);
});

test('same-zone repeat and all-zones-occupied replacement fire no duplicate lifecycle events', t => {
  const { eventLog, instance, draggables, droppables } = createTask();
  const [one, two, distractor] = draggables;
  const [firstZone, secondZone] = droppables;

  instance.drop(one, firstZone);
  instance.drop(two, secondZone);
  instance.drop(one, firstZone);
  instance.drop(distractor, firstZone);

  t.is(firstZone.containedDraggable, distractor);
  t.is(secondZone.containedDraggable, two);
  t.is(one.getInsideDropzone(), null);
  t.deepEqual(instance.getCurrentState(), [
    { draggable: 1, droppable: 1 },
    { draggable: 2, droppable: 0 }
  ]);
  t.is(instance.getScore(), 1);
  t.is(eventLog.filter(event => event.name === 'drop').length, 4);
  t.is(eventLog.filter(event => event.name === 'revert').length, 1);
  t.is(new Set(instance.dragControls.elements).size, instance.dragControls.elements.length);
});

test('keepCorrectAnswers blocks reverting evaluated correct placement but permits wrong placement', t => {
  const { instance, draggables, droppables } = createTask({ keepCorrectAnswers: true });
  const [correct, , wrong] = draggables;
  const [firstZone, secondZone] = droppables;
  instance.drop(correct, firstZone);
  instance.drop(wrong, secondZone);
  firstZone.addFeedback();
  secondZone.addFeedback();

  instance.revert(correct);
  instance.revert(wrong);

  t.is(firstZone.containedDraggable, correct);
  t.is(correct.getInsideDropzone(), firstZone);
  t.is(secondZone.containedDraggable, null);
  t.is(wrong.getInsideDropzone(), null);
  t.deepEqual(instance.getCurrentState(), [{ draggable: 0, droppable: 0 }]);
  t.is(instance.getScore(), 1);
});

test('physical drop callbacks choose the innermost hovered zone and clear hover state', t => {
  const { instance, draggables, droppables } = createTask();
  const [outer, inner] = droppables;
  const outerOptions = outer.getElement().droppableOptions;
  const innerOptions = inner.getElement().droppableOptions;

  outerOptions.over();
  innerOptions.over();
  t.is(instance.getHoveredDroppableIndex(), 0);

  outerOptions.drop({}, { draggable: $(draggables[0].getElement()) });
  t.is(outer.containedDraggable, draggables[0]);
  t.is(inner.containedDraggable, null);
  t.deepEqual(instance.hoveredDroppables, []);
  t.false(outer.getElement().classes.has('ui-droppable-hover'));
  t.false(inner.getElement().classes.has('ui-droppable-hover'));
});

test('cancelled physical drag reports no drop target after revert', t => {
  const { eventLog, instance, draggables } = createTask();
  const [draggable] = draggables;
  const options = draggable.getElement().draggableOptions;

  options.start({ target: draggable.getElement() });
  t.false(options.revert(false));
  options.stop({ target: draggable.getElement() });

  const stop = eventLog.filter(event => event.name === 'stop').at(-1);
  t.deepEqual(stop.data, {
    element: draggable.getElement(),
    target: undefined
  });
  t.deepEqual(eventLog.map(event => event.name), ['start', 'revert', 'resize', 'stop']);
  t.is(draggable.getInsideDropzone(), null);
  t.is(draggable.getElement().parent, instance.$draggables.get(0));
});

test('successful physical drag reports the actual drop zone as its stop target', t => {
  const { eventLog, instance, draggables, droppables } = createTask();
  const [draggable] = draggables;
  const [zone] = droppables;

  instance.drop(draggable, zone);
  draggable.getElement().draggableOptions.stop({ target: draggable.getElement() });

  const stop = eventLog.filter(event => event.name === 'stop').at(-1);
  t.is(stop.data.target, zone.getElement());
});

test('moving a draggable updates the vacated drop zone accessible label', t => {
  const { instance, draggables, droppables } = createTask();
  const [draggable] = draggables;
  const [firstZone, secondZone] = droppables;

  instance.drop(draggable, firstZone);
  t.is(firstZone.getElement().getAttribute('aria-label'), 'Drop Zone 1 contains draggable one.');

  instance.drop(draggable, secondZone);
  t.is(firstZone.getElement().getAttribute('aria-label'), 'Drop Zone 1 is empty.');
  t.is(secondZone.getElement().getAttribute('aria-label'), 'Drop Zone 2 contains draggable one.');
});
