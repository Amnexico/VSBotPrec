'use strict';
const { Telegraf, Scenes, Markup } = require('telegraf');
const LocalSession = require('telegraf-session-local');
const scenes = require('./scenes');
const commands = require('./commands');
const actions = require('./actions');
const adminCommands = require('./commands/admin');
const errorHandler = require('./error-handler');
const { Product, PriceHistory, UserSettings } = require('../models');
const EmailService = require('../services/email-service');

// Función helper que necesitas definir (añadir después de los imports)
function escapeMarkdown(text) {
  if (!text) return '';
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

const stage = new Scenes.Stage(Object.values(scenes));
const session = new LocalSession();

// Menú principal mejorado
const welcomeMessage = '🤖 *VS PrecioBot*\n\n' +
 'Alertas de ofertas en Amazon e historial de precios. ' +
 'Recibe notificaciones cuando baje el precio de tus productos favoritos.\n\n' +
 '¿Qué quieres hacer?';

const mainMenuKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('➕ Añadir Producto', 'menu_add_product')],
  [Markup.button.callback('📋 Mis productos', 'menu_my_products')],
  [Markup.button.callback('❓ Ayuda', 'menu_help')]
]);

class Bot extends Telegraf {
 constructor(token, options) {
   super(token, options);
   this.use(session.middleware());
   this.use(stage.middleware());
   
   // Middleware para analytics
   this.use(async (ctx, next) => {
     if (ctx.from && ctx.from.id !== 615957202) { // No para admin
       const AnalyticsService = require('../services/analytics-service');
       const command = ctx.updateType === 'message' ? 
         (ctx.message.text?.split(' ')[0] || 'message') : ctx.updateType;
       
       await AnalyticsService.trackUserActivity(ctx.from.id, command, {
         username: ctx.from.username,
         firstName: ctx.from.first_name,
         lastName: ctx.from.last_name
       });
     }
     
     return next();
   });
   
   this.catch(errorHandler);

// MIDDLEWARE DE VERIFICACIÓN - MÁXIMA PRIORIDAD
this.use(async (ctx, next) => {
  const text = ctx.message?.text;
  if (text && text.match(/^\/start verify_(\d+)$/)) {
    const match = text.match(/^\/start verify_(\d+)$/);
    const verifyUserId = parseInt(match[1]);
    const currentUserId = ctx.from.id;
    
    console.log('MIDDLEWARE VERIFICACIÓN:', verifyUserId, currentUserId);
    
    if (verifyUserId === currentUserId) {
      try {
        const userSettings = await UserSettings.findOne({ userId: verifyUserId });
        if (userSettings?.email && !userSettings.emailVerified) {
          userSettings.emailVerified = true;
          userSettings.emailVerifiedDate = new Date();
          await userSettings.save();
          return ctx.reply(`Email verificado correctamente: ${userSettings.email}`);
        }
      } catch (error) {
        console.error('Error verificando:', error);
      }
    }
    return;
  }
  return next();
});

// Logging para debug
this.use((ctx, next) => {
  if (ctx.message?.text) {
    console.log('MENSAJE RECIBIDO:', ctx.message.text);
  }
  return next();
});
  
   // Comando start con menú
   this.command('start', (ctx) => {
  // Solo procesar si NO tiene parámetros
  const text = ctx.message.text;
  if (text === '/start') {
    return ctx.replyWithMarkdown(welcomeMessage, mainMenuKeyboard);
  }
  // Si tiene parámetros, dejar que otros handlers lo procesen
});
   
   // Comandos nuevos traducidos
   this.command('alerta', commands.track);
   this.command('lista', commands.list);
   this.command('ayuda', this.showHelp.bind(this));
   
   // Mantener comandos antiguos por compatibilidad
   this.command('track', commands.track);
   this.command('list', commands.list);
   
   // Comandos de administrador - SECCIÓN CORREGIDA
   this.command('ayudaadmin', adminCommands.ayudaAdmin);
   this.command('ayudaanalytics', adminCommands.ayudaanalytics);
   
   // Gestión de precios
   this.command('agregarprecio', adminCommands.agregarPrecio);
   this.command('agregarhistorial', adminCommands.agregarHistorial);
   this.command('forzarrevision', adminCommands.forzarRevision);
   
   // Gestión de productos
   this.command('borrarproducto', adminCommands.borrarProducto);
   this.command('corregirasins', adminCommands.corregirasins);
   
   // Importación masiva
   this.command('importarhistorial', adminCommands.importarhistorial);
   this.command('importartexto', adminCommands.importartexto);
   
   // Diagnóstico
   this.command('diagnosticoasin', adminCommands.diagnosticoasin);
   this.command('forzarguardado', adminCommands.forzarguardado);
   this.command('testearalerta', adminCommands.testearalerta);
   this.command('corregirnombres', adminCommands.corregirnombres);
   this.command('recuperarproducto', adminCommands.recuperarproducto);
   this.command('sincronizarnombres', adminCommands.sincronizarnombres);
   this.command('limpiarstats', adminCommands.limpiarstats);
   
   // Analytics
   this.command('stats', adminCommands.stats);
   this.command('listaproductos', adminCommands.listaproductos);
   this.command('listausuarios', adminCommands.listausuarios);
   this.command('resumenbot', adminCommands.resumenbot);
  
   // Comando para mostrar menú manualmente
   this.command('menu', (ctx) => ctx.replyWithMarkdown(welcomeMessage, mainMenuKeyboard));

   // Comando email
   this.command('email', require('./commands/email'));
   
   // HANDLER DE TEXTO COMBINADO (CORRIGE EL CONFLICTO)
   this.on('text', async (ctx, next) => {
     const text = ctx.message.text;
     const userId = ctx.from.id;
     
console.log('DEBUG - texto:', JSON.stringify(text));
console.log('DEBUG - startsWith check:', text.startsWith('/start verify_'));
     // PRIMERO: Handler de verificación de email
     if (text && text.startsWith('/start verify_')) {
       console.log('VERIFICACIÓN DETECTADA:', text);
       const match = text.match(/^\/start verify_(.+)$/);
       if (match) {
         const verifyUserId = parseInt(match[1]);
         console.log('Verify ID:', verifyUserId, 'Current ID:', userId);
         
         if (verifyUserId !== userId) {
           return ctx.reply('Este enlace no es válido para tu cuenta.');
         }
         
         try {
           const userSettings = await UserSettings.findOne({ userId: verifyUserId });
           if (userSettings && userSettings.email && !userSettings.emailVerified) {
             userSettings.emailVerified = true;
             userSettings.emailVerifiedDate = new Date();
             await userSettings.save();
             
             return ctx.reply(`🎉 Email verificado correctamente!\n\n✅ ${userSettings.email}\n\nUsa /email para gestionar tu configuración.`);
           } else if (userSettings && userSettings.emailVerified) {
             return ctx.reply(`✅ Tu email ya estaba verificado: ${userSettings.email}`);
           } else {
             return ctx.reply('No se encontró configuración de email para verificar.');
           }
         } catch (error) {
           console.error('Error verificando email:', error);
           return ctx.reply('Error procesando la verificación.');
         }
       }
       return;
     }
     
     // 1. SEGUNDO: Procesamiento de importación masiva para admin
     if (userId === 615957202) {
       // Detectar si es texto de importación masiva
       const lines = text.trim().split('\n');
       if (lines.length >= 2) {
         let formatoValido = 0;
         for (const line of lines) {
           const parts = line.trim().split(/[\s,]+/);
           if (parts.length === 3 && 
               parts[0].match(/^[A-Z0-9]{10}$/) && 
               (parts[1].match(/^\d{1,2}\/\d{1,2}\/\d{4}$/) || parts[1].match(/^\d{4}-\d{2}-\d{2}$/)) && 
               !isNaN(parseFloat(parts[2]))) {
             formatoValido++;
           }
         }
         
         // Si al menos 80% son líneas válidas de importación, procesar
         if (formatoValido >= lines.length * 0.8) {
           await adminCommands.procesarImportacionMasiva(ctx);
           return; // Importante: detener procesamiento
         }
       }
     }
     
     // 2. TERCERO: Si es comando, continuar normal
     if (text.startsWith('/')) {
       return next();
     }
     
     // 3. CUARTO: Si está en escena, continuar normal
     if (ctx.scene && ctx.scene.current) {
       return next();
     }
     
     // 4. QUINTO: Solo funcionar en chats privados
     if (ctx.chat.type !== 'private') {
       return next();
     }
     
     // 5. SEXTO: Verificar si es usuario nuevo
     const hasProducts = await Product.exists({ user: userId });
     
     if (!hasProducts) {
       // Usuario nuevo - mostrar menú de bienvenida
       const welcomeText = '¡Hola! Soy VS PrecioBot 👋\n\n' +
         'Te ayudo a seguir precios de Amazon y te aviso cuando bajan.\n\n' +
         '¿Qué quieres hacer?';
       
       return ctx.replyWithMarkdown(welcomeText, mainMenuKeyboard);
     }
     
     // 6. FINALMENTE: Usuario existente - no hacer nada
     return next();
   });
   
   // HANDLER DE DOCUMENTOS PARA ADMIN
   this.on('document', async (ctx) => {
     const userId = ctx.from.id;
     
     // Solo procesar documentos del admin
     if (userId !== 615957202) return;
     
     const document = ctx.message.document;
     
     // Solo procesar archivos CSV
     if (!document.file_name?.endsWith('.csv') && document.mime_type !== 'text/csv') return;
     
     // Procesar CSV usando la función de importación masiva
     await adminCommands.procesarImportacionMasiva(ctx);
   });
   
   // ACCIONES DEL MENÚ PRINCIPAL
   this.action('menu_add_product', (ctx) => {
     ctx.answerCbQuery();
     ctx.scene.enter('add-product');
   });

this.action('menu_my_products', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    const user = ctx.from.id;
    
    // Contar productos totales
    const totalProducts = await Product.countDocuments({ user: user });
    
    if (totalProducts === 0) {
      return ctx.editMessageText('Tu lista de productos está vacía.\n\n¿Quieres añadir el primer producto?', {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('➕ Añadir Producto', 'menu_add_product')],
          [Markup.button.callback('🔙 Volver al menú', 'menu_main')]
        ])
      });
    }
    
    // Si hay pocos productos (≤5), usar la función original
    if (totalProducts <= 5) {
      const products = await Product.find({ user: user });
      const listText = '📋 *LISTA DE PRODUCTOS*\n\nSelecciona un producto para configurar o ver detalles:';
      return ctx.editMessageText(listText, {
        parse_mode: 'Markdown',
        ...this.createProductListKeyboard(products)
      });
    }
    
    // Si hay muchos productos, usar vista paginada
    const PRODUCTS_PER_PAGE = 6;
    const page = 1;
    const totalPages = Math.ceil(totalProducts / PRODUCTS_PER_PAGE);
    const skip = (page - 1) * PRODUCTS_PER_PAGE;
    
    // Obtener solo los primeros productos
    const products = await Product.find({ user: user })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(PRODUCTS_PER_PAGE)
      .select('name price currency preferences createdAt');
    
    // Crear mensaje
    let message = `📋 **MIS PRODUCTOS** (${totalProducts} total)\\n`;
    message += `📄 Página ${page}/${totalPages} | Mostrando ${products.length}\\n\\n`;
    
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
    
    // Navegación si hay más páginas
    if (totalPages > 1) {
      const navRow = [];
      if (page > 1) {
        navRow.push(Markup.button.callback('⬅️ Anterior', `!menu_page=${page - 1}`));
      }
      navRow.push(Markup.button.callback(`${page}/${totalPages}`, 'noop'));
      if (page < totalPages) {
        navRow.push(Markup.button.callback('Siguiente ➡️', `!menu_page=${page + 1}`));
      }
      buttons.push(navRow);
    }
    
    // Botón de menú
    buttons.push([Markup.button.callback('🔙 Volver al menú', 'menu_main')]);
    
    // Enviar respuesta
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard(buttons)
    });
    
  } catch (error) {
    console.error('Error en menu_my_products:', error);
    ctx.editMessageText('❌ Error al cargar productos. Usa /lista para ver tus productos.', {
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🔙 Volver al menú', 'menu_main')]
      ])
    });
  }
});

   // ACCIONES PARA CONFIGURACIÓN DE EMAIL
   this.action('email_setup', async (ctx) => {
     await ctx.answerCbQuery();
     await ctx.scene.enter('setup-email');
   });

   this.action('email_enable', async (ctx) => {
     await ctx.answerCbQuery();
     
     const userSettings = await UserSettings.findOne({ userId: ctx.from.id });
     if (!userSettings || !userSettings.email) {
       return ctx.editMessageText('Primero configura un email con /email tu@email.com');
     }
     
     userSettings.emailNotifications = true;
     await userSettings.save();
     
     ctx.editMessageText(`✅ Notificaciones por email activadas para: ${userSettings.email}`, {
       ...Markup.inlineKeyboard([
         [Markup.button.callback('🔙 Volver', 'show_email_menu')]
       ])
     });
   });

   this.action('email_disable', async (ctx) => {
     await ctx.answerCbQuery();
     
     const userSettings = await UserSettings.findOne({ userId: ctx.from.id });
     if (userSettings) {
       userSettings.emailNotifications = false;
       await userSettings.save();
     }
     
     ctx.editMessageText('❌ Notificaciones por email desactivadas\n\n📱 Seguirás recibiendo notificaciones por Telegram', {
       ...Markup.inlineKeyboard([
         [Markup.button.callback('🔙 Volver', 'show_email_menu')]
       ])
     });
   });

   this.action('email_change', async (ctx) => {
     await ctx.answerCbQuery();
     await ctx.scene.enter('setup-email');
   });

