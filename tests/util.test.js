import test from 'ava';

import Util from '../src/scripts/util';

test('startsWith checks the first character', t => {
  t.true(Util.startsWith('*', '*answer'));
  t.false(Util.startsWith('*', 'answer*'));
  t.false(Util.startsWith('*', ''));
});

test('endsWith checks the final character', t => {
  t.true(Util.endsWith('*', 'answer*'));
  t.false(Util.endsWith('*', '*answer'));
  t.false(Util.endsWith('*', ''));
});

test('cleanCharacter removes one matching character from each boundary', t => {
  t.is(Util.cleanCharacter('*', '*answer*'), 'answer');
  t.is(Util.cleanCharacter('*', '**answer**'), '*answer*');
  t.is(Util.cleanCharacter('*', 'answer'), 'answer');
});

test('curry accepts arguments across multiple calls', t => {
  const join = Util.curry((first, second, third) => `${first}-${second}-${third}`);

  t.is(join('a', 'b', 'c'), 'a-b-c');
  t.is(join('a')('b')('c'), 'a-b-c');
  t.is(join('a', 'b')('c'), 'a-b-c');
});

test('shuffle preserves the same array, length, and members', t => {
  const values = ['one', 'two', 'three', 'four'];
  const shuffled = Util.shuffle(values);

  t.is(shuffled, values);
  t.is(shuffled.length, 4);
  t.deepEqual([...shuffled].sort(), ['four', 'one', 'three', 'two']);
});

test('alphasort orders simple draggable text', t => {
  const draggables = ['zebra', 'apple', 'middle'].map((text, index) => ({
    getIndex: () => index,
    getAnswerText: () => text
  }));

  Util.alphasort(draggables);

  t.deepEqual(draggables.map(item => item.getAnswerText()), [
    'apple',
    'middle',
    'zebra'
  ]);
});

test('alphasort handles accented draggable text', t => {
  const draggables = ['zèbre', 'éclair', 'apple'].map((text, index) => ({
    getIndex: () => index,
    getAnswerText: () => text
  }));

  Util.alphasort(draggables);

  t.deepEqual(draggables.map(item => item.getAnswerText()), [
    'apple',
    'éclair',
    'zèbre'
  ]);
});
