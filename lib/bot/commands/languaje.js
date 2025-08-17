'use strict';
const localization = require('../../locales');
const keyboards = require('../keyboards');

module.exports = async ctx => {
  const userId = ctx.from.id;
  const currentLang = await localization.getUserLanguage(userId);
  const langNames = {
    'es': 'Español',
    'en': 'English',
    'fr': 'Français',
    'de': 'Deutsch'
  };
  
  const currentMsg = await localization.getText('commands.language.current', userId, {
    language: langNames[currentLang] || currentLang
  });
  const chooseMsg = await localization.getText('commands.language.choose', userId);
  
  await ctx.reply(
    `${currentMsg}\n\n${chooseMsg}`,
    keyboards.languages(userId)
  );
};
