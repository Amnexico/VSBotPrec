'use strict';
const { Markup } = require('telegraf');

module.exports = products => {
  const items = products.map(product => ({
    text: product.name,
    callbackData: '!menu=' + product.id
  }));
  
  // Crear array de botones con productos
  const productButtons = items.map(e => [Markup.button.callback(e.text, e.callbackData)]);
  
  // Añadir botón "Volver al menú" al final
  productButtons.push([Markup.button.callback('🔙 Volver al menú', 'menu_main')]);
  
  return Markup.inlineKeyboard(productButtons);
};
