import test from 'ava';

import {
  indexTooltipImages,
  isManagedImagePath,
  resolveTooltipImage
} from '../src/scripts/tooltip-images';

const ID = '550e8400-e29b-41d4-a716-446655440000';

test('accepts conservative H5P-managed relative paths', t => {
  t.true(isManagedImagePath('images/tooltip.png'));
  t.true(isManagedImagePath('images/folder/tooltip%20image.webp'));
});

test('rejects schemes, absolute paths, backslashes, NULs and traversal', t => {
  [
    'https://example.com/image.png',
    'data:image/png;base64,AA==',
    '//example.com/image.png',
    '/images/image.png',
    'C:/images/image.png',
    'images\\image.png',
    'images/../secret.png',
    'images/./image.png',
    'images/%2e%2e/secret.png',
    'images/%252e%252e/secret.png',
    '%252f%252fevil.example/image.png',
    'images/%2E/image.png',
    'images//image.png',
    `images/zero\0byte.png`,
    ' images/image.png',
    'images/image.png ',
    'images/%zz/image.png'
  ].forEach(path => t.false(isManagedImagePath(path), path));
});

test('indexes only unique complete definitions with meaningful alt text', t => {
  const index = indexTooltipImages([
    { id: ID, image: { path: 'images/good.png', mime: 'image/png' }, alt: '  Flower  ' },
    { id: 'not-an-id', image: { path: 'images/ignored.png' }, alt: 'Ignored' },
    { id: '6ba7b810-9dad-41d1-80b4-00c04fd430c8', image: { path: 'https://bad' }, alt: 'Bad' },
    { id: '6ba7b811-9dad-41d1-80b4-00c04fd430c8', image: { path: 'images/no-alt.png' }, alt: '   ' }
  ]);

  t.deepEqual(Object.keys(index), [ID]);
  t.is(index[ID].path, 'images/good.png');
  t.is(index[ID].alt, 'Flower');
  t.is(index[ID].image.mime, 'image/png');
});

test('duplicate definitions fail closed even when one duplicate is invalid', t => {
  const index = indexTooltipImages([
    { id: ID, image: { path: 'images/one.png' }, alt: 'One' },
    { id: ID, image: { path: 'https://example.com/two.png' }, alt: 'Two' }
  ]);

  t.false(Object.prototype.hasOwnProperty.call(index, ID));
});

test('resolves accepted paths with the owning content id', t => {
  const calls = [];
  const definition = indexTooltipImages([
    { id: ID, image: { path: 'images/one.png' }, alt: 'One' }
  ])[ID];
  const result = resolveTooltipImage(definition, 73, (path, contentId) => {
    calls.push({ contentId, path });
    return `/content/${contentId}/${path}`;
  });

  t.deepEqual(calls, [{ contentId: 73, path: 'images/one.png' }]);
  t.deepEqual(result, { alt: 'One', src: '/content/73/images/one.png' });
});

test('resolution errors and unavailable resolvers fail closed', t => {
  const definition = { alt: 'One', path: 'images/one.png' };

  t.is(resolveTooltipImage(definition, 1, null), null);
  t.is(resolveTooltipImage(definition, 1, () => { throw new Error('No path'); }), null);
  t.is(resolveTooltipImage(definition, 1, () => ''), null);
});
