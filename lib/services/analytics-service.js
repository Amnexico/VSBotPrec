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

  async trackApiCall(asin, success = true, responseTime = 0) {
    try {
      // Product stats
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
        if (user.totalProducts >= 20 || user.alertsReceived >= 15) {
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

  async getBasicStats() {
    try {
      const result = await ProductStats.aggregate([
        {
          $group: {
            _id: null,
            totalAlerts: { $sum: '$totalAlerts' }
          }
        }
      ]);

      const stats = result[0] || { totalAlerts: 0 };

      return {
        totalAlerts: stats.totalAlerts
      };
    } catch (error) {
      return { error: 'Error generando estadísticas básicas' };
    }
  }

  async getTopProducts() {
    try {
      const products = await ProductStats.find({})
        .sort({ totalTrackers: -1, totalAlerts: -1 })
        .limit(10)
        .select('asin productName totalTrackers totalAlerts');

      return products.map(p => ({
        asin: p.asin,
        name: p.productName || 'Producto sin nombre',
        trackers: p.totalTrackers,
        alerts: p.totalAlerts
      }));
    } catch (error) {
      return [];
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
            avgAlerts: { $avg: '$alertsReceived' }
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
          avgAlerts: s.avgAlerts?.toFixed(1) || '0'
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
        .select('asin productName totalTrackers activeTrackers totalAlerts usersTracking');

      return products.map(p => ({
        asin: p.asin,
        name: p.productName || 'Producto sin nombre',
        totalUsers: p.totalTrackers,
        activeUsers: p.activeTrackers,
        alerts: p.totalAlerts,
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
        .select('userId username firstName lastName totalProducts alertsReceived userType lastActivity');

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
        alertsReceived: u.alertsReceived,
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

      await SystemStats.findOneAndUpdate(
        { date: today },
        {
          $set: {
            totalUsers,
            totalProducts,
            activeUsers
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
