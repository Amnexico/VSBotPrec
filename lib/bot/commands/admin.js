'use strict';
const { Product, PriceHistory } = require('../../models');

const ADMIN_USER_ID = 615957202; // Tu ID de Telegram

// Configuración de límites para comandos de listado
const LIMITS = {
  USERS_PER_PAGE: 8,        // Usuarios por página
  PRODUCTS_PER_PAGE: 10,    // Productos por página
  MAX_MESSAGE_LENGTH: 3800, // Límite seguro para mensajes
  MAX_PRODUCT_NAME: 25      // Caracteres máx del nombre del producto
};

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
    const { Product, UserStats } = require('../../models');
    
    // Contar productos y usuarios totales
    const [totalProducts, totalUsers, basicStats] = await Promise.all([
      Product.countDocuments({}),
      UserStats.countDocuments({}),
      AnalyticsService.getBasicStats()
    ]);

    const dashboard = `🔥 *VS PrecioBot Analytics Dashboard*

📊 *ESTADÍSTICAS GENERALES*
• Total productos trackeados: ${totalProducts}
• Total usuarios registrados: ${totalUsers}

📈 *ESTADÍSTICAS BÁSICAS*
• Total alertas enviadas: ${basicStats.totalAlerts}

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

  // Extraer página del comando: /listaproductos 2
  const args = ctx.message.text.split(' ');
  const page = parseInt(args[1]) || 1;
  const skip = (page - 1) * LIMITS.PRODUCTS_PER_PAGE;

  try {
    const { ProductStats } = require('../../models');
    
    // Contar total de productos
    const totalProducts = await ProductStats.countDocuments({});
    const totalPages = Math.ceil(totalProducts / LIMITS.PRODUCTS_PER_PAGE);
    
    if (totalProducts === 0) {
      return ctx.reply('📭 No hay productos registrados');
    }
    
    if (page > totalPages) {
      return ctx.reply(`📄 Página ${page} no existe. Total de páginas: ${totalPages}\nUsa: /listaproductos [página]`);
    }

    const products = await ProductStats.find({})
      .sort({ totalTrackers: -1, totalAlerts: -1 })
      .skip(skip)
      .limit(LIMITS.PRODUCTS_PER_PAGE);

    let message = `📦 **PRODUCTOS** (${totalProducts} total)\n`;
    message += `📄 Página ${page}/${totalPages} | Mostrando ${products.length} productos\n\n`;
    
    let currentLength = message.length;
    let productNumber = skip + 1;
    
    for (const p of products) {
      const originalName = p.productName || 'Producto sin nombre';
      const escapedName = escapeMarkdown(originalName);
      
      // Mostrar nombre completo si es corto, sino truncar elegantemente
      let displayName;
      if (originalName.length <= 35) {
        displayName = escapedName;
      } else {
        displayName = escapeMarkdown(originalName.substring(0, 32)) + '...';
      }
      
      let productBlock = `**${productNumber}.** ${displayName}\n`;
      productBlock += `📋 ASIN: \`${p.asin}\`\n`;
      productBlock += `👥 **${p.totalTrackers}** usuarios | 🚨 **${p.totalAlerts}** alertas`;
      
      // Mostrar métricas adicionales para productos populares
      if (p.totalTrackers >= 3) {
        productBlock += ` | 🔥 *Popular*`;
        if (p.isViral) productBlock += ` ⚡ *Viral*`;
      }
      
      productBlock += '\n\n';
      
      // Verificar límite de mensaje
      if (currentLength + productBlock.length > LIMITS.MAX_MESSAGE_LENGTH) {
        message += '\n_... mensaje truncado - usa páginas específicas_\n';
        break;
      }
      
      message += productBlock;
      currentLength += productBlock.length;
      productNumber++;
    }

    // Añadir instrucciones de navegación
    if (totalPages > 1) {
      message += `\n📖 **NAVEGACIÓN:**\n`;
      if (page > 1) message += `⬅️ \`/listaproductos ${page - 1}\` `;
      if (page < totalPages) message += `\`/listaproductos ${page + 1}\` ➡️`;
      message += `\n\n💡 Usa \`/listaproductos [página]\` para navegar`;
    }

    await ctx.replyWithMarkdown(message);

  } catch (error) {
    console.error('Error getting products list:', error);
    await ctx.reply(`❌ Error obteniendo lista de productos: ${error.message}`);
  }
};

