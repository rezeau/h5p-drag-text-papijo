import test from 'ava';

import {
  DragText,
  resetSpeechBubbles,
  speechBubbles
} from './helpers/drag-drop-dom-harness';
import { getTooltipReferenceMarker } from '../src/scripts/scan-text-field';

require('../src/scripts/joubel-tip-papijo');

const FIRST_ID = '550e8400-e29b-41d4-a716-446655440000';
const SECOND_ID = '6ba7b810-9dad-41d1-80b4-00c04fd430c8';
const FIRST_MARKER = getTooltipReferenceMarker(FIRST_ID);
const SECOND_MARKER = getTooltipReferenceMarker(SECOND_ID);
const click = () => ({
  preventDefault() {},
  stopPropagation() {},
  type: 'click'
});

const definition = (id, path, alt) => ({ id, image: { path }, alt });
const createTask = (textField, tooltipImages = [], options = {}) => {
  H5P.getPath = options.getPath || ((path, contentId) => `/content/${contentId}/${path}`);
  const task = new DragText({
    behaviour: { alphaSort: true, hideTips: false },
    distractors: options.distractors || '',
    taskDescription: 'Task',
    textField,
    tooltipImages
  }, options.contentId || 17, options.contentData || {});
  task.hideButton = task.hideButton || (() => {});
  task.removeFeedback = task.removeFeedback || (() => {});
  task.setExplanation = task.setExplanation || (() => {});
  task.setFeedback = task.setFeedback || (() => {});
  task.showButton = task.showButton || (() => {});
  task.triggerXAPI = task.triggerXAPI || (() => {});
  return task;
};

const serialized = value => JSON.stringify(value);

test.serial('reference is removed before every answer, feedback, state, accessibility and xAPI consumer', t => {
  const source = `Lead *_old_alpha/beta::Hint\\+Correct \\-Incorrect${FIRST_MARKER}* tail`;
  const task = createTask(source, [definition(FIRST_ID, 'images/alpha.png', 'Alpha diagram')]);
  const droppable = task.droppables[0];
  const alpha = task.draggables.find(item => item.getAnswerText() === 'alpha');

  t.false(task.params.textField.includes('papijo-tip-ref'));
  t.false(task.textFieldHtml.includes('papijo-tip-ref'));
  t.deepEqual(droppable.text, ['alpha', 'beta']);
  t.is(droppable.correctFeedback, 'Correct');
  t.is(droppable.incorrectFeedback, 'Incorrect');
  t.is(droppable.removableBlock, 'old');
  t.is(droppable.$removableBlock.html(), 'old');
  t.true(task.draggables.every(item => !item.getAnswerText().includes('papijo-tip-ref')));
  t.true(task.draggables.every(item =>
    !serialized(item.getElement().attributes).includes('papijo-tip-ref')
  ));

  task.drop(alpha, droppable);
  task.setDroppableLabel(droppable.getElement(), alpha.getAnswerText(), 1);
  droppable.showSolution();
  const xapiDefinition = task.getxAPIDefinition();

  t.is(task.getScore(), 1);
  t.deepEqual(task.getCurrentState(), [{ draggable: alpha.getInitialIndex(), droppable: 0 }]);
  t.is(task.getXAPIResponse(), 'alpha');
  t.is(xapiDefinition.correctResponsesPattern[0], 'alpha/beta');
  t.false(droppable.getElement().getAttribute('aria-label').includes('papijo-tip-ref'));
  t.false(droppable.$showSolution.html().includes('papijo-tip-ref'));
  t.false(serialized({
    draggables: task.draggables.map(item => item.getAnswerText()),
    feedback: [droppable.correctFeedback, droppable.incorrectFeedback],
    state: task.getCurrentState(),
    xapiDefinition,
    xapiResponse: task.getXAPIResponse()
  }).includes('papijo-tip-ref'));
});

test.serial('multiple gaps, alternatives and duplicate visible answers resolve by distinct UUID', t => {
  const task = createTask(
    `*same/first${FIRST_MARKER}* then *same/second${SECOND_MARKER}*`,
    [
      definition(FIRST_ID, 'images/first.png', 'First image'),
      definition(SECOND_ID, 'images/second.png', 'Second image')
    ]
  );

  t.deepEqual(task.droppables.map(item => item.text), [
    ['same', 'first'], ['same', 'second']
  ]);
  t.deepEqual(task.droppables.map(item => item.structuredTooltip.image), [
    { alt: 'First image', src: '/content/17/images/first.png' },
    { alt: 'Second image', src: '/content/17/images/second.png' }
  ]);
  t.true(task.droppables.every(item => item.$tip && item.$dropzoneContainer.hasClass('has-tip')));
});

