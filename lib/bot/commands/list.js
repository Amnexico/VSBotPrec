'use strict';
const { Product } = require('../../models');
const keyboards = require('../keyboards');
const localization = require('../../locales');

module.exports = async ctx => {
  const user = ctx.from.id;
  const products = await Product.find({ user: user });
  
  if (products.length) {
    const message = await localization.getText('commands.list.choose', user);
    await ctx.reply(message, keyboards.list(products));
  } else {
    const message = await localization.getText('commands.list.empty', user);
    await ctx.reply(message);
  }
};
