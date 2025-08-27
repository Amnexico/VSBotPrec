'use strict';
const { Product } = require('../../models');
const { Markup } = require('telegraf');

// Máximo 6 productos por página
const PRODUCTS_PER_PAGE = 6;

function escapeMarkdown(text) {
  if (!text) return 'Producto sin nombre';
  return text.toString()
    .replace(/\*/g, '\\*')
    .replace(/_/g, '\\_')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/~/g, '\\~')
    .replace(/`/g, '\\`')
    .replace(/>/g, '\\>')
    .replace(/#/g, '\\#')
    .replace(/\+/g, '\\+')
    .replace(/-/g, '\\-')
    .replace(/=/g, '\\=')
    .replace(/\|/g, '\\|')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\./g, '\\.')
    .replace(/\!/g, '\\!');
}

module.exports = async ctx => {
  try {
    const user = ctx.update.message.from.id;
    const page = 1; // Primera página
    
    // Contar productos totales
    const totalProducts = await Product.countDocuments({ user: user });
    
    if (totalProducts === 0) {
      return ctx.reply('Tu lista de productos está vacía. Usa /alerta para agregar productos.');
    }
    
    // Calcular paginación
    const totalPages = Math.ceil(totalProducts / PRODUCTS_PER_PAGE);
    const skip = (page - 1) * PRODUCTS_PER_PAGE;
    
    // Obtener solo los productos de la página actual
    const products = await Product.find({ user: user })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(PRODUCTS_PER_PAGE)
      .select('name price currency preferences createdAt');
    
    // Crear mensaje
    let message = `📋 **MIS PRODUCTOS**\\n`;
    message += `Total: ${totalProducts} | Página: ${page}/${totalPages}\\n\\n`;
    
    // Lista de productos
    products.forEach((product, index) => {
      const num = skip + index + 1;
      const name = product.name ? 
        (product.name.length > 35 ? product.name.substring(0, 32) + '...' : product.name) :
        'Sin nombre';
      const price = product.price || 0;
      const currency = product.currency || '€';
      
      message += `**${num}.** ${escapeMarkdown(name)}\\n`;
      message += `💰 ${price}${currency}\\n\\n`;
    });
    
    // Crear teclado
    const buttons = [];
    
    // Botones de productos
    products.forEach(product => {
      const displayName = product.name ? 
        (product.name.length > 20 ? product.name.substring(0, 17) + '...' : product.name) :
        'Sin nombre';
      
      buttons.push([Markup.button.callback(
        `📦 ${displayName}`,
        `!menu=${product._id}`
      )]);
    });
    
    // Navegación
    if (totalPages > 1) {
      const navRow = [];
      if (page > 1) {
        navRow.push(Markup.button.callback('⬅️ Anterior', `!list_page=${page - 1}`));
      }
      navRow.push(Markup.button.callback(`${page}/${totalPages}`, 'noop'));
      if (page < totalPages) {
        navRow.push(Markup.button.callback('Siguiente ➡️', `!list_page=${page + 1}`));
      }
      buttons.push(navRow);
    }
    
    // Botón de menú
    buttons.push([Markup.button.callback('🔙 Volver al menú', 'menu_main')]);
    
    // Enviar respuesta
    await ctx.replyWithMarkdown(message, Markup.inlineKeyboard(buttons));
    
  } catch (error) {
    console.error('Error en comando /lista:', error);
    ctx.reply('❌ Error al cargar la lista de productos. Inténtalo de nuevo.');
  }
};
