'use strict';
const localization = require('../../locales');

module.exports = async ctx => {
  const userId = ctx.from.id;
  const newLanguage = ctx.match[1];
  
  const success = await localization.setUserLanguage(userId, newLanguage);
  
  if (success) {
    const langNames = {
      'es': 'Español',
      'en': 'English', 
      'fr': 'Français',
      'de': 'Deutsch'
    };
    
    const message = await localization.getText('commands.language.changed', userId, {
      language: langNames[newLanguage] || newLanguage
    });
    
    await ctx.answerCbQuery();
    await ctx.editMessageText(message);
  } else {
    const errorMsg = await localization.getText('errors.generic', userId);
    await ctx.answerCbQuery(errorMsg);
  }
};
