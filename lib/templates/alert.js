'use strict';
class Alert {
  constructor(product) {
    this.title = product.name;
    this.oldPrice = product.oldPrice;
    this.newPrice = product.newPrice;
    this.currency = product.currency;
    this.availability = product.availability;
    this.url = product.url;
    this.changeType = product.changeType;
  }
  
  toMarkdown() {
    if (this.changeType === 'price_drop') {
      return this.createPriceDropAlert();
    } else if (this.changeType === 'availability_change') {
      return this.createAvailabilityAlert();
    } else {
      return this.createGenericAlert();
    }
  }
  
  createPriceDropAlert() {
    const savings = (this.oldPrice - this.newPrice).toFixed(2);
    const discountPercent = Math.round(((this.oldPrice - this.newPrice) / this.oldPrice) * 100);
    
    const message = `🔥 *¡BAJADA DE PRECIO DETECTADA!* 🔥

📦 *${this.title}*

💸 Precio anterior: *${this.oldPrice.toFixed(2)}€*
💰 *NUEVO PRECIO: ${this.newPrice.toFixed(2)}€*
🎯 *AHORRO: ${savings}€ (${discountPercent}%)*

⏰ Oferta por tiempo limitado

${this.url}`;

    return {
      text: message,
      extra: {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            {
              text: '✅ COMPRAR EN AMAZON',
              url: this.url
            }
          ]]
        }
      }
    };
  }
  
  createAvailabilityAlert() {
    return `📦 *${this.title}*

🔄 *Estado actualizado*
🧭 ${this.availability}

${this.url}`;
  }
  
  createGenericAlert() {
    return `📦 *${this.title}*

💰 ${this.newPrice ? `*${this.newPrice.toFixed(2)} ${this.currency}*` : '-'}
🧭 ${this.availability}

${this.url}`;
  }
}

module.exports = Alert;
