import test from 'ava';

import { $, createParentHarness } from './helpers/drag-drop-dom-harness';

const createTask = (options = {}) => {
  const harness = createParentHarness({ instantFeedback: true, ...options });
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

const answeredEvents = eventLog => eventLog
  .filter(entry => typeof entry.name === 'object')
  .map(entry => entry.name)
  .filter(event => event.data.statement.verb.id === 'https://adlnet.gov/expapi/verbs/answered');

test('instant feedback evaluates and disables a partial correct placement immediately', t => {
  const { buttonVisibility, eventLog, instance, draggables, droppables } = createTask();

  instance.drop(draggables[0], droppables[0]);

  t.true(droppables[0].hasCorrectFeedback());
  t.is(instance.getScore(), 1);
  t.true(instance.getAnswerGiven());
  t.deepEqual(instance.getCurrentState(), [{ draggable: 0, droppable: 0 }]);
  t.is(draggables[0].getElement().getAttribute('aria-disabled'), 'true');
  t.is(droppables[0].getElement().getAttribute('aria-disabled'), 'true');
  t.is(global.document.activeElement, draggables[1].getElement());
  t.false(buttonVisibility['try-again']);
  t.false(buttonVisibility['show-solution']);
  t.is(answeredEvents(eventLog).length, 0);
  t.is(eventLog.filter(entry => entry.name === 'xapi:interacted').length, 1);
});

test('instant feedback keeps an incorrect distractor movable and permits correction', t => {
  const { eventLog, instance, draggables, droppables } = createTask();
  const distractor = draggables[2];
  const zone = droppables[0];

  instance.drop(distractor, zone);

  t.true(zone.getElement().classes.has('h5p-drag-wrong-feedback'));
  t.is(instance.getScore(), 0);
  t.deepEqual(instance.getCurrentState(), [{ draggable: 2, droppable: 0 }]);
  t.is(distractor.getElement().getAttribute('aria-disabled'), null);
  t.is(zone.getElement().getAttribute('aria-disabled'), null);
  t.is(global.document.activeElement, zone.getElement());

  instance.drop(draggables[0], zone);

  t.is(zone.containedDraggable, draggables[0]);
  t.is(distractor.getInsideDropzone(), null);
  t.is(distractor.getElement().parent, instance.$draggables.get(0));
  t.true(zone.hasCorrectFeedback());
  t.false(distractor.getElement().classes.has('h5p-drag-draggable-wrong'));
  t.is(instance.getScore(), 1);
  t.is(new Set(instance.dragControls.elements).size, instance.dragControls.elements.length);
  t.is(answeredEvents(eventLog).length, 0);
});

test('instant feedback evaluates only full responses and emits one answered event per full attempt', t => {
  const { buttonVisibility, eventLog, instance, draggables, droppables } = createTask();

  instance.drop(draggables[0], droppables[0]);
  t.is(answeredEvents(eventLog).length, 0);

  instance.drop(draggables[2], droppables[1]);
  let answered = answeredEvents(eventLog);
  t.is(answered.length, 1);
  t.is(answered[0].data.statement.result.response, 'one[,]other');
  t.is(answered[0].data.statement.result.score.raw, 1);
  t.true(answered[0].data.statement.result.completion);
  t.true(buttonVisibility['try-again']);
  t.true(buttonVisibility['show-solution']);
  t.is(droppables[1].getElement().getAttribute('aria-disabled'), null);

  instance.drop(draggables[1], droppables[1]);
  answered = answeredEvents(eventLog);
  t.is(answered.length, 2);
  t.is(answered[1].data.statement.result.response, 'one[,]two');
  t.is(answered[1].data.statement.result.score.raw, 2);
  t.is(instance.getScore(), 2);
  t.false(buttonVisibility['try-again']);
  t.false(buttonVisibility['show-solution']);
  t.deepEqual(instance.dragControls.elements, []);
  t.is(draggables[2].getElement().getAttribute('tabindex'), '-1');
  t.is(global.document.activeElement, instance.$introductionParent.get(0));
});

test('correct and incorrect placement orders evaluate only once all zones are occupied', t => {
  const first = createTask();
  first.instance.drop(first.draggables[0], first.droppables[0]);
  first.instance.drop(first.draggables[2], first.droppables[0]);
  t.is(answeredEvents(first.eventLog).length, 0);
  t.is(first.instance.getScore(), 0);

  const second = createTask();
  second.instance.drop(second.draggables[2], second.droppables[0]);
  second.instance.drop(second.draggables[1], second.droppables[1]);
  t.is(answeredEvents(second.eventLog).length, 1);
  t.is(answeredEvents(second.eventLog)[0].data.statement.result.response, 'other[,]two');
  t.is(second.instance.getScore(), 1);
});

test('instant-feedback Retry retains correct answers and resets distractors with controls synchronized', t => {
  const { buttons, instance, draggables, droppables } = createTask({ keepCorrectAnswers: true });
  instance.drop(draggables[0], droppables[0]);
  instance.drop(draggables[2], droppables[1]);

  buttons['try-again']();

  t.is(droppables[0].containedDraggable, draggables[0]);
  t.is(droppables[1].containedDraggable, null);
  t.is(draggables[2].getInsideDropzone(), null);
  t.true(instance.getAnswerGiven());
  t.is(instance.getScore(), 1);
  t.deepEqual(instance.getCurrentState(), [{ draggable: 0, droppable: 0 }]);
  t.is(draggables[0].getElement().getAttribute('aria-disabled'), 'true');
  t.is(droppables[0].getElement().getAttribute('aria-disabled'), 'true');
  t.false(instance.dragControls.elements.includes(draggables[0].getElement()));
  t.false(instance.dropControls.elements.includes(droppables[0].getElement()));
  t.true(instance.dragControls.elements.includes(draggables[2].getElement()));
  t.is(new Set(instance.dragControls.elements).size, instance.dragControls.elements.length);

  instance.drop(draggables[1], droppables[1]);
  t.is(instance.getScore(), 2);
  t.deepEqual(instance.getCurrentState(), [
    { draggable: 0, droppable: 0 },
    { draggable: 1, droppable: 1 }
  ]);
  t.deepEqual(instance.dragControls.elements, []);
  t.is(global.document.activeElement, instance.$introductionParent.get(0));
});

test('repeated distractor moves clear prior feedback and preserve one owner', t => {
  const { eventLog, instance, draggables, droppables } = createTask();
  const distractor = draggables[2];

  instance.drop(distractor, droppables[0]);
  instance.drop(distractor, droppables[1]);
  instance.drop(distractor, droppables[1]);

  t.is(droppables[0].containedDraggable, null);
  t.false(droppables[0].hasFeedback());
  t.is(droppables[0].getElement().getAttribute('aria-label'), 'Drop Zone 1 is empty.');
  t.is(droppables[1].containedDraggable, distractor);
  t.is(distractor.getInsideDropzone(), droppables[1]);
  t.true(droppables[1].getElement().classes.has('h5p-drag-wrong-feedback'));
  t.deepEqual(instance.getCurrentState(), [{ draggable: 2, droppable: 1 }]);
  t.is(instance.getScore(), 0);
  t.is(new Set(instance.dragControls.elements).size, instance.dragControls.elements.length);
  t.is(eventLog.filter(entry => entry.name === 'xapi:interacted').length, 3);
});

test('resetTask fully clears retained instant-feedback answers and re-enables the task', t => {
  const { instance, draggables, droppables } = createTask({ keepCorrectAnswers: true });
  instance.drop(draggables[0], droppables[0]);
  instance.drop(draggables[2], droppables[1]);

  instance.resetTask();

  t.false(instance.getAnswerGiven());
  t.is(instance.getScore(), 0);
  t.deepEqual(instance.getCurrentState(), []);
  t.true(draggables.every(draggable => draggable.getElement().getAttribute('aria-disabled') === 'false'));
  t.true(droppables.every(droppable => droppable.getElement().getAttribute('aria-disabled') === 'false'));
  t.true(draggables.every(draggable => draggable.getElement().parent === instance.$draggables.get(0)));
});

test('saved distractor placement restores its stable initial index and remains incorrect', t => {
  const { eventLog, instance, draggables, droppables } = createTask();
  instance.previousState = [{ draggable: 2, droppable: 0 }];

  instance.setH5PUserState();

  t.is(droppables[0].containedDraggable, draggables[2]);
  t.is(draggables[2].getInsideDropzone(), droppables[0]);
  t.deepEqual(instance.getCurrentState(), [{ draggable: 2, droppable: 0 }]);
  t.is(instance.getScore(), 0);
  t.is(instance.getXAPIResponse(), 'other[,]');
  t.true(instance.getAnswerGiven());
  t.is(droppables[0].getElement().getAttribute('aria-disabled'), null);
  t.is(answeredEvents(eventLog).length, 0);
});

test('duplicate visible solution and distractor text retain distinct identity but score by text', t => {
  const harness = createParentHarness({ instantFeedback: true });
  const { instance } = harness;
  const solution = instance.createDraggable('one');
  instance.createDraggable('two');
  const duplicateDistractor = instance.createDraggable('one');
  const zone = instance.createDroppable(1, ['one'], undefined, undefined, undefined, undefined, false);
  [solution, instance.draggables[1], duplicateDistractor].forEach(draggable => {
    draggable.appendDraggableTo(instance.$draggables);
    instance.addDraggableToControls(instance.dragControls, draggable);
  });

  instance.drop(duplicateDistractor, zone);

  t.not(solution, duplicateDistractor);
  t.is(solution.getInitialIndex(), 0);
  t.is(duplicateDistractor.getInitialIndex(), 2);
  t.deepEqual(instance.getCurrentState(), [{ draggable: 2, droppable: 0 }]);
  t.is(instance.getScore(), 1);
});

test('distractor syntax creates separate draggable identities after solution draggables', t => {
  const { instance } = createParentHarness();
  instance.textFieldHtml = '*one*';
  instance.distractorsHtml = '*fake/decoy*';

  instance.addTaskTo($('<div/>'));

  t.deepEqual(instance.draggables.map(draggable => draggable.getAnswerText()), [
    'one',
    'fake',
    'decoy'
  ]);
  t.deepEqual(instance.draggables.map(draggable => draggable.getInitialIndex()), [0, 1, 2]);
  t.is(instance.droppables.length, 1);
  t.deepEqual(instance.droppables[0].text, ['one']);
});
