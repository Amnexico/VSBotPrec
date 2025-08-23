'use strict';
const config = require('config');
const logger = require('./lib/logger')();
const database = require('./lib/database');
const Bot = require('./lib/bot');
const priceTracker = require('./lib/price-tracker');
const Alert = require('./lib/templates/alert');

// Analytics imports
const AnalyticsService = require('./lib/services/analytics-service');
const cron = require('node-cron');

const mongoConnectionURI = config.get('mongo.connectionURI');
const telegramBotToken = config.get('telegram.token');
const bot = new Bot(telegramBotToken);

database.connect(mongoConnectionURI).then(async () => {
  bot.launch();
  priceTracker.start();
  
  priceTracker.on('update', async product => {
    // Tracking de alerta enviada ANTES de crear el template
    const alertTime = await AnalyticsService.trackAlertSent(
      product.user, 
      product.asin, 
      product.preferences?.alertType || 'percentage'
    );
    
    const alert = new Alert(product).toMarkdown();
    
    if (alert.extra) {
      bot.sendMessage(product.user, alert.text, alert.extra);
    } else {
      bot.sendMessage(product.user, alert);
    }
    
    logger.info(`Alert sent: ${product.name} (${product.id}) - Analytics tracked`);
  });
  
  // Cron job para stats diarias (cada día a las 00:05)
  cron.schedule('5 0 * * *', async () => {
    console.log('🔄 Actualizando stats diarias...');
    
    try {
      // Actualizar stats del sistema
      await AnalyticsService.updateDailyStats();
      
      // Actualizar segmentación de usuarios
      const { UserStats } = require('./lib/models');
      const users = await UserStats.find({}).select('userId');
      
      for (const user of users) {
        await AnalyticsService.updateUserSegmentation(user.userId);
      }
      
      logger.info('📊 Stats diarias actualizadas exitosamente');
    } catch (error) {
      logger.error('❌ Error actualizando stats diarias:', error);
    }
  });
  
  // Cron job para stats diarias (cada día a las 00:05)
  cron.schedule('5 0 * * *', async () => {
    console.log('🔄 Actualizando stats diarias...');
    
    try {
      // Actualizar stats del sistema
      await AnalyticsService.updateDailyStats();
      
      // Actualizar segmentación de usuarios
      const { UserStats } = require('./lib/models');
      const users = await UserStats.find({}).select('userId');
      
      for (const user of users) {
        await AnalyticsService.updateUserSegmentation(user.userId);
      }
      
      logger.info('📊 Stats diarias actualizadas exitosamente');
    } catch (error) {
      logger.error('❌ Error actualizando stats diarias:', error);
    }
  });
  
  logger.info('🚀 VS PrecioBot con Analytics System started...');
  
  // Log de confirmación del sistema analytics
  console.log(`
📊 SISTEMA ANALYTICS ACTIVO
============================
✅ Tracking automático de usuarios
✅ Tracking de alertas enviadas  
✅ Tracking de productos añadidos
✅ Tracking de API calls
✅ Cron job de stats diarias
✅ Comandos admin disponibles

👑 Admin ID: ${AnalyticsService.ADMIN_ID}
🕰️ Stats diarias: 00:05 UTC
💰 Sistema optimizado para comisiones
  `);
});
