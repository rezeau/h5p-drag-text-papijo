import test from 'ava';

import {
  DragText,
  createParentHarness,
  resetSpeechBubbles,
  speechBubbles
} from './helpers/drag-drop-dom-harness';

import StopWatch from '../src/scripts/stop-watch';

require('../src/scripts/joubel-tip-papijo');

const createTask = (answers = ['one', 'two'], options = {}) => {
  const harness = createParentHarness(options);
  const { instance } = harness;
  const draggables = answers.map(answer => instance.createDraggable(answer));
  const droppables = answers.map((answer, index) => instance.createDroppable(
    index + 1, [answer], `${answer} tip`, undefined, undefined, undefined, false
  ));

  draggables.forEach(draggable => {
    draggable.appendDraggableTo(instance.$draggables);
    instance.addDraggableToControls(instance.dragControls, draggable);
  });

  return { ...harness, draggables, droppables };
};

const interactionEvent = type => ({
  type,
  preventDefault() {},
  stopPropagation() {}
});

test('constructing two tasks gives each its own content, IDs, controls, state, and timer', t => {
  const first = new DragText({ textField: '*alpha*', distractors: '' }, 101, {});
  const second = new DragText({ textField: '*beta*', distractors: '' }, 202, {});

  t.is(first.introductionId, 'h5p-drag-text-101-introduction');
  t.is(second.introductionId, 'h5p-drag-text-202-introduction');
  t.not(first.introductionId, second.introductionId);
  t.is(first.draggables[0].getAnswerText(), 'alpha');
  t.is(second.draggables[0].getAnswerText(), 'beta');
  t.not(first.dragControls, second.dragControls);
  t.not(first.dropControls, second.dropControls);
  t.not(first.stopWatch, second.stopWatch);
  t.deepEqual(first.getCurrentState(), []);
  t.deepEqual(second.getCurrentState(), []);
});

test('drop, move, and revert transitions in one task do not alter the other task', t => {
  const first = createTask(['alpha', 'bravo']);
  const second = createTask(['charlie', 'delta']);

  first.instance.drop(first.draggables[0], first.droppables[0]);
  first.instance.drop(first.draggables[0], first.droppables[1]);

  t.deepEqual(first.instance.getCurrentState(), [{ draggable: 0, droppable: 1 }]);
  t.deepEqual(second.instance.getCurrentState(), []);
  t.is(first.instance.getScore(), 0);
  t.is(second.instance.getScore(), 0);
  t.false(second.instance.getAnswerGiven());
  t.deepEqual(second.instance.dragControls.elements, second.draggables.map(item => item.getElement()));

  first.instance.revert(first.draggables[0]);
  t.deepEqual(first.instance.getCurrentState(), []);
  t.deepEqual(second.instance.getCurrentState(), []);
});

test('a global physical drop callback ignores a draggable owned by another instance', t => {
  const first = createTask(['alpha']);
  const second = createTask(['beta']);
  const secondDropOptions = second.droppables[0].getElement().droppableOptions;

  secondDropOptions.over();
  secondDropOptions.drop({}, { draggable: first.draggables[0].$draggable });

  t.is(first.draggables[0].getInsideDropzone(), null);
  t.is(second.droppables[0].containedDraggable, null);
  t.deepEqual(first.instance.getCurrentState(), []);
  t.deepEqual(second.instance.getCurrentState(), []);
  t.deepEqual(second.instance.hoveredDroppables, []);
});

test('evaluation and full reset remain local to the selected instance', t => {
  const first = createTask(['alpha']);
  const second = createTask(['beta']);
  first.instance.drop(first.draggables[0], first.droppables[0]);
  second.instance.drop(second.draggables[0], second.droppables[0]);
  first.instance.answered = true;
  second.instance.answered = true;
  first.droppables[0].addFeedback();
  second.droppables[0].addFeedback();

  first.instance.resetTask();

  t.false(first.instance.answered);
  t.deepEqual(first.instance.getCurrentState(), []);
  t.is(first.instance.getScore(), 0);
  t.true(second.instance.answered);
  t.deepEqual(second.instance.getCurrentState(), [{ draggable: 0, droppable: 0 }]);
  t.is(second.instance.getScore(), 1);
  t.true(second.droppables[0].hasCorrectFeedback());
});

test('show-solution disabling remains local to its owning instance', t => {
  const first = createTask(['alpha']);
  const second = createTask(['beta']);
  first.instance.drop(first.draggables[0], first.droppables[0]);
  second.instance.drop(second.draggables[0], second.droppables[0]);

  first.instance.showSolutions();

  t.true(first.draggables[0].getElement().draggableOptions.disabled);
  t.true(first.droppables[0].$showSolution.get(0).hidden === false);
  t.not(second.draggables[0].getElement().draggableOptions.disabled, true);
  t.true(second.droppables[0].$showSolution.get(0).hidden);
  t.deepEqual(second.instance.getCurrentState(), [{ draggable: 0, droppable: 0 }]);
});

test('drop controls, keyboard ownership, and resize listeners remain instance-local', t => {
  const first = createTask(['alpha']);
  const second = createTask(['beta']);
  let firstResizeCount = 0;
  let secondResizeCount = 0;
  first.instance.changeLayoutToFitWidth = () => { firstResizeCount += 1; };
  second.instance.changeLayoutToFitWidth = () => { secondResizeCount += 1; };
  first.instance.on('resize', first.instance.resize, first.instance);
  second.instance.on('resize', second.instance.resize, second.instance);
  const secondTabIndex = second.draggables[0].getElement().getAttribute('tabindex');

  first.instance.drop(first.draggables[0], first.droppables[0]);

  t.is(firstResizeCount, 1);
  t.is(secondResizeCount, 0);
  t.deepEqual(first.instance.dragControls.elements, []);
  t.deepEqual(second.instance.dragControls.elements, [second.draggables[0].getElement()]);
  t.is(second.draggables[0].getElement().getAttribute('tabindex'), secondTabIndex);
  t.is(second.instance.selectedElement, undefined);
});

