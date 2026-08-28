import fs from 'node:fs';

import test from 'ava';

const library = JSON.parse(fs.readFileSync('library.json', 'utf8'));
const semantics = JSON.parse(fs.readFileSync('semantics.json', 'utf8'));
const languages = fs.readdirSync('language')
  .filter(file => file.endsWith('.json'))
  .map(file => ({
    file,
    value: JSON.parse(fs.readFileSync(`language/${file}`, 'utf8'))
  }));

const placeholders = value => [...new Set((value.match(/(?:@|:)[A-Za-z][A-Za-z0-9]*/g) || []))].sort();

const compareDefaultPlaceholders = (canonical, translation, path, mismatches) => {
  if (Array.isArray(canonical) && Array.isArray(translation)) {
    canonical.forEach((item, index) => {
      if (translation[index] !== undefined) {
        compareDefaultPlaceholders(item, translation[index], `${path}[${index}]`, mismatches);
      }
    });
    return;
  }

  if (!canonical || !translation || typeof canonical !== 'object' || typeof translation !== 'object') {
    return;
  }

  if (typeof canonical.default === 'string' && typeof translation.default === 'string') {
    const expected = placeholders(canonical.default);
    const actual = placeholders(translation.default);
    if (expected.join() !== actual.join()) {
      mismatches.push({ actual, expected, path: `${path}.default` });
    }
  }

  Object.keys(canonical).forEach(key => {
    if (key !== 'default' && translation[key] !== undefined) {
      compareDefaultPlaceholders(canonical[key], translation[key], `${path}.${key}`, mismatches);
    }
  });
};

test('translated defaults preserve canonical substitution placeholders', t => {
  languages.forEach(({ file, value }) => {
    const mismatches = [];
    compareDefaultPlaceholders(semantics, value.semantics, 'semantics', mismatches);
    t.deepEqual(mismatches, [], file);
  });
});

test('optional media stays content-selected instead of preloading H5P.Audio', t => {
  const mediaOptions = semantics.find(field => field.name === 'media').fields
    .find(field => field.name === 'type').options;
  const preloaded = library.preloadedDependencies.map(dependency => dependency.machineName);

  t.true(mediaOptions.includes('H5P.Audio 1.5'));
  t.false(preloaded.includes('H5P.Audio'));
});
