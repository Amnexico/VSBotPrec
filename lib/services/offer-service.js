'use strict';
const { Product, OfferPublication, PriceHistory } = require('../models');
const paapiClient = require('../amazon/paapi-client');

class OfferService {
  constructor(bot = null) {
    // Configuración desde variables de entorno
    this.VACUUM_GROUP_ID = process.env.VACUUM_GROUP_ID || '@vacuumspain';
    this.VACUUM_THREAD_ID = parseInt(process.env.VACUUM_THREAD_ID) || 112724;
    this.VACUUM_CHANNEL_ID = process.env.VACUUM_CHANNEL_ID || '@vacuumspain_ofertas';
    this.ADMIN_USER_ID = parseInt(process.env.ADMIN_USER_ID) || 615957202;
    this.OFFERS_ENABLED = process.env.OFFERS_ENABLED !== 'false';
    this.AFFILIATE_TAG = process.env.AMAZON_TRACKING_TAG;
    this.bot = bot;
  }

  // Función principal llamada desde el price-tracker
  async checkAndPublishOffer(productData) {
    try {
      console.log(`🔍 Checking offer for ${productData.asin}`);
      
      if (!this.OFFERS_ENABLED) {
        console.log('📢 Offers disabled globally');
        return { success: false, reason: 'offers_disabled' };
      }

      // Verificar si es robot aspirador
      const product = await Product.findOne({ 
        asin: productData.asin, 
        isRobotVacuum: true 
      });

      if (!product) {
        console.log(`📦 ${productData.asin} is not a robot vacuum`);
        return { success: false, reason: 'not_robot_vacuum' };
      }

      // Verificar si es una bajada de precio
      if (productData.newPrice >= productData.oldPrice) {
        console.log(`📈 ${productData.asin} price went up or stayed same`);
        return { success: false, reason: 'price_not_decreased' };
      }

      // Verificar control de duplicados (mismo día + diferencia <2%)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      if (product.lastOfferPublished && product.lastPublishedPrice) {
        const lastOfferDate = new Date(product.lastOfferPublished);
        lastOfferDate.setHours(0, 0, 0, 0);
        
        // Si fue publicado hoy
        if (lastOfferDate.getTime() === today.getTime()) {
          // Calcular diferencia de precio
          const priceDifference = ((product.lastPublishedPrice - productData.newPrice) / product.lastPublishedPrice) * 100;
          
          if (priceDifference < 2) {
            console.log(`🚫 ${productData.asin} already published today with similar price (${priceDifference.toFixed(1)}% difference)`);
            return { success: false, reason: 'already_published_today' };
          }
        }
      }

      // Todo OK - proceder a publicar
      return await this.publishOffer({
        asin: productData.asin,
        name: productData.name || product.name,
        newPrice: productData.newPrice,
        oldPrice: productData.oldPrice,
        currency: productData.currency || product.currency || '€',
        forced: false
      });

    } catch (error) {
      console.error('Error in checkAndPublishOffer:', error);
      await this.notifyAdminError('checkAndPublishOffer', error, productData.asin);
      return { success: false, error: error.message };
    }
  }

  // Función para publicar la oferta
  async publishOffer(offerData) {
    try {
      console.log(`🚀 Publishing offer for ${offerData.asin}`);
      
      // Obtener información adicional del producto
      const productInfo = await this.getProductInfo(offerData.asin);
      
      // Calcular estadísticas
      const stats = await this.calculatePriceStats(offerData.asin, offerData.newPrice);
      
      // Generar enlace de afiliado
      const affiliateUrl = this.generateAffiliateUrl(offerData.asin);
      
      // Crear mensaje
      const message = this.formatOfferMessage({
        ...offerData,
        imageUrl: productInfo.imageUrl,
        affiliateUrl,
        stats
      });
      
      // Publicar en grupo y canal
      const publicationResults = await this.publishToChannels(message, productInfo.imageUrl, affiliateUrl);
      
      // Actualizar producto
      await Product.updateMany(
        { asin: offerData.asin },
        {
          $set: {
            lastOfferPublished: new Date(),
            lastPublishedPrice: offerData.newPrice
          }
        }
      );
      
      // Guardar registro de publicación
      await this.savePublicationRecord({
        ...offerData,
        imageUrl: productInfo.imageUrl,
        affiliateUrl,
        publicationResults
      });
      
      console.log(`✅ Offer published successfully for ${offerData.asin}`);
      return { success: true, results: publicationResults };
      
    } catch (error) {
      console.error('Error publishing offer:', error);
      await this.notifyAdminError('publishOffer', error, offerData.asin);
      return { success: false, error: error.message };
    }
  }

  // Obtener información del producto (imagen, etc)
  async getProductInfo(asin) {
    try {
      const productData = await paapiClient.getProductInfo(asin);
      return {
        imageUrl: productData?.image || null,
        affiliateUrl: productData?.affiliateUrl || null
      };
    } catch (error) {
      console.error('Error getting product info:', error);
      return {
        imageUrl: null,
        affiliateUrl: null
      };
    }
  }

  // Calcular estadísticas de precio
  async calculatePriceStats(asin, currentPrice) {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const recentHistory = await PriceHistory.find({
        asin: asin,
        timestamp: { $gte: thirtyDaysAgo }
      }).sort({ price: 1 });
      
      const allHistory = await PriceHistory.find({
        asin: asin
      }).sort({ price: 1 });
      
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

  // Formatear mensaje de oferta
  formatOfferMessage(data) {
    const discountPercent = ((data.oldPrice - data.newPrice) / data.oldPrice * 100).toFixed(0);
    
    let message = `🤖 **OFERTA ROBOT ASPIRADOR**\n\n`;
    message += `🆚 ${data.name}\n\n`;
    message += `🔥 **${data.newPrice}${data.currency}**\n`;
    message += `📈 Precio anterior: ${data.oldPrice}${data.currency} (-${discountPercent}%)\n`;
    
    if (data.stats.isHistoricalMin) {
      message += `⚠️ **Mínimo histórico**\n`;
    } else if (data.stats.is30DayMin) {
      message += `⚠️ **Mínimo últimos 30 días**\n`;
    } else {
      message += `⚠️ Mínimo últimos 30 días: ${data.stats.minPrice30Days}${data.currency}\n`;
    }
    
    message += `\n✅ [Ver Oferta en Amazon](${data.affiliateUrl})\n\n`;
    message += `💬 Más ofertas en ${this.VACUUM_GROUP_ID}`;
    
    return message;
  }

  // Publicar en grupo y canal
  async publishToChannels(message, imageUrl, affiliateUrl) {
    const results = { group: null, channel: null };
    
    try {
      const { Markup } = require('telegraf');
      
      // Keyboard con botón de enlace
      const keyboard = Markup.inlineKeyboard([
        [Markup.button.url('✅ Ver Oferta en Amazon', affiliateUrl)]
      ]);
      
      // Obtener instancia del bot
      const bot = this.bot || require('../bot').getBotInstance();
      
      if (!bot) {
        throw new Error('Bot instance not available');
      }
      
      // Publicar en grupo (con tema específico)
      try {
        if (imageUrl) {
          results.group = await bot.telegram.sendPhoto(
            this.VACUUM_GROUP_ID,
            imageUrl,
            {
              caption: message,
              parse_mode: 'Markdown',
              message_thread_id: this.VACUUM_THREAD_ID,
              ...keyboard
            }
          );
        } else {
          results.group = await bot.telegram.sendMessage(
            this.VACUUM_GROUP_ID,
            message,
            {
              parse_mode: 'Markdown',
              message_thread_id: this.VACUUM_THREAD_ID,
              ...keyboard
            }
          );
        }
        console.log('✅ Published to group successfully');
      } catch (groupError) {
        console.error('❌ Error publishing to group:', groupError);
        results.group = { error: groupError.message };
      }
      
      // Publicar en canal
      try {
        if (imageUrl) {
          results.channel = await bot.telegram.sendPhoto(
            this.VACUUM_CHANNEL_ID,
            imageUrl,
            {
              caption: message,
              parse_mode: 'Markdown',
              ...keyboard
            }
          );
        } else {
          results.channel = await bot.telegram.sendMessage(
            this.VACUUM_CHANNEL_ID,
            message,
            {
              parse_mode: 'Markdown',
              ...keyboard
            }
          );
        }
        console.log('✅ Published to channel successfully');
      } catch (channelError) {
        console.error('❌ Error publishing to channel:', channelError);
        results.channel = { error: channelError.message };
      }
      
    } catch (error) {
      console.error('❌ General error in publishToChannels:', error);
      results.error = error.message;
    }
    
    return results;
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

  // Método para comando /forzaroferta
  async forcePublishOffer(asin) {
    try {
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

  // Notificar errores al admin
  async notifyAdminError(operation, error, asin) {
    try {
      const bot = this.bot || require('../bot').getBotInstance();
      if (!bot) return;
      
      const errorMessage = `🚨 **ERROR EN OFERTAS**\n\n` +
        `🔧 Operación: ${operation}\n` +
        `📦 ASIN: ${asin || 'N/A'}\n` +
        `❌ Error: ${error.message}\n` +
        `⏰ Fecha: ${new Date().toLocaleString('es-ES')}`;
      
      await bot.telegram.sendMessage(this.ADMIN_USER_ID, errorMessage, {
        parse_mode: 'Markdown'
      });
    } catch (notifyError) {
      console.error('Error notifying admin:', notifyError);
    }
  }
}

module.exports = OfferService;
