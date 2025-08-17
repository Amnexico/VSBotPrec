'use strict';
const paapiClient = require('./paapi-client');

class AmazonProductPage {
  constructor(url) {
    this.url = url;
    this.productData = null;
  }

  async init() {
    try {
      console.log(`Inicializando producto desde URL: ${this.url}`);
      this.productData = await paapiClient.getProductByUrl(this.url);
      console.log('Producto inicializado:', this.productData);
      return this;
    } catch (error) {
      console.error('Error obteniendo producto:', error);
      throw error;
    }
  }

  get price() {
    return this.productData ? this.productData.price : null;
  }

  get currency() {
    return this.productData ? this.productData.currency : '€';
  }

  get availability() {
    return this.productData ? this.productData.availability : 'Desconocido';
  }

  get name() {
    return this.productData ? this.productData.name : null;
  }

  get asin() {
    return this.productData ? this.productData.asin : null;
  }

  get image() {
    return this.productData ? this.productData.image : null;
  }
}

module.exports = AmazonProductPage;
