'use strict';
const { Product } = require('../../models');
const keyboards = require('../keyboards');

module.exports = async ctx => {
  console.log('=== DEBUG MENU ACTION ===');
  console.log('ctx.match:', ctx.match);
  console.log('productId recibido:', ctx.match[1]);
  
  const productId = ctx.match[1];
  
  try {
    const product = await Product.findById(productId);
    console.log('Producto encontrado:', product ? 'SÍ' : 'NO');
    
    if (!product) {
      console.log('Producto no encontrado en BD');
      await ctx.answerCbQuery();
      return ctx.editMessageText('Producto no encontrado');
    }
    
    console.log('Producto name:', product.name);
    await ctx.answerCbQuery();
    
    // Verificar si el mensaje actual es una alerta
    const currentMessage = ctx.callbackQuery.message.text;
    const isAlert = currentMessage.includes('BAJADA DE PRECIO') || 
                   currentMessage.includes('SUBIDA DE PRECIO') || 
                   currentMessage.includes('Estado actualizado');
    
    if (isAlert) {
      // Es una alerta - crear nuevo mensaje para preservar la alerta
      await ctx.reply(product.name, keyboards.menu(product));
    } else {
      // Es navegación normal - editar mensaje
      await ctx.editMessageText(product.name, keyboards.menu(product));
    }
    
  } catch (error) {
    console.error('Error en menu action:', error.message);
    console.error('Stack:', error.stack);
    await ctx.answerCbQuery();
    await ctx.editMessageText('Error al cargar el producto');
  }
  
  console.log('========================');
};

