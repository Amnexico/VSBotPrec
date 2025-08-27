'use strict';
const { Product } = require('../../models');
const { Markup } = require('telegraf');

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
    const page = 1;
    
    const totalProducts = await Product.countDocuments({ user: user });
    
    if (totalProducts === 0) {
      return ctx.reply('Tu lista de productos está vacía. Usa /alerta para agregar productos.');
    }
    
    const totalPages = Math.ceil(totalProducts / PRODUCTS_PER_PAGE);
    const skip = (page - 1) * PRODUCTS_PER_PAGE;
    
    const products = await Product.find({ user: user })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(PRODUCTS_PER_PAGE)
      .select('name price currency preferences createdAt');
    
    // CORREGIR EL FORMATO - usar \n reales en lugar de \\n
    let message = `📋 **MIS PRODUCTOS** (${totalProducts} total)\n`;
    message += `📄 Página ${page}/${totalPages}\n\n`;
    message += `Selecciona un producto:`;
    
    // Crear teclado
    const buttons = [];
    
    // BOTONES SOLO CON NOMBRES MÁS LARGOS - sin precios
    products.forEach(product => {
      // NOMBRE MÁS LARGO - hasta 50 caracteres
      const displayName = product.name ? 
        (product.name.length > 50 ? product.name.substring(0, 47) + '...' : product.name) :
        'Producto sin nombre';
      
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
    
    buttons.push([Markup.button.callback('🔙 Volver al menú', 'menu_main')]);
    
    await ctx.replyWithMarkdown(message, Markup.inlineKeyboard(buttons));
    
  } catch (error) {
    console.error('Error en comando /lista:', error);
    ctx.reply('❌ Error al cargar la lista de productos. Inténtalo de nuevo.');
  }
};
