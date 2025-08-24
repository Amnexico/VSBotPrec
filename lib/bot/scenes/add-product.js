'use strict';
const { Scenes, Markup } = require('telegraf');
const extractDomain = require('extract-domain');
const logger = require('../../logger')('bot');
const { Product } = require('../../models');
const validator = require('../../helpers/validator');
const paapiClient = require('../../amazon/paapi-client');

// Función para crear botones de configuración inmediata
function createConfigurationKeyboard(productId, currentPrice, currency = 'EUR') {
  const buttons = [];
  
  // Fila 1: 5% y 10%
  const price5 = currentPrice ? (currentPrice * 0.95).toFixed(2) : 'X';
  const price10 = currentPrice ? (currentPrice * 0.90).toFixed(2) : 'X';
  buttons.push([
    Markup.button.callback(`🔵 5% (${price5}${currency})`, `setup_percent_5_${productId}`),
    Markup.button.callback(`🟠 10% (${price10}${currency})`, `setup_percent_10_${productId}`)
  ]);
  
  // Fila 2: 15% y 20%
  const price15 = currentPrice ? (currentPrice * 0.85).toFixed(2) : 'X';
  const price20 = currentPrice ? (currentPrice * 0.80).toFixed(2) : 'X';
  buttons.push([
    Markup.button.callback(`🔴 15% (${price15}${currency})`, `setup_percent_15_${productId}`),
    Markup.button.callback(`🟣 20% (${price20}${currency})`, `setup_percent_20_${productId}`)
  ]);
  
  // Fila 3: Cualquier bajada
  buttons.push([
  Markup.button.callback('⚡ Cualquier bajada', `setup_any_drop_${productId}`),
  Markup.button.callback('🎯 Precio personalizado', `setup_custom_${productId}`)
]);
  
  // Fila 5: Solo stock + Configurar después
  buttons.push([
    Markup.button.callback('📦 Solo cuando hay stock', `setup_stock_${productId}`),
    Markup.button.callback('⏭️ Configurar después', `setup_later_${productId}`)
  ]);
  
  // Fila 6: Navegación
  buttons.push([
    Markup.button.callback('🔙 Volver al menú', 'menu_main'),
    Markup.button.callback('❌ Cancelar', 'exit_scene')
  ]);
  
  return Markup.inlineKeyboard(buttons);
}

