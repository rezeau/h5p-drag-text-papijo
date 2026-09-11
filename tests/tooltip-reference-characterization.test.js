import test from 'ava';

import { lex, parseText } from '../src/scripts/parse-text';

test('current parser treats an unclosed answer as ordinary text', t => {
  t.deepEqual(parseText('Before *answer::tip'), ['Before *answer::tip']);
});

test('current lexer treats repeated contiguous double colons as one tip', t => {
  t.deepEqual(lex('*answer::first::second*'), {
    correctFeedback: null,
    incorrectFeedback: null,
    isPartOfWord: false,
    removableBlock: null,
    text: 'answer',
    tip: 'first::second'
  });
});

test('current lexer preserves its malformed separated multiple-tip behavior', t => {
  t.deepEqual(lex('*answer::first\\+yes::second*'), {
    correctFeedback: 'yes',
    incorrectFeedback: null,
    isPartOfWord: false,
    removableBlock: null,
    text: 'answer::first::second',
    tip: 'first'
  });
});

test('current lexer assigns one tip to the full alternative-answer expression', t => {
  t.deepEqual(lex('*first/second::shared*'), {
    correctFeedback: null,
    incorrectFeedback: null,
    isPartOfWord: false,
    removableBlock: null,
    text: 'first/second',
    tip: 'shared'
  });
});
