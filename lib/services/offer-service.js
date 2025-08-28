'use strict';
const { Markup } = require('telegraf');
const { Product, OfferPublication } = require('../models');

class OfferService {
  constructor(botInstance = null) {
    // IDs de configuración (YA CONFIGURADAS EN RAILWAY)
    this.VACUUM_GROUP_ID = process.env.VACUUM_GROUP_ID;
    this.VACUUM_CHANNEL_ID = process.env.VACUUM_CHANNEL_ID;
    this.VACUUM_THREAD_ID = process.env.VACUUM_THREAD_ID;
    this.ADMIN_USER_ID = process.env.ADMIN_USER_ID || 615957202;
    this.AFFILIATE_TAG = process.env.AMAZON_TRACKING_TAG; // Usar la variable correcta de Railway
    
    // CORRECCIÓN: Manejar tanto bot completo como telegram
    this.bot = botInstance;
    this.telegram = botInstance?.telegram || botInstance;
    
    console.log('🔧 OfferService inicializado:', {
      hasBotInstance: !!this.bot,
      hasTelegram: !!this.telegram,
      groupId: this.VACUUM_GROUP_ID,
      channelId: this.VACUUM_CHANNEL_ID
    });
  }

  // Método principal para publicar ofertas
  async publishOffer(offerData) {
    console.log('🚀 Iniciando publicación de oferta:', offerData.asin);
    
    try {
      // Verificar que tenemos los datos necesarios
      if (!offerData.asin || !offerData.name || !offerData.newPrice) {
        throw new Error('Datos de oferta incompletos');
      }

      // Generar enlace de afiliado
      const affiliateUrl = this.generateAffiliateUrl(offerData.asin);
      
      // Calcular estadísticas de precios
      const stats = await this.calculatePriceStats(offerData.asin, offerData.newPrice);
      
      // Formatear mensaje
      const message = this.formatOfferMessage({
        ...offerData,
        affiliateUrl,
        stats
      });

      // Obtener imagen del producto
      const imageUrl = await this.getProductImage(offerData.asin);

      // Publicar en canales
      const publicationResults = await this.publishToChannels(message, imageUrl, affiliateUrl);
      
      // Guardar registro de publicación
      await this.savePublicationRecord({
        ...offerData,
        imageUrl,
        affiliateUrl,
        publicationResults
      });

      console.log('✅ Oferta publicada exitosamente');
      return {
        success: true,
        results: publicationResults,
        message: 'Oferta publicada correctamente'
      };

    } catch (error) {
      console.error('❌ Error publicando oferta:', error);
      await this.notifyAdminError('publishOffer', error, offerData.asin);
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Publicar en grupo y canal
  async publishToChannels(message, imageUrl, affiliateUrl) {
    const results = { group: null, channel: null };
    
    try {
      // Keyboard con botón de enlace
      const keyboard = Markup.inlineKeyboard([
        [Markup.button.url('✅ Ver Oferta en Amazon', affiliateUrl)]
      ]);
      
      // CORRECCIÓN: Obtener instancia del bot de manera más robusta
      let telegram = this.telegram;
      
      if (!telegram) {
        console.log('🔄 Obteniendo instancia del bot...');
        const Bot = require('../bot');
        const botInstance = Bot.getBotInstance();
        
        if (!botInstance) {
          throw new Error('❌ No se puede obtener la instancia del bot');
        }
        
        telegram = botInstance.telegram;
        this.telegram = telegram; // Guardar para futuros usos
      }
      
      console.log('📡 Publicando en canales...', {
        hasTelegram: !!telegram,
        groupId: this.VACUUM_GROUP_ID,
        channelId: this.VACUUM_CHANNEL_ID,
        hasImage: !!imageUrl
      });
      
      // Publicar en grupo (con tema específico si está configurado)
      try {
        const groupOptions = {
          caption: imageUrl ? message : undefined,
          text: imageUrl ? undefined : message,
          parse_mode: 'Markdown',
          ...keyboard
        };
        
        // Agregar thread_id solo si está configurado
        if (this.VACUUM_THREAD_ID) {
          groupOptions.message_thread_id = parseInt(this.VACUUM_THREAD_ID);
        }
        
        if (imageUrl) {
          results.group = await telegram.sendPhoto(this.VACUUM_GROUP_ID, imageUrl, groupOptions);
        } else {
          results.group = await telegram.sendMessage(this.VACUUM_GROUP_ID, message, groupOptions);
        }
        
        console.log('✅ Publicado en grupo exitosamente');
      } catch (groupError) {
        console.error('❌ Error publishing to group:', groupError);
        results.group = { error: groupError.message };
      }
      
      // Publicar en canal
      try {
        const channelOptions = {
          caption: imageUrl ? message : undefined,
          text: imageUrl ? undefined : message,
          parse_mode: 'Markdown',
          ...keyboard
        };
        
        if (imageUrl) {
          results.channel = await telegram.sendPhoto(this.VACUUM_CHANNEL_ID, imageUrl, channelOptions);
        } else {
          results.channel = await telegram.sendMessage(this.VACUUM_CHANNEL_ID, message, channelOptions);
        }
        
        console.log('✅ Publicado en canal exitosamente');
      } catch (channelError) {
        console.error('❌ Error publishing to channel:', channelError);
        results.channel = { error: channelError.message };
      }
      
    } catch (error) {
      console.error('❌ Error general en publishToChannels:', error);
      results.error = error.message;
    }
    
    return results;
  }

  // Método para comando /forzaroferta
  async forcePublishOffer(asin) {
    try {
      console.log(`🔧 Forzando publicación para ASIN: ${asin}`);
      
      const product = await Product.findOne({ asin: asin, isRobotVacuum: true });
      
      if (!product) {
        return { success: false, error: 'Robot aspirador no encontrado' };
      }
      
      // Simular datos de oferta forzada
      const offerData = {
        asin: asin,
        name: product.name,
        newPrice: product.price,
        oldPrice: product.price * 1.2, // Simular 20% de descuento
        currency: product.currency || '€',
        forced: true
      };
      
      return await this.publishOffer(offerData);
      
    } catch (error) {
      console.error('Error in forcePublishOffer:', error);
      return { success: false, error: error.message };
    }
  }

  // Calcular estadísticas de precios
  async calculatePriceStats(asin, currentPrice) {
    try {
      const { PriceHistory } = require('../models');
      
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const [recentHistory, allHistory] = await Promise.all([
        PriceHistory.find({ asin }).sort({ price: 1 }).limit(1),
        PriceHistory.find({ 
          asin, 
          timestamp: { $gte: thirtyDaysAgo } 
        }).sort({ price: 1 }).limit(1)
      ]);
      
      return {
        minPrice30Days: recentHistory.length > 0 ? recentHistory[0].price : currentPrice,
        minPriceHistorical: allHistory.length > 0 ? allHistory[0].price : currentPrice,
        isHistoricalMin: allHistory.length > 0 ? currentPrice <= allHistory[0].price : true,
        is30DayMin: recentHistory.length > 0 ? currentPrice <= recentHistory[0].price : true
      };
    } catch (error) {
      console.error('Error calculating price stats:', error);
      return {
        minPrice30Days: currentPrice,
        minPriceHistorical: currentPrice,
        isHistoricalMin: false,
        is30DayMin: false
      };
    }
  }

  // Generar enlace de afiliado
  generateAffiliateUrl(asin) {
    if (!this.AFFILIATE_TAG) {
      return `https://www.amazon.es/dp/${asin}`;
    }
    return `https://www.amazon.es/dp/${asin}?tag=${this.AFFILIATE_TAG}`;
  }

  // Obtener imagen del producto
  async getProductImage(asin) {
    try {
      const product = await Product.findOne({ asin });
      return product?.image || null;
    } catch (error) {
      console.error('Error getting product image:', error);
      return null;
    }
  }

  // Formatear mensaje de oferta
  formatOfferMessage(data) {
    const discountPercent = ((data.oldPrice - data.newPrice) / data.oldPrice * 100).toFixed(0);
    
    let message = `🤖 **OFERTA ROBOT ASPIRADOR**\n\n`;
    message += `🆚 ${data.name}\n\n`;
    message += `🔥 **${data.newPrice}${data.currency}**\n`;
    message += `📈 Precio anterior: ${data.oldPrice}${data.currency} (-${discountPercent}%)\n`;
    
    if (data.stats.isHistoricalMin) {
      message += `⚡ **Mínimo histórico**\n`;
    } else if (data.stats.is30DayMin) {
      message += `⚡ **Mínimo últimos 30 días**\n`;
    } else {
      message += `⚡ Mínimo últimos 30 días: ${data.stats.minPrice30Days}${data.currency}\n`;
    }
    
    message += `\n📱 Más ofertas: ${this.VACUUM_GROUP_ID}`;
    
    return message;
  }

  // Guardar registro de publicación
  async savePublicationRecord(data) {
    try {
      const channels = [];
      if (data.publicationResults.group && !data.publicationResults.group.error) {
        channels.push('group');
      }
      if (data.publicationResults.channel && !data.publicationResults.channel.error) {
        channels.push('channel');
      }
      
      const publication = new OfferPublication({
        asin: data.asin,
        productName: data.name,
        price: data.newPrice,
        previousPrice: data.oldPrice,
        discountPercent: ((data.oldPrice - data.newPrice) / data.oldPrice * 100),
        channels: channels,
        groupMessageId: data.publicationResults.group?.message_id,
        channelMessageId: data.publicationResults.channel?.message_id,
        success: channels.length > 0,
        error: data.publicationResults.error || null,
        imageUrl: data.imageUrl,
        affiliateUrl: data.affiliateUrl
      });
      
      await publication.save();
      console.log('📝 Publication record saved');
    } catch (error) {
      console.error('Error saving publication record:', error);
    }
  }

  // Notificar errores al admin
  async notifyAdminError(operation, error, asin) {
    try {
      let telegram = this.telegram;
      
      if (!telegram) {
        const Bot = require('../bot');
        const botInstance = Bot.getBotInstance();
        if (botInstance) {
          telegram = botInstance.telegram;
        }
      }
      
      if (!telegram) {
        console.error('No se puede notificar error al admin: bot no disponible');
        return;
      }
      
      const errorMessage = `🚨 **ERROR EN OFERTAS**\n\n` +
        `🔧 Operación: ${operation}\n` +
        `📦 ASIN: ${asin || 'N/A'}\n` +
        `❌ Error: ${error.message}\n` +
        `⏰ Fecha: ${new Date().toLocaleString('es-ES')}`;
      
      await telegram.sendMessage(this.ADMIN_USER_ID, errorMessage, {
        parse_mode: 'Markdown'
      });
    } catch (notifyError) {
      console.error('Error notifying admin:', notifyError);
    }
  }
}

module.exports = OfferService;
