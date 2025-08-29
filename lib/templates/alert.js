'use strict';
const { UserSettings } = require('../models');
const EmailService = require('../services/email-service');

class Alert {
  constructor(product) {
    console.log('=== DEBUG ALERT CONSTRUCTOR ===');
    console.log('product.productId:', product.productId);
    console.log('product._id:', product._id);
    console.log('==============================');
    
    this.title = product.name;
    this.asin = product.asin;
    this.productId = product.productId || product._id;
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
    this.userId = product.user; // Para notificaciones por email
  }
  
  async toMarkdown() {
  // Enviar notificación por email si está configurada
  await this.sendEmailNotification();
  
  // Verificar si es alerta de grupo
  if (this.isGroupAlert) {
    return this.createGroupAlert();
  }
  
  // Devolver la notificación normal
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
  
  async sendEmailNotification() {
    try {
      if (!this.userId) return;
      
      // Buscar configuración del usuario
      const userSettings = await UserSettings.findOne({ userId: this.userId });
      
      if (!userSettings || !userSettings.email || !userSettings.emailNotifications) {
        console.log(`Email not configured or disabled for user ${this.userId}`);
        return;
      }
      
      // Preparar datos para el email
      const emailData = {
        title: this.title,
        asin: this.asin,
        oldPrice: this.oldPrice,
        newPrice: this.newPrice,
        currency: this.currency,
        availability: this.availability,
        affiliateUrl: this.affiliateUrl || `https://www.amazon.es/dp/${this.asin}?tag=vsoatg-21`,
        changeType: this.changeType,
        isHistoricalLow: this.isHistoricalLow,
        comment: this.comment
      };
      
      // Enviar email
      const emailResult = await EmailService.sendPriceAlert(userSettings.email, emailData);
      
      if (emailResult.success) {
        // Actualizar última fecha de email enviado
        userSettings.lastEmailSent = new Date();
        await userSettings.save();
        
        console.log(`Email alert sent to ${userSettings.email} for product ${this.asin}`);
      } else {
        console.error(`Failed to send email to ${userSettings.email}:`, emailResult.error);
        
        // Incrementar contador de errores
        userSettings.emailBounces += 1;
        
        // Si hay muchos errores, desactivar notificaciones automáticamente
        if (userSettings.emailBounces >= 3) {
          userSettings.emailNotifications = false;
          console.log(`Email notifications disabled for user ${this.userId} due to bounces`);
        }
        
        await userSettings.save();
      }
      
    } catch (error) {
      console.error('Error sending email notification:', error);
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

createGroupAlert() {
  const isCross = this.isCrossVariant;
  const discountPercent = ((this.oldPrice - this.newPrice) / this.oldPrice * 100).toFixed(0);
  
  let message = '';
  
  if (isCross) {
    // Alerta cruzada - otra variante del grupo bajó de precio
    message = `🔄 **VARIANTE DEL GRUPO**\n\n`;
    message += `📦 **${this.groupName}** (${this.actualVariantColor})\n`;
    message += `💰 **${this.newPrice}${this.currency}** (Antes: ${this.oldPrice}${this.currency})\n`;
    message += `📉 **-${discountPercent}%** de descuento\n\n`;
    message += `ℹ️ Tú sigues la variante: **${this.userVariantColor}**\n`;
    message += `🔍 Bajó de precio la variante: **${this.actualVariantColor}**\n\n`;
  } else {
    // Alerta normal - la propia variante del usuario bajó
    message = `📉 **BAJADA DE PRECIO**\n\n`;
    message += `📦 **${this.groupName}** (${this.userVariantColor})\n`;
    message += `💰 **${this.newPrice}${this.currency}** (Antes: ${this.oldPrice}${this.currency})\n`;
    message += `📉 **-${discountPercent}%** de descuento\n\n`;
  }
  
  if (this.isHistoricalLow) {
    message += `🔥 **¡MÍNIMO HISTÓRICO!**\n\n`;
  }
  
  message += `🛒 [Ver en Amazon](${this.affiliateUrl})`;
  
  return {
    text: message,
    extra: {
      parse_mode: 'Markdown',
      disable_web_page_preview: false,
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🛒 Ver Producto', url: this.affiliateUrl },
            { text: '📊 Historial', callback_data: `history_${this.productId}` }
          ],
          [
            { text: '⚙️ Configurar', callback_data: `menu_${this.productId}` }
          ]
        ]
      }
    }
  };
}

module.exports = Alert;

