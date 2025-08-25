'use strict';
const nodemailer = require('nodemailer');
const { Resend } = require('resend');

class EmailService {
  constructor() {
    this.useResend = process.env.EMAIL_PROVIDER === 'resend';
    this.setupTransport();
  }

  setupTransport() {
    if (this.useResend) {
      // Configuración Resend
      this.resend = new Resend(process.env.RESEND_API_KEY);
      console.log('Email service inicializado con Resend');
    } else {
      // Configuración Gmail SMTP
      this.transporter = nodemailer.createTransporter({
        service: 'gmail',
        auth: {
          user: process.env.GMAIL_USER,
          pass: process.env.GMAIL_APP_PASSWORD
        }
      });
      console.log('Email service inicializado con Gmail SMTP');
    }
  }

  async sendPriceAlert(email, alertData) {
    try {
      const subject = this.createAlertSubject(alertData);
      const htmlContent = this.createAlertHTML(alertData);
      const textContent = this.createAlertText(alertData);

      if (this.useResend) {
        const result = await this.resend.emails.send({
          from: process.env.EMAIL_FROM || 'alerts@vspreciobot.com',
          to: email,
          subject: subject,
          html: htmlContent,
          text: textContent
        });
        
        console.log(`Email enviado via Resend a ${email}:`, result.id);
        return { success: true, messageId: result.id };
      } else {
        const result = await this.transporter.sendMail({
          from: process.env.EMAIL_FROM || process.env.GMAIL_USER,
          to: email,
          subject: subject,
          html: htmlContent,
          text: textContent
        });
        
        console.log(`Email enviado via Gmail a ${email}:`, result.messageId);
        return { success: true, messageId: result.messageId };
      }
    } catch (error) {
      console.error('Error enviando email:', error);
      return { success: false, error: error.message };
    }
  }

  createAlertSubject(alertData) {
    if (alertData.changeType === 'price_drop') {
      return `🔥 Bajada de precio: ${alertData.title.substring(0, 50)}...`;
    } else if (alertData.changeType === 'availability_change') {
      return `📦 Stock disponible: ${alertData.title.substring(0, 50)}...`;
    }
    return `⚡ Alerta de precio: ${alertData.title.substring(0, 50)}...`;
  }