const listausuarios = async (ctx) => {
  if (ctx.from.id !== ADMIN_USER_ID) {
    return ctx.reply('Comando no autorizado');
  }

  // Extraer página del comando: /listausuarios 2
  const args = ctx.message.text.split(' ');
  const page = parseInt(args[1]) || 1;
  const skip = (page - 1) * LIMITS.USERS_PER_PAGE;

  try {
    const { UserStats, Product } = require('../../models');
    
    // Contar total de usuarios
    const totalUsers = await UserStats.countDocuments({});
    const totalPages = Math.ceil(totalUsers / LIMITS.USERS_PER_PAGE);
    
    if (totalUsers === 0) {
      return ctx.reply('👥 No hay usuarios registrados');
    }
    
    if (page > totalPages) {
      return ctx.reply(`📄 Página ${page} no existe. Total de páginas: ${totalPages}\nUsa: /listausuarios [página]`);
    }

    const users = await UserStats.find({})
      .sort({ totalProducts: -1, lastActivity: -1 })
      .skip(skip)
      .limit(LIMITS.USERS_PER_PAGE);

    let message = `👥 **USUARIOS** (${totalUsers} total)\n`;
    message += `📄 Página ${page}/${totalPages} | Mostrando ${users.length} usuarios\n\n`;
    
    let currentLength = message.length;
    
    for (const u of users) {
      const products = await Product.find({ user: u.userId })
        .select('name')
        .limit(3); // Solo 3 productos por usuario para ahorrar espacio
      
      // Escapar caracteres especiales para Markdown
      const escapedFirstName = escapeMarkdown(u.firstName || '');
      const escapedLastName = escapeMarkdown(u.lastName || '');
      const escapedUsername = escapeMarkdown(u.username || 'sin_username');
      
      const fullName = `${escapedFirstName} ${escapedLastName}`.trim() || 'Sin nombre';
      
      let userBlock = `👤 **${fullName}** (@${escapedUsername})\n`;
      userBlock += `🆔 ID: \`${u.userId}\` | 🏷️ Tipo: **${u.userType}**\n`;
      userBlock += `📦 **${u.totalProducts}** productos | 🚨 **${u.alertsReceived}** alertas\n`;
      
      if (products.length > 0) {
        const productNames = products
          .map(p => {
            const name = p.name;
            if (name.length <= 25) {
              return escapeMarkdown(name);
            } else {
              return escapeMarkdown(name.substring(0, 22)) + '...';
            }
          })
          .join(', ');
        userBlock += `📋 Siguiendo: ${productNames}\n`;
      } else {
        userBlock += `📋 No tiene productos\n`;
      }
      
      userBlock += `\n`;
      
      // Verificar si añadir este bloque excede el límite
      if (currentLength + userBlock.length > LIMITS.MAX_MESSAGE_LENGTH) {
        message += '\n_... mensaje truncado - usa páginas específicas_\n';
        break;
      }
      
      message += userBlock;
      currentLength += userBlock.length;
    }

    // Añadir instrucciones de navegación
    if (totalPages > 1) {
      message += `\n📖 **NAVEGACIÓN:**\n`;
      if (page > 1) message += `⬅️ \`/listausuarios ${page - 1}\` `;
      if (page < totalPages) message += `\`/listausuarios ${page + 1}\` ➡️`;
      message += `\n\n💡 Usa \`/listausuarios [página]\` para navegar`;
    }

    await ctx.replyWithMarkdown(message);

  } catch (error) {
    console.error('Error getting users list:', error);
    await ctx.reply(`❌ Error obteniendo lista de usuarios: ${error.message}`);
  }
};