const steps = [
  async ctx => {
    const message = 'Envía el enlace del producto de Amazon que quieres seguir.\n\n' +
      '📋 Copia y pega cualquier enlace de Amazon España.\n' +
      '🔔 Te avisaré cuando baje de precio.';
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('❌ Cancelar', 'exit_scene')]
    ]);
    
    await ctx.reply(message, keyboard);
    ctx.wizard.next();
  },
  async ctx => {
    // Verificar si es botón de cancelar
    if (ctx.callbackQuery) {
      return; // Los botones se manejan por separado
    }
    
    const messageText = ctx.update.message.text;
    const user = ctx.update.message.from.id;
    const userMessageId = ctx.update.message.message_id;
    const urls = messageText.match(/\bhttps?:\/\/\S+/gi);
    
    if (!urls) {
      const errorMsg = 'Esta no es una URL válida, por favor inténtalo de nuevo.';
      return await ctx.reply(errorMsg, Markup.inlineKeyboard([
        [Markup.button.callback('❌ Cancelar', 'exit_scene')]
      ]));
    }
    
    const url = urls[0];
    const domain = extractDomain(url);
    
    // Validación mejorada para enlaces acortados
    const validDomains = ['amzn.eu', 'amzn.to'];
    const isAmazonDomain = domain.startsWith('amazon.') || validDomains.includes(domain);
    
    if (!validator.isUrl(url) || !isAmazonDomain) {
      const errorMsg = 'Este no es un producto válido de Amazon, por favor inténtalo de nuevo.';
      return await ctx.reply(errorMsg, Markup.inlineKeyboard([
        [Markup.button.callback('❌ Cancelar', 'exit_scene')]
      ]));
    }
    
    // Mensaje de procesamiento
    const processingMessage = await ctx.reply('⏳ Obteniendo información del producto...');
    const processingMessageId = processingMessage.message_id;
    
    try {
      // Borrar mensaje del usuario con el enlace
      try {
        await ctx.deleteMessage(userMessageId);
      } catch (deleteError) {
        console.log('No se pudo borrar el mensaje del usuario:', deleteError.message);
      }
      
      // Obtener datos del producto
      const productData = await paapiClient.getProductByUrl(url);
      
      // Verificar si ya existe un producto con el mismo ASIN
      const existingProduct = await Product.findOne({ 
        asin: productData.asin, 
        user: user 
      });
      
      if (existingProduct) {
        // Borrar mensaje de procesamiento
        try {
          await ctx.deleteMessage(processingMessageId);
        } catch (deleteError) {
          console.log('No se pudo borrar mensaje de procesamiento:', deleteError.message);
        }
        
        const errorMsg = '⚠️ Ya estás siguiendo este producto.\n\n' +
          `📦 ${existingProduct.name}\n` +
          `💰 Precio: ${existingProduct.price}${existingProduct.currency}`;
        
        await ctx.reply(errorMsg, Markup.inlineKeyboard([
          [Markup.button.callback('📋 Ver mis productos', 'menu_my_products')],
          [Markup.button.callback('🔙 Volver al menú', 'menu_main')]
        ]));
        
        return await ctx.scene.leave();
      }
      
      // Crear el producto en la base de datos
      const product = new Product({
        name: productData.name,
        url: url,
        asin: productData.asin,
        user: user,
        price: productData.price || 0,
        currency: productData.currency || 'EUR',
        availability: productData.availability || 'Disponible',
        lastCheck: Math.floor(Date.now() / 1000)
      });

      await product.save();

      // Guardar precio inicial en historial solo si es el primer usuario que añade este ASIN
      if (productData.price && productData.price > 0) {
        const { PriceHistory } = require('../../models');
        
        const existingHistory = await PriceHistory.findOne({ asin: productData.asin });
        
        if (!existingHistory) {
          await PriceHistory.create({
            asin: productData.asin,
            price: productData.price,
            previousPrice: 0,
            timestamp: new Date(),
            currency: productData.currency || 'EUR',
            comment: 'Precio inicial - primer usuario'
          });
          
          console.log(`Precio inicial guardado (primera vez): ${productData.asin} - ${productData.price}€`);
        } else {
          console.log(`ASIN ${productData.asin} ya tiene historial - no se duplica registro`);
        }
      }

      // Tracking de analytics
      const AnalyticsService = require('../../services/analytics-service');
      await AnalyticsService.trackProductAdded(user, productData.asin, productData.name, productData.price);

      logger.info(`Product added via PA-API: ${product.name} (${product.id}) - ${product.price}${product.currency} - ${product.availability}`);
      // Borrar mensaje de procesamiento
      try {
        await ctx.deleteMessage(processingMessageId);
      } catch (deleteError) {
        console.log('No se pudo borrar mensaje de procesamiento:', deleteError.message);
      }
      
      // Mensaje de confirmación con configuración inmediata
      const successMsg = `✅ *Producto añadido correctamente*\n\n` +
        `📦 ${productData.name}\n` +
        `💰 Precio actual: *${productData.price}${productData.currency}*\n` +
        `📊 Disponibilidad: ${productData.availability}\n` +
        `🆔 ASIN: ${productData.asin}\n` +
        `🔗 [Ver en Amazon](${productData.affiliateUrl || `https://www.amazon.es/dp/${productData.asin}?tag=vsoatg-21`})\n\n` +
        `🔔 *¿Bajada esperada?*\nElige el tipo de alerta que prefieres:`;
      
      await ctx.replyWithMarkdown(successMsg, {
        ...createConfigurationKeyboard(product.id, productData.price, productData.currency),
        disable_web_page_preview: true
      });
      
      // Guardar datos para uso posterior
      ctx.wizard.state.productId = product.id;
      ctx.wizard.state.productData = productData;
      ctx.wizard.next();
      
    } catch (error) {
      logger.error('Error adding product via PA-API:', error);
      
      // Borrar mensaje de procesamiento
      try {
        await ctx.deleteMessage(processingMessageId);
      } catch (deleteError) {
        console.log('No se pudo borrar mensaje de procesamiento:', deleteError.message);
      }
      
      let errorMsg = 'Error al obtener información del producto de Amazon.';
      
      if (error.message.includes('No se pudo resolver el enlace acortado')) {
        errorMsg = 'No se pudo procesar el enlace acortado. Intenta con la URL completa del producto.';
      } else if (error.message.includes('PA-API Error')) {
        errorMsg = 'Error temporal de Amazon. Inténtalo de nuevo en unos minutos.';
      }
      
      await ctx.reply(errorMsg, Markup.inlineKeyboard([
        [Markup.button.callback('🔄 Intentar de nuevo', 'retry_add_product')],
        [Markup.button.callback('🔙 Volver al menú', 'menu_main')]
      ]));
    }
  },
  
  // Paso final - esperar configuración
  async ctx => {
    // Este paso maneja los botones de configuración
    // Los botones específicos se manejan en las acciones del bot principal
  }
];

const scene = new Scenes.WizardScene('add-product', ...steps);

// Manejar botón de cancelar
scene.action('exit_scene', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText('❌ Operación cancelada.', 
    Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Volver al menú', 'menu_main')]
    ])
  );
  await ctx.scene.leave();
});

