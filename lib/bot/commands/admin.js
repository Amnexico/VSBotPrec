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

*Gestión de productos:*
/borrarproducto ASIN - Eliminar producto y su historial (requiere confirmación)
/borrarproducto ASIN TOTAL CONFIRMAR - Eliminar todo del ASIN
/borrarproducto ASIN DD/MM/YYYY CONFIRMAR - Eliminar solo datos de fecha específica
/corregirasins - Corregir ASINs faltantes en productos

*Importación:*
/importarhistorial - Instrucciones para importar CSV
Enviar archivo CSV con formato: ASIN,fecha(YYYY-MM-DD),precio

*Ejemplos de uso:*
/agregarprecio B0D9YHVZKS 299.99 "Cupón de 30€"
/agregarhistorial B0D9YHVZKS 15/08/2024 320.00 "Precio mínimo anterior"
/borrarproducto B0D9YHVZKS - Muestra confirmación
/borrarproducto B0D9YHVZKS TOTAL CONFIRMAR - Elimina todo
/borrarproducto B0D9YHVZKS 15/08/2025 CONFIRMAR - Elimina solo del 15/08/2025

*Seguridad:*
- Los comandos de eliminación requieren confirmación explícita
- No se pueden deshacer las eliminaciones
- Solo funciona con tu ID de administrador`;

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
      currency: '€',
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
              productId: product._id,
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
      currency: '€',
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
  if (ctx.from.id !== ADMIN_USER_ID) {
    return ctx.reply('Comando no autorizado');
  }
  
  const args = ctx.message.text.split(' ');
  if (args.length < 2) {
    return ctx.reply('Uso: /borrarproducto ASIN [TOTAL|DD/MM/YYYY] [CONFIRMAR]\nEjemplos:\n/borrarproducto B0D9YHVZKS\n/borrarproducto B0D9YHVZKS TOTAL CONFIRMAR\n/borrarproducto B0D9YHVZKS 15/08/2025 CONFIRMAR');
  }
  
  const asin = args[1].toUpperCase();
  const tipoOperacion = args[2] ? args[2].toUpperCase() : null;
  const confirmacion = args[3] ? args[3].toUpperCase() : null;
  
  // Verificar si es confirmación
  const esConfirmacion = (args.length === 3 && tipoOperacion === 'CONFIRMAR') || 
                        (args.length === 4 && confirmacion === 'CONFIRMAR');
  
  if (esConfirmacion) {
    // EJECUTAR ELIMINACIÓN
    try {
      const products = await Product.find({ asin: asin });
      
      if (products.length === 0) {
        return ctx.reply(`No se encontraron productos con ASIN: ${asin}`);
      }
      
      let deletedHistory;
      let operacionTexto;
      
      if (tipoOperacion === 'TOTAL' || args.length === 3) {
        // Eliminar todo
        await Product.deleteMany({ asin: asin });
        deletedHistory = await PriceHistory.deleteMany({ asin: asin });
        operacionTexto = 'TOTAL';
      } else {
        // Eliminar por fecha específica
        const fechaStr = tipoOperacion;
        const [day, month, year] = fechaStr.split('/');
        const fechaInicio = new Date(year, month - 1, day, 0, 0, 0);
        const fechaFin = new Date(year, month - 1, day, 23, 59, 59);
        
        deletedHistory = await PriceHistory.deleteMany({ 
          asin: asin,
          timestamp: { $gte: fechaInicio, $lte: fechaFin }
        });
        operacionTexto = `del ${fechaStr}`;
      }
      
      const deletedProducts = tipoOperacion === 'TOTAL' || args.length === 3 ? products.length : 0;
      
      ctx.reply(`Eliminación ${operacionTexto} completada:
ASIN: ${asin}
${deletedProducts > 0 ? `Productos eliminados: ${deletedProducts}` : ''}
Registros de historial eliminados: ${deletedHistory.deletedCount}
${deletedProducts > 0 ? `Usuarios afectados: ${[...new Set(products.map(p => p.user))].join(', ')}` : ''}`);
      
    } catch (error) {
      ctx.reply(`Error: ${error.message}`);
    }
  } else {
    // MOSTRAR CONFIRMACIÓN
    try {
      const products = await Product.find({ asin: asin });
      
      if (products.length === 0) {
        return ctx.reply(`No se encontraron productos con ASIN: ${asin}`);
      }
      
      let historyCount;
      let operacionTexto;
      let comandoConfirmacion;
      
      if (tipoOperacion === 'TOTAL' || !tipoOperacion) {
        historyCount = await PriceHistory.countDocuments({ asin: asin });
        operacionTexto = 'TODO (productos + historial completo)';
        comandoConfirmacion = `/borrarproducto ${asin} TOTAL CONFIRMAR`;
      } else {
        // Verificar formato de fecha
        const fechaRegex = /^\d{2}\/\d{2}\/\d{4}$/;
        if (!fechaRegex.test(tipoOperacion)) {
          return ctx.reply('Formato de fecha incorrecto. Usa DD/MM/YYYY');
        }
        
        const [day, month, year] = tipoOperacion.split('/');
        const fechaInicio = new Date(year, month - 1, day, 0, 0, 0);
        const fechaFin = new Date(year, month - 1, day, 23, 59, 59);
        
        historyCount = await PriceHistory.countDocuments({ 
          asin: asin,
          timestamp: { $gte: fechaInicio, $lte: fechaFin }
        });
        operacionTexto = `historial del ${tipoOperacion}`;
        comandoConfirmacion = `/borrarproducto ${asin} ${tipoOperacion} CONFIRMAR`;
      }
      
      ctx.reply(`⚠️ ADVERTENCIA: Vas a eliminar PERMANENTEMENTE:

