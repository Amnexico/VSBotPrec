'use strict';
const { Markup } = require('telegraf');
const validator = require('validator');
const { UserSettings } = require('../../models');
const EmailService = require('../../services/email-service');

module.exports = async ctx => {
  const userId = ctx.from.id;
  const args = ctx.message.text.split(' ');
  const command = args[1]?.toLowerCase();
  
  try {
    // Obtener configuración actual del usuario
    let userSettings = await UserSettings.findOne({ userId });
    
    if (!userSettings) {
      userSettings = new UserSettings({
        userId: userId,
        emailNotifications: false,
        telegramNotifications: true
      });
      await userSettings.save();
    }
    
    // Manejar subcomandos
    switch (command) {
      case 'off':
      case 'disable':
        return await disableEmailNotifications(ctx, userSettings);
        
      case 'on':
      case 'enable':
        return await enableEmailNotifications(ctx, userSettings);
        
      case 'status':
        return await showEmailStatus(ctx, userSettings);
        
      default:
        // Si es un email válido, configurarlo
        if (command && validator.isEmail(command)) {
          return await setUserEmail(ctx, userSettings, command);
        }
        
        // Mostrar menú de configuración de email
        return await showEmailMenu(ctx, userSettings);
    }
  } catch (error) {
    console.error('Error en comando /email:', error);
    await ctx.reply('Error procesando comando de email. Inténtalo de nuevo.');
  }
};

async function showEmailMenu(ctx, userSettings) {
  const hasEmail = userSettings.email && userSettings.email.length > 0;
  const isEnabled = userSettings.emailNotifications;
  
  let message = '📧 *CONFIGURACIÓN DE EMAIL*\n\n';
  
  if (hasEmail) {
    message += `📧 Email: ${userSettings.email}\n`;
    message += `${userSettings.emailVerified ? '✅' : '⚠️'} ${userSettings.emailVerified ? 'Verificado' : 'Sin verificar'}\n`;
    message += `🔔 Notificaciones: ${isEnabled ? '✅ Activadas' : '❌ Desactivadas'}\n\n`;
    
    if (userSettings.lastEmailSent) {
      message += `📬 Último email: ${userSettings.lastEmailSent.toLocaleDateString('es-ES')}\n`;
    }
    
    if (userSettings.emailBounces > 0) {
      message += `⚠️ Errores de entrega: ${userSettings.emailBounces}\n`;
    }
  } else {
    message += 'Sin email configurado\n';
    message += '📱 Solo recibes notificaciones por Telegram\n\n';
  }
  
  message += '*Comandos disponibles:*\n';
  message += '`/email tu@email.com` - Configurar email\n';
  message += '`/email on` - Activar notificaciones\n';
  message += '`/email off` - Desactivar notificaciones\n';
  message += '`/email status` - Ver configuración';
  
  const buttons = [];
  
  if (hasEmail) {
    if (isEnabled) {
      buttons.push([Markup.button.callback('❌ Desactivar email', 'email_disable')]);
    } else {
      buttons.push([Markup.button.callback('✅ Activar email', 'email_enable')]);
    }
    buttons.push([Markup.button.callback('📝 Cambiar email', 'email_change')]);
  } else {
    buttons.push([Markup.button.callback('📧 Configurar email', 'email_setup')]);
  }
  
  buttons.push([Markup.button.callback('🔙 Volver al menú', 'menu_main')]);
  
  await ctx.replyWithMarkdown(message, Markup.inlineKeyboard(buttons));
}

async function setUserEmail(ctx, userSettings, email) {
  try {
    userSettings.email = email;
    userSettings.emailNotifications = true;
    userSettings.emailVerified = false;
    userSettings.emailAddedDate = new Date();
    userSettings.emailBounces = 0;
    
    await userSettings.save();
    
    // Enviar email de verificación
    const verificationLink = `https://t.me/vsofertasamazonbot?menu=verify_${ctx.from.id}`;
    const emailResult = await EmailService.sendVerificationEmail(email, verificationLink);
    
    let message = `✅ *Email configurado correctamente*\n\n`;
    message += `📧 ${email}\n`;
    message += `🔔 Notificaciones activadas\n\n`;
    
    if (emailResult.success) {
      message += `📬 Te hemos enviado un email de confirmación.\n`;
      message += `Haz clic en el enlace para verificar tu dirección.`;
    } else {
      message += `⚠️ No pudimos enviar el email de confirmación, pero tu dirección ha sido guardada.`;
    }
    
    await ctx.replyWithMarkdown(message);
    
  } catch (error) {
    console.error('Error configurando email:', error);
    await ctx.reply('Error guardando el email. Inténtalo de nuevo.');
  }
}

async function enableEmailNotifications(ctx, userSettings) {
  if (!userSettings.email) {
    return await ctx.reply('Primero configura un email con: `/email tu@email.com`', 
      { parse_mode: 'Markdown' }
    );
  }
  
  userSettings.emailNotifications = true;
  await userSettings.save();
  
  await ctx.reply(`✅ Notificaciones por email activadas para: ${userSettings.email}`);
}

async function disableEmailNotifications(ctx, userSettings) {
  userSettings.emailNotifications = false;
  await userSettings.save();
  
  let message = '❌ Notificaciones por email desactivadas\n\n';
  message += '📱 Seguirás recibiendo notificaciones por Telegram\n';
  message += 'Para reactivar usa: `/email on`';
  
  await ctx.replyWithMarkdown(message);
}

async function showEmailStatus(ctx, userSettings) {
  const hasEmail = userSettings.email && userSettings.email.length > 0;
  
  let message = '📊 *ESTADO DE NOTIFICACIONES*\n\n';
  message += `📱 Telegram: ✅ Activado\n`;
  
  if (hasEmail) {
    message += `📧 Email: ${userSettings.emailNotifications ? '✅ Activado' : '❌ Desactivado'}\n`;
    message += `📧 Dirección: ${userSettings.email}\n`;
    message += `${userSettings.emailVerified ? '✅' : '⚠️'} ${userSettings.emailVerified ? 'Verificado' : 'Sin verificar'}\n`;
    
    if (userSettings.lastEmailSent) {
      message += `📬 Último email: ${userSettings.lastEmailSent.toLocaleDateString('es-ES')}\n`;
    }
  } else {
    message += `📧 Email: ❌ No configurado\n`;
  }
  
  await ctx.replyWithMarkdown(message);
}
