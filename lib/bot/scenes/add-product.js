'use strict';
const { Scenes } = require('telegraf');
const extractDomain = require('extract-domain');
const logger = require('../../logger')('bot');
const { Product } = require('../../models');
const http = require('../../helpers/http');
const validator = require('../../helpers/validator');
const AmazonProductPage = require('../../amazon/amazon-product-page');
const localization = require('../../locales');

const steps = [
  async ctx => {
    const userId = ctx.from.id;
    const message = await localization.getText('scenes.add_product.ask_name', userId);
    await ctx.reply(message);
    ctx.wizard.next();
  },
  async ctx => {
    const name = ctx.update.message.text;
    const user = ctx.update.message.from.id;
    const exists = await Product.exists({ name: name, user: user });
    
    if (exists) {
      const message = await localization.getText('scenes.add_product.name_exists', user);
      return await ctx.reply(message);
    }
    
    const message = await localization.getText('scenes.add_product.ask_url', user);
    await ctx.reply(message);
    ctx.wizard.state.name = name;
    ctx.wizard.next();
  },
  async ctx => {
    const message = ctx.update.message.text;
    const user = ctx.update.message.from.id;
    const urls = message.match(/\bhttps?:\/\/\S+/gi);
    
    if (!urls) {
      const errorMsg = await localization.getText('scenes.add_product.invalid_url', user);
      return await ctx.reply(errorMsg);
    }
    
    const url = urls[0];
    const domain = extractDomain(url);
    
    if (!validator.isUrl(url) || !domain.startsWith('amazon.')) {
      const errorMsg = await localization.getText('scenes.add_product.invalid_amazon', user);
      return await ctx.reply(errorMsg);
    }
    
    const retrievingMsg = await localization.getText('scenes.add_product.retrieving_info', user);
    await ctx.reply(retrievingMsg);
    
    try {
      const html = await http.get(url);
      const productPage = new AmazonProductPage(html);
      
      const product = new Product({
        name: ctx.wizard.state.name,
        url: url,
        user: user,
        price: productPage.price,
        currency: productPage.currency,
        availability: productPage.availability,
        lastCheck: Math.floor(Date.now() / 1000)
      });
      
      await product.save();
      logger.info(`Product added: ${product.name} (${product.id}) - ${product.price} - ${product.availability}`);
      
      const successMsg = await localization.getText('scenes.add_product.success', user);
      await ctx.reply(successMsg);
      await ctx.scene.leave();
    } catch (error) {
      logger.error('Error adding product:', error);
      const errorMsg = await localization.getText('errors.generic', user);
      await ctx.reply(errorMsg);
    }
  }
];

const scene = new Scenes.WizardScene('add-product', ...steps);

scene.command('exit', async ctx => {
  const userId = ctx.from.id;
  await ctx.scene.leave();
  const message = await localization.getText('scenes.add_product.aborted', userId);
  await ctx.reply(message);
});

module.exports = scene;
