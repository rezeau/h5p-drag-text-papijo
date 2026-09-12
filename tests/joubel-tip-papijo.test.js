import test from 'ava';
import fs from 'node:fs';

import {
  $,
  Draggable,
  FakeElement,
  createParentHarness,
  resetSpeechBubbles,
  setNextSpeechBubbleRect,
  speechBubbles,
  tooltipCalls
} from './helpers/drag-drop-dom-harness';

require('../src/scripts/joubel-tip-papijo');
const {
  eventTargetIsWithin,
  getAccessibleAncestorDocuments,
  getSpeechBubbleLayoutPlan,
  getSpeechBubblePlacement,
  watchSpeechBubbleImages
} = require('../src/scripts/joubel-tip-papijo');

const interactionEvent = (type, which) => ({
  type,
  which,
  prevented: false,
  stopped: false,
  preventDefault() {
    this.prevented = true;
  },
  stopPropagation() {
    this.stopped = true;
  }
});

const createTipTask = ({ hideTips = false, tip = 'Helpful text' } = {}) => {
  const harness = createParentHarness();
  const { instance } = harness;
  instance.params.behaviour.hideTips = hideTips;
  const draggable = instance.createDraggable('one');
  const droppable = instance.createDroppable(
    1, ['one'], tip, undefined, undefined, undefined, false
  );
  draggable.appendDraggableTo(instance.$draggables);
  instance.addDraggableToControls(instance.dragControls, draggable);
  return { ...harness, draggable, droppable };
};

test.beforeEach(() => {
  resetSpeechBubbles();
  tooltipCalls.length = 0;
});

test.afterEach(() => {
  delete H5P.$body;
  delete H5P.$window;
  document.eventListeners = {};
  delete global.window;
});

test('places a rendered bubble below when it fits there', t => {
  t.deepEqual(getSpeechBubblePlacement(
    { top: 100, bottom: 120 },
    { height: 80 },
    { top: 0, bottom: 300 }
  ), { available: 171, direction: 'bottom', fits: true });
});

test('flips a bottom-edge image bubble above using its final rendered height', t => {
  t.deepEqual(getSpeechBubblePlacement(
    { top: 240, bottom: 260 },
    { height: 160 },
    { top: 0, bottom: 300 }
  ), { available: 231, direction: 'top', fits: true });
});

test('reserves enough bottom space when neither side initially fits', t => {
  const plan = getSpeechBubbleLayoutPlan(
    { top: 90, bottom: 110 },
    { height: 200 },
    { top: 0, bottom: 200 },
    0
  );

  t.deepEqual(plan, { direction: 'bottom', fits: false, reservedSpace: 119 });
  t.deepEqual(getSpeechBubbleLayoutPlan(
    { top: 90, bottom: 110 },
    { height: 200 },
    { top: 0, bottom: 319 },
    plan.reservedSpace
  ), plan);
});

test('fit-below and flip-above plans do not reserve extra height', t => {
  t.deepEqual(getSpeechBubbleLayoutPlan(
    { top: 100, bottom: 120 },
    { height: 80 },
    { top: 0, bottom: 300 }
  ), { direction: 'bottom', fits: true, reservedSpace: 0 });
  t.deepEqual(getSpeechBubbleLayoutPlan(
    { top: 240, bottom: 260 },
    { height: 160 },
    { top: 0, bottom: 300 }
  ), { direction: 'top', fits: true, reservedSpace: 0 });
});

test('temporary tooltip space is in flow and is removed on close', t => {
  const { eventLog, instance } = createParentHarness();
  instance.$inner = $('<div/>');

  instance.setTooltipReservedSpace(119.2);
  const spacer = instance.$inner.find('.papijo-tooltip-reserved-space');
  t.is(spacer.length, 1);
  t.is(spacer.get(0).style.height, '120px');
  t.is(spacer.attr('aria-hidden'), 'true');

  instance.setTooltipReservedSpace(0);
  t.is(instance.$inner.find('.papijo-tooltip-reserved-space').length, 0);
  t.is(eventLog.filter(event => event.name === 'resize').length, 2);
});

test('temporary tooltip space remains local to its DragText instance', t => {
  const first = createParentHarness();
  const second = createParentHarness();
  first.instance.$inner = $('<div/>');
  second.instance.$inner = $('<div/>');

  first.instance.setTooltipReservedSpace(150);

  t.is(first.instance.$inner.find('.papijo-tooltip-reserved-space').length, 1);
  t.is(second.instance.$inner.find('.papijo-tooltip-reserved-space').length, 0);
  t.is(second.instance.tooltipReservedSpace, undefined);
});

