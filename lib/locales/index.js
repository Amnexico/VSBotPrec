// =============================================================================
// lib/locales/index.js - Sistema de localización
// =============================================================================
'use strict';

const path = require('path');
const fs = require('fs');
const { User } = require('../models');

class Localization {
  constructor() {
    this.languages = {};
    this.defaultLang = 'en';
    this.loadLanguages();
  }

  // Cargar todos los archivos de idioma
  loadLanguages() {
    const localesDir = path.join(__dirname);
    const files = fs.readdirSync(localesDir).filter(file => file.endsWith('.json'));
    
    files.forEach(file => {
      const lang = path.basename(file, '.json');
      try {
        this.languages[lang] = require(path.join(localesDir, file));
      } catch (error) {
        console.error(`Error loading language file ${file}:`, error);
      }
    });
  }

  // Obtener idioma del usuario desde base de datos
  async getUserLanguage(userId) {
    try {
      const user = await User.findOne({ telegramId: userId });
      return user?.language || this.defaultLang;
    } catch (error) {
      return this.defaultLang;
    }
  }

  // Obtener texto traducido (versión síncrona para casos simples)
  getTextSync(key, language = this.defaultLang, replacements = {}) {
    const lang = this.languages[language] || this.languages[this.defaultLang];
    let text = this.getNestedValue(lang, key) || key;
    
    // Reemplazar variables
    Object.keys(replacements).forEach(placeholder => {
      text = text.replace(new RegExp(`{${placeholder}}`, 'g'), replacements[placeholder]);
    });
    
    return text;
  }

  // Obtener texto traducido (versión asíncrona)
  async getText(key, userId, replacements = {}) {
    const userLang = await this.getUserLanguage(userId);
    return this.getTextSync(key, userLang, replacements);
  }

  // Obtener valor anidado del objeto (ej: "welcome.message")
  getNestedValue(obj, key) {
    return key.split('.').reduce((o, k) => (o || {})[k], obj);
  }

  // Cambiar idioma del usuario
  async setUserLanguage(userId, language) {
    try {
      await User.updateOne(
        { telegramId: userId }, 
        { language: language }, 
        { upsert: true }
      );
      return true;
    } catch (error) {
      console.error('Error setting user language:', error);
      return false;
    }
  }

  // Obtener lista de idiomas disponibles
  getAvailableLanguages() {
    return Object.keys(this.languages);
  }
}

module.exports = new Localization();
