'use strict';
const crypto = require('crypto');
const https = require('https');

class PaapiClient {
  constructor() {
    // Debug de variables de entorno
    console.log('=== DEBUG VARIABLES ===');
    console.log('process.env.AMAZON_ACCESS_KEY:', process.env.AMAZON_ACCESS_KEY ? 'EXISTE' : 'NO EXISTE');
    console.log('process.env.AMAZON_SECRET_KEY:', process.env.AMAZON_SECRET_KEY ? 'EXISTE' : 'NO EXISTE');
    console.log('process.env.AMAZON_PARTNER_TAG:', process.env.AMAZON_PARTNER_TAG || 'NO DEFINIDA');
    console.log('process.env.AMAZON_TRACKING_TAG:', process.env.AMAZON_TRACKING_TAG || 'NO DEFINIDA');
    console.log('Todas las variables env:', Object.keys(process.env).filter(k => k.startsWith('AMAZON')));
    
    // Usar variables de entorno para seguridad
    this.accessKey = process.env.AMAZON_ACCESS_KEY || 'YOUR_ACCESS_KEY';
    this.secretKey = process.env.AMAZON_SECRET_KEY || 'YOUR_SECRET_KEY';
    this.partnerTag = process.env.AMAZON_PARTNER_TAG || 'vacuumspain-21'; // Para PA-API
    this.trackingTag = process.env.AMAZON_TRACKING_TAG || 'vsoatg-21';    // Para enlaces de afiliado
    
    // Intentar múltiples configuraciones de host/región
    this.configs = [
      { host: 'webservices.amazon.es', region: 'eu-west-1' },
      { host: 'webservices.amazon.com', region: 'us-east-1' },
      { host: 'webservices.amazon.co.uk', region: 'eu-west-1' }
    ];
    
    // Empezar con la configuración para España
    this.currentConfig = 0;
    this.host = this.configs[this.currentConfig].host;
    this.region = this.configs[this.currentConfig].region;
    this.service = 'ProductAdvertisingAPI';
    
    // Validar que las credenciales estén configuradas
    if (this.accessKey === 'YOUR_ACCESS_KEY' || this.secretKey === 'YOUR_SECRET_KEY') {
      console.error('⚠️  CREDENCIALES DE AMAZON NO CONFIGURADAS');
      console.error('Configure las variables de entorno:');
      console.error('AMAZON_ACCESS_KEY, AMAZON_SECRET_KEY, AMAZON_PARTNER_TAG, AMAZON_TRACKING_TAG');
    }
  }

  // Extraer ASIN de URL de Amazon
  extractASIN(url) {
    // Primero intentar el patrón estándar
    let asinMatch = url.match(/\/([A-Z0-9]{10})(?:[/?]|$)/);
    
    // Si no funciona, probar con el patrón /dp/
    if (!asinMatch) {
      asinMatch = url.match(/\/dp\/([A-Z0-9]{10})/);
    }
    
    // También probar con /gp/product/
    if (!asinMatch) {
      asinMatch = url.match(/\/gp\/product\/([A-Z0-9]{10})/);
    }
    
    const asin = asinMatch ? asinMatch[1] : null;
    console.log(`URL: ${url} -> ASIN: ${asin}`);
    return asin;
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
    // Probar diferentes endpoints - el error 404 podría ser por endpoint incorrecto
    const uri = operation === 'GetItems' ? '/paapi5/getitems' : `/paapi5/${operation.toLowerCase()}`;
    const queryString = '';
    const payloadStr = JSON.stringify(payload);
    
    // Debug: Log de configuración
    console.log('=== CONFIGURACIÓN PA-API ===');
    console.log('Host:', this.host);
    console.log('Region:', this.region);
    console.log('Access Key:', this.accessKey ? this.accessKey.substring(0, 8) + '...' : 'NO CONFIGURADA');
    console.log('Partner Tag:', this.partnerTag);
    console.log('Operation:', operation);
    console.log('URI:', uri);
    
    // Debug: Log del payload que enviamos
    console.log('=== PAYLOAD ===');
    console.log(JSON.stringify(payload, null, 2));
    
    const signature = this.createSignature(method, uri, queryString, headers, payloadStr, timestamp);
    
    const dateStamp = timestamp.toISOString().substr(0, 10).replace(/-/g, '');
    const credentialScope = `${dateStamp}/${this.region}/${this.service}/aws4_request`;
    const authorizationHeader = `AWS4-HMAC-SHA256 Credential=${this.accessKey}/${credentialScope}, SignedHeaders=content-type;host;x-amz-date;x-amz-target, Signature=${signature}`;
    
    headers['Authorization'] = authorizationHeader;
    headers['Content-Length'] = Buffer.byteLength(payloadStr);
    
    // Debug: Log de headers (sin mostrar credenciales completas)
    console.log('=== HEADERS ===');
    console.log('Content-Type:', headers['Content-Type']);
    console.log('Host:', headers['Host']);
    console.log('X-Amz-Date:', headers['X-Amz-Date']);
    console.log('X-Amz-Target:', headers['X-Amz-Target']);
    console.log('Authorization:', headers['Authorization'].substring(0, 50) + '...');
    
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
          // Debug: Log de respuesta completa
          console.log('=== RESPUESTA PA-API ===');
          console.log('Status Code:', res.statusCode);
          console.log('Response Headers:', res.headers);
          console.log('Response Body:', data);
          
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
        'Offers.Summaries.HighestPrice',
        'Offers.Summaries.LowestPrice',
        'Images.Primary.Large',
        'ItemInfo.Features'
      ]
    };
    
    try {
      console.log(`Consultando PA-API para ASIN: ${asin}`);
      const response = await this.makeRequest('GetItems', payload);
      
      // Debug: Log de la respuesta completa
      console.log('PA-API Response:', JSON.stringify(response, null, 2));
      
      if (response.ItemsResult && response.ItemsResult.Items && response.ItemsResult.Items.length > 0) {
        return this.parseProductData(response.ItemsResult.Items[0]);
      } else if (response.Errors && response.Errors.length > 0) {
        const errorMsg = response.Errors[0].Message || 'Error desconocido de PA-API';
        const errorCode = response.Errors[0].Code || 'Unknown';
        console.error(`PA-API Error: ${errorCode} - ${errorMsg}`);
        throw new Error(`PA-API Error [${errorCode}]: ${errorMsg}`);
      } else {
        console.error('Respuesta inesperada de PA-API:', response);
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
      image: null,
      affiliateUrl: null // Nueva propiedad para enlaces con vsoatg-21
    };

    // Generar URL de afiliado con el tracking tag específico del bot
    productData.affiliateUrl = `https://www.amazon.es/dp/${item.ASIN}?tag=${this.trackingTag}`;

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

  // Buscar productos por URL con fallback automático
  async getProductByUrl(url) {
    const asin = this.extractASIN(url);
    if (!asin) {
      throw new Error('URL de Amazon inválida - no se pudo extraer ASIN');
    }
    
    // Intentar con diferentes configuraciones si la primera falla
    for (let i = 0; i < this.configs.length; i++) {
      try {
        this.currentConfig = i;
        this.host = this.configs[i].host;
        this.region = this.configs[i].region;
        
        console.log(`Intentando configuración ${i + 1}: ${this.host} (${this.region})`);
        return await this.getProductInfo(asin);
      } catch (error) {
        console.error(`Configuración ${i + 1} falló:`, error.message);
        if (i === this.configs.length - 1) {
          // Si todas las configuraciones fallan, lanzar el último error
          throw error;
        }
      }
    }
  }
}

module.exports = new PaapiClient();
