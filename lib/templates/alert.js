'use strict';
class Alert {
  constructor(product) {
    this.title = product.name;
    this.asin = product.asin;
    this.productId = product.productId;
    this.oldPrice = product.oldPrice;
    this.newPrice = product.newPrice;
    this.currency = product.currency || 'EUR';
    this.availability = product.availability;
    this.url = product.url;
    this.affiliateUrl = product.affiliateUrl;
    this.changeType = product.changeType;
    this.isHistoricalLow = product.isHistoricalLow;
    this.comment = product.comment;
    this.manualUpdate = product.manualUpdate;
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
  
  createPriceDropAlert() {
    const savings = (this.oldPrice - this.newPrice).toFixed(2);
    const discountPercent = Math.round(((this.oldPrice - this.newPrice) / this.oldPrice) * 100);
    
    let commentText = '';
    if (this.comment) {
      commentText = `\n🎟️ ${this.comment}`;
    }
    
    const isDropping = this.newPrice < this.oldPrice;
    const emoji = isDropping ? '🔥 *¡BAJADA DE PRECIO DETECTADA!* 🔥' : '📈 *SUBIDA DE PRECIO DETECTADA* 📈';
    const savingsText = isDropping ? 
      `🎯 AHORRO: ${savings}€ (${discountPercent}%)` : 
      `📊 INCREMENTO: ${Math.abs(savings)}€ (${Math.abs(discountPercent)}%)`;
    
    const historicalLowText = this.isHistoricalLow ? '\n🏆 *¡MÍNIMO HISTÓRICO!*' : '';
    
    const message = `${emoji}
📦 *${this.title}*
💰 *NUEVO PRECIO: ${this.newPrice.toFixed(2)}€*
💸 Precio anterior: *${this.oldPrice.toFixed(2)}€*
${savingsText}${historicalLowText}${commentText}
⏰ ${isDropping ? 'Oferta por tiempo limitado' : 'Precio actualizado'}
${this.affiliateUrl || `https://www.amazon.es/dp/${this.asin}?tag=vsoatg-21`}`;

    return {
      text: message,
      extra: {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{
              text: '✅ COMPRAR EN AMAZON',
              url: this.affiliateUrl || `https://www.amazon.es/dp/${this.asin}?tag=vsoatg-21`
            }],
            [{
              text: '🎯 Configurar alertas',
              callback_data: `!menu=${this.productId ? this.productId.toString() : 'unknown'}`
            }, {
              text: '🗑️ Dejar de rastrear',
              callback_data: `delete_tracking_${this.asin}`
            }],
            [{
              text: '📋 Mis productos',
              callback_data: 'menu_my_products'
            }, {
              text: '🔙 Menú principal',
              callback_data: 'menu_main'
            }]
          ]
        }
      }
    };
  }
  
  createAvailabilityAlert() {
    const message = `📦 *${this.title}*
🔄 *Estado actualizado*
🧭 ${this.availability}
${this.affiliateUrl || `https://www.amazon.es/dp/${this.asin}?tag=vsoatg-21`}`;

    return {
      text: message,
      extra: {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{
              text: '✅ VER EN AMAZON',
              url: this.affiliateUrl || `https://www.amazon.es/dp/${this.asin}?tag=vsoatg-21`
            }],
            [{
              text: '📋 Mis productos',
              callback_data: 'menu_my_products'
            }, {
              text: '🔙 Menú principal',
              callback_data: 'menu_main'
            }]
          ]
        }
      }
    };
  }
  
  createGenericAlert() {
    const message = `📦 *${this.title}*
💰 ${this.newPrice ? `*${this.newPrice.toFixed(2)} ${this.currency}*` : '-'}
🧭 ${this.availability}
${this.affiliateUrl || `https://www.amazon.es/dp/${this.asin}?tag=vsoatg-21`}`;

    return {
      text: message,
      extra: {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{
              text: '✅ VER EN AMAZON',
              url: this.affiliateUrl || `https://www.amazon.es/dp/${this.asin}?tag=vsoatg-21`
            }],
            [{
              text: '📋 Mis productos',
              callback_data: 'menu_my_products'
            }, {
              text: '🔙 Menú principal',
              callback_data: 'menu_main'
            }]
          ]
        }
      }
    };
  }
}

module.exports = Alert;