test.serial('missing, duplicate, malformed and orphan data fails closed without suppressing text tips', t => {
  let pathCalls = 0;
  const getPath = (path, contentId) => {
    pathCalls += 1;
    return `/content/${contentId}/${path}`;
  };
  const duplicateReference = createTask(
    `*one::Text one${FIRST_MARKER}* *two::Text two${FIRST_MARKER}*`,
    [definition(FIRST_ID, 'images/unused.png', 'Unused')],
    { getPath }
  );
  const duplicateDefinition = createTask(
    `*three::Text three${SECOND_MARKER}*`,
    [
      definition(SECOND_ID, 'images/a.png', 'A'),
      definition(SECOND_ID, 'images/b.png', 'B')
    ],
    { getPath }
  );
  const malformed = createTask(
    '*four::Text four&lt;!--papijo-tip-ref:v1:not-a-uuid--&gt;*',
    [definition(FIRST_ID, 'images/orphan.png', 'Orphan')],
    { getPath }
  );
  const missingText = createTask(`*zero::Text zero${SECOND_MARKER}*`, [], { getPath });
  const missingImageOnly = createTask(`*five${FIRST_MARKER}*`, [], { getPath });

  [...duplicateReference.droppables, ...malformed.droppables]
    .forEach(item => {
      t.is(item.structuredTooltip, null);
      t.truthy(item.$tip);
      t.false(item.tip.includes('papijo-tip-ref'));
    });
  t.deepEqual(duplicateDefinition.droppables[0].structuredTooltip, {
    image: null,
    text: 'Text three'
  });
  t.truthy(duplicateDefinition.droppables[0].$tip);
  t.deepEqual(missingText.droppables[0].structuredTooltip, {
    image: null,
    text: 'Text zero'
  });
  t.truthy(missingText.droppables[0].$tip);
  t.is(missingImageOnly.droppables[0].structuredTooltip, null);
  t.is(missingImageOnly.droppables[0].$tip, undefined);
  t.is(pathCalls, 0);
});

test.serial('invalid managed paths and blank alt never resolve or render', t => {
  const invalidDefinitions = [
    definition(FIRST_ID, 'https://example.com/x.png', 'External'),
    definition(SECOND_ID, 'images/ok.png', '   ')
  ];
  let pathCalls = 0;
  const task = createTask(
    `*one${FIRST_MARKER}* *two${SECOND_MARKER}*`,
    invalidDefinitions,
    { getPath: () => { pathCalls += 1; return '/unexpected'; } }
  );

  t.true(task.droppables.every(item => item.structuredTooltip === null));
  t.true(task.droppables.every(item => item.$tip === undefined));
  t.is(pathCalls, 0);
});

test.serial('combined managed tooltip uses structured rendering while unreferenced legacy HTML is unchanged', t => {
  resetSpeechBubbles();
  const legacy = '\u200B<img src="https://example.com/legacy.png">';
  const task = createTask(
    `*managed::Read <strong onclick="bad()">this</strong><script>bad()</script>${FIRST_MARKER}* ` +
      `*legacy::${legacy}*`,
    [definition(FIRST_ID, 'images/managed.png', 'Managed image')]
  );

  task.droppables[0].$tip.get(0).dispatchEvent(click());
  const structuredHtml = speechBubbles.at(-1).html;
  t.true(structuredHtml.includes('Read <strong>this</strong>'));
  t.true(structuredHtml.includes('src="/content/17/images/managed.png"'));
  t.true(structuredHtml.includes('alt="Managed image"'));
  t.false(structuredHtml.includes('onclick'));
  t.false(structuredHtml.includes('<script>'));

  task.droppables[1].$tip.get(0).dispatchEvent(click());
  t.is(speechBubbles.at(-1).html, `\u200B${legacy}`);
});

test.serial('structured tooltips preserve Show Solution, Retry and saved-state behavior', t => {
  const params = `*one${FIRST_MARKER}* *two${SECOND_MARKER}*`;
  const images = [
    definition(FIRST_ID, 'images/one.png', 'One'),
    definition(SECOND_ID, 'images/two.png', 'Two')
  ];
  const task = createTask(params, images);
  task.triggerXAPI = () => {};
  task.previousState = [{ draggable: 0, droppable: 1 }];
  task.setH5PUserState();

  t.deepEqual(task.getCurrentState(), [{ draggable: 0, droppable: 1 }]);
  task.showSolutions();
  t.true(task.droppables.every(item => !item.$showSolution.html().includes('papijo-tip-ref')));
  task.resetTask();
  t.deepEqual(task.getCurrentState(), []);
  t.true(task.droppables.every(item => item.$tip && item.$dropzoneContainer.hasClass('has-tip')));
});

test.serial('multiple instances resolve against their own content id and keep popup ownership isolated', t => {
  resetSpeechBubbles();
  const first = createTask(`*same${FIRST_MARKER}*`, [
    definition(FIRST_ID, 'images/same.png', 'First')
  ], { contentId: 101 });
  const second = createTask(`*same${FIRST_MARKER}*`, [
    definition(FIRST_ID, 'images/same.png', 'Second')
  ], { contentId: 202 });

  t.is(first.droppables[0].structuredTooltip.image.src, '/content/101/images/same.png');
  t.is(second.droppables[0].structuredTooltip.image.src, '/content/202/images/same.png');
  first.droppables[0].$tip.get(0).dispatchEvent(click());
  second.droppables[0].$tip.get(0).dispatchEvent(click());
  t.true(speechBubbles[0].removed);
  t.false(speechBubbles[1].removed);
  t.is(first.droppables[0].$tip.attr('aria-expanded'), 'false');
  t.is(second.droppables[0].$tip.attr('aria-expanded'), 'true');
});