this.action(/^!menu_page=(\d+)$/, async (ctx) => {
  const page = parseInt(ctx.match[1]);
  const user = ctx.from.id;
  
  try {
    await ctx.answerCbQuery();
    
    const totalProducts = await Product.countDocuments({ user: user });
    const PRODUCTS_PER_PAGE = 6;
    const totalPages = Math.ceil(totalProducts / PRODUCTS_PER_PAGE);
    const skip = (page - 1) * PRODUCTS_PER_PAGE;
    
    const products = await Product.find({ user: user })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(PRODUCTS_PER_PAGE)
      .select('name price currency preferences createdAt');
    
    let message = `📋 **MIS PRODUCTOS** (${totalProducts} total)\\n`;
    message += `📄 Página ${page}/${totalPages} | Mostrando ${products.length}\\n\\n`;
    
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
    
    const buttons = [];
    products.forEach(product => {
      const displayName = product.name ? 
        (product.name.length > 20 ? product.name.substring(0, 17) + '...' : product.name) :
        'Sin nombre';
      
      buttons.push([Markup.button.callback(
        `📦 ${displayName}`,
        `!menu=${product._id}`
      )]);
    });
    
    if (totalPages > 1) {
      const navRow = [];
      if (page > 1) {
        navRow.push(Markup.button.callback('⬅️ Anterior', `!menu_page=${page - 1}`));
      }
      navRow.push(Markup.button.callback(`${page}/${totalPages}`, 'noop'));
      if (page < totalPages) {
        navRow.push(Markup.button.callback('Siguiente ➡️', `!menu_page=${page + 1}`));
      }
      buttons.push(navRow);
    }
    
    buttons.push([Markup.button.callback('🔙 Volver al menú', 'menu_main')]);
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard(buttons)
    });
    
  } catch (error) {
    console.error('Error navegando menú:', error);
    ctx.answerCbQuery('Error al cargar página', true);
  }
});

