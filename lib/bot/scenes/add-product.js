'use strict';
const { Scenes } = require('telegraf');
const extractDomain = require('extract-domain');
const logger = require('../../logger')('bot');
const { Product } = require('../../models');
const validator = require('../../helpers/validator');
const AmazonProductPage = require('../../amazon/amazon-product-page');

const steps = [
  async ctx => {
    await ctx.reply('¿Cuál es el nombre del producto?');
    ctx.wizard.next();
  },
  async ctx => {
    const name = ctx.update.message.text;
    const user = ctx.update.message.from.id;
    const exists = await Product.exists({ name: name, user: user });
    if (exists) {
      return await ctx.reply(
        'Ya tienes un producto con el mismo nombre. Por favor elige otro o usa /exit para salir.'
      );
    }
    await ctx.reply('Inserta la URL o comparte el producto con Pricegram desde la app de Amazon');
    ctx.wizard.state.name = name;
    ctx.wizard.next();
  },
  async ctx => {
    const message = ctx.update.message.text;
    const urls = message.match(/\bhttps?:\/\/\S+/gi);
    if (!urls) {
      return await ctx.reply('Esta no es una URL válida, por favor inténtalo de nuevo o usa /exit para salir.');
    }
    const url = urls[0];
    const domain = extractDomain(url);
    if (!validator.isUrl(url) || !domain.startsWith('amazon.')) {
      return await ctx.reply('Este no es un producto válido de Amazon, por favor inténtalo de nuevo o usa /exit para salir.');
    }
    await ctx.reply('Obteniendo información del producto...');
    
    try {
      const productPage = new AmazonProductPage(url);
      await productPage.init();
      
      const product = new Product({
        name: ctx.wizard.state.name,
        url: url,
        user: ctx.update.message.from.id,
        price: productPage.price || 0,
        currency: productPage.currency || '€',
        availability: productPage.availability || 'Desconocido',
        lastCheck: Math.floor(Date.now() / 1000)
      });
      
      await product.save();
      logger.info(`Product added via PA-API: ${product.name} (${product.id}) - ${product.price}${product.currency} - ${product.availability}`);
      
      const successMsg = `Tu producto está siendo rastreado\n\n` +
        `📦 ${productPage.name || ctx.wizard.state.name}\n` +
        `💰 Precio: ${productPage.price}${productPage.currency}\n` +
        `📊 Disponibilidad: ${productPage.availability}`;
      
      await ctx.reply(successMsg);
      await ctx.scene.leave();
    } catch (error) {
      logger.error('Error adding product via PA-API:', error);
      
      let errorMsg = 'Error al obtener información del producto.';
      
      if (error.message.includes('no se pudo extraer ASIN')) {
        errorMsg = 'URL de Amazon inválida. Por favor usa una URL directa del producto.';
      } else if (error.message.includes('Producto no encontrado')) {
        errorMsg = 'Producto no encontrado en Amazon. Verifica que la URL sea correcta.';
      }
      
      await ctx.reply(errorMsg);
    }
  }
];

const scene = new Scenes.WizardScene('add-product', ...steps);

scene.command('exit', async ctx => {
  await ctx.scene.leave();
  await ctx.reply('La operación fue cancelada.');
});

module.exports = scene;
