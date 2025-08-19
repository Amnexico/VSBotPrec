'use strict';
const { Product, PriceHistory } = require('../../models');

module.exports = async ctx => {
  const productId = ctx.match[1];
  
  try {
    await ctx.answerCbQuery();
    
    const product = await Product.findById(productId);
    if (!product) {
      return ctx.reply('Producto no encontrado');
    }
    
    const asin = product.asin || extractASIN(product.url);
    const history = await PriceHistory.find({ asin }).sort({ timestamp: 1 });
    
    if (history.length === 0) {
      return ctx.editMessageText(`📊 Estadísticas de: ${product.name}\n\n❌ Sin datos históricos disponibles\n\nLas estadísticas estarán disponibles después de algunas verificaciones de precio.`);
    }
    
    const prices = history.map(h => h.price).filter(p => p > 0);
    const currentPrice = prices[prices.length - 1];
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
    
    const firstCheck = history[0].timestamp;
    const lastCheck = history[history.length - 1].timestamp;
    const daysDiff = Math.ceil((lastCheck - firstCheck) / (1000 * 60 * 60 * 24)) || 1;
    
    let trend = 'Estable';
    if (currentPrice < avgPrice * 0.95) trend = 'Bajando 📉';
    else if (currentPrice > avgPrice * 1.05) trend = 'Subiendo 📈';
    
    const recentHistory = history.slice(-7);
    let recentChanges = 'Últimos cambios:\n';
    recentHistory.reverse().forEach(h => {
      const date = h.timestamp.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
      recentChanges += `${date}: ${h.price}€\n`;
    });
    
    const message = `📊 Estadísticas de precio: ${product.name}

💰 Precio actual: ${currentPrice}€
📉 Precio mínimo: ${minPrice}€ ${minPrice === currentPrice ? '(MÍNIMO HISTÓRICO)' : ''}
📈 Precio máximo: ${maxPrice}€
📊 Precio promedio: ${avgPrice.toFixed(2)}€
📈 Tendencia: ${trend}

📅 Datos desde: ${firstCheck.toLocaleDateString('es-ES')}
🔢 Verificaciones: ${history.length} puntos de datos
⏱️ Período: ${daysDiff} días

${recentChanges}`;

    ctx.editMessageText(message);
    
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
