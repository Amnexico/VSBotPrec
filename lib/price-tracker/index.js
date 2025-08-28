'use strict';
const { Product, PriceHistory } = require('../models');
const paapiClient = require('../amazon/paapi-client');
const logger = require('../logger')('price-tracker');

class PriceTracker {
  constructor(bot = null) {
    this.isRunning = false;
    this.interval = null;
    
    // Configurar servicio de ofertas
    this.bot = bot;
    this.offerService = null;
    
    // Inicializar servicio de ofertas si hay bot disponible
    if (this.bot) {
      const OfferService = require('../services/offer-service');
      this.offerService = new OfferService(this.bot);
    }
  }

  // Método para configurar bot después de la construcción
  setBotInstance(bot) {
    this.bot = bot;
    if (!this.offerService && bot) {
      const OfferService = require('../services/offer-service');
      this.offerService = new OfferService(bot);
    }
  }

  start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.interval = setInterval(() => {
      this.checkAllProducts();
    }, 600000); // 10 minutos
    
    logger.info('Price tracker iniciado con PA-API manual');
    
    setTimeout(() => {
      this.checkAllProducts();
    }, 30000);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.isRunning = false;
    logger.info('Price tracker detenido');
  }

  async checkAllProducts() {
    try {
      const products = await Product.find({});
      logger.info(`Verificando ${products.length} productos con PA-API`);
      
      for (const product of products) {
        await this.checkProduct(product);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      logger.info('Verificación de productos completada');
    } catch (error) {
      logger.error('Error en verificación masiva:', error);
    }
  }

  async checkProduct(product) {
    try {
      console.log(`Verificando producto: ${product.name}`);
      const productData = await paapiClient.getProductByUrl(product.url);
      
      const oldPrice = product.price;
      const newPrice = productData.price;
      const newAvailability = productData.availability;
      
      if (newPrice <= 0) {
        logger.info(`Precio inválido detectado para ${product.name}: ${newPrice}€. Saltando actualización.`);
        return;
      }
      
      // Guardar en historial SOLO si hay cambio de precio significativo
      if (newPrice > 0 && newPrice !== oldPrice) {
        const asin = product.asin || this.extractASIN(product.url);
        if (asin) {
          await PriceHistory.create({
            asin: asin,
            price: newPrice,
            previousPrice: oldPrice,
            timestamp: new Date(),
            currency: '€'
          });
          console.log(`Cambio de precio registrado: ${asin} - €${oldPrice} → €${newPrice}`);
        }
      }
      
      // Verificar si es mínimo histórico
      let isHistoricalLow = false;
      if (newPrice > 0) {
        const asin = product.asin || this.extractASIN(product.url);
        if (asin) {
          const historicalLow = await PriceHistory.findOne({ asin }).sort({price: 1});
          isHistoricalLow = !historicalLow || newPrice <= historicalLow.price;
        }
      }
      
      // Verificar cambios de precio
      if (oldPrice !== newPrice) {
        logger.info(`Precio actualizado: ${product.name} - ${oldPrice}€ → ${newPrice}€`);
        
        const isPriceDrop = newPrice < oldPrice;
        const userWantsAllAlerts = product.preferences?.alertOnPriceIncrease === true;
        
        // ========== INTEGRACIÓN CON SERVICIO DE OFERTAS ==========
        if (isPriceDrop && product.isRobotVacuum && this.offerService) {
          try {
            logger.info(`🤖 Detectada bajada en robot aspirador: ${product.name} - ${oldPrice}€ → ${newPrice}€`);
            
            const offerData = {
              asin: product.asin || this.extractASIN(product.url),
              name: product.name,
              oldPrice: oldPrice,
              newPrice: newPrice,
              currency: product.currency || '€',
              isHistoricalLow: isHistoricalLow
            };
            
            // Llamar al servicio de ofertas
            const offerResult = await this.offerService.checkAndPublishOffer(offerData);
            
            if (offerResult.success) {
              logger.info(`✅ Oferta publicada automáticamente: ${product.name}`);
            } else {
              logger.info(`ℹ️ Oferta no publicada: ${offerResult.reason || 'No cumple criterios'}`);
            }
            
          } catch (offerError) {
            logger.error(`❌ Error en servicio de ofertas: ${offerError.message}`);
          }
        }
        // ========== FIN INTEGRACIÓN ==========
        
        if (isPriceDrop || userWantsAllAlerts) {
          if (this.shouldSendAlert(product, newPrice)) {
            // Tracking de alerta enviada
            const AnalyticsService = require('../services/analytics-service');
            const alertTime = await AnalyticsService.trackAlertSent(
              product.user, 
              product.asin || this.extractASIN(product.url),
              product.preferences?.alertType || 'percentage'
            );
            
            this.emit('update', {
              ...product.toObject(),
              productId: product._id, // AÑADIDO: ID del producto para navegación
              asin: product.asin || this.extractASIN(product.url),
              oldPrice: oldPrice,
              newPrice: newPrice,
              isHistoricalLow: isHistoricalLow,
              changeType: isPriceDrop ? 'price_drop' : 'price_increase'
            });
          }
        } else {
          // Log la subida de precio pero no enviar alerta
          logger.info(`Subida de precio detectada pero no se envía alerta: ${product.name} - ${oldPrice}€ → ${newPrice}€`);
        }
      }
      
      // Verificar cambios de disponibilidad
      if (product.availability !== newAvailability) {
        logger.info(`Disponibilidad actualizada: ${product.name} - ${product.availability} → ${newAvailability}`);
        
        if (product.preferences && product.preferences.stockAlerts) {
          // Tracking de alerta de stock
          const AnalyticsService = require('../services/analytics-service');
          const alertTime = await AnalyticsService.trackAlertSent(
            product.user, 
            product.asin || this.extractASIN(product.url),
            'stock'
          );
          
          this.emit('update', {
            ...product.toObject(),
            productId: product._id, // AÑADIDO: ID del producto para navegación
            asin: product.asin || this.extractASIN(product.url),
            availability: newAvailability,
            changeType: 'availability_change'
          });
        }
      }
      
      // Actualizar producto en base de datos
      await Product.findByIdAndUpdate(product._id, {
        price: newPrice > 0 ? newPrice : product.price, // Mantener precio anterior si es inválido
        availability: newAvailability,
        lastCheck: Math.floor(Date.now() / 1000)
      });
      
    } catch (error) {
      logger.error(`Error verificando producto ${product.name}:`, error);
    }
  }

  extractASIN(url) {
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

  shouldSendAlert(product, newPrice, previousPrice = null) {
    const prefs = product.preferences || {};
    
    // Usar el precio anterior si se proporciona, sino usar el precio actual del producto
    const basePrice = previousPrice || product.price;
    
    if (prefs.alertType === 'percentage' && prefs.discountPercent > 0) {
      const discountThreshold = basePrice * (1 - prefs.discountPercent / 100);
      return newPrice <= discountThreshold;
    }
    
    if (prefs.alertType === 'custom' && prefs.targetPrice && newPrice <= prefs.targetPrice) {
      return true;
    }
    
    if (!prefs.alertType || prefs.alertType === 'any_drop') {
      return newPrice < basePrice;
    }
    
    return false;
  }

  emit(event, data) {
    if (this.listeners && this.listeners[event]) {
      this.listeners[event].forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          logger.error('Error en listener:', error);
        }
      });
    }
  }

  on(event, callback) {
    if (!this.listeners) this.listeners = {};
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
  }
}

module.exports = new PriceTracker();

