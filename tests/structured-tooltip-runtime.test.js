import test from 'ava';

import {
  createParentHarness,
  resetSpeechBubbles,
  speechBubbles
} from './helpers/drag-drop-dom-harness';
import { sanitizeTooltipText } from '../src/scripts/tooltip-sanitizer';

require('../src/scripts/joubel-tip-papijo');

const click = () => ({
  preventDefault() {},
  stopPropagation() {},
  type: 'click'
});

test.beforeEach(() => resetSpeechBubbles());

test('structured text-only tips use restricted sanitized markup', t => {
  const tip = H5P.JoubelTip('legacy value is ignored', {
    structuredTooltip: {
      image: null,
      text: 'Safe <strong onclick="bad()">bold</strong><script>bad()</script>'
    },
    tipLabel: 'Show tip'
  });

  tip.get(0).dispatchEvent(click());
  t.true(speechBubbles[0].html.includes('Safe <strong>bold</strong>'));
  t.false(speechBubbles[0].html.includes('onclick'));
  t.false(speechBubbles[0].html.includes('script'));
  t.false(speechBubbles[0].html.includes('bad()'));
});

test('structured image-only tips set managed src and alt through DOM output', t => {
  const tip = H5P.JoubelTip('', {
    structuredTooltip: {
      image: { alt: 'A flower', src: '/content/7/images/flower.png' },
      text: ''
    },
    tipLabel: 'Show tip'
  });

  tip.get(0).dispatchEvent(click());
  const bubble = speechBubbles.at(-1);
  t.true(bubble.html.includes('class="papijo-structured-tooltip-image"'));
  t.true(bubble.html.includes('src="/content/7/images/flower.png"'));
  t.true(bubble.html.includes('alt="A flower"'));
  t.true(bubble.width >= 240);
});

test('combined structured tips render sanitized text and one managed image', t => {
  const tip = H5P.JoubelTip('', {
    structuredTooltip: {
      image: { alt: 'Diagram', src: '/content/8/images/diagram.png' },
      text: 'Read <em>this</em>'
    }
  });

  tip.get(0).dispatchEvent(click());
  const bubble = speechBubbles.at(-1);
  t.true(bubble.html.includes('Read <em>this</em>'));
  t.true(bubble.html.includes('/content/8/images/diagram.png'));
});

test('blank structured content creates no tip', t => {
  t.is(H5P.JoubelTip('', {
    structuredTooltip: { image: null, text: '<br>' }
  }), undefined);
});

test('sanitizer preserves its restricted inline set and removes unsafe content', t => {
  t.is(
    sanitizeTooltipText('<em>A</em><strong>B</strong><sup>C</sup><sub>D</sub><s>E</s><br>'),
    '<em>A</em><strong>B</strong><sup>C</sup><sub>D</sub><s>E</s><br>'
  );
  t.is(sanitizeTooltipText('<iframe>frame</iframe><img src=x>text'), 'text');
});

test.serial('structured Droppable retains keyboard, hideTips and Retry lifecycle', t => {
  const { instance } = createParentHarness();
  instance.params.behaviour.hideTips = true;
  const draggable = instance.createDraggable('one');
  const droppable = instance.createDroppable(
    1,
    ['one'],
    undefined,
    undefined,
    undefined,
    undefined,
    false,
    { image: { alt: 'One', src: '/content/1/images/one.png' }, text: '' }
  );

  droppable.$tip.get(0).dispatchEvent(click());
  t.is(droppable.$tip.attr('aria-expanded'), 'true');
  instance.drop(draggable, droppable);
  droppable.addFeedback();
  t.is(droppable.$tip.attr('aria-expanded'), 'false');
  t.is(droppable.$tip.attr('style'), 'display: none;');
  instance.revert(draggable);
  t.is(droppable.$tip.attr('style'), '');
  t.true(droppable.$dropzoneContainer.hasClass('has-tip'));
});

test('legacy raw URL, base64 and mixed tips retain their exact HTML path', t => {
  const legacy = [
    '\u200B<img src="https://example.com/image.png">',
    '\u200B<img src="data:image/png;base64,AA==">',
    'Text <strong>and</strong> <img src="https://example.com/image.png">'
  ];

  legacy.forEach(html => {
    const tip = H5P.JoubelTip(html);
    tip.get(0).dispatchEvent(click());
    t.is(speechBubbles.at(-1).html, html);
  });
});
