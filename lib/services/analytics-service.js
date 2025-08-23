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

  // MÉTODO QUE TE FALTABA:
  async trackApiCall(asin, success = true, responseTime = 0) {
    try {
      // Product stats (estadística 14)
      const update = success ? 
        { $inc: { apiCalls: 1 }, $set: { avgResponseTime: responseTime } } : 
        { $inc: { apiCalls: 1, apiErrors: 1 }, $set: { lastApiError: new Date() } };

      await ProductStats.findOneAndUpdate({ asin }, update, { upsert: true });

      // System stats
      const today = this.getTodayString();
      const systemUpdate = success ? 
        { $inc: { apiCalls: 1 } } : 
        { $inc: { apiCalls: 1, apiErrors: 1 } };

      await SystemStats.findOneAndUpdate(
        { date: today },
        systemUpdate,
        { upsert: true }
      );
    } catch (error) {
      console.error('Error tracking API call:', error);
    }
  }

  // === DETECCIÓN DE PATRONES ===

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

  async updateUserSegmentation(userId) {
    if (userId === this.ADMIN_ID) return;
    
    try {
      const user = await UserStats.findOne({ userId });
      if (!user) return;

      const daysSinceJoin = (new Date() - user.firstInteraction) / (1000 * 60 * 60 * 24);
      let userType = 'nuevo';

      if (daysSinceJoin >= 7) {
        if (user.totalProducts >= 20 || user.affiliateClicks >= 10) {
          userType = 'power_user';
        } else if (user.totalProducts >= 5 && user.alertsReceived >= 3) {
          userType = 'activo';
        } else if (user.totalCommands >= 5) {
          userType = 'ocasional';
        } else {
          userType = 'inactivo';
        }
      }

      // Verificar retención
      const retention = {};
      const now = new Date();
      if (daysSinceJoin >= 7 && user.lastActivity >= new Date(now - 7*24*60*60*1000)) {
        retention.retentionDay7 = true;
      }
      if (daysSinceJoin >= 30 && user.lastActivity >= new Date(now - 30*24*60*60*1000)) {
        retention.retentionDay30 = true;
      }
      if (daysSinceJoin >= 90 && user.lastActivity >= new Date(now - 90*24*60*60*1000)) {
        retention.retentionDay90 = true;
      }

      await UserStats.findOneAndUpdate(
        { userId },
        { 
          $set: { 
            userType,
            ...retention
          }
        }
      );

    } catch (error) {
      console.error('Error updating user segmentation:', error);
    }
  }

  // === REPORTES PARA COMANDOS ADMIN ===

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

  async getTopProducts() {
    try {
      const products = await ProductStats.find({})
        .sort({ totalClicks: -1, totalTrackers: -1 })
        .limit(10)
        .select('asin productName totalTrackers totalClicks totalAlerts');

      return products.map(p => ({
        asin: p.asin,
        name: p.productName || 'Producto sin nombre',
        trackers: p.totalTrackers,
        clicks: p.totalClicks,
        alerts: p.totalAlerts,
        ctr: p.totalAlerts > 0 ? `${((p.totalClicks / p.totalAlerts) * 100).toFixed(1)}%` : '0%'
      }));
    } catch (error) {
      return [];
    }
  }

  async getClickTimeAnalysis() {
    try {
      const users = await UserStats.find({ 
        'clickTimes.0': { $exists: true } 
      }).select('clickTimes clicksByHour');

      let totalResponseTime = 0;
      let count = 0;
      const hourlyClicks = new Map();

      users.forEach(user => {
        // Tiempo respuesta promedio
        user.clickTimes.forEach(click => {
          if (click.alertTime && click.clickTime) {
            const responseMinutes = (click.clickTime - click.alertTime) / (1000 * 60);
            totalResponseTime += responseMinutes;
            count++;
          }
        });

        // Clicks por hora
        if (user.clicksByHour) {
          for (let [hour, clicks] of user.clicksByHour) {
            hourlyClicks.set(parseInt(hour), (hourlyClicks.get(parseInt(hour)) || 0) + clicks);
          }
        }
      });

      const avgResponseTime = count > 0 ? (totalResponseTime / count).toFixed(1) : '0';
      
      const peakHour = [...hourlyClicks.entries()]
        .sort((a, b) => b[1] - a[1])[0];

      return {
        avgResponseTime: `${avgResponseTime} minutos`,
        totalSamples: count,
        peakHour: peakHour ? `${peakHour[0]}:00 (${peakHour[1]} clicks)` : 'No data'
      };
    } catch (error) {
      return { error: 'Error analizando tiempos de click' };
    }
  }

  async getUserSegmentationReport() {
    try {
      const segments = await UserStats.aggregate([
        {
          $group: {
            _id: '$userType',
            count: { $sum: 1 },
            avgProducts: { $avg: '$totalProducts' },
            avgClicks: { $avg: '$affiliateClicks' }
          }
        }
      ]);

      const retention = await UserStats.aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            retention7: { $sum: { $cond: ['$retentionDay7', 1, 0] } },
            retention30: { $sum: { $cond: ['$retentionDay30', 1, 0] } },
            retention90: { $sum: { $cond: ['$retentionDay90', 1, 0] } }
          }
        }
      ]);

      const retentionStats = retention[0] || { total: 0, retention7: 0, retention30: 0, retention90: 0 };

      return {
        segments: segments.map(s => ({
          type: s._id,
          users: s.count,
          avgProducts: s.avgProducts?.toFixed(1) || '0',
          avgClicks: s.avgClicks?.toFixed(1) || '0'
        })),
        retention: {
          day7: retentionStats.total > 0 ? `${((retentionStats.retention7 / retentionStats.total) * 100).toFixed(1)}%` : '0%',
          day30: retentionStats.total > 0 ? `${((retentionStats.retention30 / retentionStats.total) * 100).toFixed(1)}%` : '0%',
          day90: retentionStats.total > 0 ? `${((retentionStats.retention90 / retentionStats.total) * 100).toFixed(1)}%` : '0%'
        }
      };
    } catch (error) {
      return { error: 'Error generando reporte de segmentación' };
    }
  }

  async getViralProducts() {
    try {
      const viral = await ProductStats.find({ isViral: true })
        .sort({ viralDate: -1 })
        .limit(10)
        .select('asin productName totalTrackers viralDate');

      return viral.map(p => ({
        asin: p.asin,
        name: p.productName || 'Producto sin nombre',
        trackers: p.totalTrackers,
        viralDate: p.viralDate?.toISOString().split('T')[0] || 'Unknown'
      }));
    } catch (error) {
      return [];
    }
  }

  async getGrowthMetrics() {
    try {
      const last30Days = new Date();
      last30Days.setDate(last30Days.getDate() - 30);

      const newUsers = await UserStats.countDocuments({
        firstInteraction: { $gte: last30Days }
      });

      const totalUsers = await UserStats.countDocuments({});

      const activeUsers = await UserStats.countDocuments({
        lastActivity: { $gte: last30Days }
      });

      return {
        newUsers30Days: newUsers,
        totalUsers: totalUsers,
        activeUsers30Days: activeUsers,
        growthRate: totalUsers > newUsers ? `${(((newUsers / (totalUsers - newUsers)) * 100)).toFixed(1)}%` : '100%'
      };
    } catch (error) {
      return { error: 'Error obteniendo métricas de crecimiento' };
    }
  }

  async getSystemHealth() {
    try {
      const today = this.getTodayString();
      const systemStats = await SystemStats.findOne({ date: today });

      const productsWithErrors = await ProductStats.countDocuments({
        apiErrors: { $gt: 0 }
      });

      const totalProducts = await ProductStats.countDocuments({});

      return {
        apiCalls: systemStats?.apiCalls || 0,
        apiErrors: systemStats?.apiErrors || 0,
        apiSuccessRate: systemStats?.apiCalls > 0 ? 
          `${(((systemStats.apiCalls - (systemStats.apiErrors || 0)) / systemStats.apiCalls) * 100).toFixed(1)}%` : '100%',
        productsWithErrors,
        totalProducts,
        healthScore: totalProducts > 0 ? 
          `${(((totalProducts - productsWithErrors) / totalProducts) * 100).toFixed(1)}%` : '100%'
      };
    } catch (error) {
      return { error: 'Error obteniendo salud del sistema' };
    }
  }

  async getAllProductsList() {
    try {
      const products = await ProductStats.find({})
        .sort({ totalTrackers: -1 })
        .select('asin productName totalTrackers activeTrackers totalClicks totalAlerts usersTracking');

      return products.map(p => ({
        asin: p.asin,
        name: p.productName || 'Producto sin nombre',
        totalUsers: p.totalTrackers,
        activeUsers: p.activeTrackers,
        clicks: p.totalClicks,
        alerts: p.totalAlerts,
        ctr: p.totalAlerts > 0 ? `${((p.totalClicks / p.totalAlerts) * 100).toFixed(1)}%` : '0%',
        users: p.usersTracking.map(u => u.userId)
      }));
    } catch (error) {
      return [];
    }
  }

  async getAllUsersList() {
    try {
      const users = await UserStats.find({})
        .sort({ totalProducts: -1 })
        .select('userId username firstName lastName totalProducts affiliateClicks userType lastActivity');

      // Obtener productos por usuario
      const userProducts = await Product.aggregate([
        {
          $group: {
            _id: '$user',
            products: { 
              $push: { 
                asin: '$asin',
                name: '$name',
                price: '$price'
              }
            }
          }
        }
      ]);

      const userProductsMap = new Map();
      userProducts.forEach(up => {
        userProductsMap.set(up._id, up.products);
      });

      return users.map(u => ({
        userId: u.userId,
        username: u.username || 'Sin username',
        name: `${u.firstName || ''} ${u.lastName || ''}`.trim() || 'Sin nombre',
        totalProducts: u.totalProducts,
        clicks: u.affiliateClicks,
        type: u.userType,
        lastActive: u.lastActivity?.toISOString().split('T')[0] || 'Never',
        products: userProductsMap.get(u.userId) || []
      }));
    } catch (error) {
      return [];
    }
  }

  // === UTILIDADES ===
  
  getTodayString() {
    return new Date().toISOString().split('T')[0];
  }

  // Actualizar stats diarias
  async updateDailyStats() {
    try {
      const today = this.getTodayString();
      
      const totalUsers = await UserStats.countDocuments({});
      const totalProducts = await Product.countDocuments({});
      const activeUsers = await UserStats.countDocuments({
        lastActivity: { $gte: new Date(Date.now() - 24*60*60*1000) }
      });

      // Calcular CTR del día
      const todayStats = await SystemStats.findOne({ date: today });
      const ctr = todayStats?.alertsSent > 0 ? 
        ((todayStats.totalClicks / todayStats.alertsSent) * 100) : 0;

      await SystemStats.findOneAndUpdate(
        { date: today },
        {
          $set: {
            totalUsers,
            totalProducts,
            activeUsers,
            ctrRate: ctr
          }
        },
        { upsert: true }
      );

    } catch (error) {
      console.error('Error updating daily stats:', error);
    }
  }
}

module.exports = new AnalyticsService();
