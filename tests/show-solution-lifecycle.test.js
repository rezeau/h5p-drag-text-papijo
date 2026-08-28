import test from 'ava';

import { createParentHarness } from './helpers/drag-drop-dom-harness';

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
  instance.addButtons();

  return { ...harness, draggables, droppables };
};

test('instant-feedback Show Solution removes every disabled draggable from keyboard controls', t => {
  const { buttons, draggables, droppables, instance } = createTask({ instantFeedback: true });

  instance.drop(draggables[0], droppables[0]);
  instance.drop(draggables[2], droppables[1]);
  t.deepEqual(instance.dragControls.elements, [draggables[1].getElement()]);

  buttons['show-solution']();

  t.true(draggables.every(draggable => draggable.getElement().draggableOptions.disabled));
  t.deepEqual(instance.dragControls.elements, []);
  t.is(draggables[1].getElement().getAttribute('tabindex'), '-1');
});

test('partial Check and Show Solution preserve answers and expose every solution', t => {
  const { buttonVisibility, buttons, draggables, droppables, instance } = createTask();
  instance.drop(draggables[0], droppables[0]);

  buttons['check-answer']();
  t.true(droppables[0].hasCorrectFeedback());
  t.true(buttonVisibility['show-solution']);
  t.true(buttonVisibility['try-again']);

  buttons['show-solution']();

  t.deepEqual(instance.getCurrentState(), [{ draggable: 0, droppable: 0 }]);
  t.is(instance.getScore(), 1);
  t.true(instance.getAnswerGiven());
  t.true(droppables.every(droppable => !droppable.$showSolution.get(0).hidden));
  t.is(droppables[1].$showSolution.html(), 'two');
  t.true(draggables.every(draggable => draggable.getElement().draggableOptions.disabled));
  t.deepEqual(instance.dragControls.elements, []);
  t.deepEqual(instance.dropControls.elements, []);
  t.false(buttonVisibility['show-solution']);
  t.true(buttonVisibility['try-again']);
});

test('Show Solution remains hidden for partial input when all gaps are required', t => {
  const { buttonVisibility, buttons, draggables, droppables, instance } = createTask({
    showSolutionsRequiresInput: true
  });
  instance.drop(draggables[0], droppables[0]);

  buttons['check-answer']();

  t.false(buttonVisibility['show-solution']);
  t.true(buttonVisibility['try-again']);
});

test('wrong and unanswered zones keep coherent feedback and solution state', t => {
  const { buttons, draggables, droppables, instance } = createTask();
  instance.drop(draggables[2], droppables[0]);
  buttons['check-answer']();
  buttons['show-solution']();

  t.true(droppables[0].$dropzone.hasClass('h5p-drag-wrong-feedback'));
  t.false(droppables[1].hasFeedback());
  t.true(droppables[0].$showSolution.hasClass('incorrect'));
  t.true(droppables[1].$showSolution.hasClass('incorrect'));
  t.is(droppables[0].$showSolution.html(), 'one');
  t.is(droppables[1].$showSolution.html(), 'two');
  t.is(instance.getScore(), 0);
  t.deepEqual(instance.getCurrentState(), [{ draggable: 2, droppable: 0 }]);
});

test('Show Solution followed by Retry clears solution-only state and restores interaction', t => {
  const { buttonVisibility, buttons, draggables, droppables, instance } = createTask();
  instance.drop(draggables[2], droppables[0]);
  buttons['check-answer']();
  buttons['show-solution']();

  buttons['try-again']();

  t.false(instance.getAnswerGiven());
  t.is(instance.getScore(), 0);
  t.deepEqual(instance.getCurrentState(), []);
  t.true(droppables.every(droppable => droppable.$showSolution.get(0).hidden));
  t.true(droppables.every(droppable => droppable.$showSolution.html() === ''));
  t.true(droppables.every(droppable => !droppable.hasFeedback()));
  t.true(draggables.every(draggable => !draggable.getElement().draggableOptions.disabled));
  t.is(new Set(instance.dragControls.elements).size, draggables.length);
  t.true(draggables.every(draggable => instance.dragControls.elements.includes(draggable.getElement())));
  t.true(buttonVisibility['check-answer']);
  t.false(buttonVisibility['show-solution']);
  t.false(buttonVisibility['try-again']);
});

test('keepCorrectAnswers Retry retains only the checked correct placement after Show Solution', t => {
  const { buttons, draggables, droppables, instance } = createTask({ keepCorrectAnswers: true });
  instance.drop(draggables[0], droppables[0]);
  instance.drop(draggables[2], droppables[1]);
  buttons['check-answer']();
  buttons['show-solution']();

  buttons['try-again']();

  t.deepEqual(instance.getCurrentState(), [{ draggable: 0, droppable: 0 }]);
  t.is(instance.getScore(), 1);
  t.true(instance.getAnswerGiven());
  t.is(droppables[0].containedDraggable, draggables[0]);
  t.is(droppables[1].containedDraggable, null);
  t.true(droppables[0].hasCorrectFeedback());
  t.false(droppables[1].hasFeedback());
  t.true(draggables[0].getElement().draggableOptions.disabled);
  t.false(instance.dragControls.elements.includes(draggables[0].getElement()));
  t.true(droppables.every(droppable => droppable.$showSolution.get(0).hidden));
});

test('full correct evaluation keeps Show Solution unreachable and public solution rendering idempotent', t => {
  const { buttonVisibility, buttons, draggables, droppables, instance } = createTask();
  instance.drop(draggables[0], droppables[0]);
  instance.drop(draggables[1], droppables[1]);

  buttons['check-answer']();

  t.false(buttonVisibility['show-solution']);
  t.false(buttonVisibility['try-again']);
  t.is(instance.getScore(), 2);
  t.true(instance.getAnswerGiven());

  instance.showSolutions();
  instance.showSolutions();

  t.is(instance.getScore(), 2);
  t.deepEqual(instance.getCurrentState(), [
    { draggable: 0, droppable: 0 },
    { draggable: 1, droppable: 1 }
  ]);
  t.true(droppables.every(droppable => droppable.$showSolution.get(0).children.length === 1));
  t.true(droppables.every(droppable => droppable.hasCorrectFeedback()));
  t.deepEqual(instance.dragControls.elements, []);
});
