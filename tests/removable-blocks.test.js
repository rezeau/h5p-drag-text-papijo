import test from 'ava';

import { createParentHarness } from './helpers/drag-drop-dom-harness';

const createTask = (options = {}) => {
  const harness = createParentHarness(options);
  const { instance } = harness;
  const draggables = ['new', 'wrong'].map(answer => instance.createDraggable(answer));
  const removable = instance.createDroppable(
    1, ['new'], undefined, undefined, undefined, 'old text', false
  );
  const ordinary = instance.createDroppable(
    2, ['other'], undefined, undefined, undefined, undefined, false
  );
  draggables.forEach(draggable => {
    draggable.appendDraggableTo(instance.$draggables);
    instance.addDraggableToControls(instance.dragControls, draggable);
  });
  instance.addButtons();
  return { ...harness, draggables, ordinary, removable };
};

test('removable text is created once in its associated empty drop zone', t => {
  const { ordinary, removable } = createTask();
  const block = removable.$removableBlock.get(0);

  t.is(removable.removableBlock, 'old text');
  t.is(block.parent, removable.getElement());
  t.is(block.textContent, 'old text');
  t.true(block.classes.has('removableblock'));
  t.false(block.classes.has('hide'));
  t.is(removable.getElement().children.filter(child => child === block).length, 1);
  t.is(removable.getElement().getAttribute('aria-label'), 'Drop Zone 1 Drop Zone 1 is empty.');
  t.is(ordinary.$removableBlock, undefined);
});

test('removable text is presentation rather than an independently actionable control', t => {
  const { removable } = createTask();
  const block = removable.$removableBlock.get(0);

  t.is(block.getAttribute('role'), null);
  t.is(block.getAttribute('tabindex'), null);
  t.deepEqual(block.eventListeners, {});
  t.is(block.getAttribute('aria-label'), null);
});

test('drop hides removable text and revert restores it with consistent state', t => {
  const { instance, draggables, removable } = createTask();
  const draggable = draggables[0];

  instance.drop(draggable, removable);
  t.true(removable.$removableBlock.hasClass('hide'));
  t.is(removable.containedDraggable, draggable);
  t.is(draggable.getInsideDropzone(), removable);
  t.deepEqual(instance.getCurrentState(), [{ draggable: 0, droppable: 0 }]);
  t.is(instance.getScore(), 1);

  instance.revert(draggable);
  t.false(removable.$removableBlock.hasClass('hide'));
  t.is(removable.containedDraggable, null);
  t.is(draggable.getInsideDropzone(), null);
  t.is(draggable.getElement().parent, instance.$draggables.get(0));
  t.deepEqual(instance.getCurrentState(), []);
  t.is(instance.getScore(), 0);
  t.true(instance.getAnswerGiven());
  t.is(removable.getElement().getAttribute('aria-label'), 'Drop Zone 1 is empty.');
});

test('repeated removable-text drop and revert cycles do not duplicate DOM or controls', t => {
  const { instance, draggables, removable } = createTask();
  const draggable = draggables[0];
  const block = removable.$removableBlock.get(0);

  for (let index = 0; index < 3; index++) {
    instance.drop(draggable, removable);
    instance.revert(draggable);
  }

  t.is(removable.getElement().children.filter(child => child === block).length, 1);
  t.false(removable.$removableBlock.hasClass('hide'));
  t.is(new Set(instance.dragControls.elements).size, instance.dragControls.elements.length);
  t.deepEqual(instance.getCurrentState(), []);
});

test('Retry restores removable text for wrong answers', t => {
  const { buttons, instance, draggables, removable } = createTask();
  instance.drop(draggables[1], removable);
  buttons['check-answer']();
  t.true(removable.$removableBlock.hasClass('hide'));

  buttons['try-again']();

  t.false(removable.$removableBlock.hasClass('hide'));
  t.is(removable.containedDraggable, null);
  t.deepEqual(instance.getCurrentState(), []);
});

test('keepCorrectAnswers Retry retains a correct replacement and keeps original text hidden', t => {
  const { buttons, instance, draggables, removable } = createTask({ keepCorrectAnswers: true });
  instance.drop(draggables[0], removable);
  buttons['check-answer']();
  buttons['try-again']();

  t.is(removable.containedDraggable, draggables[0]);
  t.true(removable.$removableBlock.hasClass('hide'));
  t.is(instance.getScore(), 1);
  t.true(instance.getAnswerGiven());
  t.is(removable.getElement().getAttribute('aria-disabled'), 'true');
});

test('resetTask fully restores removable text even after retained correct feedback', t => {
  const { instance, draggables, removable } = createTask({ keepCorrectAnswers: true });
  instance.drop(draggables[0], removable);
  removable.addFeedback();

  instance.resetTask();

  t.false(removable.$removableBlock.hasClass('hide'));
  t.is(removable.containedDraggable, null);
  t.deepEqual(instance.getCurrentState(), []);
  t.false(instance.getAnswerGiven());
});

test('instant feedback hides removable text for a correct answer and reset restores it', t => {
  const { instance, draggables, removable } = createTask({ instantFeedback: true });
  instance.drop(draggables[0], removable);
  t.true(removable.$removableBlock.hasClass('hide'));
  t.true(removable.hasCorrectFeedback());

  instance.resetTask();

  t.false(removable.$removableBlock.hasClass('hide'));
  t.is(removable.containedDraggable, null);
  t.is(instance.getScore(), 0);
});

test('Show Solution leaves empty removable replacement text visible', t => {
  const { buttons, removable } = createTask();

  buttons['show-solution']();

  t.false(removable.$removableBlock.hasClass('hide'));
  t.false(removable.hasDraggable());
  t.false(removable.$showSolution.get(0).hidden);
});
