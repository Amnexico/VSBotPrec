'use strict';
const Product = require('./product.model');
const PriceHistory = require('./price-history');
const UserStats = require('./user-stats');
const ProductStats = require('./product-stats');
const SystemStats = require('./system-stats');
const UserSettings = require('./user-settings'); // AÑADIDO

module.exports = { 
  Product, 
  PriceHistory, 
  UserStats, 
  ProductStats, 
  SystemStats,
  UserSettings  // AÑADIDO
};
