'use strict';
const logger = require('../../logger')('bot');
const { Product } = require('../../models');

module.exports = async ctx => {
  const productId = ctx.match[1];
  const product = await Product.findByIdAndDelete(productId);

  logger.info(`Product deleted: ${product.name} (${product.id})`);

  await ctx.answerCbQuery();
  await ctx.editMessageText(product.name + ' ha sido eliminado de tu lista de productos.');
};

