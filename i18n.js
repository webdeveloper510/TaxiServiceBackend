const i18n = require('i18n');
const path = require('path');

i18n.configure({
  locales: ['en', 'nl'],
  directory: path.join(__dirname, 'locales'),
  defaultLocale: 'en',
  queryParameter: 'lang', // e.g., /api?lang=hi
  objectNotation: true,
  autoReload: true,
  updateFiles: false,
  syncFiles: false,
  register: global
});

module.exports = i18n;
