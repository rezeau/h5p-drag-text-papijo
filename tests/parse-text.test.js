import test from 'ava';

import { parseText } from '../src/scripts/parse-text';

test('keeps plain text as one part', t => {
  t.deepEqual(parseText('plain text only'), ['plain text only']);
});

test('splits ordinary text and answer parts', t => {
  t.deepEqual(
    parseText('first *second* third'),
    ['first ', '*second*', ' third']
  );
});

test('preserves answers at the beginning and end', t => {
  t.deepEqual(
    parseText('*first* second *third*'),
    ['*first*', ' second ', '*third*']
  );
});

test('preserves repeated answers', t => {
  t.deepEqual(
    parseText('*first* second *first* third'),
    ['*first*', ' second ', '*first*', ' third']
  );
});

test('preserves spaces inside an answer', t => {
  t.deepEqual(
    parseText('*first second* third'),
    ['*first second*', ' third']
  );
});

test('splits adjacent answers', t => {
  t.deepEqual(
    parseText('*first**second**third*'),
    ['*first*', '*second*', '*third*']
  );
});

test('leaves PapiJo answer syntax untouched for lexing', t => {
  t.deepEqual(
    parseText('*first/1st* *second::tip* *third\\+yes \\-no*'),
    ['*first/1st*', ' ', '*second::tip*', ' ', '*third\\+yes \\-no*']
  );
});

test('returns no parts for an empty string', t => {
  t.deepEqual(parseText(''), []);
});

test('preserves punctuation, line breaks, tabs, and surrounding whitespace', t => {
  t.deepEqual(
    parseText('  Wait,\n*what?!*\t Yes.  '),
    ['  Wait,\n', '*what?!*', '\t Yes.  ']
  );
});
