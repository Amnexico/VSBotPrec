'use strict';
const paapiClient = require('./paapi-client');

class AmazonProductPage {
  constructor(url) {
    this.url = url;
    this.productData = null;
  }

  async init() {
    try {
      console.log(`Inicializando producto desde URL: ${this.url}`);
      this.productData = await paapiClient.getProductByUrl(this.url);
      console.log('Producto inicializado:', this.productData);
      return this;
    } catch (error) {
      console.error('Error obteniendo producto:', error);
      throw error;
    }
  }

  get price() {
    return this.productData ? this.productData.price : null;
  }

  get currency() {
    return this.productData ? this.productData.currency : '€';
  }

  get availability() {
    return this.productData ? this.productData.availability : 'Desconocido';
  }

  get name() {
    return this.productData ? this.productData.name : null;
  }

  get asin() {
    return this.productData ? this.productData.asin : null;
  }

  get image() {
    return this.productData ? this.productData.image : null;
  }
}

module.exports = AmazonProductPage;

// =============================================================================
// lib/bot/scenes/add-product.js - ACTUALIZAR el flujo de agregar productos
// =============================================================================
'use strict';
const { Scenes } = require('telegraf');
const extractDomain = require('extract-domain');
const logger = require('../../logger')('bot');
const { Product } = require('../../models');
const validator = require('../../helpers/validator');
const AmazonProductPage = require('../../amazon/amazon-product-page');

const steps = [
  async ctx => {
    const userId = ctx.from.id;
    const message = '¿Cuál es el nombre del producto?';
    await ctx.reply(message);
    ctx.wizard.next();
  },
  async ctx => {
    const name = ctx.update.message.text;
    const user = ctx.update.message.from.id;
    const exists = await Product.exists({ name: name, user: user });
    
    if (exists) {
      const message = 'Ya tienes un producto con el mismo nombre. Por favor elige otro o usa /exit para salir.';
      return await ctx.reply(message);
    }
    
    const message = 'Inserta la URL o comparte el producto con Pricegram desde la app de Amazon';
    await ctx.reply(message);
    ctx.wizard.state.name = name;
    ctx.wizard.next();
  },
  async ctx => {
    const message = ctx.update.message.text;
    const user = ctx.update.message.from.id;
    const urls = message.match(/\bhttps?:\/\/\S+/gi);
    
    if (!urls) {
      const errorMsg = 'Esta no es una URL válida, por favor inténtalo de nuevo o usa /exit para salir.';
      return await ctx.reply(errorMsg);
    }
    
    const url = urls[0];
    const domain = extractDomain(url);
    
    if (!validator.isUrl(url) || !domain.startsWith('amazon.')) {
      const errorMsg = 'Este no es un producto válido de Amazon, por favor inténtalo de nuevo o usa /exit para salir.';
      return await ctx.reply(errorMsg);
    }
    
    const retrievingMsg = 'Obteniendo información del producto...';
    await ctx.reply(retrievingMsg);
    
    try {
      // Usar PA-API en lugar de scraping
      const productPage = new AmazonProductPage(url);
      await productPage.init();
      
      // Validar que se obtuvo información básica
      if (!productPage.name) {
        throw new Error('No se pudo obtener el nombre del producto');
      }
      
      const product = new Product({
        name: ctx.wizard.state.name,
        url: url,
        user: user,
        price: productPage.price || 0,
        currency: productPage.currency || '€',
        availability: productPage.availability || 'Desconocido',
        lastCheck: Math.floor(Date.now() / 1000)
      });
      
      await product.save();
      logger.info(`Product added via PA-API: ${product.name} (${product.id}) - ${product.price}${product.currency} - ${product.availability}`);
      
      const successMsg = `✅ Tu producto está siendo rastreado\n\n` +
        `📦 ${productPage.name || ctx.wizard.state.name}\n` +
        `💰 Precio: ${productPage.price}${productPage.currency}\n` +
        `📊 Disponibilidad: ${productPage.availability}\n` +
        `🆔 ASIN: ${productPage.asin}`;
      
      await ctx.reply(successMsg);
      await ctx.scene.leave();
    } catch (error) {
      logger.error('Error adding product via PA-API:', error);
      
      let errorMsg = 'Error al obtener información del producto de Amazon.';
      
      if (error.message.includes('no se pudo extraer ASIN')) {
        errorMsg = 'URL de Amazon inválida. Por favor usa una URL directa del producto.';
      } else if (error.message.includes('Producto no encontrado')) {
        errorMsg = 'Producto no encontrado en Amazon. Verifica que la URL sea correcta.';
      } else if (error.message.includes('PA-API Error')) {
        errorMsg = 'Error temporal de Amazon. Inténtalo de nuevo en unos minutos.';
      }
      
      errorMsg += '\n\nPor favor inténtalo de nuevo o usa /exit para salir.';
      await ctx.reply(errorMsg);
    }
  }
];

const scene = new Scenes.WizardScene('add-product', ...steps);

scene.command('exit', async ctx => {
  const userId = ctx.from.id;
  await ctx.scene.leave();
  const message = 'La operación fue cancelada.';
  await ctx.reply(message);
});

module.exports = scene;
