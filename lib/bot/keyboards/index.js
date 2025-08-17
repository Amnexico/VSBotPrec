'use strict';
const { Markup } = require('telegraf');
const localization = require('../../locales');

module.exports = {
  // Teclado para seleccionar idioma
  languages: (userId) => {
    return Markup.inlineKeyboard([
      [
        Markup.button.callback('🇪🇸 Español', '!language=es'),
        Markup.button.callback('🇺🇸 English', '!language=en')
      ],
      [
        Markup.button.callback('🇫🇷 Français', '!language=fr'),
        Markup.button.callback('🇩🇪 Deutsch', '!language=de')
      ]
    ]);
  },

  // Teclado para lista de productos (ejemplo)
  list: (products) => {
    const buttons = products.map(product => [
      Markup.button.callback(product.name, `!menu=${product.id}`)
    ]);
    return Markup.inlineKeyboard(buttons);
  },

  // Teclado para menú de producto (ejemplo)
  productMenu: async (product, userId) => {
    const setTargetText = await localization.getText('buttons.set_target', userId);
    const toggleAlertsText = await localization.getText('buttons.toggle_alerts', userId);
    const removeText = await localization.getText('buttons.remove', userId);
    const backText = await localization.getText('buttons.back', userId);
    
    return Markup.inlineKeyboard([
      [Markup.button.callback(setTargetText, `!price?id=${product.id}`)],
      [Markup.button.callback(toggleAlertsText, `!availability?id=${product.id}&value=toggle`)],
      [Markup.button.callback(removeText, `!remove?id=${product.id}`)],
      [Markup.button.callback(backText, '!list')]
    ]);
  }
};
