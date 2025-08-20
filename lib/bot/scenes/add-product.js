'use strict';
const { Scenes } = require('telegraf');
const extractDomain = require('extract-domain');
const logger = require('../../logger')('bot');
const { Product } = require('../../models');
const validator = require('../../helpers/validator');
const paapiClient = require('../../amazon/paapi-client');

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
    
    const message = 'Inserta la URL o comparte el producto con VS PrecioBot desde la app de Amazon';
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
    
    const validDomains = ['amzn.eu', 'amzn.to'];
    const isAmazonDomain = domain.startsWith('amazon.') || validDomains.includes(domain);

    if (!validator.isUrl(url) || !isAmazonDomain) {
      const errorMsg = 'Este no es un producto válido de Amazon, por favor inténtalo de nuevo o usa /exit para salir.';
      return await ctx.reply(errorMsg);
    }
    
    const retrievingMsg = 'Obteniendo información del producto...';
    await ctx.reply(retrievingMsg);
    
    try {
      // Extraer ASIN de la URL
      const asin = extractASIN(url);
      if (!asin) {
        throw new Error('No se pudo extraer ASIN de la URL');
      }
      
      // Usar PA-API para obtener información del producto
      const productData = await paapiClient.getProductByUrl(url);
      
      const product = new Product({
        name: ctx.wizard.state.name,
        url: url,
        asin: asin, // Agregar el ASIN extraído
        user: user,
        price: productData.price || 0,
        currency: productData.currency || 'EUR',
        availability: productData.availability || 'Disponible',
        lastCheck: Math.floor(Date.now() / 1000)
      });
      
      await product.save();
      logger.info(`Product added via PA-API: ${product.name} (${product.id}) - ${product.price}${product.currency} - ${product.availability}`);
      
      const successMsg = `✅ Tu producto está siendo rastreado\n\n` +
        `📦 ${productData.name || ctx.wizard.state.name}\n` +
        `💰 Precio: ${productData.price}${productData.currency}\n` +
        `📊 Disponibilidad: ${productData.availability}\n` +
        `🆔 ASIN: ${asin}\n` +
        `🔗 Link: ${productData.affiliateUrl}`;
      
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
        errorMsg = `Error de Amazon API: ${error.message}`;
        console.error('Error detallado de PA-API:', error);
      } else if (error.message.includes('Request error')) {
        errorMsg = 'Error de conexión con Amazon. Inténtalo de nuevo en unos minutos.';
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