test.serial('the global single tooltip popup updates both owning instances without stale ARIA', t => {
  resetSpeechBubbles();
  const first = createTask(['alpha']);
  const second = createTask(['beta']);
  const firstTip = first.droppables[0].$tip;
  const secondTip = second.droppables[0].$tip;

  firstTip.get(0).dispatchEvent(interactionEvent('click'));
  t.is(firstTip.attr('aria-expanded'), 'true');
  t.is(secondTip.attr('aria-expanded'), 'false');

  secondTip.get(0).dispatchEvent(interactionEvent('click'));
  t.is(speechBubbles.length, 2);
  t.true(speechBubbles[0].removed);
  t.false(speechBubbles[1].removed);
  t.is(firstTip.attr('aria-expanded'), 'false');
  t.is(firstTip.find('.hidden-but-read').html(), '');
  t.is(secondTip.attr('aria-expanded'), 'true');

  first.instance.resetTask();
  t.is(secondTip.attr('aria-expanded'), 'true');
  t.false(speechBubbles[1].removed);
});

test.serial('stopwatch state is not shared across task instances', t => {
  const originalNow = Date.now;
  let now = 1000;
  Date.now = () => now;
  try {
    const first = new StopWatch().start();
    now = 1500;
    const second = new StopWatch().start();
    now = 2000;
    t.is(first.stop(), 1);
    t.is(second.stop(), 0.5);

    second.reset();
    t.is(second.duration, 0);
    t.is(first.duration, 1000);
  }
  finally {
    Date.now = originalNow;
  }
});

test('repeated cycles do not duplicate instance or element listeners', t => {
  const first = createTask(['alpha']);
  const second = createTask(['beta']);
  const firstHandlerCounts = Object.fromEntries(
    Object.entries(first.instance.handlers).map(([name, handlers]) => [name, handlers.length])
  );
  const secondHandlerCounts = Object.fromEntries(
    Object.entries(second.instance.handlers).map(([name, handlers]) => [name, handlers.length])
  );
  const touchCounts = Object.fromEntries(
    Object.entries(first.draggables[0].getElement().eventListeners)
      .map(([name, handlers]) => [name, handlers.length])
  );

  for (let cycle = 0; cycle < 3; cycle++) {
    first.instance.drop(first.draggables[0], first.droppables[0]);
    first.instance.revert(first.draggables[0]);
    first.instance.resetTask();
  }

  t.deepEqual(
    Object.fromEntries(Object.entries(first.instance.handlers).map(([name, handlers]) => [name, handlers.length])),
    firstHandlerCounts
  );
  t.deepEqual(
    Object.fromEntries(Object.entries(second.instance.handlers).map(([name, handlers]) => [name, handlers.length])),
    secondHandlerCounts
  );
  t.deepEqual(
    Object.fromEntries(Object.entries(first.draggables[0].getElement().eventListeners)
      .map(([name, handlers]) => [name, handlers.length])),
    touchCounts
  );
  t.deepEqual(second.instance.getCurrentState(), []);
});

test.serial('interleaved keep-correct Retry and ordinary reset preserve instance ownership', t => {
  resetSpeechBubbles();
  const first = createTask(['alpha'], { keepCorrectAnswers: true });
  const second = createTask(['beta']);
  first.instance.drop(first.draggables[0], first.droppables[0]);
  second.instance.drop(second.draggables[0], second.droppables[0]);
  first.droppables[0].addFeedback();
  second.droppables[0].addFeedback();

  first.instance.resetDraggables();
  second.instance.resetTask();
  second.instance.drop(second.draggables[0], second.droppables[0]);
  first.droppables[0].$tip.get(0).dispatchEvent(interactionEvent('click'));

  t.deepEqual(first.instance.getCurrentState(), [{ draggable: 0, droppable: 0 }]);
  t.is(first.instance.getScore(), 1);
  t.true(first.droppables[0].hasCorrectFeedback());
  t.deepEqual(second.instance.getCurrentState(), [{ draggable: 0, droppable: 0 }]);
  t.is(second.instance.getScore(), 1);
  t.false(second.droppables[0].hasFeedback());
  t.is(first.droppables[0].$tip.attr('aria-expanded'), 'true');
  t.is(second.droppables[0].$tip.attr('aria-expanded'), 'false');
});

test('transparent feedback settings remain isolated between instances', t => {
  const transparentTask = createTask(['alpha']);
  const ordinaryTask = createTask(['beta']);
  transparentTask.instance.params.behaviour.transparentBackground = true;

  transparentTask.instance.drop(
    transparentTask.draggables[0], transparentTask.droppables[0]
  );
  transparentTask.droppables[0].addFeedback();

  ordinaryTask.instance.drop(ordinaryTask.draggables[0], ordinaryTask.droppables[0]);
  ordinaryTask.droppables[0].addFeedback();

  t.true(transparentTask.droppables[0].$dropzone.hasClass('transparent-background'));
  t.true(transparentTask.draggables[0].$draggable.hasClass('transparent'));
  t.false(ordinaryTask.droppables[0].$dropzone.hasClass('transparent-background'));
  t.false(ordinaryTask.draggables[0].$draggable.hasClass('transparent'));
});
