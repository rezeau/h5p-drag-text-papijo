import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import test from 'ava';

// Override H5P_LIBRARIES_ROOT for another H5P installation and PHP_BINARY
// when PHP is not available as `php`. The test is skipped if either the
// official H5P engine/Video files or PHP cannot be found.
const defaultLibrariesRoot = 'C:/my_first_h5p_environment/libraries';
const librariesRoot = process.env.H5P_LIBRARIES_ROOT || defaultLibrariesRoot;
const phpBinary = process.env.PHP_BINARY || 'php';
const coreRoot = path.join(librariesRoot, 'h5p-php-library');
const videoRoot = path.join(librariesRoot, 'H5P.Video-1.6');
const versionScript = path.join(coreRoot, 'js', 'h5p-version.js');
const upgradeScript = path.join(coreRoot, 'js', 'h5p-content-upgrade-process.js');
const phpCore = path.join(coreRoot, 'h5p.classes.php');
const videoSemanticsPath = path.join(videoRoot, 'semantics.json');
const videoUpgradeScript = path.join(videoRoot, 'upgrades.js');
const requiredFiles = [
  versionScript,
  upgradeScript,
  phpCore,
  videoSemanticsPath,
  videoUpgradeScript
];
const phpAvailable = spawnSync(phpBinary, ['--version'], { encoding: 'utf8' }).status === 0;
const integrationAvailable = phpAvailable && requiredFiles.every(file => fs.existsSync(file));

const clone = value => JSON.parse(JSON.stringify(value));
const fixture = JSON.parse(fs.readFileSync('tests/fixtures/legacy-video-1.5.json', 'utf8'));
const library = JSON.parse(fs.readFileSync('library.json', 'utf8'));
const parentSemantics = JSON.parse(fs.readFileSync('semantics.json', 'utf8'));

const runMigrationTest = async t => {
  const context = vm.createContext({
    console,
    H5P: {},
    H5PUpgrades: {},
    setTimeout
  });

  [versionScript, upgradeScript, videoUpgradeScript].forEach(file => {
    vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
  });

  const videoSemantics = JSON.parse(fs.readFileSync(videoSemanticsPath, 'utf8'));
  const upgrade = (params, oldVersion = '1.1', newVersion = '1.2') => new Promise((resolve, reject) => {
    new context.H5P.ContentUpgradeProcess(
      'H5P.DragTextPapiJo',
      new context.H5P.Version(oldVersion),
      new context.H5P.Version(newVersion),
      JSON.stringify({ metadata: {}, params }),
      1,
      (name, version, done) => {
        if (name === 'H5P.DragTextPapiJo') {
          done(null, {
            name,
            semantics: parentSemantics,
            upgradesScript: null,
            version: new context.H5P.Version(`${library.majorVersion}.${library.minorVersion}`)
          });
          return;
        }

        if (name === 'H5P.Video') {
          done(null, {
            name,
            semantics: videoSemantics,
            upgradesScript: videoUpgradeScript,
            version: new context.H5P.Version('1.6')
          });
          return;
        }

        done({ library: name, type: 'unexpectedLibrary' });
      },
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(JSON.parse(result).params);
      }
    );
  });

  const original = clone(fixture);
  const migrated = await upgrade(clone(fixture));

  t.is(original.media.type.library, 'H5P.Video 1.5');
  t.is(migrated.media.type.library, 'H5P.Video 1.6');
  t.deepEqual(migrated.media.type.params.sources, original.media.type.params.sources);
  t.deepEqual(migrated.media.type.params.visuals, original.media.type.params.visuals);
  t.deepEqual(migrated.media.type.params.playback, original.media.type.params.playback);
  t.is(migrated.media.type.subContentId, original.media.type.subContentId);

  const validation = JSON.parse(execFileSync(
    phpBinary,
    ['tests/helpers/h5p-video-migration-validator.php', phpCore, videoSemanticsPath],
    {
      encoding: 'utf8',
      input: JSON.stringify(migrated.media.type)
    }
  ));

  t.deepEqual(validation.errors, []);
  t.is(validation.value.library, 'H5P.Video 1.6');
  t.deepEqual(validation.value.params.sources, migrated.media.type.params.sources);
  t.deepEqual(validation.value.params.visuals, migrated.media.type.params.visuals);
  t.deepEqual(validation.value.params.playback, migrated.media.type.params.playback);
  t.is(validation.value.subContentId, migrated.media.type.subContentId);

  const alreadyCurrent = clone(fixture);
  alreadyCurrent.media.type.library = 'H5P.Video 1.6';
  t.deepEqual(await upgrade(clone(alreadyCurrent)), alreadyCurrent);

  const withImage = clone(fixture);
  withImage.media.type = {
    library: 'H5P.Image 1.1',
    params: { file: { mime: 'image/png', path: 'images/example.png' } }
  };
  t.deepEqual(await upgrade(clone(withImage)), withImage);

  const withAudio = clone(fixture);
  withAudio.media.type = {
    library: 'H5P.Audio 1.5',
    params: { files: [{ mime: 'audio/mpeg', path: 'audios/example.mp3' }] }
  };
  t.deepEqual(await upgrade(clone(withAudio)), withAudio);

  const withoutMedia = {
    taskDescription: fixture.taskDescription,
    textField: fixture.textField
  };
  t.deepEqual(await upgrade(clone(withoutMedia)), withoutMedia);
  t.deepEqual(await upgrade(clone(migrated), '1.2', '1.2'), migrated);
};

if (integrationAvailable) {
  test.serial('official H5P engine recursively migrates legacy Video 1.5 content', runMigrationTest);
}
else {
  test.serial.skip(
    'official H5P engine recursively migrates legacy Video 1.5 content (requires H5P_LIBRARIES_ROOT and PHP_BINARY)',
    runMigrationTest
  );
}