const diagnosticoasin = async (ctx) => {
  if (ctx.from.id !== ADMIN_USER_ID) {
    return ctx.reply('Comando no autorizado');
  }
  
  const args = ctx.message.text.split(' ');
  if (args.length < 2) {
    return ctx.reply('Uso: /diagnosticoasin ASIN');
  }
  
  const asin = args[1].toUpperCase();
  
  try {
    const { Product, PriceHistory, ProductStats } = require('../../models');
    
    // 1. Buscar productos activos
    const products = await Product.find({ asin: asin });
    
    // 2. Buscar historial de precios
    const history = await PriceHistory.find({ asin: asin }).sort({ timestamp: -1 }).limit(10);
    
    // 3. Buscar ProductStats
    const stats = await ProductStats.findOne({ asin: asin });
    
    let message = `🔍 **DIAGNÓSTICO COMPLETO: ${asin}**\n\n`;
    
    // Productos activos
    message += `📦 **PRODUCTOS ACTIVOS:** ${products.length}\n`;
    for (const product of products) {
      message += `  • Usuario: ${product.user}\n`;
      message += `  • Precio actual: ${product.price}€\n`;
      message += `  • Última verificación: ${new Date(product.lastCheck * 1000).toLocaleString('es-ES')}\n`;
      message += `  • Tipo de alerta: ${product.preferences?.alertType || 'no configurado'}\n`;
      message += `  • Precio objetivo: ${product.preferences?.targetPrice || 'no configurado'}€\n`;
      message += `  • Descuento %: ${product.preferences?.discountPercent || 0}%\n\n`;
    }
    
    // Historial de precios
    message += `📊 **HISTORIAL DE PRECIOS:** ${history.length} registros\n`;
    for (const record of history) {
      message += `  • ${record.timestamp.toLocaleString('es-ES')}: ${record.price}€`;
      if (record.comment) message += ` (${record.comment})`;
      message += '\n';
    }
    
    if (history.length === 0) {
      message += `  ❌ **NO HAY HISTORIAL** - Esta es la causa del problema\n`;
    }
    
    message += '\n';
    
    // ProductStats
    if (stats) {
      message += `📈 **PRODUCT STATS:**\n`;
      message += `  • Total usuarios: ${stats.totalTrackers}\n`;
      message += `  • Alertas enviadas: ${stats.totalAlerts}\n`;
      message += `  • Llamadas API: ${stats.apiCalls}\n`;
      message += `  • Errores API: ${stats.apiErrors}\n\n`;
    } else {
      message += `📈 **PRODUCT STATS:** No encontradas\n\n`;
    }
    
    // Análisis del problema
    message += `🔬 **ANÁLISIS:**\n`;
    if (products.length === 0) {
      message += `❌ No hay productos activos para este ASIN\n`;
    } else if (history.length === 0) {
      message += `❌ PROBLEMA IDENTIFICADO: No hay historial de precios\n`;
      message += `💡 SOLUCIÓN: El producto se añadió pero no se guardó precio inicial\n`;
    } else if (history.length === 1) {
      message += `⚠️ Solo hay 1 registro de precio - no puede comparar\n`;
      message += `💡 Necesita al menos 2 registros para detectar cambios\n`;
    } else {
      message += `✅ Historial correcto - revisar lógica de alertas\n`;
    }
    
    await ctx.replyWithMarkdown(message);
    
  } catch (error) {
    ctx.reply(`❌ Error en diagnóstico: ${error.message}`);
  }
};

const forzarguardado = async (ctx) => {
  if (ctx.from.id !== ADMIN_USER_ID) {
    return ctx.reply('Comando no autorizado');
  }
  
  const args = ctx.message.text.split(' ');
  if (args.length < 3) {
    return ctx.reply('Uso: /forzarguardado ASIN PRECIO\nEjemplo: /forzarguardado B0DCVYS9FQ 449.00');
  }
  
  const asin = args[1].toUpperCase();
  const precio = parseFloat(args[2]);
  
  if (isNaN(precio)) {
    return ctx.reply('❌ Precio inválido');
  }
  
  try {
    const { PriceHistory } = require('../../models');
    
    // Crear registro en PriceHistory con timestamp de ayer
    const ayer = new Date();
    ayer.setDate(ayer.getDate() - 1);
    ayer.setHours(12, 0, 0, 0); // Mediodía de ayer
    
    await PriceHistory.create({
      asin: asin,
      price: precio,
      previousPrice: 0,
      timestamp: ayer,
      currency: '€',
      comment: 'Precio forzado manualmente para recuperar historial'
    });
    
    ctx.reply(`✅ Precio guardado manualmente:
📦 ASIN: ${asin}
💰 Precio: ${precio}€
📅 Fecha: ${ayer.toLocaleString('es-ES')}
📝 Comentario: Recuperación de historial

Ahora ejecuta: /forzarrevision ${asin}`);
    
  } catch (error) {
    ctx.reply(`❌ Error guardando precio: ${error.message}`);
  }
};

const testearalerta = async (ctx) => {
  if (ctx.from.id !== ADMIN_USER_ID) {
    return ctx.reply('Comando no autorizado');
  }
  
  const args = ctx.message.text.split(' ');
  if (args.length < 2) {
    return ctx.reply('Uso: /testearalerta ASIN');
  }
  
  const asin = args[1].toUpperCase();
  
  try {
    const { Product } = require('../../models');
    const priceTracker = require('../../price-tracker');
    
    const products = await Product.find({ asin: asin });
    
    if (products.length === 0) {
      return ctx.reply(`❌ No se encontraron productos con ASIN: ${asin}`);
    }
    
    let message = `🧪 **TEST DE ALERTAS:** ${asin}\n\n`;
    
    for (const product of products) {
      message += `👤 Usuario: ${product.user}\n`;
      message += `💰 Precio actual: ${product.price}€\n`;
      
      // Simular precios para testear lógica
      const testPrices = [
        product.price - 10,  // -10€
        product.price - 5,   // -5€
        product.price - 1,   // -1€
        product.price + 1    // +1€ (no debería alertar)
      ];
      
      for (const testPrice of testPrices) {
        const shouldAlert = priceTracker.shouldSendAlert(product, testPrice);
        const diff = product.price - testPrice;
        message += `  📊 ${testPrice}€ (${diff > 0 ? '-' : '+'}${Math.abs(diff).toFixed(2)}€): ${shouldAlert ? '✅ ALERTA' : '❌ NO ALERTA'}\n`;
      }
      message += '\n';
    }
    
    await ctx.replyWithMarkdown(message);
    
  } catch (error) {
    ctx.reply(`❌ Error testeando alertas: ${error.message}`);
  }
};