// Handler para navegación de páginas en /lista
this.action(/^!list_page=(\d+)$/, async (ctx) => {
  const page = parseInt(ctx.match[1]);
  const user = ctx.from.id;
  
  try {
    await ctx.answerCbQuery();
    
    const totalProducts = await Product.countDocuments({ user: user });
    const PRODUCTS_PER_PAGE = 6;
    const totalPages = Math.ceil(totalProducts / PRODUCTS_PER_PAGE);
    const skip = (page - 1) * PRODUCTS_PER_PAGE;
    
    const products = await Product.find({ user: user })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(PRODUCTS_PER_PAGE)
      .select('name price currency preferences createdAt');
    
    // MENSAJE SIMPLIFICADO
    let message = `📋 **MIS PRODUCTOS** (${totalProducts} total)\\n`;
    message += `📄 Página ${page}/${totalPages}\\n\\n`;
    message += `Selecciona un producto:`;
    
    const buttons = [];
    
    // BOTONES MÁS LARGOS
    products.forEach((product, index) => {
      const num = skip + index + 1;
      
      const displayName = product.name ? 
        (product.name.length > 45 ? product.name.substring(0, 42) + '...' : product.name) :
        'Sin nombre';
      
      const price = product.price || 0;
      const currency = product.currency || '€';
      
      // FORMATO: Número + Precio + Nombre largo
      const buttonText = `${num}. ${price}${currency} - ${displayName}`;
      
      buttons.push([Markup.button.callback(
        buttonText,
        `!menu=${product._id}`
      )]);
    });
    
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
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard(buttons)
    });
    
  } catch (error) {
    console.error('Error navegando lista:', error);
    ctx.answerCbQuery('Error al cargar página', true);
  }
});

