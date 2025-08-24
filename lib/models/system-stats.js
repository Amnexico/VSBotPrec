'use strict';
const mongoose = require('mongoose');

const systemStatsSchema = new mongoose.Schema({
  date: { type: String, required: true, unique: true }, // YYYY-MM-DD
  
  // Usuarios
  totalUsers: { type: Number, default: 0 },
  newUsers: { type: Number, default: 0 },
  activeUsers: { type: Number, default: 0 },
  
  // Productos
  totalProducts: { type: Number, default: 0 },
  newProducts: { type: Number, default: 0 },
  
  // Alertas y conversión
  alertsSent: { type: Number, default: 0 },
  ctrRate: { type: Number, default: 0 },
  
  // Performance técnico
  apiCalls: { type: Number, default: 0 },
  apiErrors: { type: Number, default: 0 },
  botErrors: { type: Number, default: 0 },
  
  // Estimaciones monetización
  estimatedCommissions: { type: Number, default: 0 }
}, {
  timestamps: true
});

module.exports = mongoose.model('SystemStats', systemStatsSchema);