test.serial('neither-side lifecycle grows the container, avoids scrolling and cleans up', async t => {
  const frame = $('<div/>').addClass('h5p-frame');
  const frameElement = frame.get(0);
  frameElement.rectValue = { bottom: 200, height: 200, left: 0, right: 400, top: 0, width: 400 };
  const reservations = [];
  const tip = H5P.JoubelTip('Large image', {
    setReservedSpace(height) {
      reservations.push(height);
      frameElement.rectValue.bottom = 200 + height;
      frameElement.rectValue.height = 200 + height;
    }
  });
  frame.append(tip);
  tip.get(0).rectValue = {
    bottom: 110, height: 20, left: 180, right: 200, top: 90, width: 20
  };
  setNextSpeechBubbleRect({
    bottom: 310, height: 200, left: 80, right: 320, top: 110, width: 240
  });

  tip.get(0).dispatchEvent(interactionEvent('click'));
  await new Promise(resolve => setTimeout(resolve, 10));

  t.deepEqual(reservations, [119]);
  t.true(speechBubbles[0].element.classes.has('joubel-speech-bubble-bottom'));
  t.is($(speechBubbles[0].element).find('.joubel-speech-bubble-inner').get(0).style.overflowY, '');
  t.is(frameElement.rectValue.height, 319);

  tip.get(0).dispatchEvent(interactionEvent('click'));
  t.deepEqual(reservations, [119, 0]);
  t.is(frameElement.rectValue.height, 200);
});

test('image settlement requests layout refresh for managed, legacy and cached base64 images', t => {
  const managed = new FakeElement('img');
  const legacy = new FakeElement('img');
  const base64 = new FakeElement('img');
  managed.src = '/content/1/images/managed.png';
  legacy.src = 'https://example.com/legacy.png';
  base64.src = 'data:image/png;base64,AA==';
  base64.complete = true;
  let refreshes = 0;

  watchSpeechBubbleImages([managed, legacy, base64], () => refreshes++);
  t.is(refreshes, 1);

  managed.dispatchEvent({ type: 'load' });
  legacy.dispatchEvent({ type: 'error' });
  managed.dispatchEvent({ type: 'load' });
  t.is(refreshes, 3);
});

test('tooltip fix does not introduce global overflow-visible rules', t => {
  const css = fs.readFileSync('src/styles/drag-text.css', 'utf8');
  t.notRegex(css, /overflow\s*:\s*visible/i);
});

test.serial('opening a task tip propagates the normal H5P resize event', t => {
  const { droppable, eventLog } = createTipTask();

  droppable.$dropzoneContainer.find('.joubel-tip-container').get(0)
    .dispatchEvent(interactionEvent('click'));

  t.true(eventLog.some(event => event.name === 'resize'));
});

test.serial('plain tip creates an accessible keyboard and mouse button', t => {
  const tip = H5P.JoubelTip('Helpful text', { tipLabel: 'Show tip', tabcontrol: true });
  const element = tip.get(0);

  t.true(element.classes.has('joubel-tip-container'));
  t.is(element.getAttribute('role'), 'button');
  t.is(element.getAttribute('aria-label'), 'Show tip');
  t.is(element.getAttribute('aria-expanded'), 'false');
  t.is(element.getAttribute('tabindex'), '-1');
  t.is(tip.find('.hidden-but-read').length, 1);

  const click = interactionEvent('click');
  element.dispatchEvent(click);
  t.true(click.prevented);
  t.is(element.getAttribute('aria-expanded'), 'true');
  t.is(speechBubbles.length, 1);
  t.is(speechBubbles[0].html, 'Helpful text');
  t.is(tip.find('.hidden-but-read').html(), 'Helpful text');

  element.dispatchEvent(interactionEvent('click'));
  t.true(speechBubbles[0].removed);
  t.is(element.getAttribute('aria-expanded'), 'false');
  t.is(tip.find('.hidden-but-read').html(), '');
});

test.serial('Enter and Space toggle a tip while Escape closes it', t => {
  const tip = H5P.JoubelTip('Keyboard tip');
  const element = tip.get(0);

  const enter = interactionEvent('keydown', 13);
  element.dispatchEvent(enter);
  t.true(enter.prevented);
  t.true(enter.stopped);
  t.is(element.getAttribute('aria-expanded'), 'true');

  element.dispatchEvent(interactionEvent('keydown', 27));
  t.true(speechBubbles[0].removed);
  t.is(element.getAttribute('aria-expanded'), 'false');

  element.dispatchEvent(interactionEvent('keydown', 32));
  t.is(element.getAttribute('aria-expanded'), 'true');
});

