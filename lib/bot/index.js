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
  [Markup.button.callback('📊 Historial de precios', 'menu_price_history')],
  [Markup.button.callback('❓ Ayuda', 'menu_help')]
]);

class Bot extends Telegraf {
 constructor(token, options) {
   super(token, options);
   this.use(session.middleware());
   this.use(stage.middleware());
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
   
   // Comandos de administrador
   this.command('ayudaadmin', adminCommands.ayudaAdmin);
   this.command('agregarprecio', adminCommands.agregarPrecio);
   this.command('agregarhistorial', adminCommands.agregarHistorial);
   this.command('forzarrevision', adminCommands.forzarRevision);
   this.command('importarhistorial', adminCommands.importarHistorial);
   this.command('corregirasins', adminCommands.corregirAsins);
   
   // Comando para mostrar menú manualmente
   this.command('menu', (ctx) => ctx.replyWithMarkdown(welcomeMessage, mainMenuKeyboard));
   
   // Menú de bienvenida solo para nuevos usuarios en chat privado
   this.on('text', async (ctx, next) => {
     const text = ctx.message.text;
     const userId = ctx.from.id;
     
     // Si es un comando, continuar normal
     if (text.startsWith('/')) {
       return next();
     }
     
     // Si está en una escena, continuar normal
     if (ctx.scene && ctx.scene.current) {
       return next();
     }
     
     // Solo funcionar en chats privados
     if (ctx.chat.type !== 'private') {
       return next();
     }
     
     // Verificar si es un usuario nuevo (sin productos)
     const hasProducts = await Product.exists({ user: userId });
     
     if (!hasProducts) {
       // Usuario nuevo - mostrar menú de bienvenida
       const welcomeText = '¡Hola! Soy VS PrecioBot 👋\n\n' +
         'Te ayudo a seguir precios de Amazon y te aviso cuando bajan.\n\n' +
         '¿Qué quieres hacer?';
       
       return ctx.replyWithMarkdown(welcomeText, mainMenuKeyboard);
     }
     
     // Usuario existente - no hacer nada, dejar que escriba libremente
     return next();
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
   
   this.action('menu_price_history', async (ctx) => {
     ctx.answerCbQuery();
     const user = ctx.from.id;
     const products = await Product.find({ user: user });
     
     if (products.length === 0) {
       await ctx.editMessageText('No tienes productos para ver historial.\n\n¿Quieres añadir el primer producto?',
         Markup.inlineKeyboard([
           [Markup.button.callback('➕ Añadir Producto', 'menu_add_product')],
           [Markup.button.callback('🔙 Volver al menú', 'menu_main')]
         ]));
       return;
     }
     
     const historyText = '📊 *HISTORIAL DE PRECIOS*\n\nSelecciona un producto para ver su evolución de precios:';
     const historyButtons = products.map(product => [
       Markup.button.callback(
         `${product.name.substring(0, 25)}... - ${product.price}${product.currency}`,
         `history_${product.id}`
       )
     ]);
     
     historyButtons.push([Markup.button.callback('🔙 Volver al menú', 'menu_main')]);
     
     await ctx.editMessageText(historyText, {
       parse_mode: 'Markdown',
       ...Markup.inlineKeyboard(historyButtons)
     });
   });
   
   this.action('menu_help', (ctx) => {
     ctx.answerCbQuery();
     const helpText = '❓ *Ayuda - VS PrecioBot*\n\n' +
       '🔹 *Añadir Producto*: Envía un enlace de Amazon y configura alertas\n' +
       '🔹 *Mis productos*: Ve y gestiona tus productos seguidos\n' +
       '🔹 *Alertas*: Recibes notificaciones cuando baja el precio\n\n' +
       '*Comandos disponibles:*\n' +
       '/alerta - Añadir nuevo producto\n' +
       '/lista - Ver mis productos\n' +
       '/ayuda - Mostrar esta ayuda\n\n' +
       '*Tipos de enlace compatibles:*\n' +
       '• URLs completas de Amazon España\n' +
       '• Enlaces acortados (amzn.eu, amzn.to)';
     
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
   this.action(/^!menu=(\w+)$/, actions.menu);
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
   
   // ACCIÓN PARA HISTORIAL INDIVIDUAL - CORREGIDA
   this.action(/^history_(\w+)$/, async (ctx) => {
     try {
       await ctx.answerCbQuery();
       const productId = ctx.match[1];
       
       // Crear un nuevo contexto simulado para la acción stats
       const newCallbackData = `!stats?id=${productId}&period=recent&from_history=true`;
       
       // Ejecutar el regex de stats manualmente para obtener el match correcto
       const statsMatch = newCallbackData.match(/^!stats\?id=(\w+)(?:&page=(\d+))?(?:&period=(\w+))?(?:&from_history=(\w+))?$/);
       
       if (statsMatch) {
         // Crear un contexto temporal con los valores correctos
         const tempCtx = {
           ...ctx,
           callbackQuery: {
             ...ctx.callbackQuery,
             data: newCallbackData
           },
           match: statsMatch
         };
         
         // Llamar a la acción stats con el contexto corregido
         await actions.stats(tempCtx);
       } else {
         throw new Error('No se pudo parsear los parámetros de stats');
       }
       
     } catch (error) {
       console.error('Error en history action:', error);
       await ctx.editMessageText('Error temporal. Inténtalo de nuevo.', {
         ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Volver al historial', 'menu_price_history')]])
       });
     }
   });
   
   // Manejo de archivos CSV para importación histórica
   this.on('document', async (ctx) => {
     if (ctx.from.id !== 615957202) return; // Solo admin
     
     if (ctx.message.document.mime_type === 'text/csv') {
       try {
         const fileUrl = await ctx.telegram.getFileLink(ctx.message.document.file_id);
         const response = await fetch(fileUrl);
         const csvText = await response.text();
         
         const lines = csvText.split('\n').filter(line => line.trim());
         const records = [];
         
         for (const line of lines.slice(1)) { // Omitir header
           const [asin, date, price] = line.split(',');
           if (asin && date && price) {
             records.push({
               asin: asin.trim(),
               price: parseFloat(price.trim()),
               timestamp: new Date(date.trim()),
               currency: 'EUR',
               previousPrice: 0,
               comment: 'Importado desde CSV'
             });
           }
         }
         
         await PriceHistory.insertMany(records);
         ctx.reply(`Importados ${records.length} registros históricos`);
         
       } catch (error) {
         ctx.reply(`Error procesando CSV: ${error.message}`);
       }
     }
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
   const helpText = '❓ *Ayuda - VS PrecioBot*\n\n' +
     '🔹 *Añadir Producto*: Envía un enlace de Amazon y configura alertas\n' +
     '🔹 *Mis productos*: Ve y gestiona tus productos seguidos\n' +
     '🔹 *Alertas*: Recibes notificaciones cuando baja el precio\n\n' +
     '*Comandos disponibles:*\n' +
     '/alerta - Añadir nuevo producto\n' +
     '/lista - Ver mis productos\n' +
     '/ayuda - Mostrar esta ayuda\n\n' +
     '*Tipos de enlace compatibles:*\n' +
     '• URLs completas de Amazon España\n' +
     '• Enlaces acortados (amzn.eu, amzn.to)';
   
   ctx.replyWithMarkdown(helpText);
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
