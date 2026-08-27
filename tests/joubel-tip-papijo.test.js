import test from 'ava';

import {
  $,
  Draggable,
  FakeElement,
  createParentHarness,
  resetSpeechBubbles,
  speechBubbles,
  tooltipCalls
} from './helpers/drag-drop-dom-harness';

require('../src/scripts/joubel-tip-papijo');

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
