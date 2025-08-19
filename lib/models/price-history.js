'use strict';
const mongoose = require('mongoose');

const priceHistorySchema = new mongoose.Schema({
  asin: {
    type: String,
    required: true,
    index: true
  },
  price: {
    type: Number,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  currency: {
    type: String,
    default: 'EUR'
  }
});

priceHistorySchema.index({ asin: 1, timestamp: -1 });
priceHistorySchema.index({ timestamp: 1 }, { expireAfterSeconds: 31536000 });

module.exports = mongoose.model('PriceHistory', priceHistorySchema);
