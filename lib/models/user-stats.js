'use strict';
const mongoose = require('mongoose');

const userStatsSchema = new mongoose.Schema({
  userId: { type: Number, required: true, unique: true, index: true },
  username: String,
  firstName: String,
  lastName: String,
  
  // Métricas básicas
  firstInteraction: { type: Date, default: Date.now },
  lastActivity: { type: Date, default: Date.now },
  totalCommands: { type: Number, default: 0 },
  totalProducts: { type: Number, default: 0 },
  
  // Métricas de monetización
  alertsReceived: { type: Number, default: 0 },
  affiliateClicks: { type: Number, default: 0 },
  clickTimes: [{ 
    alertTime: Date, 
    clickTime: Date,
    asin: String 
  }],
  estimatedCommissions: { type: Number, default: 0 },
  
  // Segmentación automática
  userType: {
    type: String,
    enum: ['nuevo', 'ocasional', 'activo', 'power_user', 'inactivo'],
    default: 'nuevo'
  },
  retentionDay7: { type: Boolean, default: false },
  retentionDay30: { type: Boolean, default: false },
  retentionDay90: { type: Boolean, default: false },
  
  // Preferencias de alertas
  alertTypeStats: {
    percentage: { type: Number, default: 0 },
    custom: { type: Number, default: 0 },
    any_drop: { type: Number, default: 0 },
    stock: { type: Number, default: 0 }
  },
  
  // Actividad por horarios
  clicksByHour: {
    type: Map,
    of: Number,
    default: new Map()
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('UserStats', userStatsSchema);
