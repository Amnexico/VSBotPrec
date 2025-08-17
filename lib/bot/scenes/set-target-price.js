'use strict';
const { Scenes, Markup } = require('telegraf');
const { Product } = require('../../models');

// Función para crear teclado con opciones de porcentaje
function createPercentageKeyboard(productId, currentPrice, currency) {
  const buttons = [];
  
  // Fila 1: 5% y 10%
  const price5 = currentPrice ? (currentPrice * 0.95).toFixed(2) : 'X';
  const price10 = currentPrice ? (currentPrice * 0.90).toFixed(2) : 'X';
  buttons.push([
    Markup.button.callback(`📉 5% (${price5}${currency})`, `percent_5_${productId}`),
    Markup.button.callback(`📉 10% (${price10}${currency})`, `percent_10_${productId}`)
  ]);
  
  // Fila 2: 15% y 20%
  const price15 = currentPrice ? (currentPrice * 0.85).toFixed(2) : 'X';
  const price20 = currentPrice ? (currentPrice * 0.80).toFixed(2) : 'X';
  buttons.push([
    Markup.button.callback(`📉 15% (${price15}${currency})`, `percent_15_${productId}`),
    Markup.button.callback(`📉 20% (${price20}${currency})`, `percent_20_${productId}`)
  ]);
  
  // Fila 3: Precio personalizado
  buttons.push([
    Markup.button.callback('🎯 Precio personalizado', `custom_price_${productId}`)
  ]);
  
  // Fila 4: Eliminar precio objetivo
  buttons.push([
    Markup.button.callback('🗑️ Eliminar precio objetivo', `remove_price_${productId}`)
  ]);
  
  // Fila 5: Volver
  buttons.push([
    Markup.button.callback('⬅️ Volver al menú', `menu_${productId}`)
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
    
    let message = `🎯 **Configurar precio objetivo**\n\n`;
    message += `📦 Producto: ${product.name}\n`;
    message += `💰 Precio actual: ${currentPrice.toFixed(2)}${currency}\n`;
    
    if (currentTarget && currentTarget > 0) {
      message += `🎯 Precio objetivo actual: ${currentTarget}${currency}\n`;
    } else {
      message += `🎯 Precio objetivo: No establecido\n`;
    }
    
    message += `\n📊 **Opciones de descuento:**\n`;
    message += `Elige el descuento mínimo para recibir alertas:`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      ...createPercentageKeyboard(productId, currentPrice, currency)
    });
    
    ctx.wizard.next();
  },
  
  async ctx => {
    // Este paso maneja el input de texto para precio personalizado
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
    
    // Actualizar precio objetivo
    await Product.findByIdAndUpdate(productId, { 
      'preferences.targetPrice': targetPrice === 0 ? null : targetPrice 
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

// Manejar botones de porcentaje
scene.action(/^percent_(\d+)_(\w+)$/, async (ctx) => {
  const percentage = parseInt(ctx.match[1]);
  const productId = ctx.match[2];
  
  const product = await Product.findById(productId);
  
  if (!product) {
    await ctx.answerCbQuery('❌ Producto no encontrado');
    return;
  }
  
  if (!product.price) {
    await ctx.answerCbQuery('❌ No hay precio actual disponible');
    return;
  }
  
  // Calcular precio objetivo basado en porcentaje
  const targetPrice = product.price * (1 - percentage / 100);
  
  // Actualizar en base de datos
  await Product.findByIdAndUpdate(productId, { 
    'preferences.targetPrice': targetPrice 
  });
  
  const currency = product.currency || '€';
  
  await ctx.answerCbQuery(`✅ Alerta configurada: ${percentage}% de descuento`);
  
  await ctx.editMessageText(
    `✅ **Alerta de descuento configurada**\n\n` +
    `📦 ${product.name}\n` +
    `📉 Descuento mínimo: **${percentage}%**\n` +
    `🎯 Precio objetivo: **${targetPrice.toFixed(2)}${currency}**\n` +
    `💰 Precio actual: ${product.price.toFixed(2)}${currency}\n\n` +
    `Recibirás una alerta cuando el precio baje un ${percentage}% o más.`,
    { parse_mode: 'Markdown' }
  );
  
  await ctx.scene.leave();
});

// Manejar botón de precio personalizado
scene.action(/^custom_price_(\w+)$/, async (ctx) => {
  const productId = ctx.match[1];
  
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    `🎯 **Precio personalizado**\n\n` +
    `Introduce tu precio objetivo personalizado (en números):\n\n` +
    `Ejemplo: 25.99\n` +
    `Introduce 0 para eliminar el precio objetivo.`
  );
  
  // El wizard continuará al siguiente paso para manejar el input
});

// Manejar botón de eliminar precio
scene.action(/^remove_price_(\w+)$/, async (ctx) => {
  const productId = ctx.match[1];
  
  const product = await Product.findByIdAndUpdate(productId, { 
    'preferences.targetPrice': null 
  });
  
  await ctx.answerCbQuery('✅ Precio objetivo eliminado');
  
  await ctx.editMessageText(
    `✅ **Precio objetivo eliminado**\n\n` +
    `📦 ${product.name}\n\n` +
    `Ya no recibirás alertas de precio objetivo para este producto.`
  );
  
  await ctx.scene.leave();
});

// Manejar botón de volver
scene.action(/^menu_(\w+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.scene.leave();
  // Aquí podrías redirigir al menú principal del producto
  // Por ejemplo: ctx.scene.enter('product-menu', { productId: ctx.match[1] });
});

module.exports = scene;
