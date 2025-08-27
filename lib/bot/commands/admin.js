'use strict';
const { Product, PriceHistory, OfferPublication } = require('../../models');

const ADMIN_USER_ID = 615957202;

// Configuración de límites para comandos de listado
const LIMITS = {
  USERS_PER_PAGE: 8,
  PRODUCTS_PER_PAGE: 10,
  MAX_MESSAGE_LENGTH: 3800,
  MAX_PRODUCT_NAME: 25
};

// ===================== UTILIDADES =====================

function parseSpanishDate(dateStr) {
  const match = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) {
    throw new Error(`Formato de fecha inválido: ${dateStr}. Use DD/MM/YYYY`);
  }
  
  const [, day, month, year] = match;
  const date = new Date(year, month - 1, day, 12, 0, 0);
  
  if (isNaN(date.getTime())) {
    throw new Error(`Fecha inválida: ${dateStr}`);
  }
  
  return date;
}

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

// ===================== COMANDOS DE AYUDA ACTUALIZADOS =====================

const ayudaAdmin = async (ctx) => {
  if (ctx.from.id !== ADMIN_USER_ID) {
    return ctx.reply('Comando no autorizado');
  }
  
  const helpMessage = `📋 **COMANDOS DE ADMINISTRADOR**

**GESTIÓN DE PRECIOS:**
/agregarprecio ASIN precio "comentario" - Precio actual con oferta
/agregarhistorial ASIN DD/MM/YYYY precio "comentario" - Precio histórico
/forzarrevision ASIN - Verificación manual de producto

**GESTIÓN DE PRODUCTOS:**
/borrarproducto ASIN - Eliminar con confirmación
/borrarproducto ASIN TOTAL CONFIRMAR - Eliminar todo
/borrarproducto ASIN DD/MM/YYYY CONFIRMAR - Solo fecha específica
/corregirasins - Corregir ASINs faltantes
/corregirnombres - Corregir nombres faltantes masivamente
/recuperarproducto ASIN - Recuperar producto perdido
/sincronizarnombres - Sincronizar nombres ProductStats
/limpiarstats - Limpiar estadísticas huérfanas

**🤖 ROBOTS ASPIRADORES:**
/marcarrobot ASIN - Marcar producto como robot aspirador
/desmarcarrobot ASIN - Desmarcar robot aspirador
/listarobots [página] - Ver robots aspiradores marcados
/forzaroferta ASIN - Publicar oferta manualmente

**📢 COMUNICACIÓN MASIVA:**
/broadcast mensaje - Mensaje a todos los usuarios
/emailblast asunto|mensaje - Email masivo a usuarios

**IMPORTACIÓN MASIVA:**
/importarhistorial - Importar CSV o texto masivo
/importartexto - Instrucciones para texto masivo

**DIAGNÓSTICO:**
/diagnosticoasin ASIN - Análisis completo del producto
/testearalerta ASIN - Probar lógica de alertas
/forzarguardado ASIN precio - Recuperar historial perdido

**ANALYTICS Y ESTADÍSTICAS:**
/stats - Dashboard completo de analytics
/resumenbot - Vista rápida y general del bot
/listaproductos [página] - Lista paginada productos
/listausuarios [página] - Lista paginada usuarios

**FORMATO DE FECHAS:** Siempre DD/MM/YYYY (ej: 24/08/2025)

**EJEMPLOS:**
/marcarrobot B0DCVYS9FQ - Para ofertas automáticas
/broadcast ¡Nueva función disponible! - Mensaje masivo
/emailblast Ofertas|Hola, te informamos... - Email masivo
/forzaroferta B0DCVYS9FQ - Publicar oferta ahora`;

  ctx.replyWithMarkdown(helpMessage);
};

const ayudaanalytics = async (ctx) => {
  if (ctx.from.id !== ADMIN_USER_ID) {
    return ctx.reply('Comando no autorizado');
  }

  const helpMessage = `📊 **COMANDOS DE ANALYTICS**

**Dashboard:**
/stats - Dashboard completo de analytics
/resumenbot - Resumen rápido y vista general

**Listas:**
/listaproductos [página] - Productos con paginación
/listausuarios [página] - Usuarios con paginación

**Ejemplos:**
/resumenbot - Vista rápida recomendada
/listausuarios 1 - Primera página usuarios
/listaproductos 2 - Segunda página productos`;

  ctx.replyWithMarkdown(helpMessage);
};

// ===================== GESTIÓN DE ROBOTS ASPIRADORES =====================

