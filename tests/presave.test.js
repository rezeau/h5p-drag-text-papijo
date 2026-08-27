import test from 'ava';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

const presaveSource = readFileSync(resolve(process.cwd(), 'presave.js'), 'utf8');

const loadPresave = () => {
  const validatedScores = [];
  const context = {
    H5PEditor: {
      Presave: {
        checkNestedRequirements(content, requirement) {
          return requirement === 'content.textField' &&
            content !== undefined &&
            Object.prototype.hasOwnProperty.call(content, 'textField');
        },
        validateScore(score) {
          validatedScores.push(score);
        }
      }
    },
    H5PPresave: {}
  };

  vm.runInNewContext(presaveSource, context, { filename: 'presave.js' });

  return { context, validatedScores };
};

test('registers only under the DragTextPapiJo machine name', t => {
  const { context } = loadPresave();

  t.is(typeof context.H5PPresave['H5P.DragTextPapiJo'], 'function');
  t.false(Object.prototype.hasOwnProperty.call(context.H5PPresave, 'H5P.DragText'));
});

test('returns and validates the draggable count for valid content', t => {
  const { context, validatedScores } = loadPresave();
  let result;

  context.H5PPresave['H5P.DragTextPapiJo'](
    { textField: 'This is *one* and *two*.' },
    value => {
      result = value;
    }
  );

  t.deepEqual(result, { maxScore: 2 });
  t.deepEqual(validatedScores, [2]);
});

test('returns and validates zero when required content is missing', t => {
  const { context, validatedScores } = loadPresave();
  let result;

  context.H5PPresave['H5P.DragTextPapiJo']({}, value => {
    result = value;
  });

  t.deepEqual(result, { maxScore: 0 });
  t.deepEqual(validatedScores, [0]);
});

test('returns and validates zero for a present but empty text field', t => {
  const { context, validatedScores } = loadPresave();
  let result;

  context.H5PPresave['H5P.DragTextPapiJo'](
    { textField: '' },
    value => {
      result = value;
    }
  );

  t.deepEqual(result, { maxScore: 0 });
  t.deepEqual(validatedScores, [0]);
});
