'use strict';
const { UserStats, ProductStats, SystemStats, Product } = require('../models');

class AnalyticsService {
  constructor() {
    this.ADMIN_ID = 615957202;
  }

  // Verificar si user es admin
  isAdmin(userId) {
    return userId === this.ADMIN_ID;
  }

  // === TRACKING DE EVENTOS ===
  
  async trackUserActivity(userId, command, additionalData = {}) {
    if (userId === this.ADMIN_ID) return; // No trackear admin
    
    try {
      await UserStats.findOneAndUpdate(
        { userId },
        {
          $inc: { totalCommands: 1 },
          $set: { 
            lastActivity: new Date(),
            username: additionalData.username,
            firstName: additionalData.firstName,
            lastName: additionalData.lastName
          }
        },
        { upsert: true }
      );
    } catch (error) {
      console.error('Error tracking user activity:', error);
    }
  }

  async trackProductAdded(userId, asin, productName, price) {
    if (userId === this.ADMIN_ID) return;
    
    try {
      // Actualizar stats del usuario
      await UserStats.findOneAndUpdate(
        { userId },
        { $inc: { totalProducts: 1 } },
        { upsert: true }
      );

      // Actualizar stats del producto
      const currentMonth = new Date().toISOString().substring(0, 7);
      
      await ProductStats.findOneAndUpdate(
        { asin },
        {
          $inc: { 
            totalTrackers: 1, 
            activeTrackers: 1,
            [`monthlyTracking.${currentMonth}`]: 1
          },
          $addToSet: { 
            usersTracking: { userId, addedDate: new Date() }
          },
          $set: { productName, currentPrice: price }
        },
        { upsert: true }
      );

      await this.checkViralProduct(asin);

    } catch (error) {
      console.error('Error tracking product added:', error);
    }
  }

  async trackAlertSent(userId, asin, alertType = 'percentage') {
    if (userId === this.ADMIN_ID) return;
    
    try {
      const alertTime = new Date();
      
      await UserStats.findOneAndUpdate(
        { userId },
        { 
          $inc: { 
            alertsReceived: 1,
            [`alertTypeStats.${alertType}`]: 1
          }
        }
      );

      await ProductStats.findOneAndUpdate(
        { asin },
        { $inc: { totalAlerts: 1 } }
      );

      const today = this.getTodayString();
      await SystemStats.findOneAndUpdate(
        { date: today },
        { $inc: { alertsSent: 1 } },
        { upsert: true }
      );

      return alertTime;
    } catch (error) {
      console.error('Error tracking alert sent:', error);
    }
  }

  async trackAffiliateClick(userId, asin, alertTime = null) {
    if (userId === this.ADMIN_ID) return;
    
    try {
      const clickTime = new Date();
      const hour = clickTime.getHours();
      
      const updateUser = {
        $inc: { 
          affiliateClicks: 1,
          [`clicksByHour.${hour}`]: 1
        }
      };
      
      if (alertTime) {
        updateUser.$push = {
          clickTimes: { alertTime, clickTime, asin }
        };
      }

      await UserStats.findOneAndUpdate({ userId }, updateUser);

      await ProductStats.findOneAndUpdate(
        { asin, 'clicksByUser.userId': userId },
        { 
          $inc: { 
            totalClicks: 1,
            'clicksByUser.$.clicks': 1
          },
          $set: { 'clicksByUser.$.lastClick': clickTime }
        }
      );

      await ProductStats.findOneAndUpdate(
        { 
          asin,
          'clicksByUser.userId': { $ne: userId }
        },
        {
          $inc: { totalClicks: 1 },
          $push: {
            clicksByUser: { userId, clicks: 1, lastClick: clickTime }
          }
        }
      );

      const today = this.getTodayString();
      await SystemStats.findOneAndUpdate(
        { date: today },
        { $inc: { totalClicks: 1 } },
        { upsert: true }
      );

      return clickTime;
    } catch (error) {
      console.error('Error tracking affiliate click:', error);
    }
  }

  // === REPORTES ===

  async getCTRReport() {
    try {
      const result = await ProductStats.aggregate([
        {
          $group: {
            _id: null,
            totalAlerts: { $sum: '$totalAlerts' },
            totalClicks: { $sum: '$totalClicks' }
          }
        }
      ]);

      const stats = result[0] || { totalAlerts: 0, totalClicks: 0 };
      const ctr = stats.totalAlerts > 0 ? 
        ((stats.totalClicks / stats.totalAlerts) * 100).toFixed(2) : '0.00';

      return {
        totalAlerts: stats.totalAlerts,
        totalClicks: stats.totalClicks,
        ctr: `${ctr}%`
      };
    } catch (error) {
      return { error: 'Error generando reporte CTR' };
    }
  }

  async checkViralProduct(asin) {
    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const product = await ProductStats.findOne({ asin });
      if (!product) return;

      const recentTrackers = product.usersTracking.filter(
        user => user.addedDate >= sevenDaysAgo
      ).length;

      if (recentTrackers >= 5 && !product.isViral) {
        await ProductStats.findOneAndUpdate(
          { asin },
          {
            $set: {
              isViral: true,
              viralDate: new Date()
            }
          }
        );
      }
    } catch (error) {
      console.error('Error checking viral product:', error);
    }
  }

  getTodayString() {
    return new Date().toISOString().split('T')[0];
  }
}

module.exports = new AnalyticsService();