const marcarrobot = async (ctx) => {
  if (ctx.from.id !== ADMIN_USER_ID) {
    return ctx.reply('Comando no autorizado');
  }
  
  const args = ctx.message.text.split(' ');
  if (args.length < 2) {
    return ctx.reply('Uso: /marcarrobot ASIN\nEjemplo: /marcarrobot B0DCVYS9FQ');
  }
  
  const asin = args[1].toUpperCase();
  
  try {
    const { Product } = require('../../models');
    
    const result = await Product.updateMany(
      { asin: asin },
      { $set: { isRobotVacuum: true } }
    );
    
    if (result.matchedCount === 0) {
      return ctx.reply(`❌ No se encontraron productos con ASIN: ${asin}`);
    }
    
    ctx.reply(`✅ **Robot Aspirador Marcado**

📦 ASIN: \`${asin}\`
🤖 Productos marcados: **${result.modifiedCount}**
👥 Usuarios afectados: **${result.matchedCount}**

🔥 Ahora se publicarán ofertas automáticamente cuando baje el precio`, { parse_mode: 'Markdown' });
    
  } catch (error) {
    ctx.reply(`❌ Error: ${error.message}`);
  }
};

const desmarcarrobot = async (ctx) => {
  if (ctx.from.id !== ADMIN_USER_ID) {
    return ctx.reply('Comando no autorizado');
  }
  
  const args = ctx.message.text.split(' ');
  if (args.length < 2) {
    return ctx.reply('Uso: /desmarcarrobot ASIN\nEjemplo: /desmarcarrobot B0DCVYS9FQ');
  }
  
  const asin = args[1].toUpperCase();
  
  try {
    const { Product } = require('../../models');
    
    const result = await Product.updateMany(
      { asin: asin },
      { 
        $set: { isRobotVacuum: false },
        $unset: { lastOfferPublished: 1, lastPublishedPrice: 1 }
      }
    );
    
    if (result.matchedCount === 0) {
      return ctx.reply(`❌ No se encontraron productos con ASIN: ${asin}`);
    }
    
    ctx.reply(`✅ **Robot Aspirador Desmarcado**

📦 ASIN: \`${asin}\`
❌ Productos desmarcados: **${result.modifiedCount}**
👥 Usuarios afectados: **${result.matchedCount}**

🚫 Ya no se publicarán ofertas automáticamente`, { parse_mode: 'Markdown' });
    
  } catch (error) {
    ctx.reply(`❌ Error: ${error.message}`);
  }
};

const listarobots = async (ctx) => {
  if (ctx.from.id !== ADMIN_USER_ID) {
    return ctx.reply('Comando no autorizado');
  }

  const args = ctx.message.text.split(' ');
  const page = parseInt(args[1]) || 1;
  const ROBOTS_PER_PAGE = 10;
  const skip = (page - 1) * ROBOTS_PER_PAGE;

  try {
    const { Product } = require('../../models');
    
    // Obtener robots únicos por ASIN
    const robotsAgg = await Product.aggregate([
      { $match: { isRobotVacuum: true } },
      { 
        $group: {
          _id: '$asin',
          name: { $first: '$name' },
          price: { $first: '$price' },
          currency: { $first: '$currency' },
          userCount: { $sum: 1 },
          lastOfferPublished: { $first: '$lastOfferPublished' },
          lastPublishedPrice: { $first: '$lastPublishedPrice' }
        }
      },
      { $sort: { userCount: -1, name: 1 } },
      { $skip: skip },
      { $limit: ROBOTS_PER_PAGE }
    ]);

    const totalRobots = await Product.distinct('asin', { isRobotVacuum: true });
    const totalPages = Math.ceil(totalRobots.length / ROBOTS_PER_PAGE);
    
    if (robotsAgg.length === 0) {
      return ctx.reply('🤖 No hay robots aspiradores marcados\n\nUsa /marcarrobot ASIN para marcar productos');
    }

    let message = `🤖 **ROBOTS ASPIRADORES** (${totalRobots.length} únicos)\n`;
    message += `📄 Página ${page}/${totalPages} | Mostrando ${robotsAgg.length}\n\n`;
    
    robotsAgg.forEach((robot, index) => {
      const num = skip + index + 1;
      const name = robot.name ? 
        (robot.name.length > 45 ? robot.name.substring(0, 42) + '...' : robot.name) :
        'Producto sin nombre';
      
      message += `**${num}.** ${escapeMarkdown(name)}\n`;
      message += `📋 ASIN: \`${robot._id}\` | 👥 ${robot.userCount} usuarios\n`;
      message += `💰 ${robot.price}${robot.currency || '€'}`;
      
      if (robot.lastOfferPublished) {
        const daysSince = Math.floor((Date.now() - robot.lastOfferPublished) / (1000 * 60 * 60 * 24));
        message += ` | 🔥 Última oferta: hace ${daysSince} días`;
      } else {
        message += ` | 🔥 Sin ofertas publicadas`;
      }
      message += '\n\n';
    });

    if (totalPages > 1) {
      message += `📖 **NAVEGACIÓN:**\n`;
      if (page > 1) message += `⬅️ \`/listarobots ${page - 1}\` `;
      if (page < totalPages) message += `\`/listarobots ${page + 1}\` ➡️`;
      message += `\n\n💡 Usa \`/listarobots [página]\``;
    }

    ctx.replyWithMarkdown(message);

  } catch (error) {
    ctx.reply(`❌ Error: ${error.message}`);
  }
};

