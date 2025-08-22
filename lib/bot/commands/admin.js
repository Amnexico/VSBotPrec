'use strict';
const { Product, PriceHistory } = require('../../models');

const ADMIN_USER_ID = 615957202; // Tu ID de Telegram

const ayudaAdmin = async (ctx) => {
  if (ctx.from.id !== ADMIN_USER_ID) {
    return ctx.reply('Comando no autorizado');
  }
  
  const helpMessage = `📋 *Comandos de Administrador*

*Gestión de precios:*
/agregarprecio ASIN precio "comentario" - Agrega precio actual con oferta
/agregarhistorial ASIN DD/MM/YYYY precio "comentario" - Agrega precio histórico
/forzarrevision ASIN - Fuerza verificación de un producto

*Ejemplos:*
/agregarprecio B0D9YHVZKS 299.99 "Cupón de 30€"
/agregarhistorial B0D9YHVZKS 15/08/2024 320.00 "Precio mínimo anterior"

*Importación:*
/importarhistorial - Instrucciones para importar CSV
Enviar archivo CSV con formato: ASIN,fecha(YYYY-MM-DD),precio`;

  ctx.reply(helpMessage, { parse_mode: 'Markdown' });
};

const corregirAsins = async (ctx) => {
  if (ctx.from.id !== ADMIN_USER_ID) {
    return ctx.reply('Comando no autorizado');
  }
  
  try {
    const products = await Product.find({ asin: { $exists: false } });
    let updated = 0;
    
    for (const product of products) {
      const asin = extractASIN(product.url);
      if (asin) {
        await Product.findByIdAndUpdate(product._id, { asin: asin });
        updated++;
      }
    }
    
    ctx.reply(`Corregidos ${updated} productos con ASIN faltante`);
    
  } catch (error) {
    ctx.reply(`Error: ${error.message}`);
  }
};

