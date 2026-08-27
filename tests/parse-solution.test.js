import test from 'ava';

import { lex } from '../src/scripts/parse-text';

const emptyMetadata = {
  tip: null,
  correctFeedback: null,
  incorrectFeedback: null,
  removableBlock: null,
  isPartOfWord: false
};

test('returns answer text without metadata', t => {
  t.deepEqual(lex('*interactive*'), {
    ...emptyMetadata,
    text: 'interactive'
  });
});

test('recognizes a double-colon tip', t => {
  t.deepEqual(lex('*browser::What type of program is Chrome?*'), {
    ...emptyMetadata,
    tip: 'What type of program is Chrome?',
    text: 'browser'
  });
});

test('trims trailing whitespace from a tip', t => {
  t.deepEqual(lex('*answer::tip with spaces   *'), {
    ...emptyMetadata,
    tip: 'tip with spaces',
    text: 'answer'
  });
});

test('prefixes an image-only tip with two zero-width spaces', t => {
  t.deepEqual(lex('*answer::<img src="image.png">*'), {
    ...emptyMetadata,
    tip: '\u200B\u200B<img src="image.png">',
    text: 'answer'
  });
});

test('recognizes correct feedback on its own', t => {
  t.deepEqual(lex('*answer\\+Correct*'), {
    ...emptyMetadata,
    correctFeedback: 'Correct',
    text: 'answer'
  });
});

test('recognizes incorrect feedback on its own', t => {
  t.deepEqual(lex('*answer\\-Incorrect*'), {
    ...emptyMetadata,
    incorrectFeedback: 'Incorrect',
    text: 'answer'
  });
});

test('recognizes correct and incorrect feedback', t => {
  t.deepEqual(lex('*interactive\\+Correct! \\-Incorrect, try again!*'), {
    ...emptyMetadata,
    correctFeedback: 'Correct!',
    incorrectFeedback: 'Incorrect, try again!',
    text: 'interactive'
  });
});

test('recognizes combined PapiJo metadata tokens', t => {
  t.deepEqual(lex('*_old answer_answer::tip\\+Correct \\-Incorrect*'), {
    ...emptyMetadata,
    tip: 'tip',
    correctFeedback: 'Correct',
    incorrectFeedback: 'Incorrect',
    removableBlock: 'old answer',
    text: 'answer'
  });
});

test('recognizes a removable block before the answer', t => {
  t.deepEqual(lex('*_Pleased to meet you_Hi, John/Hey John::Use a less formal expression*'), {
    ...emptyMetadata,
    tip: 'Use a less formal expression',
    removableBlock: 'Pleased to meet you',
    text: 'Hi, John/Hey John'
  });
});

test('recognizes an answer that continues a word', t => {
  t.deepEqual(lex('*-ending*'), {
    ...emptyMetadata,
    isPartOfWord: true,
    text: 'ending'
  });
});

test('preserves alternative answers for later splitting', t => {
  t.deepEqual(lex('*the <em>black</em> cat/the bird/the postman*'), {
    ...emptyMetadata,
    text: 'the <em>black</em> cat/the bird/the postman'
  });
});

test('trims metadata and answer trailing whitespace', t => {
  t.deepEqual(lex('*answer   ::tip   *'), {
    ...emptyMetadata,
    tip: 'tip',
    text: 'answer'
  });
});

test('keeps single colons as ordinary answer text', t => {
  t.deepEqual(lex('*Meet at 12:30: sharp*'), {
    ...emptyMetadata,
    text: 'Meet at 12:30: sharp'
  });
});