// Handler para botón de página actual
this.action('noop', (ctx) => {
  ctx.answerCbQuery();
});

function createProductListKeyboard(products, page, totalPages) {
  const buttons = [];
  
  // Botones de productos
  products.forEach(product => {
    const displayName = product.name && product.name.length > 25 ? 
      product.name.substring(0, 22) + '...' : 
      (product.name || 'Producto sin nombre');
    
    buttons.push([Markup.button.callback(
      `📦 ${displayName}`, 
      `!menu=${product._id}`
    )]);
  });
  
  // Navegación
  if (totalPages > 1) {
    const navButtons = [];
    
    if (page > 1) {
      navButtons.push(Markup.button.callback('⬅️ Anterior', `!list_page=${page - 1}`));
    }
    
    navButtons.push(Markup.button.callback(`📄 ${page}/${totalPages}`, 'noop'));
    
    if (page < totalPages) {
      navButtons.push(Markup.button.callback('Siguiente ➡️', `!list_page=${page + 1}`));
    }
    
    buttons.push(navButtons);
  }
  
  buttons.push([Markup.button.callback('🔙 Volver al menú', 'menu_main')]);
  
  return Markup.inlineKeyboard(buttons);
}

   this.action('show_email_menu', async (ctx) => {
  await ctx.answerCbQuery();
  
  // Obtener configuración del usuario
  const userId = ctx.from.id;
  let userSettings = await UserSettings.findOne({ userId });
  
  if (!userSettings) {
    userSettings = new UserSettings({
      userId: userId,
      emailNotifications: false,
      telegramNotifications: true
    });
    await userSettings.save();
  }
  
  // Mostrar menú email directamente
  const hasEmail = userSettings.email && userSettings.email.length > 0;
  const isEnabled = userSettings.emailNotifications;
  
  let message = '📧 *CONFIGURACIÓN DE EMAIL*\n\n';
  
  if (hasEmail) {
    message += `📧 Email: ${userSettings.email}\n`;
    message += `${userSettings.emailVerified ? '✅' : '⚠️'} ${userSettings.emailVerified ? 'Verificado' : 'Sin verificar'}\n`;
    message += `🔔 Notificaciones: ${isEnabled ? '✅ Activadas' : '❌ Desactivadas'}\n\n`;
    
    if (userSettings.lastEmailSent) {
      message += `📬 Último email: ${userSettings.lastEmailSent.toLocaleDateString('es-ES')}\n`;
    }
    
    if (userSettings.emailBounces > 0) {
      message += `⚠️ Errores de entrega: ${userSettings.emailBounces}\n`;
    }
  } else {
    message += 'Sin email configurado\n';
    message += '📱 Solo recibes notificaciones por Telegram\n\n';
  }
  
  message += '*Comandos disponibles:*\n';
  message += '`/email tu@email.com` - Configurar email\n';
  message += '`/email on` - Activar notificaciones\n';
  message += '`/email off` - Desactivar notificaciones\n';
  message += '`/email status` - Ver configuración';
  
  const buttons = [];
  
  if (hasEmail) {
    if (isEnabled) {
      buttons.push([Markup.button.callback('❌ Desactivar email', 'email_disable')]);
    } else {
      buttons.push([Markup.button.callback('✅ Activar email', 'email_enable')]);
    }
    buttons.push([Markup.button.callback('📝 Cambiar email', 'email_change')]);
  } else {
    buttons.push([Markup.button.callback('📧 Configurar email', 'email_setup')]);
  }
  
  buttons.push([Markup.button.callback('🔙 Volver al menú', 'menu_main')]);
  
  await ctx.editMessageText(message, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard(buttons)
  });
});
   
   this.action('menu_help', (ctx) => {
     ctx.answerCbQuery();
     const helpText = '📋 **GUÍA COMPLETA - VS PrecioBot**\n\n' +
       '🤖 Tu asistente para encontrar las mejores ofertas en Amazon España\n\n' +
       
       '**📍 FUNCIONES PRINCIPALES:**\n\n' +
       
       '🔹 **AÑADIR PRODUCTO** (`/alerta`)\n' +
       '• Envía cualquier enlace de Amazon España\n' +
       '• Funciona con enlaces normales y acortados\n' +
       '• El bot detecta automáticamente precio y disponibilidad\n' +
       '• Configura al instante el tipo de alerta que prefieres\n\n' +
       
       '🔹 **TIPOS DE ALERTAS DISPONIBLES:**\n' +
       '• **Descuento por porcentaje**: 5%, 10%, 15% o 20% de bajada\n' +
       '• **Precio personalizado**: Establece tu precio objetivo exacto\n' +
       '• **Cualquier bajada**: Te aviso en cuanto baje aunque sea 1 céntimo\n' +
       '• **Alerta de stock**: Solo cuando vuelva a estar disponible\n\n' +
       
       '🔹 **GESTIONAR PRODUCTOS** (`/lista`)\n' +
       '• Ve todos tus productos seguidos\n' +
       '• Cambia el tipo de alerta de cada producto\n' +
       '• Consulta estadísticas detalladas de precios\n' +
       '• Elimina productos que ya no te interesen\n\n' +
       
       '**⚡ COMANDOS RÁPIDOS:**\n' +
       '`/alerta` - Añadir nuevo producto\n' +
       '`/lista` - Ver y gestionar mis productos\n' +
       '`/menu` - Volver al menú principal\n' +
       '`/ayuda` - Mostrar esta guía\n\n' +
       
       '**🔗 ENLACES COMPATIBLES:**\n' +
       '• URLs completas de Amazon España\n' +
       '• Enlaces acortados (amzn.eu, amzn.to)\n' +
       '• Enlaces desde la app de Amazon\n\n' +
       
       '💡 **¿Problemas?** Asegúrate de que el enlace sea de Amazon España';
     
     ctx.editMessageText(helpText, {
       parse_mode: 'Markdown',
       ...Markup.inlineKeyboard([
         [Markup.button.callback('🔙 Volver al menú', 'menu_main')]
       ])
     });
   });
   
   this.action('menu_main', (ctx) => {
     ctx.answerCbQuery();
     ctx.editMessageText(welcomeMessage, {
       parse_mode: 'Markdown',
       ...mainMenuKeyboard
     });
   });
   
   this.action('!list', actions.list);
   this.action(/^!menu=(.+)$/, actions.menu);
   this.action(/^!remove\?id=(\w+)$/, actions.remove);
   this.action(/^!availability\?id=(\w+)&value=(\w+)$/, actions.availability);
   this.action(/^!price\?id=(\w+)$/, actions.price);
   this.action(/^!stats\?id=(\w+)/, actions.stats);
   
   // NUEVAS ACCIONES PARA BOTONES DE PORCENTAJE
   this.action(/^percent_(\d+)_(\w+)$/, (ctx) => {
     // Manejado en set-target-price scene
   });
   this.action(/^custom_price_(\w+)$/, (ctx) => {
     // Manejado en set-target-price scene
   });
   this.action(/^remove_price_(\w+)$/, (ctx) => {
     // Manejado en set-target-price scene
   });
   this.action(/^menu_(\w+)$/, (ctx) => {
     // Manejado en set-target-price scene
   });
   
   // NUEVAS ACCIONES PARA ALERTAS DE PRECIO
   this.action(/^update_target_(\w+)_(.+)$/, this.updateTarget.bind(this));
   this.action(/^delete_tracking_(\w+)$/, this.deleteTracking.bind(this));
   
   // Test email service al iniciar
   EmailService.testConnection()
     .then(result => {
       if (result.success) {
         console.log(`✅ Email service ready: ${result.provider}`);
       } else {
         console.warn(`⚠️ Email service failed: ${result.error}`);
       }
     })
     .catch(error => {
       console.error('❌ Email service error:', error.message);
     });
 }

 getTrendIcon(priceHistory) {
   if (priceHistory.length < 2) return '➡️ Sin datos suficientes';
   
   const recent = priceHistory[0].price;
   const previous = priceHistory[1].price;
   
   if (recent < previous) return '📉 Bajando';
   if (recent > previous) return '📈 Subiendo';
   return '➡️ Estable';
 }

 createProductListKeyboard(products) {
   const buttons = products.map(product => [
     Markup.button.callback(
       `${product.name.substring(0, 30)}... - ${product.price}${product.currency}`,
       `!menu=${product.id}`
     )
   ]);
   
   buttons.push([Markup.button.callback('🔙 Volver al menú', 'menu_main')]);
   
   return Markup.inlineKeyboard(buttons);
 }

 showHelp(ctx) {
   const helpText = '📋 **GUÍA COMPLETA - VS PrecioBot**\n\n' +
     '🤖 Tu asistente para encontrar las mejores ofertas en Amazon España\n\n' +
     
     '**📍 FUNCIONES PRINCIPALES:**\n\n' +
     
     '🔹 **AÑADIR PRODUCTO** (`/alerta`)\n' +
     '• Envía cualquier enlace de Amazon España\n' +
     '• Funciona con enlaces normales y acortados\n' +
     '• El bot detecta automáticamente precio y disponibilidad\n' +
     '• Configura al instante el tipo de alerta que prefieres\n\n' +
     
     '🔹 **TIPOS DE ALERTAS DISPONIBLES:**\n' +
     '• **Descuento por porcentaje**: 5%, 10%, 15% o 20% de bajada\n' +
     '• **Precio personalizado**: Establece tu precio objetivo exacto\n' +
     '• **Cualquier bajada**: Te aviso en cuanto baje aunque sea 1 céntimo\n' +
     '• **Alerta de stock**: Solo cuando vuelva a estar disponible\n\n' +
     
     '🔹 **GESTIONAR PRODUCTOS** (`/lista`)\n' +
     '• Ve todos tus productos seguidos\n' +
     '• Cambia el tipo de alerta de cada producto\n' +
     '• Consulta estadísticas detalladas de precios\n' +
     '• Elimina productos que ya no te interesen\n\n' +
     
     '**⚡ COMANDOS RÁPIDOS:**\n' +
     '`/alerta` - Añadir nuevo producto\n' +
     '`/lista` - Ver y gestionar mis productos\n' +
     '`/menu` - Volver al menú principal\n' +
     '`/ayuda` - Mostrar esta guía\n\n' +
     
     '**🔗 ENLACES COMPATIBLES:**\n' +
     '• URLs completas de Amazon España\n' +
     '• Enlaces acortados (amzn.eu, amzn.to)\n' +
     '• Enlaces desde la app de Amazon\n\n' +
     
     '💡 **¿Problemas?** Asegúrate de que el enlace sea de Amazon España';
   
   ctx.replyWithMarkdown(helpText, {
     ...Markup.inlineKeyboard([
       [Markup.button.callback('🔙 Volver al menú', 'menu_main')]
     ])
   });
 }

 async updateTarget(ctx) {
   const match = ctx.match;
   const asin = match[1];
   const newPrice = parseFloat(match[2]);
   
   try {
     await Product.findOneAndUpdate(
       { asin: asin, user: ctx.from.id }, 
       { 'preferences.targetPrice': newPrice }
     );
     ctx.answerCbQuery(`Precio objetivo actualizado a ${newPrice}€`);
   } catch (error) {
     ctx.answerCbQuery('Error al actualizar precio objetivo');
   }
 }

 async deleteTracking(ctx) {
   const asin = ctx.match[1];
   
   try {
     await Product.findOneAndDelete({ asin: asin, user: ctx.from.id });
     ctx.answerCbQuery('Producto eliminado del seguimiento');
   } catch (error) {
     ctx.answerCbQuery('Error al eliminar producto');
   }
 }

 sendMessage(user, message, extra) {
   if (extra) {
     this.telegram.sendMessage(user, message, extra);
   } else {
     this.telegram.sendMessage(user, message, { 
       parse_mode: 'Markdown'
     });
   }
 }
}

module.exports = Bot;








