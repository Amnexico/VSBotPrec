'use strict';
const { Markup } = require('telegraf');

module.exports = product => {
  const availabilityAlerts = product.preferences.availabilityAlerts;
  const targetPrice = product.preferences.targetPrice;
  const currency = product.currency || '';
  
  const items = [
    {
      text: '📊 Ver estadísticas de precio',
      callbackData: '!stats?id=' + product.id
    },
    {
      text: '💰 Establecer precio objetivo ' + (targetPrice ? '(' + currency + (currency ? ' ' : '') + targetPrice + ')' : ''),
      callbackData: '!price?id=' + product.id
    },
    {
      text: '🧭 Alertas de disponibilidad: ' + (availabilityAlerts ? 'ACTIVADAS' : 'DESACTIVADAS'),
      callbackData: '!availability?id=' + product.id + '&value=' + !availabilityAlerts
    },
    {
      text: '🗑 Eliminar producto',
      callbackData: '!remove?id=' + product.id
    },
    {
      text: '      ⬅️ Volver a la lista      ',
      callbackData: '!list'
    }
  ];
  
  return Markup.inlineKeyboard([...items.map(e => [Markup.button.callback(e.text, e.callbackData)])]);
};
