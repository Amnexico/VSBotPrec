'use strict';
const mongoose = require('mongoose');

const userSettingsSchema = new mongoose.Schema({
  userId: { type: Number, required: true, unique: true, index: true },
  email: { type: String, default: null },
  emailNotifications: { type: Boolean, default: false },
  emailVerified: { type: Boolean, default: false },
  telegramNotifications: { type: Boolean, default: true },
  
  // Metadata
  emailAddedDate: { type: Date, default: null },
  lastEmailSent: { type: Date, default: null },
  emailBounces: { type: Number, default: 0 }
}, {
  timestamps: true
});

module.exports = mongoose.model('UserSettings', userSettingsSchema);