test.serial('one outside pointerdown closes and removes the rendered bubble immediately', t => {
  const frame = $('<div/>').addClass('h5p-frame');
  const tip = H5P.JoubelTip('Outside click tip');
  frame.append(tip);
  tip.get(0).dispatchEvent(interactionEvent('click'));
  const bubbleElement = speechBubbles[0].element;

  document.dispatchEvent({
    type: 'pointerdown',
    target: new FakeElement('div')
  });

  t.true(speechBubbles[0].removed);
  t.is(bubbleElement.parent, null);
  t.is(tip.attr('aria-expanded'), 'false');
  t.is((document.eventListeners.pointerdown || []).length, 0);
});

test.serial('mousedown inside the bubble does not close it', t => {
  const frame = $('<div/>').addClass('h5p-frame');
  const tip = H5P.JoubelTip('Interactive bubble');
  frame.append(tip);
  tip.get(0).dispatchEvent(interactionEvent('click'));
  const bubbleElement = speechBubbles[0].element;
  document.dispatchEvent({
    type: 'pointerdown',
    target: bubbleElement.children[2]
  });
  const insideEvent = interactionEvent('mousedown.papijoSpeechBubble');
  insideEvent.target = bubbleElement.children[2];

  bubbleElement.dispatchEvent(insideEvent);

  t.true(insideEvent.stopped);
  t.false(speechBubbles[0].removed);
  t.is(bubbleElement.parent, frame.get(0));
  t.is(tip.attr('aria-expanded'), 'true');
});

test.serial('a descendant info-icon mousedown is ignored and its click toggles closed once', t => {
  const frame = $('<div/>').addClass('h5p-frame');
  const tip = H5P.JoubelTip('Toggle tip');
  const icon = new FakeElement('span');
  tip.get(0).appendChild(icon);
  frame.append(tip);
  tip.get(0).dispatchEvent(interactionEvent('click'));

  t.true(eventTargetIsWithin(tip.get(0), icon));
  document.dispatchEvent({ type: 'pointerdown', target: icon });
  t.false(speechBubbles[0].removed);
  tip.get(0).dispatchEvent(interactionEvent('click'));

  t.true(speechBubbles[0].removed);
  t.is(tip.attr('aria-expanded'), 'false');
  t.is(speechBubbles.length, 1);
});

test.serial('Escape and the inherited any-other-key path remove the DOM immediately', t => {
  const frame = $('<div/>').addClass('h5p-frame');
  const escapeTip = H5P.JoubelTip('Escape tip');
  frame.append(escapeTip);
  escapeTip.get(0).dispatchEvent(interactionEvent('click'));
  const escapeBubble = speechBubbles[0].element;
  escapeTip.get(0).dispatchEvent(interactionEvent('keydown', 27));
  t.is(escapeBubble.parent, null);

  const letterTip = H5P.JoubelTip('Letter-key tip');
  frame.append(letterTip);
  letterTip.get(0).dispatchEvent(interactionEvent('click'));
  const letterBubble = speechBubbles[1].element;
  letterTip.get(0).dispatchEvent(interactionEvent('keydown', 65));
  t.true(speechBubbles[1].removed);
  t.is(letterBubble.parent, null);
  t.is(letterTip.attr('aria-expanded'), 'false');
});

test.serial('opening another tooltip removes the first DOM and repeated cycles keep one pointer listener', t => {
  const frame = $('<div/>').addClass('h5p-frame');
  const first = H5P.JoubelTip('First lifecycle tip');
  const second = H5P.JoubelTip('Second lifecycle tip');
  frame.append(first).append(second);
  first.get(0).dispatchEvent(interactionEvent('click'));
  const firstBubble = speechBubbles[0].element;
  second.get(0).dispatchEvent(interactionEvent('click'));

  t.true(speechBubbles[0].removed);
  t.is(firstBubble.parent, null);
  t.is(first.attr('aria-expanded'), 'false');
  t.is(second.attr('aria-expanded'), 'true');
  t.is(document.eventListeners.pointerdown.length, 1);

  for (let cycle = 0; cycle < 3; cycle++) {
    second.get(0).dispatchEvent(interactionEvent('click'));
    t.is((document.eventListeners.pointerdown || []).length, 0);
    second.get(0).dispatchEvent(interactionEvent('click'));
    t.is(document.eventListeners.pointerdown.length, 1);
  }
});

