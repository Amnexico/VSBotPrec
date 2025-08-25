'use strict';
const { Scenes, Markup } = require('telegraf');
const validator = require('validator');
const { UserSettings } = require('../../models');
const EmailService = require('../../services/email-service');

const steps = [
  async ctx => {
    const message = 'Configura notificaciones por email (opcional):\n\n' +
      'Introduce tu dirección de email para recibir alertas de precio también por correo.\n\n' +
      'Si prefieres solo notificaciones por Telegram, presiona "Saltar".';
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('⏭ Saltar (solo Telegram)', 'skip_email')],
      [Markup.button.callback('❌ Cancelar', 'exit_email_setup')]
    ]);
    
    await ctx.reply(message, keyboard);
    ctx.wizard.next();
  },
  
  async ctx => {
    // Verificar si es botón
    if (ctx.callbackQuery) {
      return; // Los botones se manejan por separado
    }
    
    const email = ctx.update.message.text.trim();
    const userId = ctx.from.id;
    
    // Validar email
    if (!validator.isEmail(email)) {
      const errorMsg = 'Email no válido. Introduce una dirección de email correcta o presiona "Saltar".';
      return await ctx.reply(errorMsg, Markup.inlineKeyboard([
        [Markup.button.callback('⏭ Saltar', 'skip_email')],
        [Markup.button.callback('❌ Cancelar', 'exit_email_setup')]
      ]));
    }
    
    try {
      // Buscar o crear configuración del usuario
      let userSettings = await UserSettings.findOne({ userId });
      
      if (!userSettings) {
        userSettings = new UserSettings({
          userId: userId,
          email: email,
          emailNotifications: true,
          emailAddedDate: new Date()
        });
      } else {
        userSettings.email = email;
        userSettings.emailNotifications = true;
        userSettings.emailAddedDate = new Date();
        userSettings.emailBounces = 0; // Reset bounces
      }
      
      await userSettings.save();
      
      // Enviar email de verificación (opcional)
      const verificationLink = `https://t.me/vspreciobot?start=verify_${userId}`;
      const emailResult = await EmailService.sendVerificationEmail(email, verificationLink);
      
      let confirmMessage = `Email configurado correctamente!\n\n` +
        `📧 ${email}\n` +
        `Ahora recibirás alertas de precio por Telegram y email.\n\n`;
      
      if (emailResult.success) {
        confirmMessage += `📬 Te hemos enviado un email de confirmación. Haz clic en el enlace para verificar tu dirección.`;
      } else {
        confirmMessage += `⚠ No pudimos enviar el email de confirmación, pero tu dirección ha sido guardada.`;
      }
      
      await ctx.reply(confirmMessage, Markup.inlineKeyboard([
        [Markup.button.callback('✅ Continuar', 'continue_after_email')]
      ]));
      
      await ctx.scene.leave();
      
    } catch (error) {
      console.error('Error configurando email:', error);
      await ctx.reply('Error guardando el email. Inténtalo de nuevo más tarde.', 
        Markup.inlineKeyboard([
          [Markup.button.callback('🔙 Volver al menú', 'menu_main')]
        ])
      );
      await ctx.scene.leave();
    }
  }
];

const scene = new Scenes.WizardScene('setup-email', ...steps);

// Manejar botón saltar
scene.action('skip_email', async (ctx) => {
  await ctx.answerCbQuery();
  
  // Asegurar que el usuario tiene configuración sin email
  const userId = ctx.from.id;
  let userSettings = await UserSettings.findOne({ userId });
  
  if (!userSettings) {
    userSettings = new UserSettings({
      userId: userId,
      emailNotifications: false,
      telegramNotifications: true
    });
    await userSettings.save();
  }
  
  await ctx.editMessageText('Configuración completada.\n\n' +
    'Recibirás alertas solo por Telegram.\n\n' +
    'Puedes configurar email más tarde con el comando /email', 
    Markup.inlineKeyboard([
      [Markup.button.callback('✅ Continuar', 'continue_after_email')]
    ])
  );
  
  await ctx.scene.leave();
});

// Manejar botón cancelar
scene.action('exit_email_setup', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText('Configuración de email cancelada.', 
    Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Volver al menú', 'menu_main')]
    ])
  );
  await ctx.scene.leave();
});

// Manejar botón continuar (para redirigir después de configurar email)
scene.action('continue_after_email', async (ctx) => {
  await ctx.answerCbQuery();
  
  // Redirigir según el contexto (si venía de añadir producto, etc.)
  const state = ctx.wizard.state;
  if (state && state.returnTo === 'add_product' && state.productId) {
    // Volver a la configuración del producto
    ctx.match = [null, state.productId];
    const actions = require('../actions');
    await actions.menu(ctx);
  } else {
    // Volver al menú principal
    const welcomeMessage = 'VS PrecioBot\n\n' +
      'Alertas de ofertas en Amazon e historial de precios. ' +
      'Recibe notificaciones cuando baje el precio de tus productos favoritos.\n\n' +
      '¿Qué quieres hacer?';

    const mainMenuKeyboard = Markup.inlineKeyboard([
      [Markup.button.callback('➕ Añadir Producto', 'menu_add_product')],
      [Markup.button.callback('📋 Mis productos', 'menu_my_products')],
      [Markup.button.callback('❓ Ayuda', 'menu_help')]
    ]);

    await ctx.editMessageText(welcomeMessage, {
      parse_mode: 'Markdown',
      ...mainMenuKeyboard
    });
  }
});

module.exports = scene;