const forzaroferta = async (ctx) => {
  if (ctx.from.id !== ADMIN_USER_ID) {
    return ctx.reply('Comando no autorizado');
  }
  
  const args = ctx.message.text.split(' ');
  if (args.length < 2) {
    return ctx.reply('Uso: /forzaroferta ASIN\nEjemplo: /forzaroferta B0DCVYS9FQ');
  }
  
  const asin = args[1].toUpperCase();
  
  try {
    const { Product } = require('../../models');
    
    // Buscar el producto
    const product = await Product.findOne({ asin: asin, isRobotVacuum: true });
    
    if (!product) {
      return ctx.reply(`❌ No se encontró robot aspirador con ASIN: ${asin}\n\nUsa /marcarrobot ${asin} si es un robot aspirador`);
    }
    
    // Forzar publicación
    const OfferService = require('../../services/offer-service');
    const result = await OfferService.publishOffer({
      asin: product.asin,
      name: product.name,
      newPrice: product.price,
      oldPrice: product.price * 1.2, // Simular precio anterior 20% más alto
      currency: product.currency || '€',
      forced: true
    });
    
    if (result.success) {
      ctx.reply(`✅ **Oferta Publicada Forzadamente**\n\n📦 ${product.name}\n💰 ${product.price}${product.currency}\n\n🔥 Publicado en grupo y canal`);
    } else {
      ctx.reply(`❌ Error publicando oferta: ${result.error}`);
    }
    
  } catch (error) {
    ctx.reply(`❌ Error: ${error.message}`);
  }
};

// ===================== COMUNICACIÓN MASIVA =====================

const broadcast = async (ctx) => {
  if (ctx.from.id !== ADMIN_USER_ID) {
    return ctx.reply('Comando no autorizado');
  }
  
  const args = ctx.message.text.split(' ');
  const message = args.slice(1).join(' ');
  
  if (args.length < 2) {
    return ctx.reply('Uso: /broadcast Tu mensaje aquí\n\nEjemplo: /broadcast ¡Nueva función disponible! Ahora puedes...');
  }
  
  // Verificar si es confirmación
  if (message.startsWith('CONFIRMAR ')) {
    const realMessage = message.substring(10);
    
    try {
      const { UserStats } = require('../../models');
      
      const activeDate = new Date();
      activeDate.setDate(activeDate.getDate() - 90);
      
      const users = await UserStats.find({
        lastActivity: { $gte: activeDate }
      }).select('userId firstName lastName');
      
      let sent = 0;
      let errors = 0;
      
      for (const user of users) {
        try {
          await ctx.telegram.sendMessage(user.userId, realMessage);
          sent++;
          
          // Pequeña pausa para no saturar Telegram
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          errors++;
          console.error(`Error enviando broadcast a ${user.userId}:`, error.message);
        }
      }
      
      ctx.reply(`📢 **BROADCAST COMPLETADO**\n\n✅ Enviados: **${sent}**\n❌ Errores: **${errors}**\n👥 Total usuarios: **${users.length}**`, { parse_mode: 'Markdown' });
      
    } catch (error) {
      ctx.reply(`❌ Error: ${error.message}`);
    }
    return;
  }
  
  // Mostrar confirmación
  try {
    const { UserStats } = require('../../models');
    
    const activeDate = new Date();
    activeDate.setDate(activeDate.getDate() - 90);
    
    const users = await UserStats.find({
      lastActivity: { $gte: activeDate }
    }).select('userId firstName lastName');
    
    if (users.length === 0) {
      return ctx.reply('❌ No se encontraron usuarios activos');
    }
    
    const confirmMessage = `📢 **CONFIRMACIÓN DE BROADCAST**\n\n` +
      `👥 Usuarios objetivo: **${users.length}**\n` +
      `📅 Activos en últimos 90 días\n\n` +
      `📝 **Mensaje a enviar:**\n${message}\n\n` +
      `⚠️ **¿Confirmar envío masivo?**\n\n` +
      `**Para confirmar, escribe exactamente:**\n\`/broadcast CONFIRMAR ${message}\``;
    
    ctx.replyWithMarkdown(confirmMessage);
    
  } catch (error) {
    ctx.reply(`❌ Error: ${error.message}`);
  }
};

