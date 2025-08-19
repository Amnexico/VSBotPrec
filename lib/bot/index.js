'use strict';
const { Telegraf, Scenes } = require('telegraf');
const LocalSession = require('telegraf-session-local');
const scenes = require('./scenes');
const commands = require('./commands');
const actions = require('./actions');
const errorHandler = require('./error-handler');
const { Product } = require('../models');

const stage = new Scenes.Stage(Object.values(scenes));
const session = new LocalSession();
const welcomeMessage = '*Bienvenido a Pricegram*\n\n' +
  'Empieza a ahorrar dinero rastreando productos de Amazon y recibe ' +
  'alertas de precio y disponibilidad según tus preferencias.\n\n' +
  '_Comandos_\n\n' +
  '/track - rastrear un nuevo producto\n' +
  '/list - gestionar tus productos';

class Bot extends Telegraf {
  constructor(token, options) {
    super(token, options);
    this.use(session.middleware());
    this.use(stage.middleware());
    this.catch(errorHandler);
    
    this.start(ctx => ctx.replyWithMarkdown(welcomeMessage));
    this.command('track', commands.track);
    this.command('list', commands.list);
    
    this.action('!list', actions.list);
    this.action(/^!menu=(\w+)$/, actions.menu);
    this.action(/^!remove\?id=(\w+)$/, actions.remove);
    this.action(/^!availability\?id=(\w+)&value=(\w+)$/, actions.availability);
    this.action(/^!price\?id=(\w+)$/, actions.price);
    this.action(/^!stats\?id=(\w+)$/, actions.stats);
    
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
    this.action(/^update_target_(\w+)_(.+)$/, this.updateTarget);
    this.action(/^delete_tracking_(\w+)$/, this.deleteTracking);
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
        parse_mode: 'Markdown', 
        // evitar la carga de metadatos desde el enlace disable_web_page_preview: true 
      });
    }
  }
}

module.exports = Bot;