test.serial('resize and reposition callbacks do not re-register the outside listener', async t => {
  let resizeHandler;
  H5P.$window = {
    off() {
      resizeHandler = undefined;
      return this;
    },
    on(name, handler) {
      resizeHandler = handler;
      return this;
    }
  };
  const frame = $('<div/>').addClass('h5p-frame');
  const tip = H5P.JoubelTip('Resize lifecycle tip', {
    onResize() {}
  });
  frame.append(tip);
  tip.get(0).dispatchEvent(interactionEvent('click'));

  resizeHandler();
  resizeHandler();
  await new Promise(resolve => setTimeout(resolve, 10));

  t.is(document.eventListeners.pointerdown.length, 1);
});

test.serial('a parent-document pointerdown closes a tooltip inside the H5P iframe', t => {
  const parentDocument = new FakeElement('document');
  const parentWindow = { document: parentDocument };
  parentWindow.parent = parentWindow;
  global.window = { document, parent: parentWindow };
  t.deepEqual(
    getAccessibleAncestorDocuments(global.window, document),
    [document, parentDocument]
  );
  const frame = $('<div/>').addClass('h5p-frame');
  const tip = H5P.JoubelTip('Cross-frame outside click');
  frame.append(tip);
  tip.get(0).dispatchEvent(interactionEvent('click'));
  const bubbleElement = speechBubbles[0].element;

  parentDocument.dispatchEvent({
    type: 'pointerdown',
    target: new FakeElement('button')
  });

  t.true(speechBubbles[0].removed);
  t.is(bubbleElement.parent, null);
  t.is(tip.attr('aria-expanded'), 'false');
  t.is((parentDocument.eventListeners.pointerdown || []).length, 0);
});

test.serial('blur alone does not close the custom tip popup', t => {
  const tip = H5P.JoubelTip('Persistent tip');
  const element = tip.get(0);
  element.dispatchEvent(interactionEvent('click'));

  element.dispatchEvent(interactionEvent('blur'));

  t.is(element.getAttribute('aria-expanded'), 'true');
  t.false(speechBubbles[0].removed);
});

test.serial('padded image-only and mixed HTML tips preserve markup for rendering', t => {
  const imageHtml = '\u200B\u200B<img src="image.png" width="120">';
  const imageTip = H5P.JoubelTip(imageHtml);
  t.truthy(imageTip);
  imageTip.get(0).dispatchEvent(interactionEvent('click'));
  t.is(speechBubbles[0].html, imageHtml);
  t.true(speechBubbles[0].width >= 120);

  const mixedHtml = 'Read <strong>this</strong> &amp; inspect <img src="image.png">';
  const mixedTip = H5P.JoubelTip(mixedHtml);
  mixedTip.get(0).dispatchEvent(interactionEvent('click'));
  t.is(speechBubbles[1].html, mixedHtml);
  t.is(mixedTip.find('.hidden-but-read').html(), mixedHtml);
});

test.serial('un-padded image-only or markup-only tips follow current invalid-tip behavior', t => {
  t.is(H5P.JoubelTip('<img src="image.png">'), undefined);
  t.is(H5P.JoubelTip('<br>'), undefined);
});

test.serial('identical tips keep independent popup state without cross-association', t => {
  const first = H5P.JoubelTip('Same tip');
  const second = H5P.JoubelTip('Same tip');

  first.get(0).dispatchEvent(interactionEvent('click'));
  second.get(0).dispatchEvent(interactionEvent('click'));
  t.is(speechBubbles.length, 2);
  t.true(speechBubbles[0].removed);
  t.false(speechBubbles[1].removed);
  t.is(first.attr('aria-expanded'), 'false');
  t.is(first.find('.hidden-but-read').html(), '');

  second.get(0).dispatchEvent(interactionEvent('click'));
  t.true(speechBubbles[1].removed);
  t.is(second.attr('aria-expanded'), 'false');
});

