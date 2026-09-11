import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';

import test from 'ava';

import { getTooltipReferenceMarker } from '../src/scripts/scan-text-field';

const phpBinary = process.env.PHP_BINARY || 'php';
const phpAvailable = spawnSync(phpBinary, ['--version'], { encoding: 'utf8' }).status === 0;
const configured = (process.env.H5P_TOOLTIP_FILTER_CORES || '').split(';').filter(Boolean);
const defaults = [
  'C:/wamp64/www/wp-h5p/wp-content/plugins/h5p/h5p-php-library/h5p.classes.php',
  'C:/wamp64/www/moodle/public/h5p/h5plib/v128/joubel/core/h5p.classes.php',
  'C:/wamp64/www/moodle/public/mod/hvp/library/h5p.classes.php'
];
const cores = (configured.length > 0 ? configured : defaults).filter(file => fs.existsSync(file));
const ID = '550e8400-e29b-41d4-a716-446655440000';

const runFilterRoundTrip = t => {
  const marker = getTooltipReferenceMarker(ID);
  const source = `Before *browser::Helpful${marker}* after`;

  cores.forEach(core => {
    const filtered = execFileSync(
      phpBinary,
      ['tests/helpers/h5p-tooltip-reference-filter.php', core],
      { encoding: 'utf8', input: source }
    );
    t.is(filtered, source, `Marker changed while filtering with ${core}`);
    const filteredAgain = execFileSync(
      phpBinary,
      ['tests/helpers/h5p-tooltip-reference-filter.php', core],
      { encoding: 'utf8', input: filtered }
    );
    t.is(filteredAgain, source, `Marker changed on repeated filtering with ${core}`);
  });
  t.is(JSON.parse(JSON.stringify({ textField: source })).textField, source);
  t.pass(`Validated ${cores.length} installed H5P filtering engines`);
};

if (phpAvailable && cores.length > 0) {
  test.serial('encoded comment reference survives installed H5P filters and JSON', runFilterRoundTrip);
}
else {
  test.serial.skip(
    'encoded comment reference survives installed H5P filters and JSON (requires PHP and an H5P core)',
    runFilterRoundTrip
  );
}
