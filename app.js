'use strict';
const config = require('config');
const logger = require('./lib/logger')();
const database = require('./lib/database');
const Bot = require('./lib/bot');
const priceTracker = require('./lib/price-tracker');
const Alert = require('./lib/templates/alert');
const mongoConnectionURI = config.get('mongo.connectionURI');
const telegramBotToken = config.get('telegram.token');
const bot = new Bot(telegramBotToken);

database.connect(mongoConnectionURI).then(() => {
  bot.launch();
  priceTracker.start();
  priceTracker.on('update', product => {
    const alert = new Alert(product).toMarkdown();
    
    if (alert.extra) {
      bot.sendMessage(product.user, alert.text, alert.extra);
    } else {
      bot.sendMessage(product.user, alert);
    }
    
    logger.info(`Alert sent: ${product.name} (${product.id})`);
  });
  
  logger.info('Pricegram started...');
});

