const globals = require('globals');
module.exports = [
  {
    files: ['custom_components/**/*.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'script', globals: { ...globals.browser } },
    rules: {
      'no-undef': 'error', 'no-unused-vars': ['error', { args: 'none' }], 'no-redeclare': 'error',
      'no-unreachable': 'error', 'no-dupe-keys': 'error',
    },
  },
];
