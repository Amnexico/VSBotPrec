'use strict';
const { Product } = require('../../models');
const keyboards = require('../keyboards');

module.exports = async ctx => {
  const user = ctx.update.message.from.id;
  const products = await Product.find({ user: user });
  
  if (products.length) {
    await ctx.reply('Elige un producto de la lista:', keyboards.list(products));
  } else {
    await ctx.reply('Tu lista de productos está vacía. Usa /track para agregar productos.');
  }
};