test.serial('Droppable attaches each tip to its own container and manages tab order on focus', async t => {
  const first = createTipTask({ tip: 'First tip' });
  const second = first.instance.createDroppable(
    2, ['two'], 'Second tip', undefined, undefined, undefined, false
  );

  t.is(first.droppable.$tip.get(0).parent, first.droppable.$dropzoneContainer.get(0));
  t.is(second.$tip.get(0).parent, second.$dropzoneContainer.get(0));
  t.not(first.droppable.$tip.get(0), second.$tip.get(0));
  t.true(first.droppable.$dropzoneContainer.hasClass('has-tip'));
  t.true(second.$dropzoneContainer.hasClass('has-tip'));

  first.droppable.getElement().dispatchEvent(interactionEvent('focus'));
  t.is(first.droppable.$tip.attr('tabindex'), '0');
  first.droppable.getElement().dispatchEvent(interactionEvent('blur'));
  await new Promise(resolve => setTimeout(resolve, 5));
  t.is(first.droppable.$tip.attr('tabindex'), '-1');
});

test.serial('Droppable tolerates a truthy tip whose rendered content is invalid', t => {
  const { instance } = createParentHarness();

  const create = () => instance.createDroppable(
    1, ['one'], '<br>', undefined, undefined, undefined, false
  );

  t.notThrows(create);
  const droppable = instance.droppables[0];
  t.is(droppable.$tip, undefined);
  t.false(droppable.$dropzoneContainer.hasClass('has-tip'));
});

test.serial('hideTips closes an open popup and removes the tip from tab order on correct feedback', t => {
  const { instance, draggable, droppable } = createTipTask({ hideTips: true });
  droppable.getElement().dispatchEvent(interactionEvent('focus'));
  droppable.$tip.get(0).dispatchEvent(interactionEvent('click'));
  t.is(droppable.$tip.attr('aria-expanded'), 'true');

  instance.drop(draggable, droppable);
  droppable.addFeedback();

  t.true(speechBubbles[0].removed);
  t.is(droppable.$tip.attr('aria-expanded'), 'false');
  t.is(droppable.$tip.attr('tabindex'), '-1');
  t.is(droppable.$tip.attr('style'), 'display: none;');
  t.false(droppable.$dropzoneContainer.hasClass('has-tip'));
});

test.serial('Retry-style feedback removal restores a tip hidden after a correct answer', t => {
  const { instance, draggable, droppable } = createTipTask({ hideTips: true });
  instance.drop(draggable, droppable);
  droppable.addFeedback();
  t.is(droppable.$tip.attr('style'), 'display: none;');

  instance.revert(draggable);

  t.is(droppable.$tip.attr('style'), '');
  t.true(droppable.$dropzoneContainer.hasClass('has-tip'));
  t.is(droppable.$tip.attr('tabindex'), '-1');
});

test.serial('moving an answer does not reparent or cross-associate its drop-zone tip', t => {
  const { instance, draggable, droppable } = createTipTask();
  const other = instance.createDroppable(
    2, ['two'], 'Other tip', undefined, undefined, undefined, false
  );
  const firstTipParent = droppable.$tip.get(0).parent;
  const secondTipParent = other.$tip.get(0).parent;

  instance.drop(draggable, droppable);
  instance.drop(draggable, other);

  t.is(droppable.$tip.get(0).parent, firstTipParent);
  t.is(other.$tip.get(0).parent, secondTipParent);
  t.is(droppable.containedDraggable, null);
  t.is(other.containedDraggable, draggable);
});

test.serial('tip and removable text coexist in one drop-zone container', t => {
  const { instance } = createParentHarness();
  const droppable = instance.createDroppable(
    1, ['new'], 'Why replace this?', undefined, undefined, 'old', false
  );

  t.is(droppable.$removableBlock.get(0).parent, droppable.getElement());
  t.is(droppable.$tip.get(0).parent, droppable.$dropzoneContainer.get(0));
  t.not(droppable.$removableBlock.get(0).parent, droppable.$tip.get(0).parent);
});

test.serial('short-format draggable tooltip is attached and removed on revert formatting', t => {
  const element = new FakeElement();
  const visibleText = new FakeElement('span');
  $(element).append(visibleText);
  const draggable = new Draggable('A very long answer', element, 0);
  draggable.shortFormat = 'A very…';

  draggable.setShortFormat();

  t.is(tooltipCalls.length, 1);
  t.is(tooltipCalls[0].element, element);
  t.deepEqual(tooltipCalls[0].options, { text: 'A very long answer' });
  t.is($(element).find('.h5p-tooltip').length, 1);

  draggable.removeShortFormat();
  t.is($(element).find('.h5p-tooltip').length, 0);
  t.is(visibleText.htmlContent, 'A very long answer');
});
