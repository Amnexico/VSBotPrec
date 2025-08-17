// =============================================================================
// lib/bot/scenes/set-target-price.js - VERSIÓN MEJORADA CON EMOJIS ÚNICOS
// =============================================================================
'use strict';
const { Scenes, Markup } = require('telegraf');
const { Product } = require('../../models');

function createPercentageKeyboard(productId, currentPrice, currency) {
  const buttons = [];
  
  // Fila 1: 5% y 10% con emojis únicos
  const price5 = currentPrice ? (currentPrice * 0.95).toFixed(2) : 'X';
  const price10 = currentPrice ? (currentPrice * 0.90).toFixed(2) : 'X';
  buttons.push([
    Markup.button.callback(`🔵 5% (${price5}${currency})`, `percent_5_${productId}`),
    Markup.button.callback(`🟠 10% (${price10}${currency})`, `percent_10_${productId}`)
  ]);
  
  // Fila 2: 15% y 20% con emojis únicos
  const price15 = currentPrice ? (currentPrice * 0.85).toFixed(2) : 'X';
  const price20 = currentPrice ? (currentPrice * 0.80).toFixed(2) : 'X';
  buttons.push([
    Markup.button.callback(`🔴 15% (${price15}${currency})`, `percent_15_${productId}`),
    Markup.button.callback(`🟣 20% (${price20}${currency})`, `percent_20_${productId}`)
  ]);
  
  // Fila 3: NUEVO - Cualquier bajada de precio
  buttons.push([
    Markup.button.callback('⚡ Cualquier bajada', `any_drop_${productId}`)
  ]);
  
  // Fila 4: Opciones adicionales
  buttons.push([
    Markup.button.callback('🎯 Establecer precio objetivo', `custom_price_${productId}`)
  ]);
  
  // Fila 5: Cuando haya stock
  buttons.push([
    Markup.button.callback('💚 Cuando haya Stock', `stock_alert_${productId}`)
  ]);
  
  return Markup.inlineKeyboard(buttons);
}

const steps = [
  async ctx => {
    const productId = ctx.wizard.state.productId;
    const product = await Product.findById(productId);
    
    if (!product) {
      await ctx.editMessageText('❌ Producto no encontrado.');
      return await ctx.scene.leave();
    }
    
    const currentPrice = product.price || 0;
    const currency = product.currency || '€';
    const currentTarget = product.preferences?.targetPrice;
    
    let message = `📦 **${product.name}**\n\n`;
    message += `💰 Precio actual: ${currentPrice.toFixed(2)}${currency}\n`;
    
    if (currentTarget && currentTarget > 0) {
      message += `🎯 Precio objetivo actual: ${currentTarget}${currency}\n`;
    } else {
      message += `🎯 Precio objetivo: No establecido\n`;
    }
    
    message += `\n🔔 **¿Bajada esperada?**\n`;
    message += `Elige el tipo de alerta que prefieres:`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      ...createPercentageKeyboard(productId, currentPrice, currency)
    });
    
    ctx.wizard.next();
  },
  
  async ctx => {
    // Manejo de precio personalizado
    const productId = ctx.wizard.state.productId;
    const targetPrice = parseFloat(ctx.update.message.text);
    
    if (isNaN(targetPrice) || targetPrice < 0) {
      await ctx.reply('❌ Por favor introduce un precio válido (número mayor o igual a 0)');
      return;
    }
    
    const product = await Product.findById(productId);
    
    if (!product) {
      await ctx.reply('❌ Producto no encontrado.');
      return await ctx.scene.leave();
    }
    
    await Product.findByIdAndUpdate(productId, { 
      'preferences.targetPrice': targetPrice === 0 ? null : targetPrice,
      'preferences.alertType': 'custom'
    });
    
    const currency = product.currency || '€';
    
    if (targetPrice === 0) {
      await ctx.reply(`✅ **Precio objetivo eliminado**\n\n📦 ${product.name}\n\nYa no recibirás alertas de precio objetivo.`);
    } else {
      const discountPercent = product.price ? 
        (((product.price - targetPrice) / product.price) * 100).toFixed(1) : 0;
      
      await ctx.reply(
        `✅ **Precio objetivo configurado**\n\n` +
        `📦 ${product.name}\n` +
        `🎯 Precio objetivo: ${targetPrice.toFixed(2)}${currency}\n` +
        `📉 Descuento: ${discountPercent}%\n\n` +
        `Recibirás una alerta cuando el precio sea igual o menor a ${targetPrice.toFixed(2)}${currency}.`
      );
    }
    
    await ctx.scene.leave();
  }
];

const scene = new Scenes.WizardScene('set-target-price', ...steps);

