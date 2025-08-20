'use strict';
const mongoose = require('mongoose');
const ProductSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    url: { type: String, required: true },
    asin: { type: String, required: true, index: true },
    price: { type: Number, default: 0, min: 0 },
    listPrice: { type: Number, default: 0, min: 0 }, // NUEVO: Precio original sin descuentos
    displayPrice: { type: Number, default: 0, min: 0 }, // NUEVO: Precio mostrado en Amazon
    currency: { type: String },
    availability: { type: String },
    user: { type: Number, required: true },
    lastCheck: { type: Number, default: 0 },
    totalSavings: { type: Number, default: 0, min: 0 }, // NUEVO: Ahorro total calculado
    isPrimeExclusive: { type: Boolean, default: false }, // NUEVO: Si requiere Prime
    promotionDetails: [{ // NUEVO: Detalles de cupones y ofertas
      type: { type: String },
      description: { type: String },
      amount: { type: Number, default: 0 }
    }],
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
