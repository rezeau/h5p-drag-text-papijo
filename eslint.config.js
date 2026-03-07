import eslintConfigSnordianH5P from 'eslint-config-snordian-h5p';

export default [
  eslintConfigSnordianH5P.configs['flat/recommended'],
  {
    // You can override or extend the rules here
    // For example:
    rules: {
      'no-console': 'warn',
      "no-trailing-spaces": "warn",
    },
  },
];
