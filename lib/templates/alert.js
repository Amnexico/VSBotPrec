'use strict';
class Alert {
  constructor(product) {
    this.title = product.name;
    this.asin = product.asin;
    this.oldPrice = product.oldPrice;
    this.newPrice = product.newPrice;
    this.currency = product.currency || 'EUR';
    this.availability = product.availability;
    this.url = product.url;
    this.changeType = product.changeType;
    this.isHistoricalLow = product.isHistoricalLow;
    this.comment = product.comment;
    this.manualUpdate = product.manualUpdate;
    // NUEVOS CAMPOS PARA VENDEDOR
    this.sellerType = product.sellerType;
    this.sellerName = product.sellerName;
    this.sellerEmoji = product.sellerEmoji;
  }

  toMarkdown() {
    switch (this.changeType) {
      case 'price_drop':
      case 'price_increase':
        return this.createPriceDropAlert();
      case 'availability_change':
        return this.createAvailabilityAlert();
      default:
        return this.createGenericAlert();
    }
  }

  // Método para generar la línea del vendedor
  getSellerLine() {
    if (!this.sellerEmoji || !this.sellerName) return '';
    
    let sellerText = '';
    switch (this.sellerType) {
      case 'amazon_direct':
        sellerText = `${this.sellerEmoji} Vendido y Enviado por Amazon`;
        break;
      case 'fba':
        sellerText = `${this.sellerEmoji} Vendido por ${this.sellerName} y Enviado por Amazon`;
        break;
      case 'external':
        sellerText = `${this.sellerEmoji} Vendido y Enviado por ${this.sellerName}`;
        break;
      default:
        sellerText = `${this.sellerEmoji} ${this.sellerName}`;
    }
    
    return `\n🏪 ${sellerText}`;
  }

  createPriceDropAlert() {
    const savings = (this.oldPrice - this.newPrice).toFixed(2);
    const discountPercent = Math.round(((this.oldPrice - this.newPrice) / this.oldPrice) * 100);
    const newTargetPrice = (this.newPrice * 0.95).toFixed(2);
    
    let commentText = '';
    if (this.comment) {
      commentText = `\n🎟️ ${this.comment}`;
    }

    // Determinar si es bajada o subida
    const isDropping = this.newPrice < this.oldPrice;
    const emoji = isDropping ? '🔥 *¡BAJADA DE PRECIO DETECTADA!* 🔥' : '📈 *SUBIDA DE PRECIO DETECTADA* 📈';
    const savingsText = isDropping ? 
      `🎯 *AHORRO: ${savings}€ (${discountPercent}%)*` : 
      `📊 *INCREMENTO: ${Math.abs(savings)}€ (${Math.abs(discountPercent)}%)*`;
    
    // Línea del vendedor
    const sellerLine = this.getSellerLine();
    
    // Indicador de mínimo histórico
    const historicalLowText = this.isHistoricalLow ? '\n🏆 *¡MÍNIMO HISTÓRICO!*' : '';
    
    const message = `${emoji}
📦 *${this.title}*
💸 Precio anterior: *${this.oldPrice.toFixed(2)}€*
💰 *NUEVO PRECIO: ${this.newPrice.toFixed(2)}€*
${savingsText}${sellerLine}${historicalLowText}${commentText}
⏰ ${isDropping ? 'Oferta por tiempo limitado' : 'Precio actualizado'}
https://www.amazon.es/dp/${this.asin}`;

    return {
      text: message,
      extra: {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{
              text: '✅ COMPRAR EN AMAZON',
              url: this.url
            }],
            [{
              text: '🎯 Actualizar precio objetivo',
              callback_data: `update_target_${this.asin}_${newTargetPrice}`
            }, {
              text: '🗑️ Dejar de rastrear',
              callback_data: `delete_tracking_${this.asin}`
            }]
          ]
        }
      }
    };
  }
  
  createAvailabilityAlert() {
    const sellerLine = this.getSellerLine();
    
    const message = `📦 *${this.title}*
🔄 *Estado actualizado*
🧭 ${this.availability}${sellerLine}
${this.url}`;
    return {
      text: message,
      extra: {
        parse_mode: 'Markdown'
      }
    };
  }
  
  createGenericAlert() {
    const sellerLine = this.getSellerLine();
    
    const message = `📦 *${this.title}*
💰 ${this.newPrice ? `*${this.newPrice.toFixed(2)} ${this.currency}*` : '-'}
🧭 ${this.availability}${sellerLine}
${this.url}`;
    return {
      text: message,
      extra: {
        parse_mode: 'Markdown'
      }
    };
  }
}

module.exports = Alert;
