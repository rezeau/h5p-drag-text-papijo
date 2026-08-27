import test from 'ava';

import { DragText, createHarness } from './helpers/drag-text-harness';

test('getCurrentState returns undefined before draggables are initialized', t => {
  const instance = Object.create(DragText.prototype);

  t.is(instance.getCurrentState(), undefined);
});

test('getCurrentState returns an empty array for initialized empty state', t => {
  const { instance } = createHarness();

  t.deepEqual(instance.getCurrentState(), []);
});

test('getCurrentState returns a partially filled state', t => {
  const { draggables, droppables, instance } = createHarness();

  instance.drop(draggables[1], droppables[2]);

  t.deepEqual(instance.getCurrentState(), [
    { draggable: 1, droppable: 2 }
  ]);
});

test('getCurrentState follows draggable array order, not droppable order', t => {
  const { draggables, droppables, instance } = createHarness();

  instance.drop(draggables[2], droppables[0]);
  instance.drop(draggables[0], droppables[2]);

  t.deepEqual(instance.getCurrentState(), [
    { draggable: 0, droppable: 2 },
    { draggable: 2, droppable: 0 }
  ]);
});

test('empty previousState leaves relationships empty and unanswered', t => {
  const { draggables, droppables, instance } = createHarness({ previousState: [] });

  instance.setH5PUserState();

  t.false(instance.getAnswerGiven());
  t.true(draggables.every(draggable => draggable.insideDropzone === null));
  t.true(droppables.every(droppable => droppable.containedDraggable === null));
});

test('valid partial previousState restores both sides of each relationship', t => {
  const { draggables, droppables, instance } = createHarness({
    previousState: [{ draggable: 2, droppable: 0 }]
  });

  instance.setH5PUserState();

  t.is(draggables[2].insideDropzone, droppables[0]);
  t.is(droppables[0].containedDraggable, draggables[2]);
  t.deepEqual(instance.getCurrentState(), [{ draggable: 2, droppable: 0 }]);
  t.true(instance.getAnswerGiven());
});

test('valid full previousState restores every placement', t => {
  const previousState = [
    { draggable: 0, droppable: 1 },
    { draggable: 1, droppable: 2 },
    { draggable: 2, droppable: 0 }
  ];
  const { instance } = createHarness({ previousState });

  instance.setH5PUserState();

  t.deepEqual(instance.getCurrentState(), previousState);
});

test('invalid previousState indexes throw the production error', t => {
  const { instance } = createHarness({
    previousState: [{ draggable: 99, droppable: 0 }]
  });

  const error = t.throws(() => instance.setH5PUserState());
  t.is(error.message, 'Stored user state is invalid');
});

test('getAnswerGiven tracks fresh, dropped, checked, and retried states', t => {
  const { buttons, draggables, droppables, instance } = createHarness();

  t.false(instance.getAnswerGiven());

  instance.drop(draggables[0], droppables[0]);
  t.true(instance.getAnswerGiven());

  instance.addButtons();
  buttons['check-answer']();
  t.true(instance.getAnswerGiven());

  buttons['try-again']();
  t.false(instance.getAnswerGiven());
  t.deepEqual(instance.getCurrentState(), []);
});

test('scoring reports zero, partial, full, and wrong placements', t => {
  const { draggables, droppables, instance } = createHarness();

  t.is(instance.getScore(), 0);
  t.is(instance.getMaxScore(), 3);

  instance.drop(draggables[0], droppables[0]);
  instance.drop(draggables[1], droppables[2]);
  t.is(instance.getScore(), 1);

  instance.drop(draggables[1], droppables[1]);
  instance.drop(draggables[2], droppables[2]);
  t.is(instance.getScore(), 3);
});

test('resetTask clears answered, score, placements, and disabled state', t => {
  const { draggables, droppables, instance } = createHarness();

  instance.drop(draggables[0], droppables[0]);
  instance.drop(draggables[1], droppables[1]);
  draggables.forEach(draggable => draggable.disableDraggable());
  droppables.forEach(droppable => droppable.disableDropzoneAndContainedDraggable());

  instance.resetTask();

  t.false(instance.getAnswerGiven());
  t.is(instance.getScore(), 0);
  t.deepEqual(instance.getCurrentState(), []);
  t.true(draggables.every(draggable => !draggable.disabled));
  t.true(droppables.every(droppable => !droppable.disabled));
});

test('retry with keepCorrectAnswers retains correct and resets incorrect answers', t => {
  const { buttons, draggables, droppables, instance } = createHarness({
    keepCorrectAnswers: true
  });

  instance.drop(draggables[0], droppables[0]);
  instance.drop(draggables[1], droppables[2]);
  instance.addButtons();
  buttons['check-answer']();

  t.true(droppables[0].hasCorrectFeedback());
  t.false(droppables[2].hasCorrectFeedback());

  buttons['try-again']();

  t.deepEqual(instance.getCurrentState(), [{ draggable: 0, droppable: 0 }]);
  t.is(droppables[0].containedDraggable, draggables[0]);
  t.is(droppables[2].containedDraggable, null);
  t.true(draggables[0].disabled);
  t.false(draggables[1].disabled);
  t.false(instance.getAnswerGiven());
  t.is(instance.getScore(), 1);
});

test('resetTask clears correct answers even when keepCorrectAnswers is enabled', t => {
  const { draggables, droppables, instance } = createHarness({
    keepCorrectAnswers: true
  });

  instance.drop(draggables[0], droppables[0]);
  droppables[0].addFeedback();
  instance.resetTask();

  t.deepEqual(instance.getCurrentState(), []);
  t.is(instance.getScore(), 0);
});

test('showEvaluation creates and triggers an answered xAPI event', t => {
  const { draggables, droppables, events, instance } = createHarness();
  instance.drop(draggables[0], droppables[0]);

  instance.showEvaluation();

  const answered = events
    .map(entry => entry.event)
    .find(event => typeof event === 'object');
  t.truthy(answered);
  t.is(answered.data.statement.verb.id, 'https://adlnet.gov/expapi/verbs/answered');
  t.is(answered.data.statement.result.score.raw, 1);
  t.is(answered.data.statement.result.score.max, 3);
  t.is(answered.data.statement.result.response, 'one[,][,]');
});

test('getXAPIData returns the current statement contract', t => {
  const { draggables, droppables, instance } = createHarness();
  instance.drop(draggables[2], droppables[1]);

  const data = instance.getXAPIData();

  t.deepEqual(Object.keys(data), ['statement']);
  t.is(data.statement.object.definition.interactionType, 'fill-in');
  t.deepEqual(data.statement.object.definition.correctResponsesPattern, [
    'one[,]two[,]three'
  ]);
  t.is(data.statement.result.response, '[,]three[,]');
  t.is(data.statement.result.score.raw, 0);
  t.true(data.statement.result.completion);
});
