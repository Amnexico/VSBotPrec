'use strict';
const { Product } = require('../models');
const paapiClient = require('../amazon/paapi-client');
const logger = require('../logger')('price-tracker');

class PriceTracker {
  constructor() {
    this.isRunning = false;
    this.interval = null;
  }

  start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    // Ejecutar cada 2 horas para respetar límites de PA-API
    this.interval = setInterval(() => {
      this.checkAllProducts();
    }, 7200000); // 2 horas
    
    logger.info('Price tracker iniciado con PA-API manual');
    
    // Ejecutar una verificación inicial después de 30 segundos
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
        // Pausa entre solicitudes para respetar límites de PA-API
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2 segundos
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
      
      // Verificar cambios de precio
      let priceChanged = false;
      if (oldPrice !== newPrice) {
        priceChanged = true;
        logger.info(`Precio actualizado: ${product.name} - ${oldPrice}€ → ${newPrice}€`);
        
        // Emitir evento de cambio de precio
        if (this.shouldSendAlert(product, newPrice)) {
          this.emit('update', {
            ...product.toObject(),
            oldPrice: oldPrice,
            newPrice: newPrice,
            changeType: newPrice < oldPrice ? 'price_drop' : 'price_increase'
          });
        }
      }
      
      // Verificar cambios de disponibilidad
      if (product.availability !== newAvailability) {
        logger.info(`Disponibilidad actualizada: ${product.name} - ${product.availability} → ${newAvailability}`);
        
        if (product.preferences && product.preferences.stockAlerts) {
          this.emit('update', {
            ...product.toObject(),
            availability: newAvailability,
            changeType: 'availability_change'
          });
        }
      }
      
      // Actualizar producto en base de datos
      await Product.findByIdAndUpdate(product._id, {
        price: newPrice,
        availability: newAvailability,
        lastCheck: Math.floor(Date.now() / 1000)
      });
      
    } catch (error) {
      logger.error(`Error verificando producto ${product.name}:`, error);
      
      // No actualizar lastCheck si hubo error para reintentarlo pronto
    }
  }

  shouldSendAlert(product, newPrice) {
    const prefs = product.preferences || {};
    
    // Alerta por cualquier bajada (default)
    if (!prefs.alertType || prefs.alertType === 'any_drop') {
      return newPrice < product.price;
    }
    
    // Alerta por precio objetivo
    if (prefs.alertType === 'custom' && prefs.targetPrice && newPrice <= prefs.targetPrice) {
      return true;
    }
    
    // Alerta por porcentaje
    if (prefs.alertType === 'percentage' && prefs.discountPercent > 0) {
      const discountThreshold = product.price * (1 - prefs.discountPercent / 100);
      return newPrice <= discountThreshold;
    }
    
    return false;
  }

  // Implementar EventEmitter básico para compatibilidad
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
