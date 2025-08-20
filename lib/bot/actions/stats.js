'use strict';
const { Product, PriceHistory } = require('../../models');
const { Markup } = require('telegraf');

module.exports = async ctx => {
  const match = ctx.callbackQuery.data.match(/^!stats\?id=(\w+)(?:&page=(\d+))?(?:&period=(\w+))?$/);
  if (!match) return;
  
  const productId = match[1];
  const page = parseInt(match[2]) || 1;
  const period = match[3] || 'recent';
  
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
    
    switch(period) {
      case 'month':
        dateFilter = { timestamp: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } };
        periodLabel = 'Último mes';
        limitRecords = 20;
        break;
      case 'year':
        dateFilter = { timestamp: { $gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) } };
        periodLabel = 'Último año';
        limitRecords = 50;
        break;
      case 'all':
        periodLabel = 'Historial completo';
        limitRecords = 30;
        break;
      default:
        periodLabel = 'Cambios recientes';
        limitRecords = 10;
    }
    
    const skip = (page - 1) * limitRecords;
    const history = await PriceHistory.find({ asin, ...dateFilter })
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limitRecords);
    
    if (history.length === 0) {
      return ctx.editMessageText(`No hay datos históricos disponibles para este período.`);
    }
    
    // Calcular estadísticas
    const allHistory = await PriceHistory.find({ asin });
    const prices = allHistory.map(h => h.price).filter(p => p > 0);
    const currentPrice = prices[0]; // Más reciente
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
    
    const firstCheck = allHistory[allHistory.length - 1]?.timestamp;
    const lastCheck = allHistory[0]?.timestamp;
    const daysDiff = firstCheck ? Math.ceil((lastCheck - firstCheck) / (1000 * 60 * 60 * 24)) || 1 : 0;
    
    let trend = 'Estable';
    if (currentPrice < avgPrice * 0.95) trend = 'Bajando';
    else if (currentPrice > avgPrice * 1.05) trend = 'Subiendo';
    
    // Generar historial con duración
    let historyText = `${periodLabel} (página ${page}):\n`;
    for (let i = 0; i < history.length; i++) {
      const current = history[i];
      const next = history[i + 1];
      
      const date = current.timestamp.toLocaleDateString('es-ES', { 
        day: '2-digit', 
        month: '2-digit',
        year: i < 5 ? undefined : '2-digit' // Año solo en registros antiguos
        hour: '2-digit',
        minute: '2-digit'
      });
      
      let duration = '';
      if (next) {
        const days = Math.ceil((current.timestamp - next.timestamp) / (1000 * 60 * 60 * 24));
        if (days > 1) duration = ` (${days}d)`;
      }
      
      const change = current.previousPrice > 0 ? 
        (current.price > current.previousPrice ? '↗️' : '↘️') : '';
      
      historyText += `${date}: ${current.price}€${duration} ${change}\n`;
    }
    
    const message = `Estadísticas de precio: ${product.name}

Precio actual: ${currentPrice}€
Precio mínimo: ${minPrice}€ ${minPrice === currentPrice ? '(MÍNIMO HISTÓRICO)' : ''}
Precio máximo: ${maxPrice}€
Precio promedio: ${avgPrice.toFixed(2)}€
Tendencia: ${trend}

Datos desde: ${firstCheck ? firstCheck.toLocaleDateString('es-ES') : 'N/A'}
Total cambios: ${allHistory.length}
Período: ${daysDiff} días

${historyText}`;

    // Crear botones de navegación y períodos
    const buttons = [];
    
    // Botones de período
    const periodButtons = [
      { text: period === 'recent' ? '• Reciente' : 'Reciente', callback_data: `!stats?id=${productId}&period=recent` },
      { text: period === 'month' ? '• Mes' : 'Mes', callback_data: `!stats?id=${productId}&period=month` },
      { text: period === 'year' ? '• Año' : 'Año', callback_data: `!stats?id=${productId}&period=year` },
      { text: period === 'all' ? '• Todo' : 'Todo', callback_data: `!stats?id=${productId}&period=all` }
    ];
    
    buttons.push(periodButtons);
    
    // Botones de paginación
    const paginationButtons = [];
    if (page > 1) {
      paginationButtons.push({ 
        text: '⬅️ Anterior', 
        callback_data: `!stats?id=${productId}&page=${page-1}&period=${period}` 
      });
    }
    if (history.length === limitRecords) {
      paginationButtons.push({ 
        text: 'Siguiente ➡️', 
        callback_data: `!stats?id=${productId}&page=${page+1}&period=${period}` 
      });
    }
    
    if (paginationButtons.length > 0) {
      buttons.push(paginationButtons);
    }
    
    // Botón volver
    buttons.push([{ text: '⬅️ Volver al menú', callback_data: `!menu=${productId}` }]);
    
    ctx.editMessageText(message, Markup.inlineKeyboard(buttons));
    
  } catch (error) {
    console.error('Error obteniendo estadísticas:', error);
    ctx.editMessageText('Error al obtener estadísticas del producto');
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