function extractASIN(url) {
  const patterns = [
    /\/dp\/([A-Z0-9]{10})/,
    /\/([A-Z0-9]{10})(?:[/?]|$)/,
    /\/gp\/product\/([A-Z0-9]{10})/,
    /asin=([A-Z0-9]{10})/
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

const agregarPrecio = async (ctx) => {
  if (ctx.from.id !== ADMIN_USER_ID) {
    return ctx.reply('Comando no autorizado');
  }
  
  const args = ctx.message.text.split(' ');
  if (args.length < 4) {
    return ctx.reply('Uso: /agregarprecio ASIN precio "comentario"');
  }
  
  try {
    const asin = args[1];
    const price = parseFloat(args[2]);
    const comment = args.slice(3).join(' ').replace(/"/g, '');
    
    await PriceHistory.create({
      asin,
      price,
      previousPrice: 0,
      timestamp: new Date(),
      currency: 'EUR',
      comment
    });
    
    const products = await Product.find({
      $or: [
        { asin: asin },
        { url: { $regex: asin } }
      ]
    });
    
    if (products.length > 0) {
      const priceTracker = require('../../price-tracker');
      for (const product of products) {
        const oldPrice = product.price;
        if (oldPrice !== price) {
          await Product.findByIdAndUpdate(product._id, {
            price: price,
            lastCheck: Math.floor(Date.now() / 1000)
          });
          
          if (priceTracker.shouldSendAlert(product, price, oldPrice))  {
            priceTracker.emit('update', {
              ...product.toObject(),
              asin: asin,
              oldPrice: oldPrice,
              newPrice: price,
              manualUpdate: true,
              comment: comment,
              changeType: price < oldPrice ? 'price_drop' : 'price_increase'
            });
          }
        }
      }
    }
    
    ctx.reply(`Precio agregado:
📦 ASIN: ${asin}
💰 Precio: ${price}€
📝 ${comment}
👥 Notificaciones enviadas a ${products.length} seguidor(es)`);
    
  } catch (error) {
    ctx.reply(`Error: ${error.message}`);
  }
};

const agregarHistorial = async (ctx) => {
  if (ctx.from.id !== ADMIN_USER_ID) {
    return ctx.reply('Comando no autorizado');
  }
  
  const args = ctx.message.text.split(' ');
  if (args.length < 5) {
    return ctx.reply('Uso: /agregarhistorial ASIN DD/MM/YYYY precio "comentario"');
  }
  
  try {
    const asin = args[1];
    const dateStr = args[2];
    const price = parseFloat(args[3]);
    const comment = args.slice(4).join(' ').replace(/"/g, '');
    
    const [day, month, year] = dateStr.split('/');
    const timestamp = new Date(year, month - 1, day, 12, 0, 0);
    
    await PriceHistory.create({
      asin,
      price,
      previousPrice: 0,
      timestamp,
      currency: 'EUR',
      comment
    });
    
    ctx.reply(`Precio histórico agregado:
📦 ASIN: ${asin}
📅 Fecha: ${timestamp.toLocaleDateString('es-ES')}
💰 Precio: ${price}€
📝 ${comment}`);
    
  } catch (error) {
    ctx.reply(`Error: ${error.message}`);
  }
};

const forzarRevision = async (ctx) => {
  if (ctx.from.id !== ADMIN_USER_ID) {
    return ctx.reply('Comando no autorizado');
  }
  
  const args = ctx.message.text.split(' ');
  if (args.length < 2) {
    return ctx.reply('Uso: /forzarrevision ASIN');
  }
  
  try {
    const asin = args[1];
    const products = await Product.find({
      $or: [
        { asin: asin },
        { url: { $regex: asin } }
      ]
    });
    
    if (products.length === 0) {
      return ctx.reply(`No se encontraron productos con ASIN ${asin}`);
    }
    
    const priceTracker = require('../../price-tracker');
    
    for (const product of products) {
      await priceTracker.checkProduct(product);
    }
    
    ctx.reply(`Verificación forzada completada para ${products.length} producto(s) con ASIN ${asin}`);
    
  } catch (error) {
    ctx.reply(`Error: ${error.message}`);
  }
};

const importarHistorial = async (ctx) => {
  if (ctx.from.id !== ADMIN_USER_ID) {
    return ctx.reply('Comando no autorizado');
  }
  
  ctx.reply('📎 Envía un archivo CSV con formato: ASIN,fecha(YYYY-MM-DD),precio\n\nEjemplo:\nB0D9YHVZKS,2024-01-15,299.99\nB0DBL9C6JY,2024-01-15,1199.00');
};

const borrarProducto = async (ctx) => {
  if (ctx.from.id !== 615957202) {
    return ctx.reply('Comando no autorizado');
  }
  
  const args = ctx.message.text.split(' ');
  if (args.length < 2) {
    return ctx.reply('Uso: /borrarproducto ASIN\nEjemplo: /borrarproducto B0D9YHVZKS');
  }
  
  try {
    const asin = args[1].toUpperCase();
    
    // Buscar productos con ese ASIN
    const products = await Product.find({ asin: asin });
    
    if (products.length === 0) {
      return ctx.reply(`No se encontraron productos con ASIN: ${asin}`);
    }
    
    // Eliminar todos los productos con ese ASIN
    const deletedProducts = await Product.deleteMany({ asin: asin });
    
    // Eliminar historial de precios del ASIN
    const deletedHistory = await PriceHistory.deleteMany({ asin: asin });
    
    ctx.reply(`Producto eliminado completamente:
ASIN: ${asin}
Productos eliminados: ${deletedProducts.deletedCount}
Registros de historial eliminados: ${deletedHistory.deletedCount}
Usuarios afectados: ${products.map(p => p.user).join(', ')}`);
    
  } catch (error) {
    ctx.reply(`Error: ${error.message}`);
  }
};

module.exports = {
  ayudaAdmin,
  agregarPrecio,
  agregarHistorial,
  forzarRevision,
  importarHistorial,
  corregirAsins,
  borrarProducto
};