const emailblast = async (ctx) => {
  if (ctx.from.id !== ADMIN_USER_ID) {
    return ctx.reply('Comando no autorizado');
  }
  
  const args = ctx.message.text.split(' ');
  const content = args.slice(1).join(' ');
  
  if (args.length < 2) {
    return ctx.reply('Uso: /emailblast Asunto|Mensaje del email\n\nEjemplo: /emailblast Nueva función|¡Hola! Te escribo para contarte...');
  }
  
  // Verificar si es confirmación
  if (content.startsWith('CONFIRMAR ')) {
    const realContent = content.substring(10);
    const parts = realContent.split('|');
    
    if (parts.length < 2) {
      return ctx.reply('❌ Formato incorrecto después de CONFIRMAR');
    }
    
    const subject = parts[0].trim();
    const emailMessage = parts[1].trim();
    
    try {
      const { UserSettings } = require('../../models');
      const EmailService = require('../../services/email-service');
      
      const emailUsers = await UserSettings.find({
        email: { $exists: true, $ne: null, $ne: '' },
        emailVerified: true,
        emailNotifications: true
      }).select('userId email');
      
      let sent = 0;
      let errors = 0;
      
      for (const user of emailUsers) {
        try {
          await EmailService.sendEmail({
            to: user.email,
            subject: subject,
            text: emailMessage,
            html: `<p>${emailMessage.replace(/\n/g, '<br>')}</p>`
          });
          sent++;
          
          // Pausa para no saturar el servicio de email
          await new Promise(resolve => setTimeout(resolve, 200));
        } catch (error) {
          errors++;
          console.error(`Error enviando email a ${user.email}:`, error.message);
        }
      }
      
      ctx.reply(`📧 **EMAIL BLAST COMPLETADO**\n\n✅ Enviados: **${sent}**\n❌ Errores: **${errors}**\n👥 Total usuarios: **${emailUsers.length}**`, { parse_mode: 'Markdown' });
      
    } catch (error) {
      ctx.reply(`❌ Error: ${error.message}`);
    }
    return;
  }
  
  // Mostrar confirmación
  const parts = content.split('|');
  
  if (parts.length < 2) {
    return ctx.reply('❌ Formato incorrecto. Usa: /emailblast Asunto|Mensaje');
  }
  
  const subject = parts[0].trim();
  const emailMessage = parts[1].trim();
  
  try {
    const { UserSettings } = require('../../models');
    
    const emailUsers = await UserSettings.find({
      email: { $exists: true, $ne: null, $ne: '' },
      emailVerified: true,
      emailNotifications: true
    }).select('userId email');
    
    if (emailUsers.length === 0) {
      return ctx.reply('❌ No se encontraron usuarios con email verificado y notificaciones activas');
    }
    
    const confirmMessage = `📧 **CONFIRMACIÓN DE EMAIL MASIVO**\n\n` +
      `👥 Usuarios objetivo: **${emailUsers.length}**\n` +
      `✅ Solo emails verificados con notificaciones activas\n\n` +
      `📋 **Asunto:** ${subject}\n` +
      `📝 **Mensaje:** ${emailMessage.substring(0, 100)}...\n\n` +
      `⚠️ **¿Confirmar envío de emails?**\n\n` +
      `**Para confirmar, escribe exactamente:**\n\`/emailblast CONFIRMAR ${content}\``;
    
    ctx.replyWithMarkdown(confirmMessage);
    
  } catch (error) {
    ctx.reply(`❌ Error: ${error.message}`);
  }
};

// ===================== GESTIÓN DE PRECIOS =====================

