'use strict';
const { Product, PriceHistory } = require('../../models');
const { Markup } = require('telegraf');

module.exports = async ctx => {
  const match = ctx.callbackQuery.data.match(/^!stats\?id=(\w+)(?:&page=(\d+))?(?:&period=(\w+))?(?:&from_history=(\w+))?$/);
  if (!match) return;
  
  const productId = match[1];
  const page = parseInt(match[2]) || 1;
  const period = match[3] || 'recent';
  const fromHistory = match[4] === 'true';
  
  try {
    await ctx.answerCbQuery();
    
    const product = await Product.findById(productId);
    if (!product) {
      return ctx.reply('Producto no encontrado');
    }
    
    const asin = product.asin || extractASIN(product.url);
    
    // Configurar filtros por período
    let dateFilter = {};
    let limitRecords = 10;
    let periodLabel = '';
    let enablePagination = true;
    
    switch(period) {
      case 'month':
        dateFilter = { timestamp: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } };
        periodLabel = 'Últimos 30 días';
        limitRecords = 31;
        enablePagination = false;
        break;
      case 'all':
        periodLabel = 'Historial completo';
        limitRecords = 50;
        enablePagination = true;
        break;
      default:
        periodLabel = 'Cambios recientes';
        limitRecords = 10;
        enablePagination = true;
    }
    
    const skip = enablePagination ? (page - 1) * limitRecords : 0;
    const history = await PriceHistory.find({ asin, ...dateFilter })
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limitRecords);
    
    if (history.length === 0) {
      return ctx.editMessageText(`📊 *ESTADÍSTICAS DE PRECIO*\n${product.name}\n\n❌ Sin datos históricos disponibles para este período\n\nLas estadísticas estarán disponibles después de algunos cambios de precio.`, {
        parse_mode: 'Markdown'
      });
    }
    
    // Calcular estadísticas
    const allHistory = await PriceHistory.find({ asin });
    const prices = allHistory.map(h => h.price).filter(p => p > 0);
    const currentPrice = prices[0];
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    
    // Calcular mínimo últimos 30 días
    const last30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const last30DaysHistory = await PriceHistory.find({ 
      asin, 
      timestamp: { $gte: last30Days } 
    });
    const last30DaysPrices = last30DaysHistory.map(h => h.price).filter(p => p > 0);
    const min30Days = last30DaysPrices.length > 0 ? Math.min(...last30DaysPrices) : currentPrice;
    
    const firstCheck = allHistory[allHistory.length - 1]?.timestamp;
    
    // Determinar texto especial para precio actual
    let specialPriceText = '';
    if (currentPrice === minPrice) {
      specialPriceText = ' 🏆 *PRECIO MÍNIMO HISTÓRICO*';
    } else if (currentPrice === min30Days && currentPrice !== minPrice) {
      specialPriceText = ' 🔥 *MÍNIMO ÚLTIMOS 30 DÍAS*';
    }
    
    // Calcular precio anterior para mostrar tachado
    let previousPrice = null;
    if (allHistory.length > 1) {
      // Buscar el precio anterior diferente al actual
      for (let i = 1; i < allHistory.length; i++) {
        if (allHistory[i].price !== currentPrice) {
          previousPrice = allHistory[i].price;
          break;
        }
      }
    }
    
    // Construir línea de precio actual
    let currentPriceLine = `💰 *Precio Actual:* ${currentPrice.toFixed(2)}€`;
    if (previousPrice) {
      currentPriceLine += ` ~~${previousPrice.toFixed(2)}€~~`;
    }
    currentPriceLine += specialPriceText;
    
    // Generar historial con marcadores especiales
    let historyText = `📋 *${periodLabel}* ${enablePagination ? `(página ${page})` : ''}:\n`;
    for (let i = 0; i < history.length; i++) {
      const current = history[i];
      const next = history[i + 1];
      
      const date = current.timestamp.toLocaleDateString('es-ES', { 
        day: '2-digit', 
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
      
      let duration = '';
      if (next) {
        const days = Math.ceil((current.timestamp - next.timestamp) / (1000 * 60 * 60 * 24));
        if (days > 1) duration = ` (${days}d)`;
      }
      
      let marker = '';
      if (current.price === minPrice) {
        marker = ' 🏆 PRECIO MÍNIMO HISTÓRICO';
      } else if (current.price === min30Days && current.price !== minPrice) {
        marker = ' 🔥 MÍNIMO ÚLTIMOS 30 DÍAS';
      }
      
      historyText += `${date}: *${current.price.toFixed(2)}€*${duration}${marker}\n`;
    }
    
    const message = `📊 *ESTADÍSTICAS DE PRECIO*
${product.name}

${currentPriceLine}

🛒 Ver en Amazon: \`amazon.es/dp/${asin}?tag=vsoatg-21\`

✅ *Mínimo Histórico:* ${minPrice.toFixed(2)}€
📅 *Mínimo últimos 30 días:* ${min30Days.toFixed(2)}€
🔴 *Precio máximo:* ${maxPrice.toFixed(2)}€

📅 *Datos desde:* ${firstCheck ? firstCheck.toLocaleDateString('es-ES', {year: 'numeric', month: '2-digit', day: '2-digit'}) : 'N/A'}

${historyText}`;

    // Crear botones de navegación y períodos
    const buttons = [];
    
    // Botones de período
    const periodButtons = [
      { text: period === 'recent' ? '🔥 Recientes' : '📅 Recientes', callback_data: `!stats?id=${productId}&period=recent${fromHistory ? '&from_history=true' : ''}` },
      { text: period === 'month' ? '🔥 Últimos 30 días' : '📅 Últimos 30 días', callback_data: `!stats?id=${productId}&period=month${fromHistory ? '&from_history=true' : ''}` },
      { text: period === 'all' ? '🔥 Todos' : '📚 Todos', callback_data: `!stats?id=${productId}&period=all${fromHistory ? '&from_history=true' : ''}` }
    ];
    
    buttons.push(periodButtons);
    
    // Botones de paginación
    if (enablePagination) {
      const paginationButtons = [];
      if (page > 1) {
        paginationButtons.push({ 
          text: '⬅️ Anterior', 
          callback_data: `!stats?id=${productId}&page=${page-1}&period=${period}${fromHistory ? '&from_history=true' : ''}` 
        });
      }
      if (history.length === limitRecords) {
        paginationButtons.push({ 
          text: 'Siguiente ➡️', 
          callback_data: `!stats?id=${productId}&page=${page+1}&period=${period}${fromHistory ? '&from_history=true' : ''}` 
        });
      }
      
      if (paginationButtons.length > 0) {
        buttons.push(paginationButtons);
      }
    }
    
    // Botón volver - diferente según el origen
    if (fromHistory) {
      buttons.push([{ text: '🔙 Volver al historial', callback_data: 'menu_price_history' }]);
    } else {
      buttons.push([{ text: '⬅️ Volver al menú', callback_data: `!menu=${productId}` }]);
    }
    
    ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard(buttons)
    });
    
  } catch (error) {
    console.error('Error obteniendo estadísticas:', error);
    ctx.editMessageText('❌ Error al obtener estadísticas del producto');
  }
};

function extractASIN(url) {
  const patterns = [
    /\/dp\/([A-Z0-9]{10})/,
    /\/([A-Z0-9]{10})(?:[/?]|$)/
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}
