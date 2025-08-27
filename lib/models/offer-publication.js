// Crear nuevo archivo: lib/models/offer-publication.js

'use strict';
const mongoose = require('mongoose');

const offerPublicationSchema = new mongoose.Schema({
  asin: { type: String, required: true, index: true },
  productName: { type: String, required: true },
  price: { type: Number, required: true },
  previousPrice: { type: Number, required: true },
  discountPercent: { type: Number, required: true },
  publishDate: { type: Date, default: Date.now, index: true },
  channels: [{
    type: String,
    enum: ['group', 'channel'],
    required: true
  }],
  groupMessageId: { type: Number },
  channelMessageId: { type: Number },
  success: { type: Boolean, default: false },
  error: { type: String },
  imageUrl: { type: String },
  affiliateUrl: { type: String }
}, {
  timestamps: true
});

// Índice compuesto para búsquedas eficientes
offerPublicationSchema.index({ asin: 1, publishDate: 1 });
offerPublicationSchema.index({ publishDate: 1 });

module.exports = mongoose.model('OfferPublication', offerPublicationSchema);
