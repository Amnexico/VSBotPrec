'use strict';
const { Telegraf, Scenes, Markup } = require('telegraf');
const LocalSession = require('telegraf-session-local');
const scenes = require('./scenes');
const commands = require('./commands');
const actions = require('./actions');
const adminCommands = require('./commands/admin');
const errorHandler = require('./error-handler');
const { Product, PriceHistory } = require('../models');

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
this.use(async (ctx, next) => {
  if (ctx.from && ctx.from.id !== 615957202) { // No trackear admin
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
   
   // Comando start con menú
   this.start(ctx => ctx.replyWithMarkdown(welcomeMessage, mainMenuKeyboard));
   
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
   
   // Analytics
   this.command('stats', adminCommands.stats);
   this.command('listaproductos', adminCommands.listaproductos);
   this.command('listausuarios', adminCommands.listausuarios);
   this.command('resumenbot', adminCommands.resumenbot);
  
   // Comando para mostrar menú manualmente
   this.command('menu', (ctx) => ctx.replyWithMarkdown(welcomeMessage, mainMenuKeyboard));
   
   // HANDLER DE TEXTO COMBINADO (CORRIGE EL CONFLICTO)
   this.on('text', async (ctx, next) => {
     const text = ctx.message.text;
     const userId = ctx.from.id;
     
     // 1. PRIMERO: Procesamiento de importación masiva para admin
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
     
     // 2. SEGUNDO: Si es comando, continuar normal
     if (text.startsWith('/')) {
       return next();
     }
     
     // 3. TERCERO: Si está en escena, continuar normal
     if (ctx.scene && ctx.scene.current) {
       return next();
     }
     
     // 4. CUARTO: Solo funcionar en chats privados
     if (ctx.chat.type !== 'private') {
       return next();
     }
     
     // 5. QUINTO: Verificar si es usuario nuevo
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
     ctx.answerCbQuery();
     const user = ctx.from.id;
     const products = await Product.find({ user: user });
     
     if (products.length) {
       const listText = '📋 *LISTA DE PRODUCTOS*\n\nSelecciona un producto para configurar o ver detalles:';
       await ctx.editMessageText(listText, {
         parse_mode: 'Markdown',
         ...this.createProductListKeyboard(products)
       });
     } else {
       await ctx.editMessageText('Tu lista de productos está vacía.\n\n¿Quieres añadir el primer producto?',
         Markup.inlineKeyboard([
           [Markup.button.callback('➕ Añadir Producto', 'menu_add_product')],
           [Markup.button.callback('🔙 Volver al menú', 'menu_main')]
         ]));
     }
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
   
   ctx.replyWithMarkdown(helpText, Markup.inlineKeyboard([
     [Markup.button.callback('🔙 Volver al menú', 'menu_main')]
   ]));
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
