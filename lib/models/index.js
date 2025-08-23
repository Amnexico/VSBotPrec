'use strict';
const Product = require('./product.model');
const PriceHistory = require('./price-history');
const UserStats = require('./user-stats');
const ProductStats = require('./product-stats');
const SystemStats = require('./system-stats');

module.exports = { 
  Product, 
  PriceHistory, 
  UserStats, 
  ProductStats, 
  SystemStats 
};
