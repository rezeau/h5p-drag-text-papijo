const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

const normalize = filePath => filePath.split(path.sep).join('/');
const escapeRegExp = value => value.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
const globToRegExp = pattern => new RegExp(`^${escapeRegExp(pattern).replace(/\*/g, '.*')}$`);

const ignorePatterns = fs.readFileSync(path.join(root, '.h5pignore'), 'utf8')
  .split(/\r?\n/)
  .map(line => line.trim())
  .filter(line => line && !line.startsWith('#'))
  .map(line => line.replace(/^\//, '').replace(/\/$/, ''));

const isIgnored = relativePath => {
  const normalized = normalize(relativePath);
  const segments = normalized.split('/');

  return ignorePatterns.some(pattern => {
    const matcher = globToRegExp(pattern);

    if (pattern.includes('/')) {
      return matcher.test(normalized) || normalized.startsWith(`${pattern}/`);
    }

    return segments.some(segment => matcher.test(segment));
  });
};

const packageFiles = [];

const collect = (directory, relativeDirectory = '') => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const relativePath = normalize(path.join(relativeDirectory, entry.name));

    if (isIgnored(relativePath)) {
      continue;
    }

    if (entry.isDirectory()) {
      collect(path.join(directory, entry.name), relativePath);
    }
    else if (entry.isFile()) {
      packageFiles.push(relativePath);
    }
  }
};

collect(root);

const included = new Set(packageFiles);
const requiredFiles = [
  'library.json',
  'semantics.json',
  'presave.js',
  'icon.svg',
  'dist/h5p-drag-text-papijo.js',
  'dist/h5p-drag-text-papijo.css'
];
const forbiddenPaths = [
  'node_modules',
  'tests',
  'src',
  '.git',
  '.github',
  '.babelrc',
  '.gitignore',
  '.h5pignore',
  'package.json',
  'package-lock.json',
  'README.md',
  'CONTRIBUTING.md',
  'crowdin.yml',
  'webpack.config.js',
  'webpack.config.cjs',
  '.travis.yml',
  '.eslintrc.json',
  '.stylelintrc.json',
  'eslint.config.js',
  'scripts'
];

const errors = [];

for (const requiredFile of requiredFiles) {
  if (!included.has(requiredFile)) {
    errors.push(`Required package file is missing: ${requiredFile}`);
  }
}

const languageFiles = packageFiles.filter(file => /^language\/[^/]+\.json$/.test(file));
if (languageFiles.length === 0) {
  errors.push('No language JSON files would be included.');
}

for (const forbiddenPath of forbiddenPaths) {
  if (packageFiles.some(file => file === forbiddenPath || file.startsWith(`${forbiddenPath}/`))) {
    errors.push(`Development path would be included: ${forbiddenPath}`);
  }
}

const expectedDistFiles = new Set([
  'dist/h5p-drag-text-papijo.css',
  'dist/h5p-drag-text-papijo.js'
]);
const actualDistFiles = packageFiles.filter(file => file.startsWith('dist/'));

for (const file of actualDistFiles) {
  if (!expectedDistFiles.has(file)) {
    errors.push(`Unexpected or stale dist artifact would be included: ${file}`);
  }
}

for (const file of expectedDistFiles) {
  if (!actualDistFiles.includes(file)) {
    errors.push(`Expected dist artifact is missing: ${file}`);
  }
}

if (errors.length > 0) {
  console.error('H5P package verification failed:');
  errors.forEach(error => console.error(`- ${error}`));
  process.exitCode = 1;
}
else {
  console.log(`H5P package verification passed: ${packageFiles.length} files would be included.`);
  console.log(`Language files: ${languageFiles.join(', ')}`);
  console.log(`Dist files: ${actualDistFiles.join(', ')}`);
}
