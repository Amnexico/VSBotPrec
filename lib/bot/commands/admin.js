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

// ===================== COMANDOS DE AYUDA =====================

const ayudaAdmin = async (ctx) => {
  if (ctx.from.id !== ADMIN_USER_ID) {
    return ctx.reply('Comando no autorizado');
  }
  
  const helpMessage = `📋 **COMANDOS DE ADMINISTRADOR**

**🤖 ROBOTS ASPIRADORES:**
/marcarrobot ASIN - Marcar producto como robot aspirador
/desmarcarrobot ASIN - Desmarcar robot aspirador  
/listarobots [página] - Ver robots aspiradores marcados
/forzaroferta ASIN - Publicar oferta manualmente

*Ejemplos:*
• \`/marcarrobot B0DCVYS9FQ\`
• \`/forzaroferta B0DCVYS9FQ\`
• \`/listarobots 2\`

**📢 COMUNICACIÓN MASIVA:**
/broadcast mensaje - Mensaje a todos los usuarios
/emailblast asunto|mensaje - Email masivo a usuarios

*Ejemplos:*
• \`/broadcast ¡Nueva función de ofertas automáticas disponible!\`
• \`/emailblast Ofertas Semanales|Hola, te traemos las mejores ofertas...\`

**💰 GESTIÓN DE PRECIOS:**
/agregarprecio ASIN precio "comentario" - Precio actual con oferta
/agregarhistorial ASIN DD/MM/YYYY precio "comentario" - Precio histórico
/forzarrevision ASIN - Verificación manual de producto

*Ejemplos:*
• \`/agregarprecio B0DCVYS9FQ 339.99 "Oferta Flash detectada"\`
• \`/agregarhistorial B0DCVYS9FQ 28/08/2025 449.00 "Precio anterior"\`
• \`/forzarrevision B0DCVYS9FQ\`

**🔧 GESTIÓN DE PRODUCTOS:**
/borrarproducto ASIN - Eliminar con confirmación
/corregirasins - Corregir ASINs faltantes
/corregirnombres - Corregir nombres faltantes masivamente
/recuperarproducto ASIN - Recuperar producto perdido
/sincronizarnombres - Sincronizar nombres ProductStats
/limpiarstats - Limpiar estadísticas huérfanas

*Ejemplos:*
• \`/borrarproducto B0DCVYS9FQ TOTAL CONFIRMAR\`
• \`/recuperarproducto B0DSL8QV7Q\`

**📊 IMPORTACIÓN MASIVA:**
/importarhistorial - Importar CSV o texto masivo
/importartexto - Instrucciones para texto masivo

*Ejemplo de importación por texto:*
\`\`\`
B0DCVYS9FQ 28/08/2025 339.99
B0DSL8QV7Q 27/08/2025 249.00
B0EXAMPLE1 26/08/2025 199.50
\`\`\`

**🔍 DIAGNÓSTICO:**
/diagnosticoasin ASIN - Análisis completo del producto
/testearalerta ASIN - Probar lógica de alertas
/forzarguardado ASIN precio - Recuperar historial perdido

*Ejemplos:*
• \`/diagnosticoasin B0DCVYS9FQ\`
• \`/testearalerta B0DCVYS9FQ\`
• \`/forzarguardado B0DCVYS9FQ 339.99\`

**📈 ANALYTICS:**
/stats - Dashboard completo de analytics
/resumenbot - Vista rápida y general del bot
/listaproductos [página] - Lista paginada productos
/listausuarios [página] - Lista paginada usuarios
/ayudaanalytics - Ayuda específica de analytics

*Ejemplos:*
• \`/stats\` - Dashboard completo
• \`/resumenbot\` - Vista rápida recomendada
• \`/listaproductos 3\` - Tercera página de productos

**📅 FORMATO DE FECHAS:** 
Siempre DD/MM/YYYY (ej: 28/08/2025)

**🚀 FLUJO TÍPICO PARA OFERTAS AUTOMÁTICAS:**
1. \`/marcarrobot B0DCVYS9FQ\` - Marcar como robot aspirador
2. El sistema detectará automáticamente bajadas de precio
3. Se publicarán ofertas automáticamente en @vacuumspain y @vacuumspain_ofertas
4. \`/forzaroferta B0DCVYS9FQ\` - Si quieres forzar una publicación manual

**💡 TIPS:**
• Usa \`/ayudaanalytics\` para comandos específicos de estadísticas
• Los comandos de comunicación masiva requieren confirmación
• Importa historial masivo enviando texto con múltiples líneas
• El diagnóstico te ayuda a encontrar productos con problemas`;

  ctx.replyWithMarkdown(helpMessage);
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

// También añadir comando para limpiar estadísticas huérfanas
// 4. COMPLETAR FUNCIÓN limpiarstats (reemplazar la existente)
const limpiarstats = async (ctx) => {
  if (ctx.from.id !== ADMIN_USER_ID) {
    return ctx.reply('Comando no autorizado');
  }
  
  const args = ctx.message.text.split(' ');
  const confirmacion = args[1] ? args[1].toUpperCase() : null;
  
  if (confirmacion === 'CONFIRMAR') {
    // EJECUTAR LIMPIEZA
    try {
      const { ProductStats } = require('../../models');
      
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
    const { ProductStats } = require('../../models');
    
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
// ===================== GESTIÓN DE PRODUCTOS =====================

const borrarProducto = async (ctx) => {
  if (ctx.from.id !== ADMIN_USER_ID) {
    return ctx.reply('Comando no autorizado');
  }
  
  const args = ctx.message.text.split(' ');
  if (args.length < 2) {
    return ctx.reply('Uso: /borrarproducto ASIN [TOTAL|DD/MM/YYYY] [CONFIRMAR]\n\nEjemplos:\n/borrarproducto B0DCVYS9FQ\n/borrarproducto B0DCVYS9FQ TOTAL CONFIRMAR\n/borrarproducto B0DCVYS9FQ 24/08/2025 CONFIRMAR');
  }
  
  const asin = args[1].toUpperCase();
  const tipoOperacion = args[2] ? args[2].toUpperCase() : null;
  const confirmacion = args[3] ? args[3].toUpperCase() : null;
  
  const esConfirmacion = (args.length === 3 && tipoOperacion === 'CONFIRMAR') || 
                        (args.length === 4 && confirmacion === 'CONFIRMAR');
  
  if (esConfirmacion) {
    // EJECUTAR ELIMINACIÓN
    try {
      const products = await Product.find({ asin: asin });
      
      if (products.length === 0) {
        return ctx.reply(`❌ No se encontraron productos con ASIN: ${asin}`);
      }
      
      let deletedHistory;
      let deletedProductStats = 0;
      let operacionTexto;
      
      if (tipoOperacion === 'TOTAL' || args.length === 3) {
        // Eliminar TODO incluyendo ProductStats
        await Product.deleteMany({ asin: asin });
        deletedHistory = await PriceHistory.deleteMany({ asin: asin });
        
        const { ProductStats } = require('../../models');
        const deletedStats = await ProductStats.deleteOne({ asin: asin });
        deletedProductStats = deletedStats.deletedCount;
        
        operacionTexto = 'TOTAL (completa con estadísticas)';
      } else {
        // Eliminar por fecha específica
        const fechaStr = tipoOperacion;
        const fechaInicio = parseSpanishDate(fechaStr);
        const fechaFin = new Date(fechaInicio);
        fechaFin.setHours(23, 59, 59, 999);
        
        deletedHistory = await PriceHistory.deleteMany({ 
          asin: asin,
          timestamp: { $gte: fechaInicio, $lte: fechaFin }
        });
        operacionTexto = `fecha ${fechaStr}`;
      }
      
      const deletedProducts = tipoOperacion === 'TOTAL' || args.length === 3 ? products.length : 0;
      
      ctx.reply(`✅ **Eliminación ${operacionTexto} completada**

📦 ASIN: \`${asin}\`
🗑️ Productos eliminados: **${deletedProducts}**
📊 Historial eliminado: **${deletedHistory.deletedCount}** registros
📈 Estadísticas eliminadas: **${deletedProductStats}**
${deletedProducts > 0 ? `👥 Usuarios afectados: ${[...new Set(products.map(p => p.user))].join(', ')}` : ''}

✨ Limpieza completa realizada`, { parse_mode: 'Markdown' });
      
    } catch (error) {
      ctx.reply(`❌ Error: ${error.message}`);
    }
  } else {
    // MOSTRAR CONFIRMACIÓN
    try {
      const products = await Product.find({ asin: asin });
      
      if (products.length === 0) {
        return ctx.reply(`❌ No se encontraron productos con ASIN: ${asin}`);
      }
      
      let historyCount;
      let operacionTexto;
      let comandoConfirmacion;
      
      const { ProductStats } = require('../../models');
      const statsCount = await ProductStats.countDocuments({ asin: asin });
      
      if (tipoOperacion === 'TOTAL' || !tipoOperacion) {
        historyCount = await PriceHistory.countDocuments({ asin: asin });
        operacionTexto = 'TODO (productos + historial + estadísticas)';
        comandoConfirmacion = `/borrarproducto ${asin} TOTAL CONFIRMAR`;
      } else {
        try {
          const fecha = parseSpanishDate(tipoOperacion);
          const fechaInicio = new Date(fecha);
          fechaInicio.setHours(0, 0, 0, 0);
          const fechaFin = new Date(fecha);
          fechaFin.setHours(23, 59, 59, 999);
          
          historyCount = await PriceHistory.countDocuments({ 
            asin: asin,
            timestamp: { $gte: fechaInicio, $lte: fechaFin }
          });
          operacionTexto = `historial del ${tipoOperacion}`;
          comandoConfirmacion = `/borrarproducto ${asin} ${tipoOperacion} CONFIRMAR`;
        } catch (dateError) {
          return ctx.reply(`❌ ${dateError.message}`);
        }
      }
      
      ctx.reply(`⚠️ **ADVERTENCIA: ELIMINACIÓN PERMANENTE**

📦 ASIN: \`${asin}\`
🗑️ Operación: **${operacionTexto}**
${tipoOperacion === 'TOTAL' || !tipoOperacion ? `🔢 Productos: **${products.length}**` : ''}
${tipoOperacion === 'TOTAL' || !tipoOperacion ? `👥 Usuarios: **${[...new Set(products.map(p => p.user))].length}**` : ''}
📊 Registros historial: **${historyCount}**
${tipoOperacion === 'TOTAL' || !tipoOperacion ? `📈 Estadísticas: **${statsCount}**` : ''}

**Para confirmar, escribe exactamente:**
\`${comandoConfirmacion}\`

⚠️ **Esta acción NO se puede deshacer**`, { parse_mode: 'Markdown' });
      
    } catch (error) {
      ctx.reply(`❌ Error: ${error.message}`);
    }
  }
};

const corregirasins = async (ctx) => {
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
    
    ctx.reply(`✅ **ASINs corregidos**

🔄 Productos encontrados sin ASIN: **${products.length}**
✅ ASINs corregidos exitosamente: **${updated}**
❌ No se pudo extraer ASIN: **${products.length - updated}**`, { parse_mode: 'Markdown' });
    
  } catch (error) {
    ctx.reply(`❌ Error: ${error.message}`);
  }
};

const recuperarproducto = async (ctx) => {
  if (ctx.from.id !== ADMIN_USER_ID) {
    return ctx.reply('Comando no autorizado');
  }
  
  const args = ctx.message.text.split(' ');
  if (args.length < 2) {
    return ctx.reply('Uso: /recuperarproducto ASIN\nEjemplo: /recuperarproducto B0DSL8QV7Q');
  }
  
  const asin = args[1].toUpperCase();
  
  try {
    const { Product, PriceHistory, ProductStats } = require('../../models');
    const paapiClient = require('../../amazon/paapi-client');
    
    // Verificar que no existe el producto
    const existingProduct = await Product.findOne({ asin: asin });
    if (existingProduct) {
      return ctx.reply(`⚠️ El producto ${asin} ya existe en la base de datos`);
    }
    
    // Buscar en estadísticas para obtener el usuario original
    const stats = await ProductStats.findOne({ asin: asin });
    if (!stats || stats.usersTracking.length === 0) {
      return ctx.reply(`❌ No se encontraron estadísticas para ${asin}`);
    }
    
    // Obtener información del producto desde PA-API
    const productInfo = await paapiClient.getProductInfo(asin);
    if (!productInfo || !productInfo.name) {
      return ctx.reply(`❌ No se pudo obtener información del producto ${asin} desde Amazon`);
    }
    
    // Obtener el último precio del historial
    const lastHistory = await PriceHistory.findOne({ asin: asin }).sort({ timestamp: -1 });
    const lastPrice = lastHistory ? lastHistory.price : productInfo.price || 0;
    
    // Recrear el producto para cada usuario que lo tenía
    let recoveredProducts = 0;
    
    for (const userTracking of stats.usersTracking) {
      const product = new Product({
        name: productInfo.name,
        url: `https://www.amazon.es/dp/${asin}`,
        asin: asin,
        user: userTracking.userId,
        price: lastPrice,
        currency: productInfo.currency || 'EUR',
        availability: productInfo.availability || 'Disponible',
        lastCheck: Math.floor(Date.now() / 1000),
        preferences: {
          targetPrice: 0,
          availabilityAlerts: false,
          alertType: 'percentage',
          discountPercent: 0
        }
      });
      
      await product.save();
      recoveredProducts++;
    }
    
    const message = `✅ **PRODUCTO RECUPERADO**\n\n` +
      `📦 ASIN: \`${asin}\`\n` +
      `🏷️ Nombre: ${productInfo.name.substring(0, 50)}...\n` +
      `💰 Precio: ${lastPrice}€\n` +
      `👥 Productos recreados: **${recoveredProducts}**\n` +
      `📊 Historial: ${await PriceHistory.countDocuments({ asin: asin })} registros\n\n` +
      `💡 El producto ha sido restaurado con la información original`;
    
    ctx.replyWithMarkdown(message);
    
  } catch (error) {
    console.error('Error recuperando producto:', error);
    ctx.reply(`❌ Error: ${error.message}`);
  }
};


const corregirnombres = async (ctx) => {
  if (ctx.from.id !== ADMIN_USER_ID) {
    return ctx.reply('Comando no autorizado');
  }
  
  try {
    const { Product, ProductStats } = require('../../models');
    const paapiClient = require('../../amazon/paapi-client');
    
    // Buscar productos sin nombre
    const productsWithoutName = await Product.find({
      $or: [
        { name: { $exists: false } },
        { name: null },
        { name: '' },
        { name: 'Producto sin nombre' }
      ]
    }).limit(20); // Procesar máximo 20 por vez para no saturar la API
    
    if (productsWithoutName.length === 0) {
      return ctx.reply('✅ No se encontraron productos sin nombre');
    }
    
    let message = `🔧 **CORRECCIÓN DE NOMBRES**\n\n`;
    message += `📦 Productos encontrados: **${productsWithoutName.length}**\n\n`;
    
    let fixed = 0;
    let errors = 0;
    
    for (const product of productsWithoutName) {
      try {
        console.log(`Corrigiendo ASIN: ${product.asin}`);
        
        // Obtener información actualizada del producto
        const productInfo = await paapiClient.getProductInfo(product.asin);
        
        if (productInfo && productInfo.name) {
          // Actualizar producto
          await Product.findByIdAndUpdate(product._id, {
            name: productInfo.name,
            price: productInfo.price || product.price,
            currency: productInfo.currency || product.currency,
            availability: productInfo.availability || product.availability
          });
          
          // Actualizar también ProductStats si existe
          await ProductStats.findOneAndUpdate(
            { asin: product.asin },
            { productName: productInfo.name },
            { upsert: false }
          );
          
          const shortName = productInfo.name.length > 50 ? 
            productInfo.name.substring(0, 47) + '...' : 
            productInfo.name;
          
          message += `✅ ${product.asin}: ${shortName}\n`;
          fixed++;
        } else {
          message += `❌ ${product.asin}: Sin información disponible\n`;
          errors++;
        }
        
        // Pausa para no saturar la API
        await new Promise(resolve => setTimeout(resolve, 300));
        
      } catch (error) {
        console.error(`Error procesando ${product.asin}:`, error.message);
        message += `❌ ${product.asin}: Error de API\n`;
        errors++;
      }
    }
    
    message += `\n📊 **RESUMEN:**\n`;
    message += `✅ Corregidos: **${fixed}**\n`;
    message += `❌ Errores: **${errors}**\n`;
    
    if (fixed > 0) {
      message += `\n💡 Ejecuta /listaproductos para verificar los cambios`;
    }
    
    if (productsWithoutName.length >= 20) {
      message += `\n\n🔄 Puede haber más productos. Ejecuta el comando de nuevo.`;
    }
    
    ctx.replyWithMarkdown(message);
    
  } catch (error) {
    console.error('Error en corregirnombres:', error);
    ctx.reply(`❌ Error: ${error.message}`);
  }
};


// ===================== IMPORTACIÓN MASIVA UNIFICADA =====================

const importarhistorial = async (ctx) => {
  if (ctx.from.id !== ADMIN_USER_ID) {
    return ctx.reply('Comando no autorizado');
  }
  
  const helpMessage = `📥 **IMPORTACIÓN MASIVA DE HISTORIAL**

**OPCIÓN 1: Archivo CSV**
Envía archivo .csv con formato:
\`ASIN,DD/MM/YYYY,precio\`

Ejemplo archivo CSV:
\`\`\`
B0DCVYS9FQ,23/08/2025,449.00
B0D9YHVZKS,22/08/2025,299.99
B0DBL9C6JY,21/08/2025,1199.00
\`\`\`

**OPCIÓN 2: Texto masivo**
Usa /importartexto para enviar múltiples precios en un mensaje

**NOTAS IMPORTANTES:**
• Siempre formato español: DD/MM/YYYY
• Precio con punto decimal: 449.00
• Una entrada por línea
• Sin espacios extra ni caracteres raros`;

  ctx.replyWithMarkdown(helpMessage);
};

const importartexto = async (ctx) => {
  if (ctx.from.id !== ADMIN_USER_ID) {
    return ctx.reply('Comando no autorizado');
  }
  
  const helpMessage = `📝 **IMPORTACIÓN POR TEXTO MASIVO**

Envía precios en formato texto, uno por línea:
\`ASIN DD/MM/YYYY precio\`

**Ejemplo de mensaje para enviar:**
\`\`\`
B0DCVYS9FQ 23/08/2025 449.00
B0D9YHVZKS 22/08/2025 299.99
B0DBL9C6JY 21/08/2025 1199.00
\`\`\`

Después envía ese texto directamente y será procesado automáticamente.

**FORMATO REQUERIDO:**
• ASIN (10 caracteres)
• Fecha DD/MM/YYYY
• Precio con decimales
• Separados por espacios`;

  ctx.replyWithMarkdown(helpMessage);
};

const procesarImportacionMasiva = async (ctx) => {
  if (ctx.from.id !== ADMIN_USER_ID) return;
  
  let datos = [];
  let isCSV = false;
  
  // Determinar si es CSV o texto
  if (ctx.message.document) {
    if (!ctx.message.document.file_name?.endsWith('.csv') && ctx.message.document.mime_type !== 'text/csv') {
      return ctx.reply('❌ El archivo debe ser CSV (.csv)');
    }
    
    try {
      const fileLink = await ctx.telegram.getFileLink(ctx.message.document.file_id);
      const response = await fetch(fileLink.href);
      const content = await response.text();
      datos = content.trim().split('\n');
      isCSV = true;
    } catch (error) {
      return ctx.reply(`❌ Error leyendo archivo: ${error.message}`);
    }
  } else if (ctx.message.text) {
    const texto = ctx.message.text.trim();
    datos = texto.split('\n');
    
    // Validar que sea formato de importación
    let formatoValido = 0;
    for (const line of datos) {
      const parts = line.trim().split(/[\s,]+/);
      if (parts.length === 3 && 
          parts[0].match(/^[A-Z0-9]{10}$/) && 
          (parts[1].match(/^\d{1,2}\/\d{1,2}\/\d{4}$/) || parts[1].match(/^\d{4}-\d{2}-\d{2}$/)) && 
          !isNaN(parseFloat(parts[2]))) {
        formatoValido++;
      }
    }
    
    if (formatoValido < datos.length * 0.8) return; // No es importación masiva
  } else {
    return;
  }
  
  await ctx.reply('📥 Procesando importación masiva...');
  
  const results = { processed: 0, errors: 0, details: [] };
  
  for (let i = 0; i < datos.length; i++) {
    const line = datos[i].trim();
    if (!line) continue;
    
    try {
      let parts;
      if (isCSV) {
        parts = line.split(',').map(p => p.trim());
      } else {
        parts = line.split(/\s+/);
      }
      
      if (parts.length !== 3) {
        throw new Error('Formato incorrecto, se requieren 3 campos');
      }
      
      const [asin, fecha, precioStr] = parts;
      const precio = parseFloat(precioStr);
      
      // Validaciones
      if (!asin || asin.length !== 10) {
        throw new Error(`ASIN inválido: ${asin}`);
      }
      
      if (isNaN(precio) || precio <= 0) {
        throw new Error(`Precio inválido: ${precioStr}`);
      }
      
      // Convertir fecha (soportar ambos formatos)
      let timestamp;
      if (fecha.includes('/')) {
        timestamp = parseSpanishDate(fecha); // DD/MM/YYYY
      } else {
        // YYYY-MM-DD
        const [year, month, day] = fecha.split('-');
        timestamp = new Date(year, month - 1, day, 12, 0, 0);
      }
      
      if (isNaN(timestamp.getTime())) {
        throw new Error(`Fecha inválida: ${fecha}`);
      }
      
      // Crear registro
      await PriceHistory.create({
        asin: asin.toUpperCase(),
        price: precio,
        previousPrice: 0,
        timestamp: timestamp,
        currency: '€',
        comment: 'Importado masivamente'
      });
      
      results.processed++;
      
    } catch (error) {
      results.errors++;
      if (results.details.length < 10) {
        results.details.push(`Línea ${i + 1}: ${error.message}`);
      }
    }
  }
  
  // Respuesta con resultados
  let message = `📊 **IMPORTACIÓN COMPLETADA**\n\n`;
  message += `✅ Procesados: **${results.processed}**\n`;
  message += `❌ Errores: **${results.errors}**\n\n`;
  
  if (results.details.length > 0) {
    message += `📋 **Errores encontrados:**\n`;
    results.details.forEach(detail => {
      message += `• ${detail}\n`;
    });
    
    if (results.errors > results.details.length) {
      message += `• ... y ${results.errors - results.details.length} errores más\n`;
    }
  }
  
  if (results.processed > 0) {
    message += `\n💡 **Tip:** Usa /forzarrevision ASIN para cada producto actualizado`;
  }
  
  ctx.replyWithMarkdown(message);
};

// ===================== DIAGNÓSTICO =====================

const diagnosticoasin = async (ctx) => {
  if (ctx.from.id !== ADMIN_USER_ID) {
    return ctx.reply('Comando no autorizado');
  }
  
  const args = ctx.message.text.split(' ');
  if (args.length < 2) {
    return ctx.reply('Uso: /diagnosticoasin ASIN\nEjemplo: /diagnosticoasin B0DCVYS9FQ');
  }
  
  const asin = args[1].toUpperCase();
  
  try {
    const { Product, PriceHistory, ProductStats } = require('../../models');
    
    const [products, history, stats] = await Promise.all([
      Product.find({ asin: asin }),
      PriceHistory.find({ asin: asin }).sort({ timestamp: -1 }).limit(10),
      ProductStats.findOne({ asin: asin })
    ]);
    
    let message = `🔍 **DIAGNÓSTICO: ${asin}**\n\n`;
    
    // Productos activos
    message += `📦 **PRODUCTOS ACTIVOS:** ${products.length}\n`;
    for (const product of products) {
      message += `  • Usuario: ${product.user}\n`;
      message += `  • Precio: ${product.price}€\n`;
      message += `  • Verificado: ${new Date(product.lastCheck * 1000).toLocaleString('es-ES')}\n`;
      message += `  • Alerta: ${product.preferences?.alertType || 'no configurado'}\n`;
      message += `  • Objetivo: ${product.preferences?.targetPrice || 'no configurado'}€\n\n`;
    }
    
    // Historial
    message += `📊 **HISTORIAL:** ${history.length} registros\n`;
    for (const record of history) {
      message += `  • ${record.timestamp.toLocaleDateString('es-ES')}: ${record.price}€`;
      if (record.comment) message += ` (${record.comment})`;
      message += '\n';
    }
    
    if (history.length === 0) {
      message += `  ❌ **SIN HISTORIAL** - Causa probable del problema\n`;
    }
    message += '\n';
    
    // Estadísticas
    if (stats) {
      message += `📈 **ESTADÍSTICAS:**\n`;
      message += `  • Usuarios: ${stats.totalTrackers}\n`;
      message += `  • Alertas: ${stats.totalAlerts}\n`;
      message += `  • API calls: ${stats.apiCalls}\n`;
      message += `  • Errores: ${stats.apiErrors}\n\n`;
    } else {
      message += `📈 **ESTADÍSTICAS:** No encontradas\n\n`;
    }
    
    // Análisis
    message += `🔬 **ANÁLISIS:**\n`;
    if (products.length === 0) {
      message += `❌ Sin productos activos\n`;
    } else if (history.length === 0) {
      message += `❌ **PROBLEMA:** Sin historial de precios\n`;
      message += `💡 **SOLUCIÓN:** Usar /forzarguardado ${asin} [precio]\n`;
    } else if (history.length === 1) {
      message += `⚠️ Solo 1 registro - no puede comparar cambios\n`;
      message += `💡 Necesita al menos 2 registros para detectar alertas\n`;
    } else {
      message += `✅ Historial correcto - revisar configuración alertas\n`;
    }
    
    ctx.replyWithMarkdown(message);
    
  } catch (error) {
    ctx.reply(`❌ Error: ${error.message}`);
  }
};

const forzarguardado = async (ctx) => {
  if (ctx.from.id !== ADMIN_USER_ID) {
    return ctx.reply('Comando no autorizado');
  }
  
  const args = ctx.message.text.split(' ');
  if (args.length < 3) {
    return ctx.reply('Uso: /forzarguardado ASIN precio\nEjemplo: /forzarguardado B0DCVYS9FQ 449.00');
  }
  
  const asin = args[1].toUpperCase();
  const precio = parseFloat(args[2]);
  
  if (isNaN(precio) || precio <= 0) {
    return ctx.reply('❌ Precio inválido');
  }
  
  try {
    const ayer = new Date();
    ayer.setDate(ayer.getDate() - 1);
    ayer.setHours(12, 0, 0, 0);
    
    await PriceHistory.create({
      asin: asin,
      price: precio,
      previousPrice: 0,
      timestamp: ayer,
      currency: '€',
      comment: 'Precio forzado para recuperar historial'
    });
    
    ctx.reply(`✅ **Precio guardado forzadamente**

📦 ASIN: \`${asin}\`
💰 Precio: **${precio}€**
📅 Fecha: **${ayer.toLocaleDateString('es-ES')}**
📝 Motivo: Recuperación de historial perdido

🔄 **Siguiente paso:** /forzarrevision ${asin}`, { parse_mode: 'Markdown' });
    
  } catch (error) {
    ctx.reply(`❌ Error: ${error.message}`);
  }
};

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
      
      if (product.preferences?.targetPrice) {
        message += `🎯 Precio objetivo: ${product.preferences.targetPrice}€\n`;
      }
      
      // Simulación de precios
      const testPrices = [
        product.price - 10,  // -10€
        product.price - 5,   // -5€  
        product.price - 1,   // -1€
        product.price + 1    // +1€
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
    
    const [totalProducts, totalUsers, basicStats] = await Promise.all([
      Product.countDocuments({}),
      UserStats.countDocuments({}),
      AnalyticsService.getBasicStats()
    ]);

    const dashboard = `🔥 **VS PrecioBot Dashboard**

📊 **ESTADÍSTICAS GENERALES**
• Productos trackeados: **${totalProducts}**
• Usuarios registrados: **${totalUsers}**
• Alertas enviadas: **${basicStats.totalAlerts}**

Sistema funcionando correctamente.

💡 **Comandos detallados:**
• /listaproductos - Ver productos
• /listausuarios - Ver usuarios
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

// 3. COMPLETAR FUNCIÓN emailblast (reemplazar la existente)
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

// ===================== OFERTAS MANUALES =====================

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

const resumenbot = async (ctx) => {
  if (ctx.from.id !== ADMIN_USER_ID) {
    return ctx.reply('Comando no autorizado');
  }

  try {
    const { UserStats, ProductStats, Product } = require('../../models');
    
    const [totalUsers, totalProducts, activeUsers] = await Promise.all([
      UserStats.countDocuments({}),
      Product.countDocuments({}),
      UserStats.countDocuments({
        lastActivity: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
      })
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
    message += `• \`/stats\` - Dashboard completo`;

    ctx.replyWithMarkdown(message);

  } catch (error) {
    ctx.reply('❌ Error generando resumen');
  }
};

// ===================== LISTENERS AUTOMÁTICOS =====================

// Listener automático para importación masiva
const procesarMensajeAdmin = async (ctx, next) => {
  if (ctx.from.id === ADMIN_USER_ID) {
    // Procesamiento automático de CSV y texto masivo
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
  
  marcarrobot,
  desmarcarrobot,
  listarobots,
  broadcast,
  emailblast,
  forzaroferta,

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