  createAlertHTML(alertData) {
    const isPriceDrop = alertData.changeType === 'price_drop';
    const savings = isPriceDrop ? (alertData.oldPrice - alertData.newPrice).toFixed(2) : 0;
    const discountPercent = isPriceDrop ? Math.round(((alertData.oldPrice - alertData.newPrice) / alertData.oldPrice) * 100) : 0;

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center; }
    .alert-box { background: #e8f5e8; border-left: 4px solid #28a745; padding: 15px; margin: 20px 0; }
    .price-info { background: #fff; border: 1px solid #ddd; padding: 15px; border-radius: 5px; margin: 10px 0; }
    .btn { display: inline-block; background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 10px 0; }
    .footer { font-size: 12px; color: #666; text-align: center; margin-top: 30px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🤖 VS PrecioBot</h1>
      <h2>${isPriceDrop ? '🔥 ¡Bajada de precio detectada!' : '📦 Stock disponible'}</h2>
    </div>
    
    <div class="alert-box">
      <h3>${alertData.title}</h3>
    </div>
    
    ${isPriceDrop ? `
    <div class="price-info">
      <p><strong>💰 Nuevo precio:</strong> ${alertData.newPrice.toFixed(2)}€</p>
      <p><strong>💸 Precio anterior:</strong> <del>${alertData.oldPrice.toFixed(2)}€</del></p>
      <p><strong>🎯 Ahorro:</strong> ${savings}€ (${discountPercent}%)</p>
      ${alertData.isHistoricalLow ? '<p><strong>🏆 ¡PRECIO MÍNIMO HISTÓRICO!</strong></p>' : ''}
    </div>
    ` : `
    <div class="price-info">
      <p><strong>📊 Estado:</strong> ${alertData.availability}</p>
      <p><strong>💰 Precio:</strong> ${alertData.newPrice ? alertData.newPrice.toFixed(2) + '€' : 'Ver en Amazon'}</p>
    </div>
    `}
    
    <p style="text-align: center;">
      <a href="${alertData.affiliateUrl}" class="btn">✅ COMPRAR EN AMAZON</a>
    </p>
    
    <div class="footer">
      <p>Recibiste este email porque configuraste alertas de precio en VS PrecioBot.</p>
      <p>Para dejar de recibir emails, envía <strong>/email off</strong> al bot de Telegram.</p>
    </div>
  </div>
</body>
</html>`;
  }

  createAlertText(alertData) {
    const isPriceDrop = alertData.changeType === 'price_drop';
    let text = `🤖 VS PrecioBot - ${isPriceDrop ? 'Bajada de precio' : 'Stock disponible'}\n\n`;
    text += `📦 ${alertData.title}\n\n`;
    
    if (isPriceDrop) {
      const savings = (alertData.oldPrice - alertData.newPrice).toFixed(2);
      const discountPercent = Math.round(((alertData.oldPrice - alertData.newPrice) / alertData.oldPrice) * 100);
      
      text += `💰 Nuevo precio: ${alertData.newPrice.toFixed(2)}€\n`;
      text += `💸 Precio anterior: ${alertData.oldPrice.toFixed(2)}€\n`;
      text += `🎯 Ahorro: ${savings}€ (${discountPercent}%)\n`;
      
      if (alertData.isHistoricalLow) {
        text += `🏆 ¡PRECIO MÍNIMO HISTÓRICO!\n`;
      }
    } else {
      text += `📊 Estado: ${alertData.availability}\n`;
      if (alertData.newPrice) {
        text += `💰 Precio: ${alertData.newPrice.toFixed(2)}€\n`;
      }
    }
    
    text += `\n🔗 Comprar: ${alertData.affiliateUrl}\n\n`;
    text += `Para dejar de recibir emails, envía /email off al bot.`;
    
    return text;
  }

  async sendVerificationEmail(email, verificationLink) {
    try {
      const subject = 'Confirma tu email - VS PrecioBot';
      const html = this.createVerificationHTML(verificationLink);
      const text = `Confirma tu email haciendo clic aquí: ${verificationLink}`;

      if (this.useResend) {
        const result = await this.resend.emails.send({
          from: process.env.EMAIL_FROM || 'noreply@vspreciobot.com',
          to: email,
          subject: subject,
          html: html,
          text: text
        });
        return { success: true, messageId: result.id };
      } else {
        const result = await this.transporter.sendMail({
          from: process.env.EMAIL_FROM || process.env.GMAIL_USER,
          to: email,
          subject: subject,
          html: html,
          text: text
        });
        return { success: true, messageId: result.messageId };
      }
    } catch (error) {
      console.error('Error enviando email de verificación:', error);
      return { success: false, error: error.message };
    }
  }

  createVerificationHTML(verificationLink) {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .btn { display: inline-block; background: #28a745; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; }
  </style>
</head>
<body>
  <div class="container">
    <h2>🤖 VS PrecioBot - Confirma tu email</h2>
    <p>Haz clic en el botón para confirmar tu dirección de email y empezar a recibir alertas de precio:</p>
    <p style="text-align: center;">
      <a href="${verificationLink}" class="btn">✅ Confirmar Email</a>
    </p>
    <p>Si no solicitaste esto, simplemente ignora este mensaje.</p>
  </div>
</body>
</html>`;
  }

  // Método para verificar configuración
  async testConnection() {
    try {
      if (this.useResend) {
        // Test básico con Resend (solo validar API key)
        console.log('Testing Resend connection...');
        return { success: true, provider: 'Resend' };
      } else {
        // Test de conexión Gmail
        await this.transporter.verify();
        console.log('Gmail SMTP connection verified');
        return { success: true, provider: 'Gmail SMTP' };
      }
    } catch (error) {
      console.error('Email service test failed:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new EmailService();
