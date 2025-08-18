'use strict';
const https = require('https');
const aws4 = require('aws4');

class PaapiClient {
  constructor() {
    // Usar variables de entorno para seguridad
    this.accessKey = process.env.AMAZON_ACCESS_KEY;
    this.secretKey = process.env.AMAZON_SECRET_KEY;
    this.partnerTag = process.env.AMAZON_PARTNER_TAG || 'vacuumspain-21';
    this.trackingTag = process.env.AMAZON_TRACKING_TAG || 'vsoatg-21';
    
    // FALLBACK TEMPORAL
    if (!this.accessKey) {
      console.log('Usando credenciales fallback');
      this.accessKey = 'AKIAJ3EGVBIPDVM6T4CA';
      this.secretKey = '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';
    }
    
    this.host = 'webservices.amazon.es';
    this.region = 'eu-west-1';
    this.service = 'ProductAdvertisingAPI';
    
    console.log('PA-API Client inicializado con aws4');
  }

  extractASIN(url) {
    let asinMatch = url.match(/\/([A-Z0-9]{10})(?:[/?]|$)/);
    if (!asinMatch) asinMatch = url.match(/\/dp\/([A-Z0-9]{10})/);
    return asinMatch ? asinMatch[1] : null;
  }

  async makeRequest(operation, payload) {
    const startTime = Date.now();
    const payloadStr = JSON.stringify(payload);
    
    const options = {
      host: this.host,
      path: '/paapi5/getitems',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'X-Amz-Target': 'com.amazon.paapi5.v1.ProductAdvertisingAPIv1.GetItems'
      },
      body: payloadStr,
      service: this.service,
      region: this.region
    };

    // Firmar automáticamente con aws4
    aws4.sign(options, {
      accessKeyId: this.accessKey,
      secretAccessKey: this.secretKey
    });

    console.log('Solicitud firmada con aws4:', {
      host: options.host,
      path: options.path,
      operation: operation
    });

    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          const endTime = Date.now();
          const responseTime = endTime - startTime;
          
          console.log('Respuesta PA-API:', res.statusCode);
          console.log('Response Time:', responseTime + 'ms');
          
          // Extraer RequestID de headers
          const requestId = res.headers['x-amzn-requestid'] || res.headers['x-amz-request-id'] || 'No disponible';
          console.log('Request ID:', requestId);
          
          try {
            const response = JSON.parse(data);
            if (res.statusCode === 200) {
              resolve(response);
            } else {
              console.error('=== INFORMACIÓN PARA AMAZON SOPORTE ===');
              console.error('HTTP Status:', res.statusCode);
              console.error('Response Time:', responseTime + 'ms');
              console.error('Request ID:', requestId);
              console.error('JSON Response:', data);
              console.error('==========================================');
              
              reject(new Error(`PA-API Error: ${res.statusCode} - ${response.Errors?.[0]?.Message || data}`));
            }
          } catch (error) {
            console.error('Error parsing response:', error.message);
            reject(new Error(`Error parsing PA-API response: ${error.message}`));
          }
        });
      });
      
      req.on('error', (error) => {
        console.error('Request error:', error);
        reject(new Error(`Request error: ${error.message}`));
      });
      
      req.write(payloadStr);
      req.end();
    });
  }

  async getProductInfo(asin) {
    const payload = {
      PartnerTag: this.partnerTag,
      PartnerType: 'Associates',
      Marketplace: 'www.amazon.es',
      ItemIds: [asin],
      Resources: [
        'ItemInfo.Title',
        'Offers.Listings.Price',
        'Offers.Listings.Availability.Message',
        'Offers.Summaries.HighestPrice',
        'Offers.Summaries.LowestPrice',
        'Images.Primary.Large'
      ]
    };
    
    try {
      const response = await this.makeRequest('GetItems', payload);
      
      if (response.ItemsResult && response.ItemsResult.Items && response.ItemsResult.Items.length > 0) {
        return this.parseProductData(response.ItemsResult.Items[0]);
      } else if (response.Errors && response.Errors.length > 0) {
        const errorMsg = response.Errors[0].Message || 'Error desconocido de PA-API';
        throw new Error(`PA-API Error: ${errorMsg}`);
      } else {
        throw new Error('Producto no encontrado en PA-API');
      }
    } catch (error) {
      console.error('Error en getProductInfo:', error);
      throw error;
    }
  }

  parseProductData(item) {
    const productData = {
      asin: item.ASIN,
      name: null,
      price: null,
      currency: null,
      availability: null,
      image: null,
      affiliateUrl: `https://www.amazon.es/dp/${item.ASIN}?tag=${this.trackingTag}`
    };

    // Extraer título
    if (item.ItemInfo && item.ItemInfo.Title && item.ItemInfo.Title.DisplayValue) {
      productData.name = item.ItemInfo.Title.DisplayValue;
    }

    // Extraer precio
    if (item.Offers && item.Offers.Listings && item.Offers.Listings.length > 0) {
      const listing = item.Offers.Listings[0];
      
      if (listing.Price && listing.Price.Amount) {
        productData.price = parseFloat(listing.Price.Amount);
        productData.currency = listing.Price.CurrencyCode === 'EUR' ? '€' : listing.Price.CurrencyCode;
      }

      if (listing.Availability && listing.Availability.Message) {
        productData.availability = listing.Availability.Message;
      }
    }

    // Fallback a Summaries si no hay precio en Listings
    if (!productData.price && item.Offers && item.Offers.Summaries && item.Offers.Summaries.length > 0) {
      const summary = item.Offers.Summaries[0];
      if (summary.LowestPrice && summary.LowestPrice.Amount) {
        productData.price = parseFloat(summary.LowestPrice.Amount);
        productData.currency = summary.LowestPrice.CurrencyCode === 'EUR' ? '€' : summary.LowestPrice.CurrencyCode;
      }
    }

    // Imagen
    if (item.Images && item.Images.Primary && item.Images.Primary.Large && item.Images.Primary.Large.URL) {
      productData.image = item.Images.Primary.Large.URL;
    }

    // Valores por defecto
    if (!productData.price) productData.price = 0;
    if (!productData.currency) productData.currency = '€';
    if (!productData.availability) productData.availability = 'Disponible';

    console.log('Producto parseado exitosamente:', productData.name, productData.price + productData.currency);
    return productData;
  }

  async getProductByUrl(url) {
    const asin = this.extractASIN(url);
    if (!asin) {
      throw new Error('URL de Amazon inválida - no se pudo extraer ASIN');
    }
    
    try {
      console.log(`Consultando PA-API para ASIN: ${asin}`);
      return await this.getProductInfo(asin);
    } catch (error) {
      console.error('PA-API falló:', error.message);
      // Si PA-API falla, usar datos básicos
      return {
        asin: asin,
        name: 'Producto Amazon',
        price: 0,
        currency: '€',
        availability: 'Consultar disponibilidad',
        image: '',
        affiliateUrl: `https://www.amazon.es/dp/${asin}?tag=${this.trackingTag}`
      };
    }
  }
}

module.exports = new PaapiClient();
