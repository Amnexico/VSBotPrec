'use strict';
const localization = require('../locales');

class Alert {
  constructor(product) {
    this.title = product.name;
    this.price = product.price;
    this.oldPrice = product.oldPrice;
    this.currency = product.currency;
    this.availability = product.availability;
    this.url = product.url;
    this.user = product.user;
    this.type = product.changeType; // 'price_drop', 'price_increase', 'availability_change'
  }

  async toMarkdown() {
    let alertText = '';
    const checkText = await localization.getText('alerts.check_link', this.user);
    
    switch (this.type) {
      case 'price_drop':
        alertText = await localization.getText('alerts.price_drop', this.user, {
          name: this.title,
          oldPrice: this.oldPrice?.toFixed(2) || '-',
          newPrice: this.price?.toFixed(2) || '-',
          currency: this.currency,
          savings: (this.oldPrice - this.price)?.toFixed(2) || '-'
        });
        break;
        
      case 'price_increase':
        alertText = await localization.getText('alerts.price_increase', this.user, {
          name: this.title,
          oldPrice: this.oldPrice?.toFixed(2) || '-',
          newPrice: this.price?.toFixed(2) || '-',
          currency: this.currency
        });
        break;
        
      case 'availability_change':
        alertText = await localization.getText('alerts.availability_change', this.user, {
          name: this.title,
          availability: this.availability
        });
        break;
        
      default:
        // Formato básico para compatibilidad
        alertText = `*${this.title}*\n\n` +
          '💰  ' + (this.price ? `*${this.price.toFixed(2)} ${this.currency}*` : '-') + '\n\n' +
          `🧭  ${this.availability}\n\n`;
    }
    
    return `${alertText}\n\n[${checkText}](${this.url})`;
  }
}

module.exports = Alert;
