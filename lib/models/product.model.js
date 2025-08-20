'use strict';
const mongoose = require('mongoose');
const ProductSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    url: { type: String, required: true },
    asin: { type: String, required: true, index: true },
    price: { type: Number, default: 0, min: 0 },
    currency: { type: String },
    availability: { type: String },
    user: { type: Number, required: true },
    lastCheck: { type: Number, default: 0 },
    preferences: {
      targetPrice: { type: Number, default: 0, min: 0 },
      availabilityAlerts: { type: Boolean, default: false },
      alertType: {
        type: String,
        enum: ['percentage', 'custom', 'any_drop', 'stock'],
        default: 'percentage'
      },
      discountPercent: {
        type: Number,
        default: 0,
        min: 0,
        max: 100
      },
      stockAlerts: {
        type: Boolean,
        default: false
      }
    }
  },
  { timestamps: true }
);
module.exports = mongoose.model('Product', ProductSchema);
