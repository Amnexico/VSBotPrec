'use strict';
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  telegramId: {
    type: Number,
    required: true,
    unique: true
  },
  language: {
    type: String,
    default: 'en',
    enum: ['en', 'es', 'fr', 'de']
  },
  preferences: {
    notifications: {
      type: Boolean,
      default: true
    },
    priceAlerts: {
      type: Boolean,
      default: true
    },
    availabilityAlerts: {
      type: Boolean,
      default: false
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastActive: {
    type: Date,
    default: Date.now
  }
});

// Middleware para actualizar lastActive
userSchema.pre('save', function(next) {
  this.lastActive = new Date();
  next();
});

// Método estático para obtener o crear usuario
userSchema.statics.getOrCreate = async function(telegramId, language = 'en') {
  let user = await this.findOne({ telegramId });
  
  if (!user) {
    user = new this({
      telegramId,
      language
    });
    await user.save();
  }
  
  return user;
};

// Método para actualizar idioma
userSchema.methods.updateLanguage = async function(language) {
  this.language = language;
  return await this.save();
};

module.exports = mongoose.model('User', userSchema);