// BOTONES DE PORCENTAJE con emojis únicos
scene.action(/^percent_(\d+)_(\w+)$/, async (ctx) => {
  const percentage = parseInt(ctx.match[1]);
  const productId = ctx.match[2];
  
  const product = await Product.findById(productId);
  
  if (!product || !product.price) {
    await ctx.answerCbQuery('❌ No hay precio actual disponible');
    return;
  }
  
  const targetPrice = product.price * (1 - percentage / 100);
  
  await Product.findByIdAndUpdate(productId, { 
    'preferences.targetPrice': targetPrice,
    'preferences.alertType': 'percentage',
    'preferences.discountPercent': percentage
  });
  
  const currency = product.currency || '€';
  
  // Emojis únicos para cada porcentaje
  const emojiMap = {
    5: '🔵',
    10: '🟠', 
    15: '🔴',
    20: '🟣'
  };
  
  await ctx.answerCbQuery(`✅ Alerta configurada: ${percentage}% de descuento`);
  
  await ctx.editMessageText(
    `✅ **Alerta de descuento configurada**\n\n` +
    `📦 ${product.name}\n` +
    `${emojiMap[percentage]} Descuento mínimo: **${percentage}%**\n` +
    `🎯 Precio objetivo: **${targetPrice.toFixed(2)}${currency}**\n` +
    `💰 Precio actual: ${product.price.toFixed(2)}${currency}\n\n` +
    `Recibirás una alerta cuando el precio baje un ${percentage}% o más.`,
    { parse_mode: 'Markdown' }
  );
  
  await ctx.scene.leave();
});

// NUEVO: Botón para cualquier bajada de precio
scene.action(/^any_drop_(\w+)$/, async (ctx) => {
  const productId = ctx.match[1];
  
  const product = await Product.findByIdAndUpdate(productId, { 
    'preferences.targetPrice': null,
    'preferences.alertType': 'any_drop',
    'preferences.discountPercent': 0
  });
  
  await ctx.answerCbQuery('⚡ Alerta de cualquier bajada activada');
  
  await ctx.editMessageText(
    `⚡ **Alerta de cualquier bajada activada**\n\n` +
    `📦 ${product.name}\n` +
    `🔔 Tipo de alerta: **Cualquier bajada de precio**\n` +
    `💰 Precio actual: ${product.price ? product.price.toFixed(2) : '0.00'}€\n\n` +
    `Recibirás una alerta cada vez que el precio baje, sin importar el porcentaje.`,
    { parse_mode: 'Markdown' }
  );
  
  await ctx.scene.leave();
});

// NUEVO: Botón para alertas de stock
scene.action(/^stock_alert_(\w+)$/, async (ctx) => {
  const productId = ctx.match[1];
  
  const product = await Product.findByIdAndUpdate(productId, { 
    'preferences.stockAlerts': true,
    'preferences.alertType': 'stock'
  });
  
  await ctx.answerCbQuery('💚 Alerta de stock activada');
  
  await ctx.editMessageText(
    `💚 **Alerta de stock activada**\n\n` +
    `📦 ${product.name}\n` +
    `📦 Tipo de alerta: **Cuando haya stock**\n` +
    `📊 Estado actual: ${product.availability || 'Desconocido'}\n\n` +
    `Recibirás una alerta cuando el producto esté disponible en stock.`,
    { parse_mode: 'Markdown' }
  );
  
  await ctx.scene.leave();
});

// PRECIO PERSONALIZADO
scene.action(/^custom_price_(\w+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    `🎯 **Establecer precio objetivo**\n\n` +
    `Introduce tu precio objetivo personalizado:\n\n` +
    `Ejemplo: 25.99\n` +
    `Introduce 0 para eliminar el precio objetivo.`
  );
});

module.exports = scene;

// =============================================================================
// lib/models/product.js - MODELO ACTUALIZADO para nuevos tipos de alerta
// =============================================================================
// Agregar estos campos al esquema existente:

/*
preferences: {
  targetPrice: Number,
  alertType: {
    type: String,
    enum: ['percentage', 'custom', 'any_drop', 'stock'],
    default: 'percentage'
  },
  discountPercent: {
    type: Number,
    default: 0
  },
  stockAlerts: {
    type: Boolean,
    default: false
  }
}
*/

// =============================================================================
// RESULTADO VISUAL EN TELEGRAM
// =============================================================================
/*
📦 Roborock QV 355 Set Robot Aspirador
💰 Precio actual: 1699.00€
🎯 Precio objetivo: No establecido

🔔 ¿Bajada esperada?
Elige el tipo de alerta que prefieres:

[🔵 5% (1614.05€)]  [🟠 10% (1529.10€)]
[🔴 15% (1444.15€)]  [🟣 20% (1359.20€)]
[⚡ Cualquier bajada]
[🎯 Establecer precio objetivo]
[💚 Cuando haya Stock]

VENTAJAS:
✅ Emojis únicos y visualmente atractivos
✅ Opción de "cualquier bajada" muy útil
✅ Alerta de stock para productos agotados
✅ Interfaz más profesional
✅ Mayor engagement de usuarios
*/
