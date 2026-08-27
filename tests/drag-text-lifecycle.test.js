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
  t.is(instance.getScore(), 1);
});

test('retry reports an answer given when keepCorrectAnswers retains a response', t => {
  const { buttons, draggables, droppables, instance } = createHarness({
    keepCorrectAnswers: true
  });

  instance.drop(draggables[0], droppables[0]);
  instance.drop(draggables[1], droppables[2]);
  instance.addButtons();
  buttons['check-answer']();
  buttons['try-again']();

  t.deepEqual(instance.getCurrentState(), [{ draggable: 0, droppable: 0 }]);
  t.is(instance.getScore(), 1);
  t.true(instance.getAnswerGiven());
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

test('partial showEvaluation creates a completed answered xAPI event', t => {
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
  t.true(answered.data.statement.result.completion);
  t.false(Object.hasOwn(answered.data.statement.result, 'success'));
});

test('xAPI fill-in responses preserve every drop-zone position', t => {
  const empty = createHarness();
  t.is(empty.instance.getXAPIResponse(), '[,][,]');

  const onePartial = createHarness();
  onePartial.instance.drop(onePartial.draggables[0], onePartial.droppables[1]);
  t.is(onePartial.instance.getXAPIResponse(), '[,]one[,]');

  const multiplePartial = createHarness();
  multiplePartial.instance.drop(multiplePartial.draggables[0], multiplePartial.droppables[0]);
  multiplePartial.instance.drop(multiplePartial.draggables[2], multiplePartial.droppables[2]);
  t.is(multiplePartial.instance.getXAPIResponse(), 'one[,][,]three');

  const full = createHarness();
  full.draggables.forEach((draggable, index) => {
    full.instance.drop(draggable, full.droppables[index]);
  });
  t.is(full.instance.getXAPIResponse(), 'one[,]two[,]three');
  t.is(full.instance.getScore(), 3);

  const wrong = createHarness();
  wrong.instance.drop(wrong.draggables[0], wrong.droppables[2]);
  t.is(wrong.instance.getXAPIResponse(), '[,][,]one');
  t.is(wrong.instance.getScore(), 0);
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