const resumenbot = async (ctx) => {
  if (ctx.from.id !== ADMIN_USER_ID) {
    return ctx.reply('Comando no autorizado');
  }

  try {
    const { UserStats, ProductStats, Product } = require('../../models');
    
    // Stats básicas
    const [totalUsers, totalProducts, totalProductStats] = await Promise.all([
      UserStats.countDocuments({}),
      Product.countDocuments({}),
      ProductStats.countDocuments({})
    ]);

    // Usuarios activos (última actividad en 7 días)
    const last7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const activeUsers = await UserStats.countDocuments({
      lastActivity: { $gte: last7Days }
    });

    // Top usuarios (por productos)
    const topUsers = await UserStats.find({})
      .sort({ totalProducts: -1 })
      .limit(5)
      .select('userId firstName lastName totalProducts alertsReceived');

    // Top productos (por usuarios)
    const topProducts = await ProductStats.find({})
      .sort({ totalTrackers: -1 })
      .limit(5)
      .select('asin productName totalTrackers totalAlerts');

    // Productos virales
    const viralCount = await ProductStats.countDocuments({ isViral: true });

    let message = `🤖 **RESUMEN DEL BOT**\n\n`;
    
    message += `📊 **ESTADÍSTICAS GENERALES:**\n`;
    message += `👥 Total usuarios: **${totalUsers}**\n`;
    message += `📦 Total productos: **${totalProducts}**\n`;
    message += `🟢 Usuarios activos (7d): **${activeUsers}**\n`;
    message += `⚡ Productos virales: **${viralCount}**\n\n`;

    message += `🏆 **TOP 5 USUARIOS:**\n`;
    topUsers.forEach((user, i) => {
      const name = escapeMarkdown(`${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Sin nombre');
      message += `**${i + 1}.** ${name} - **${user.totalProducts}** productos\n`;
    });

    message += `\n🔥 **TOP 5 PRODUCTOS:**\n`;
    topProducts.forEach((product, i) => {
      const originalName = product.productName || 'Producto sin nombre';
      let displayName;
      if (originalName.length <= 30) {
        displayName = escapeMarkdown(originalName);
      } else {
        displayName = escapeMarkdown(originalName.substring(0, 27)) + '...';
      }
      message += `**${i + 1}.** ${displayName}\n`;
      message += `    👥 **${product.totalTrackers}** usuarios\n\n`;
    });

    message += `📖 **COMANDOS DETALLADOS:**\n`;
    message += `• \`/listausuarios [página]\` - Lista paginada de usuarios\n`;
    message += `• \`/listaproductos [página]\` - Lista paginada de productos\n`;
    message += `• \`/stats\` - Dashboard completo\n`;

    await ctx.replyWithMarkdown(message);

  } catch (error) {
    console.error('Error generating bot summary:', error);
    await ctx.reply('❌ Error generando resumen del bot');
  }
};

const ayudaanalytics = async (ctx) => {
  if (ctx.from.id !== ADMIN_USER_ID) {
    return ctx.reply('Comando no autorizado');
  }

  const helpMessage = `📊 *COMANDOS DE ANALYTICS*

*Dashboard Principal:*
/stats - Dashboard completo de analytics
/resumenbot - Resumen rápido y vista general

*Listas Completas:*
/listaproductos [página] - Todos los productos con paginación
/listausuarios [página] - Todos los usuarios con paginación

*Utilidades:*
/ayudaanalytics - Esta ayuda

Todos los comandos son exclusivos para admin (ID: 615957202)

*Ejemplos de uso:*
/resumenbot - Vista rápida recomendada
/listausuarios 1 - Primera página de usuarios
/listaproductos 2 - Segunda página de productos`;

  await ctx.replyWithMarkdown(helpMessage);
};

// Función auxiliar mejorada para escapar caracteres especiales en Markdown
function escapeMarkdown(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\*/g, '\\*')
    .replace(/\_/g, '\\_')
    .replace(/\~/g, '\\~')
    .replace(/\`/g, '\\`')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/\>/g, '\\>')
    .replace(/\#/g, '\\#')
    .replace(/\+/g, '\\+')
    .replace(/\-/g, '\\-')
    .replace(/\=/g, '\\=')
    .replace(/\|/g, '\\|')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\./g, '\\.')
    .replace(/\!/g, '\\!');
}

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
  ayudaanalytics,
  resumenbot,
  
  // NUEVAS FUNCIONES DE DIAGNÓSTICO:
  diagnosticoasin,
  forzarguardado,
  testearalerta
};
