'use strict';
const crypto = require('crypto');
const https = require('https');

class PaapiClient {
  constructor() {
    this.accessKey = 'AKPAHU7D3E1755448096';
    this.secretKey = 'Fb/vzlEB3i8OpMFlgOLeLr+z1lc1EC1S4zdVae/H';
    this.partnerTag = 'vsoatg-21';
    this.host = 'webservices.amazon.es';
    this.region = 'eu-west-1';
    this.service = 'ProductAdvertisingAPI';
  }

  // Extraer ASIN de URL de Amazon
  extractASIN(url) {
    const asinMatch = url.match(/\/([A-Z0-9]{10})(?:[/?]|$)/);
    return asinMatch ? asinMatch[1] : null;
  }

  // Crear firma AWS4 (implementación manual)
  createSignature(method, uri, queryString, headers, payload, timestamp) {
    const dateStamp = timestamp.toISOString().substr(0, 10).replace(/-/g, '');
    const amzDate = timestamp.toISOString().replace(/[:-]|\.\d{3}/g, '');
    
    // Task 1: Create canonical request
    const canonicalHeaders = Object.keys(headers)
      .sort()
      .map(key => `${key.toLowerCase()}:${headers[key]}\n`)
      .join('');
    
    const signedHeaders = Object.keys(headers)
      .sort()
      .map(key => key.toLowerCase())
      .join(';');
    
    const payloadHash = crypto.createHash('sha256').update(payload).digest('hex');
    
    const canonicalRequest = [
      method,
      uri,
      queryString,
      canonicalHeaders,
      signedHeaders,
      payloadHash
    ].join('\n');
    
    // Task 2: Create string to sign
    const algorithm = 'AWS4-HMAC-SHA256';
    const credentialScope = `${dateStamp}/${this.region}/${this.service}/aws4_request`;
    const stringToSign = [
      algorithm,
      amzDate,
      credentialScope,
      crypto.createHash('sha256').update(canonicalRequest).digest('hex')
    ].join('\n');
    
    // Task 3: Calculate signature
    const kDate = crypto.createHmac('sha256', `AWS4${this.secretKey}`).update(dateStamp).digest();
    const kRegion = crypto.createHmac('sha256', kDate).update(this.region).digest();
    const kService = crypto.createHmac('sha256', kRegion).update(this.service).digest();
    const kSigning = crypto.createHmac('sha256', kService).update('aws4_request').digest();
    const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');
    
    return signature;
  }

  // Realizar solicitud a PA-API usando solo HTTPS nativo
  async makeRequest(operation, payload) {
    const timestamp = new Date();
    const amzDate = timestamp.toISOString().replace(/[:-]|\.\d{3}/g, '');
    
    const headers = {
      'Content-Type': 'application/json; charset=utf-8',
      'Host': this.host,
      'X-Amz-Date': amzDate,
      'X-Amz-Target': `com.amazon.paapi5.v1.ProductAdvertisingAPIv1.${operation}`
    };
    
    const method = 'POST';
    const uri = '/paapi5/getitems';
    const queryString = '';
    const payloadStr = JSON.stringify(payload);
    
    const signature = this.createSignature(method, uri, queryString, headers, payloadStr, timestamp);
    
    const dateStamp = timestamp.toISOString().substr(0, 10).replace(/-/g, '');
    const credentialScope = `${dateStamp}/${this.region}/${this.service}/aws4_request`;
    const authorizationHeader = `AWS4-HMAC-SHA256 Credential=${this.accessKey}/${credentialScope}, SignedHeaders=content-type;host;x-amz-date;x-amz-target, Signature=${signature}`;
    
    headers['Authorization'] = authorizationHeader;
    headers['Content-Length'] = Buffer.byteLength(payloadStr);
    
    return new Promise((resolve, reject) => {
      const options = {
        hostname: this.host,
        port: 443,
        path: uri,
        method: method,
        headers: headers
      };
      
      const req = https.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            if (res.statusCode === 200) {
              resolve(response);
            } else {
              console.error('PA-API Response Error:', res.statusCode, data);
              reject(new Error(`PA-API Error: ${res.statusCode} - ${response.Errors?.[0]?.Message || data}`));
            }
          } catch (error) {
            console.error('PA-API Parse Error:', error.message, data);
            reject(new Error(`Error parsing PA-API response: ${error.message}`));
          }
        });
      });
      
      req.on('error', (error) => {
        console.error('PA-API Request Error:', error);
        reject(new Error(`Request error: ${error.message}`));
      });
      
      req.write(payloadStr);
      req.end();
    });
  }

  // Obtener información del producto por ASIN
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
        'Images.Primary.Large',
        'ItemInfo.Features'
      ]
    };
    
    try {
      console.log(`Consultando PA-API para ASIN: ${asin}`);
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
      console.error('Error en PA-API getProductInfo:', error);
      throw error;
    }
  }

  // Parsear datos del producto desde respuesta PA-API
  parseProductData(item) {
    const productData = {
      asin: item.ASIN,
      name: null,
      price: null,
      currency: null,
      availability: null,
      image: null
    };

    // Extraer título
    if (item.ItemInfo && item.ItemInfo.Title && item.ItemInfo.Title.DisplayValue) {
      productData.name = item.ItemInfo.Title.DisplayValue;
    }

    // Extraer precio y disponibilidad
    if (item.Offers && item.Offers.Listings && item.Offers.Listings.length > 0) {
      const listing = item.Offers.Listings[0];
      
      // Precio
      if (listing.Price && listing.Price.Amount) {
        productData.price = parseFloat(listing.Price.Amount);
        productData.currency = listing.Price.CurrencyCode === 'EUR' ? '€' : listing.Price.CurrencyCode;
      }

      // Disponibilidad
      if (listing.Availability && listing.Availability.Message) {
        productData.availability = listing.Availability.Message;
      }
    }

    // Si no hay precio en Offers, buscar en otras secciones
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
    if (!productData.availability) productData.availability = 'Desconocido';

    console.log('Producto parseado:', productData);
    return productData;
  }

  // Buscar productos por URL
  async getProductByUrl(url) {
    const asin = this.extractASIN(url);
    if (!asin) {
      throw new Error('URL de Amazon inválida - no se pudo extraer ASIN');
    }
    
    return await this.getProductInfo(asin);
  }
}

module.exports = new PaapiClient();
