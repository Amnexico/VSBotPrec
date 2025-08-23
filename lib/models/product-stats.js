'use strict';
const mongoose = require('mongoose');

const productStatsSchema = new mongoose.Schema({
  asin: { type: String, required: true, unique: true, index: true },
  productName: String,
  currentPrice: Number,
  
  // Popularidad
  totalTrackers: { type: Number, default: 1 },
  activeTrackers: { type: Number, default: 1 },
  usersTracking: [{ 
    userId: Number,
    addedDate: { type: Date, default: Date.now }
  }],
  
  // Métricas de conversión
  totalAlerts: { type: Number, default: 0 },
  totalClicks: { type: Number, default: 0 },
  clicksByUser: [{
    userId: Number,
    clicks: { type: Number, default: 0 },
    lastClick: Date
  }],
  
  // Detección viral
  isViral: { type: Boolean, default: false },
  viralDate: Date,
  
  // Performance PA-API
  apiCalls: { type: Number, default: 0 },
  apiErrors: { type: Number, default: 0 },
  lastApiError: Date,
  avgResponseTime: { type: Number, default: 0 },
  
  // Estacionalidad
  monthlyTracking: {
    type: Map,
    of: Number,
    default: new Map()
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('ProductStats', productStatsSchema);