const agregarPrecio = async (ctx) => {
  if (ctx.from.id !== ADMIN_USER_ID) {
    return ctx.reply('Comando no autorizado');
  }
  
  const args = ctx.message.text.split(' ');
  if (args.length < 4) {
    return ctx.reply('Uso: /agregarprecio ASIN precio "comentario"\nEjemplo: /agregarprecio B0DCVYS9FQ 445.45 "Oferta detectada"');
  }
  
  try {
    const asin = args[1].toUpperCase();
    const price = parseFloat(args[2]);
    const comment = args.slice(3).join(' ').replace(/"/g, '');
    
    if (isNaN(price) || price <= 0) {
      return ctx.reply('❌ Precio inválido. Debe ser un número mayor a 0');
    }
    
    // Crear registro de precio actual
    await PriceHistory.create({
      asin,
      price,
      previousPrice: 0,
      timestamp: new Date(),
      currency: '€',
      comment
    });
    
    // Buscar productos y actualizar
    const products = await Product.find({
      $or: [{ asin: asin }, { url: { $regex: asin } }]
    });
    
    let alertasSent = 0;
    
    if (products.length > 0) {
      const priceTracker = require('../../price-tracker');
      
      for (const product of products) {
        const oldPrice = product.price;
        
        // Actualizar precio en producto
        await Product.findByIdAndUpdate(product._id, {
          price: price,
          lastCheck: Math.floor(Date.now() / 1000)
        });
        
        // Enviar alerta si corresponde
        if (oldPrice !== price && priceTracker.shouldSendAlert(product, price, oldPrice)) {
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
          alertasSent++;
        }
      }
    }
    
    ctx.reply(`✅ **Precio agregado correctamente**

📦 ASIN: \`${asin}\`
💰 Precio: **${price}€**
📝 Comentario: ${comment}
👥 Productos actualizados: **${products.length}**
🚨 Alertas enviadas: **${alertasSent}**

${products.length === 0 ? '⚠️ No hay usuarios siguiendo este producto' : ''}`, { parse_mode: 'Markdown' });
    
  } catch (error) {
    ctx.reply(`❌ Error: ${error.message}`);
  }
};

const agregarHistorial = async (ctx) => {
  if (ctx.from.id !== ADMIN_USER_ID) {
    return ctx.reply('Comando no autorizado');
  }
  
  const args = ctx.message.text.split(' ');
  if (args.length < 5) {
    return ctx.reply('Uso: /agregarhistorial ASIN DD/MM/YYYY precio "comentario"\nEjemplo: /agregarhistorial B0DCVYS9FQ 23/08/2025 449.00 "Precio anterior"');
  }
  
  try {
    const asin = args[1].toUpperCase();
    const dateStr = args[2];
    const price = parseFloat(args[3]);
    const comment = args.slice(4).join(' ').replace(/"/g, '');
    
    if (isNaN(price) || price <= 0) {
      return ctx.reply('❌ Precio inválido. Debe ser un número mayor a 0');
    }
    
    const timestamp = parseSpanishDate(dateStr);
    
    await PriceHistory.create({
      asin,
      price,
      previousPrice: 0,
      timestamp,
      currency: '€',
      comment
    });
    
    ctx.reply(`✅ **Precio histórico agregado**

📦 ASIN: \`${asin}\`
📅 Fecha: **${timestamp.toLocaleDateString('es-ES')}**
💰 Precio: **${price}€**
📝 Comentario: ${comment}`, { parse_mode: 'Markdown' });
    
  } catch (error) {
    ctx.reply(`❌ Error: ${error.message}`);
  }
};

const forzarRevision = async (ctx) => {
  if (ctx.from.id !== ADMIN_USER_ID) {
    return ctx.reply('Comando no autorizado');
  }
  
  const args = ctx.message.text.split(' ');
  if (args.length < 2) {
    return ctx.reply('Uso: /forzarrevision ASIN\nEjemplo: /forzarrevision B0DCVYS9FQ');
  }
  
  try {
    const asin = args[1].toUpperCase();
    const products = await Product.find({
      $or: [{ asin: asin }, { url: { $regex: asin } }]
    });
    
    if (products.length === 0) {
      return ctx.reply(`❌ No se encontraron productos con ASIN: ${asin}`);
    }
    
    const priceTracker = require('../../price-tracker');
    
    for (const product of products) {
      await priceTracker.checkProduct(product);
    }
    
    ctx.reply(`✅ **Verificación completada**

📦 ASIN: \`${asin}\`
🔄 Productos verificados: **${products.length}**
⏱️ Ejecutado: ${new Date().toLocaleString('es-ES')}`, { parse_mode: 'Markdown' });
    
  } catch (error) {
    ctx.reply(`❌ Error: ${error.message}`);
  }
};

const sincronizarnombres = async (ctx) => {
  if (ctx.from.id !== ADMIN_USER_ID) {
    return ctx.reply('Comando no autorizado');
  }
  
  try {
    const { Product, ProductStats } = require('../../models');
    
    // Buscar ProductStats con productName vacío o null
    const statsWithoutName = await ProductStats.find({
      $or: [
        { productName: { $exists: false } },
        { productName: null },
        { productName: '' },
        { productName: 'Producto sin nombre' }
      ]
    });
    
    if (statsWithoutName.length === 0) {
      return ctx.reply('✅ Todos los ProductStats tienen nombres correctos');
    }
    
    let message = `🔄 **SINCRONIZACIÓN DE NOMBRES**\n\n`;
    message += `📊 ProductStats sin nombre: **${statsWithoutName.length}**\n\n`;
    
    let fixed = 0;
    let notFound = 0;
    
    for (const stat of statsWithoutName) {
      try {
        // Buscar el nombre en la tabla Product
        const product = await Product.findOne({ asin: stat.asin });
        
        if (product && product.name) {
          // Actualizar ProductStats con el nombre correcto
          await ProductStats.findByIdAndUpdate(stat._id, {
            productName: product.name
          });
          
          const shortName = product.name.length > 50 ? 
            product.name.substring(0, 47) + '...' : 
            product.name;
          
          message += `✅ ${stat.asin}: ${shortName}\n`;
          fixed++;
        } else {
          message += `❌ ${stat.asin}: No encontrado en tabla Product\n`;
          notFound++;
        }
        
      } catch (error) {
        console.error(`Error sincronizando ${stat.asin}:`, error.message);
        message += `❌ ${stat.asin}: Error de sincronización\n`;
        notFound++;
      }
    }
    
    message += `\n📊 **RESUMEN:**\n`;
    message += `✅ Sincronizados: **${fixed}**\n`;
    message += `❌ No encontrados: **${notFound}**\n`;
    
        if (fixed > 0) {
      message += `\n💡 Ejecuta /listaproductos para verificar los cambios`;
    }
    
    if (notFound > 0) {
      message += `\n\n⚠️ Algunos ProductStats no tienen producto correspondiente`;
      message += `\n💡 Usa /limpiarstats para eliminar estadísticas huérfanas`;
    }
    
    ctx.replyWithMarkdown(message);
    
  } catch (error) {
    console.error('Error en sincronizarnombres:', error);
    ctx.reply(`❌ Error: ${error.message}`);
  }
};

const limpiarstats = async (ctx) => {
  if (ctx.from.id !== ADMIN_USER_ID) {
    return ctx.reply('Comando no autorizado');
  }
  
  const args = ctx.message.text.split(' ');
  const confirmacion = args[1] ? args[1].toUpperCase() : null;
  
  if (confirmacion === 'CONFIRMAR') {
    // EJECUTAR LIMPIEZA
    try {
      const { Product, ProductStats } = require('../../models');
      
      const validAsins = await Product.distinct('asin');
      const result = await ProductStats.deleteMany({
        asin: { $nin: validAsins }
      });
      
      ctx.reply(`✅ **LIMPIEZA COMPLETADA**\n\n🗑️ Estadísticas eliminadas: **${result.deletedCount}**\n\n✨ Base de datos optimizada`, { parse_mode: 'Markdown' });
      
    } catch (error) {
      ctx.reply(`❌ Error: ${error.message}`);
    }
    return;
  }
  
  // MOSTRAR CONFIRMACIÓN
  try {
    const { Product, ProductStats } = require('../../models');
    
    const validAsins = await Product.distinct('asin');
    const orphanedStats = await ProductStats.find({
      asin: { $nin: validAsins }
    });
    
    if (orphanedStats.length === 0) {
      return ctx.reply('✅ No hay estadísticas huérfanas');
    }
    
    let message = `🧹 **LIMPIEZA DE ESTADÍSTICAS HUÉRFANAS**\n\n`;
    message += `📊 Estadísticas sin producto: **${orphanedStats.length}**\n\n`;
    
    for (const stat of orphanedStats.slice(0, 10)) {
      message += `🗑️ ${stat.asin}: ${stat.productName || 'Sin nombre'}\n`;
    }
    
    if (orphanedStats.length > 10) {
      message += `... y ${orphanedStats.length - 10} más\n`;
    }
    
    message += `\n⚠️ **ADVERTENCIA:** Esta acción eliminará estas estadísticas permanentemente\n\n`;
    message += `**Para confirmar, escribe exactamente:**\n`;
    message += `\`/limpiarstats CONFIRMAR\``;
    
    ctx.replyWithMarkdown(message);
    
  } catch (error) {
    ctx.reply(`❌ Error: ${error.message}`);
  }
};

// Esta es la continuación final del archivo admin.js desde testearalerta:

const testearalerta = async (ctx) => {
  if (ctx.from.id !== ADMIN_USER_ID) {
    return ctx.reply('Comando no autorizado');
  }
  
  const args = ctx.message.text.split(' ');
  if (args.length < 2) {
    return ctx.reply('Uso: /testearalerta ASIN\nEjemplo: /testearalerta B0DCVYS9FQ');
  }
  
  const asin = args[1].toUpperCase();
  
  try {
    const { Product } = require('../../models');
    const priceTracker = require('../../price-tracker');
    
    const products = await Product.find({ asin: asin });
    
    if (products.length === 0) {
      return ctx.reply(`❌ No hay productos con ASIN: ${asin}`);
    }
    
    let message = `🧪 **TEST ALERTAS: ${asin}**\n\n`;
    
    for (const product of products) {
      message += `👤 Usuario: ${product.user}\n`;
      message += `💰 Precio actual: ${product.price}€\n`;
      message += `🔔 Tipo alerta: ${product.preferences?.alertType || 'no configurado'}\n`;
      message += `🤖 Robot: ${product.isRobotVacuum ? 'SÍ' : 'NO'}\n`;
      
      if (product.preferences?.targetPrice) {
        message += `🎯 Precio objetivo: ${product.preferences.targetPrice}€\n`;
      }
      
      const testPrices = [
        product.price - 10,
        product.price - 5,
        product.price - 1,
        product.price + 1
      ];
      
      message += `\n📊 **Simulaciones:**\n`;
      for (const testPrice of testPrices) {
        const shouldAlert = priceTracker.shouldSendAlert(product, testPrice);
        const diff = product.price - testPrice;
        const diffStr = diff > 0 ? `-${Math.abs(diff).toFixed(2)}€` : `+${Math.abs(diff).toFixed(2)}€`;
        message += `  • ${testPrice.toFixed(2)}€ (${diffStr}): ${shouldAlert ? '✅ ALERTA' : '❌ NO ALERTA'}\n`;
      }
      message += '\n';
    }
    
    ctx.replyWithMarkdown(message);
    
  } catch (error) {
    ctx.reply(`❌ Error: ${error.message}`);
  }
};

// ===================== ANALYTICS =====================

const stats = async (ctx) => {
  if (ctx.from.id !== ADMIN_USER_ID) {
    return ctx.reply('Comando no autorizado');
  }

  await ctx.reply('📊 Generando dashboard...');
  
  try {
    const { Product, UserStats } = require('../../models');
    const AnalyticsService = require('../../services/analytics-service');
    
    const [totalProducts, totalUsers, basicStats, robotCount] = await Promise.all([
      Product.countDocuments({}),
      UserStats.countDocuments({}),
      AnalyticsService.getBasicStats(),
      Product.countDocuments({ isRobotVacuum: true })
    ]);

    const dashboard = `🔥 **VS PrecioBot Dashboard**

📊 **ESTADÍSTICAS GENERALES**
• Productos trackeados: **${totalProducts}**
• Usuarios registrados: **${totalUsers}**
• Alertas enviadas: **${basicStats.totalAlerts}**
• 🤖 Robots aspiradores: **${robotCount}**

Sistema funcionando correctamente.

💡 **Comandos detallados:**
• /listaproductos - Ver productos
• /listausuarios - Ver usuarios  
• /listarobots - Ver robots aspiradores
• /resumenbot - Vista rápida`;

    ctx.replyWithMarkdown(dashboard);

  } catch (error) {
    console.error('Error generating dashboard:', error);
    ctx.reply('❌ Error generando dashboard');
  }
};

const listaproductos = async (ctx) => {
  if (ctx.from.id !== ADMIN_USER_ID) {
    return ctx.reply('Comando no autorizado');
  }

  const args = ctx.message.text.split(' ');
  const page = parseInt(args[1]) || 1;
  const skip = (page - 1) * LIMITS.PRODUCTS_PER_PAGE;

  try {
    const { ProductStats } = require('../../models');
    
    const totalProducts = await ProductStats.countDocuments({});
    const totalPages = Math.ceil(totalProducts / LIMITS.PRODUCTS_PER_PAGE);
    
    if (totalProducts === 0) {
      return ctx.reply('📭 No hay productos registrados');
    }
    
    if (page > totalPages) {
      return ctx.reply(`📄 Página ${page} no existe. Total: ${totalPages}\nUso: /listaproductos [página]`);
    }

    const products = await ProductStats.find({})
      .sort({ totalTrackers: -1, totalAlerts: -1 })
      .skip(skip)
      .limit(LIMITS.PRODUCTS_PER_PAGE);

    let message = `📦 **PRODUCTOS** (${totalProducts} total)\n`;
    message += `📄 Página ${page}/${totalPages} | Mostrando ${products.length}\n\n`;
    
    for (let i = 0; i < products.length; i++) {
      const p = products[i];
      const productNumber = skip + i + 1;
      const originalName = p.productName || 'Producto sin nombre';
      
      let displayName;
      if (originalName.length <= 35) {
        displayName = escapeMarkdown(originalName);
      } else {
        displayName = escapeMarkdown(originalName.substring(0, 32)) + '...';
      }
      
      message += `**${productNumber}.** ${displayName}\n`;
      message += `📋 ASIN: \`${p.asin}\`\n`;
      message += `👥 **${p.totalTrackers}** usuarios | 🚨 **${p.totalAlerts}** alertas`;
      
      if (p.totalTrackers >= 3) {
        message += ` | 🔥 *Popular*`;
        if (p.isViral) message += ` ⚡ *Viral*`;
      }
      message += '\n\n';
    }

    if (totalPages > 1) {
      message += `📖 **NAVEGACIÓN:**\n`;
      if (page > 1) message += `⬅️ \`/listaproductos ${page - 1}\` `;
      if (page < totalPages) message += `\`/listaproductos ${page + 1}\` ➡️`;
      message += `\n\n💡 Usa \`/listaproductos [página]\``;
    }

    ctx.replyWithMarkdown(message);

  } catch (error) {
    ctx.reply(`❌ Error: ${error.message}`);
  }
};

const listausuarios = async (ctx) => {
  if (ctx.from.id !== ADMIN_USER_ID) {
    return ctx.reply('Comando no autorizado');
  }

  const args = ctx.message.text.split(' ');
  const page = parseInt(args[1]) || 1;
  const skip = (page - 1) * LIMITS.USERS_PER_PAGE;

  try {
    const { UserStats, Product } = require('../../models');
    
    const totalUsers = await UserStats.countDocuments({});
    const totalPages = Math.ceil(totalUsers / LIMITS.USERS_PER_PAGE);
    
    if (totalUsers === 0) {
      return ctx.reply('👥 No hay usuarios registrados');
    }
    
    if (page > totalPages) {
      return ctx.reply(`📄 Página ${page} no existe. Total: ${totalPages}\nUso: /listausuarios [página]`);
    }

    const users = await UserStats.find({})
      .sort({ totalProducts: -1, lastActivity: -1 })
      .skip(skip)
      .limit(LIMITS.USERS_PER_PAGE);

    let message = `👥 **USUARIOS** (${totalUsers} total)\n`;
    message += `📄 Página ${page}/${totalPages} | Mostrando ${users.length}\n\n`;
    
    for (const u of users) {
      const products = await Product.find({ user: u.userId })
        .select('name')
        .limit(3);
      
      const escapedFirstName = escapeMarkdown(u.firstName || '');
      const escapedLastName = escapeMarkdown(u.lastName || '');
      const escapedUsername = escapeMarkdown(u.username || 'sin_username');
      
      const fullName = `${escapedFirstName} ${escapedLastName}`.trim() || 'Sin nombre';
      
      message += `👤 **${fullName}** (@${escapedUsername})\n`;
      message += `🆔 ID: \`${u.userId}\` | 🏷️ **${u.userType}**\n`;
      message += `📦 **${u.totalProducts}** productos | 🚨 **${u.alertsReceived}** alertas\n`;
      
      if (products.length > 0) {
        const productNames = products
          .map(p => {
            const name = p.name;
            return name.length <= 25 ? escapeMarkdown(name) : escapeMarkdown(name.substring(0, 22)) + '...';
          })
          .join(', ');
        message += `📋 ${productNames}\n`;
      } else {
        message += `📋 Sin productos\n`;
      }
      
      message += `\n`;
    }

    if (totalPages > 1) {
      message += `📖 **NAVEGACIÓN:**\n`;
      if (page > 1) message += `⬅️ \`/listausuarios ${page - 1}\` `;
      if (page < totalPages) message += `\`/listausuarios ${page + 1}\` ➡️`;
      message += `\n\n💡 Usa \`/listausuarios [página]\``;
    }

    ctx.replyWithMarkdown(message);

  } catch (error) {
    ctx.reply(`❌ Error: ${error.message}`);
  }
};

const resumenbot = async (ctx) => {
  if (ctx.from.id !== ADMIN_USER_ID) {
    return ctx.reply('Comando no autorizado');
  }

  try {
    const { UserStats, ProductStats, Product } = require('../../models');
    
    const [totalUsers, totalProducts, activeUsers, robotCount] = await Promise.all([
      UserStats.countDocuments({}),
      Product.countDocuments({}),
      UserStats.countDocuments({
        lastActivity: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
      }),
      Product.countDocuments({ isRobotVacuum: true })
    ]);

    const [topUsers, topProducts, viralCount] = await Promise.all([
      UserStats.find({}).sort({ totalProducts: -1 }).limit(5).select('firstName lastName totalProducts'),
      ProductStats.find({}).sort({ totalTrackers: -1 }).limit(5).select('productName totalTrackers'),
      ProductStats.countDocuments({ isViral: true })
    ]);

    let message = `🤖 **RESUMEN DEL BOT**\n\n`;
    
    message += `📊 **ESTADÍSTICAS:**\n`;
    message += `👥 Total usuarios: **${totalUsers}**\n`;
    message += `📦 Total productos: **${totalProducts}**\n`;
    message += `🟢 Activos (7d): **${activeUsers}**\n`;
    message += `🤖 Robots aspiradores: **${robotCount}**\n`;
    message += `⚡ Virales: **${viralCount}**\n\n`;

    message += `🏆 **TOP 5 USUARIOS:**\n`;
    topUsers.forEach((user, i) => {
      const name = escapeMarkdown(`${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Sin nombre');
      message += `**${i + 1}.** ${name} - **${user.totalProducts}** productos\n`;
    });

    message += `\n🔥 **TOP 5 PRODUCTOS:**\n`;
    topProducts.forEach((product, i) => {
      const originalName = product.productName || 'Producto sin nombre';
      const displayName = originalName.length <= 30 ? 
        escapeMarkdown(originalName) : 
        escapeMarkdown(originalName.substring(0, 27)) + '...';
      message += `**${i + 1}.** ${displayName}\n`;
      message += `    👥 **${product.totalTrackers}** usuarios\n\n`;
    });

    message += `📖 **COMANDOS:**\n`;
    message += `• \`/listausuarios [página]\`\n`;
    message += `• \`/listaproductos [página]\`\n`;
    message += `• \`/listarobots [página]\`\n`;
    message += `• \`/stats\` - Dashboard completo`;

    ctx.replyWithMarkdown(message);

  } catch (error) {
    ctx.reply('❌ Error generando resumen');
  }
};

// ===================== LISTENER AUTOMÁTICO =====================

const procesarMensajeAdmin = async (ctx, next) => {
  if (ctx.from.id === ADMIN_USER_ID) {
    if (ctx.message.document || 
        (ctx.message.text && ctx.message.text.includes('\n') && !ctx.message.text.startsWith('/'))) {
      await procesarImportacionMasiva(ctx);
      return;
    }
  }
  next();
};

// ===================== EXPORTS =====================

module.exports = {
  // Comandos básicos
  ayudaAdmin,
  ayudaanalytics,
  
  // 🤖 Robots aspiradores
  marcarrobot,
  desmarcarrobot,
  listarobots,
  forzaroferta,
  
  // 📢 Comunicación masiva
  broadcast,
  emailblast,
  
  // Gestión de precios  
  agregarPrecio,
  agregarHistorial,
  forzarRevision,
  
  // Gestión de productos
  borrarProducto,
  corregirasins,
  recuperarproducto,
  corregirnombres,
  
  // Importación
  importarhistorial,
  importartexto,
  procesarImportacionMasiva,
  
  // Diagnóstico
  diagnosticoasin,
  forzarguardado,
  testearalerta,
  sincronizarnombres,
  limpiarstats,
  
  // Analytics
  stats,
  listaproductos,
  listausuarios, 
  resumenbot,
  
  // Listener automático
  procesarMensajeAdmin
};
