'use strict';
const mongoose = require('mongoose');

const productGroupSchema = new mongoose.Schema({
  groupId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  mainASIN: {
    type: String,
    required: true,
    index: true
  },
  variants: [{
    type: String,
    required: true
  }],
  productName: {
    type: String,
    required: true
  },
  colors: {
    type: Map,
    of: String,
    default: new Map()
  },
  isRobotVacuum: {
    type: Boolean,
    default: false
  },
  createdBy: {
    type: Number, // Admin user ID
    required: true
  }
}, {
  timestamps: true
});

// Índice compuesto para búsquedas eficientes
productGroupSchema.index({ variants: 1 });
productGroupSchema.index({ mainASIN: 1, isRobotVacuum: 1 });

// Método para verificar si un ASIN pertenece a este grupo
productGroupSchema.methods.hasASIN = function(asin) {
  return this.variants.includes(asin);
};

// Método para obtener el color de una variante
productGroupSchema.methods.getVariantColor = function(asin) {
  return this.colors.get(asin) || 'Sin especificar';
};

// Método estático para encontrar grupo por ASIN
productGroupSchema.statics.findByASIN = async function(asin) {
  return this.findOne({ variants: asin });
};

module.exports = mongoose.model('ProductGroup', productGroupSchema);