// Manejar reintentar
scene.action('retry_add_product', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText('Envía el enlace del producto de Amazon que quieres seguir:', 
    Markup.inlineKeyboard([
      [Markup.button.callback('❌ Cancelar', 'exit_scene')]
    ])
  );
  ctx.wizard.back();
});

// Manejar configuraciones inmediatas
scene.action(/^setup_percent_(\d+)_(\w+)$/, async (ctx) => {
  const percentage = parseInt(ctx.match[1]);
  const productId = ctx.match[2];
  
  try {
    const product = await Product.findById(productId);
    const targetPrice = product.price * (1 - percentage / 100);
    
    await Product.findByIdAndUpdate(productId, { 
      'preferences.targetPrice': targetPrice,
      'preferences.alertType': 'percentage',
      'preferences.discountPercent': percentage
    });
    
    await ctx.answerCbQuery(`✅ Alerta configurada: ${percentage}% de descuento`);
    
    const confirmMsg = `🎉 *¡Configuración completada!*\n\n` +
      `📦 ${product.name}\n` +
      `🔵 Recibirás alertas cuando baje un *${percentage}%* o más\n` +
      `🎯 Precio objetivo: *${targetPrice.toFixed(2)}${product.currency}*\n\n` +
      `✨ Te notificaremos cuando haya una buena oferta.`;
    
    await ctx.editMessageText(confirmMsg, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('📋 Ver mis productos', 'menu_my_products')],
        [Markup.button.callback('🔙 Volver al menú', 'menu_main')]
      ])
    });
    
    await ctx.scene.leave();
  } catch (error) {
    await ctx.answerCbQuery('Error al configurar la alerta');
  }
});

scene.action(/^setup_any_drop_(\w+)$/, async (ctx) => {
  const productId = ctx.match[1];
  
  try {
    const product = await Product.findByIdAndUpdate(productId, { 
      'preferences.targetPrice': null,
      'preferences.alertType': 'any_drop',
      'preferences.discountPercent': 0
    }, { new: true });
    
    await ctx.answerCbQuery('⚡ Cualquier bajada configurada');
    
    const confirmMsg = `🎉 *¡Configuración completada!*\n\n` +
      `📦 ${product.name}\n` +
      `⚡ Recibirás alertas con *cualquier bajada de precio*\n\n` +
      `✨ Te notificaremos inmediatamente cuando baje el precio.`;
    
    await ctx.editMessageText(confirmMsg, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('📋 Ver mis productos', 'menu_my_products')],
        [Markup.button.callback('🔙 Volver al menú', 'menu_main')]
      ])
    });
    
    await ctx.scene.leave();
  } catch (error) {
    await ctx.answerCbQuery('Error al configurar la alerta');
  }
});

scene.action(/^setup_stock_(\w+)$/, async (ctx) => {
  const productId = ctx.match[1];
  
  try {
    const product = await Product.findByIdAndUpdate(productId, { 
      'preferences.stockAlerts': true,
      'preferences.alertType': 'stock'
    }, { new: true });
    
    await ctx.answerCbQuery('📦 Alerta de stock configurada');
    
    const confirmMsg = `🎉 *¡Configuración completada!*\n\n` +
      `📦 ${product.name}\n` +
      `📦 Recibirás alertas cuando *haya stock disponible*\n\n` +
      `✨ Te notificaremos cuando el producto esté disponible.`;
    
    await ctx.editMessageText(confirmMsg, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('📋 Ver mis productos', 'menu_my_products')],
        [Markup.button.callback('🔙 Volver al menú', 'menu_main')]
      ])
    });
    
    await ctx.scene.leave();
  } catch (error) {
    await ctx.answerCbQuery('Error al configurar la alerta');
  }
});

scene.action(/^setup_later_(\w+)$/, async (ctx) => {
  await ctx.answerCbQuery('✅ Producto añadido');
  
  const confirmMsg = `✅ *Producto añadido correctamente*\n\n` +
    `Puedes configurar las alertas más tarde desde "Mis productos".\n\n` +
    `💡 *Tip:* Sin configurar alertas no recibirás notificaciones.`;
  
  await ctx.editMessageText(confirmMsg, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('📋 Ver mis productos', 'menu_my_products')],
      [Markup.button.callback('🔙 Volver al menú', 'menu_main')]
    ])
  });
  
  await ctx.scene.leave();
});

// Salir con comando
scene.command('exit', async ctx => {
  await ctx.scene.leave();
  await ctx.reply('❌ Operación cancelada.', 
    Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Volver al menú', 'menu_main')]
    ])
  );
});

// Añadir esta acción al final del archivo, antes de module.exports = scene;
scene.action(/^setup_custom_(\w+)$/, async (ctx) => {
  const productId = ctx.match[1];
  await ctx.answerCbQuery();
  await ctx.scene.enter('set-target-price', { productId: productId });
});

module.exports = scene;