ASIN: ${asin}
Operación: ${operacionTexto}
${tipoOperacion === 'TOTAL' || !tipoOperacion ? `Productos afectados: ${products.length}` : ''}
${tipoOperacion === 'TOTAL' || !tipoOperacion ? `Usuarios afectados: ${[...new Set(products.map(p => p.user))].join(', ')}` : ''}
Registros de historial: ${historyCount}

Para confirmar la eliminación, escribe exactamente:
${comandoConfirmacion}

Esta acción NO se puede deshacer.`);
      
    } catch (error) {
      ctx.reply(`Error: ${error.message}`);
    }
  }
};

// === COMANDOS DE ANALYTICS ===
const AnalyticsService = require('../../services/analytics-service');

const stats = async (ctx) => {
  if (ctx.from.id !== ADMIN_USER_ID) {
    return ctx.reply('Comando no autorizado');
  }

  await ctx.reply('📊 Generando dashboard de analytics...');
  
  try {
    const ctr = await AnalyticsService.getCTRReport();

    const dashboard = `🔥 *VS PrecioBot Analytics Dashboard*

📊 *CONVERSIÓN Y MONETIZACIÓN*
- CTR Global: ${ctr.ctr} (${ctr.totalClicks}/${ctr.totalAlerts})

Sistema funcionando correctamente.
Usa /listaproductos y /listausuarios para ver detalles.`;

    await ctx.replyWithMarkdown(dashboard);

  } catch (error) {
    console.error('Error generating dashboard:', error);
    await ctx.reply('❌ Error generando dashboard');
  }
};

const listaproductos = async (ctx) => {
  if (ctx.from.id !== ADMIN_USER_ID) {
    return ctx.reply('Comando no autorizado');
  }

  try {
    const { ProductStats } = require('../../models');
    const products = await ProductStats.find({})
      .sort({ totalTrackers: -1 })
      .limit(20);
    
    if (products.length === 0) {
      return ctx.reply('📭 No hay productos registrados');
    }

    let message = `📦 *LISTA COMPLETA DE PRODUCTOS* (${products.length})\n\n`;
    
    products.forEach((p, i) => {
      const ctr = p.totalAlerts > 0 ? ((p.totalClicks / p.totalAlerts) * 100).toFixed(1) : '0';
      message += `${i+1}. ${p.productName || 'Producto'}\n`;
      message += `   ASIN: \`${p.asin}\`\n`;
      message += `   👥 ${p.totalTrackers} usuarios | 🎯 CTR: ${ctr}%\n`;
      message += `   🔗 ${p.totalClicks} clicks | 🚨 ${p.totalAlerts} alertas\n\n`;
    });

    await ctx.replyWithMarkdown(message);

  } catch (error) {
    console.error('Error getting products list:', error);
    await ctx.reply('❌ Error obteniendo lista de productos');
  }
};

const listausuarios = async (ctx) => {
  if (ctx.from.id !== ADMIN_USER_ID) {
    return ctx.reply('Comando no autorizado');
  }

  try {
    const { UserStats, Product } = require('../../models');
    const users = await UserStats.find({})
      .sort({ totalProducts: -1 })
      .limit(15);
    
    if (users.length === 0) {
      return ctx.reply('👥 No hay usuarios registrados');
    }

    let message = `👥 *LISTA COMPLETA DE USUARIOS* (${users.length})\n\n`;
    
    for (const u of users) {
      const products = await Product.find({ user: u.userId }).limit(5);
      
      message += `${u.firstName || ''} ${u.lastName || ''} (@${u.username || 'sin_username'})\n`;
      message += `   ID: \`${u.userId}\` | Tipo: ${u.userType}\n`;
      message += `   📦 ${u.totalProducts} productos | 🔗 ${u.affiliateClicks} clicks\n`;
      
      if (products.length > 0) {
        const productNames = products.map(p => p.name.substring(0, 20) + '...').join(', ');
        message += `   Siguiendo: ${productNames}\n`;
      }
      message += '\n';
    }

    await ctx.replyWithMarkdown(message);

  } catch (error) {
    console.error('Error getting users list:', error);
    await ctx.reply('❌ Error obteniendo lista de usuarios');
  }
};

const ayudaanalytics = async (ctx) => {
  if (ctx.from.id !== ADMIN_USER_ID) {
    return ctx.reply('Comando no autorizado');
  }

  const helpMessage = `📊 *COMANDOS DE ANALYTICS*

*Dashboard Principal:*
/stats - Dashboard completo de analytics

*Listas Completas:*
/listaproductos - Todos los productos con stats
/listausuarios - Todos los usuarios con sus productos

*Utilidades:*
/ayudaanalytics - Esta ayuda

Todos los comandos son exclusivos para admin (ID: 615957202)`;

  await ctx.replyWithMarkdown(helpMessage);
};

module.exports = {
  ayudaAdmin,
  agregarPrecio,
  agregarHistorial,
  forzarRevision,
  importarHistorial,
  corregirAsins,
  borrarProducto,
  stats,
  listaproductos,
  listausuarios,
  ayudaanalytics
};
