'use strict';
const aws4 = require('aws4');
const https = require('https');

class PaapiClient {
  constructor() {
    // Configuración PA-API con nombres correctos de Railway
    this.accessKey = process.env.AWS_ACCESS_KEY_ID || process.env.AMAZON_ACCESS_KEY || 'AKPAHU7D3E1755448096';
    this.secretKey = process.env.AWS_SECRET_ACCESS_KEY || process.env.AMAZON_SECRET_KEY || 'Fb/vzlEB3i8OpMFlgOLeLr+z1lc1EC1S4zdVae/H';
    this.partnerTag = process.env.AMAZON_PARTNER_TAG || 'vacuumspain-21';
    this.trackingTag = process.env.AMAZON_TRACKING_TAG || 'vsoatg-21';
    
    // Configuración específica para España
    this.host = 'webservices.amazon.es';
    this.region = 'eu-west-1';
    this.service = 'ProductAdvertisingAPI';
    
    // Validar configuración
    this.validateConfig();
    
    console.log('PA-API Cliente inicializado para Amazon España');
    console.log(`Partner Tag: ${this.partnerTag}`);
    console.log(`Tracking Tag: ${this.trackingTag}`);
    console.log(`Host: ${this.host}`);
    console.log(`Region: ${this.region}`);
  }

  validateConfig() {
    // Informar sobre configuración
    console.log(`🔑 Access Key: ${this.accessKey ? this.accessKey.substring(0, 8) + '...' : 'NOT SET'}`);
    console.log(`🔐 Secret Key: ${this.secretKey ? 'SET (' + this.secretKey.length + ' chars)' : 'NOT SET'}`);
    console.log(`🏷️ Partner Tag: ${this.partnerTag}`);
    console.log(`📍 Tracking Tag: ${this.trackingTag}`);

    // Validar que tenemos credenciales
    if (!this.accessKey || !this.secretKey) {
      throw new Error('Faltan credenciales de Amazon PA-API');
    }

    // Validar formato de Partner Tag
    if (!this.partnerTag.includes('-21')) {
      console.warn(`⚠️ Warning: Partner Tag "${this.partnerTag}" no termina en -21`);
    }

    console.log('✅ Configuración PA-API validada correctamente');
  }

  extractASIN(url) {
    let asinMatch = url.match(/\/([A-Z0-9]{10})(?:[/?]|$)/);
    if (!asinMatch) asinMatch = url.match(/\/dp\/([A-Z0-9]{10})/);
    return asinMatch ? asinMatch[1] : null;
  }

  // Crear payload específico para España que evita InternalFailure
  createPayload(asin) {
    return {
      PartnerTag: this.partnerTag,
      PartnerType: 'Associates',
      Marketplace: 'www.amazon.es',
      Operation: 'GetItems',
      ItemIds: [asin],
      Resources: [
        'ItemInfo.Title',
        'ItemInfo.Features', 
        'Offers.Listings.Price',
        'Offers.Listings.Availability.Message',
        'Images.Primary.Medium',
        'Images.Primary.Large'
      ],
      // Configuración específica para evitar errores en España
      ItemIdType: 'ASIN',
      Condition: 'New'
    };
  }

  // Configuración de request optimizada para España
  createRequestOptions(payload) {
    const body = JSON.stringify(payload);
    
    const requestOptions = {
      host: this.host,
      path: '/paapi5/getitems',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
        'X-Amz-Target': 'com.amazon.paapi5.v1.ProductAdvertisingAPIv1.GetItems',
        'X-Amz-Content-Sha256': this.getContentSHA256(body)
      },
      body: body,
      service: this.service,
      region: this.region
    };

    // Firmar con AWS4
    const signedRequest = aws4.sign(requestOptions, {
      accessKeyId: this.accessKey,
      secretAccessKey: this.secretKey
    });

    console.log(`🔐 Request firmado para ASIN: ${payload.ItemIds[0]}`);
    return signedRequest;
  }

  getContentSHA256(content) {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
  }

  // Hacer request con retry automático y mejor error handling
  async makeRequest(asin, retryCount = 0) {
    const maxRetries = 3;
    
    try {
      console.log(`📡 Intentando PA-API para ${asin} (intento ${retryCount + 1}/${maxRetries + 1})`);
      
      const payload = this.createPayload(asin);
      const requestOptions = this.createRequestOptions(payload);
      
      console.log(`📤 Payload enviado:`, JSON.stringify(payload, null, 2));
      
      return new Promise((resolve, reject) => {
        const req = https.request(requestOptions, (res) => {
          let data = '';
          
          console.log(`📥 Status Code: ${res.statusCode}`);
          console.log(`📥 Headers:`, res.headers);
          
          res.on('data', (chunk) => data += chunk);
          
          res.on('end', () => {
            console.log(`📄 Response recibida: ${data.length} caracteres`);
            
            try {
              const response = JSON.parse(data);
              
              if (res.statusCode === 200 && response.ItemsResult?.Items) {
                console.log(`✅ PA-API Success para ${asin}`);
                resolve(this.parseResponse(response, asin));
              } else {
                // Log detallado del error
                console.error(`❌ PA-API Error para ${asin}:`);
                console.error(`Status: ${res.statusCode}`);
                console.error(`Response:`, JSON.stringify(response, null, 2));
                
                // Analizar errores específicos
                if (response.Errors) {
                  response.Errors.forEach(error => {
                    console.error(`Error Code: ${error.Code}`);
                    console.error(`Error Message: ${error.Message}`);
                  });
                }
                
                reject(new Error(`PA-API Error ${res.statusCode}: ${JSON.stringify(response)}`));
              }
            } catch (parseError) {
              console.error(`❌ JSON Parse Error:`, parseError.message);
              console.error(`Raw response:`, data);
              reject(new Error(`Invalid JSON response: ${parseError.message}`));
            }
          });
        });

        req.on('error', (error) => {
          console.error(`🔌 Request Error para ${asin}:`, error.message);
          reject(error);
        });

        req.setTimeout(15000, () => {
          req.destroy();
          reject(new Error('Request timeout'));
        });

        req.write(requestOptions.body);
        req.end();
      });
      
    } catch (error) {
      console.error(`💥 Error en intento ${retryCount + 1} para ${asin}:`, error.message);
      
      // Retry automático con backoff exponencial
      if (retryCount < maxRetries) {
        const delay = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
        console.log(`⏱️ Reintentando en ${delay}ms...`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.makeRequest(asin, retryCount + 1);
      }
      
      // Si agotamos los reintentos, devolver producto de fallback
      console.log(`❌ Agotados los reintentos para ${asin}, usando fallback`);
      return this.createFallbackProduct(asin);
    }
  }

  // Parser de respuesta mejorado
  parseResponse(response, asin) {
    try {
      const item = response.ItemsResult.Items[0];
      
      // Extraer información básica
      const title = item.ItemInfo?.Title?.DisplayValue || 'Producto Amazon';
      
      // Extraer precio
      let price = 0;
      let currency = '€';
      
      if (item.Offers?.Listings?.[0]?.Price) {
        const priceInfo = item.Offers.Listings[0].Price;
        price = priceInfo.Amount || 0;
        currency = priceInfo.Currency || '€';
      }
      
      // Extraer disponibilidad
      let availability = 'Disponible';
      if (item.Offers?.Listings?.[0]?.Availability?.Message) {
        availability = item.Offers.Listings[0].Availability.Message;
      }
      
      // Extraer imagen
      let image = '';
      if (item.Images?.Primary?.Large?.URL) {
        image = item.Images.Primary.Large.URL;
      } else if (item.Images?.Primary?.Medium?.URL) {
        image = item.Images.Primary.Medium.URL;
      }
      
      const result = {
        asin: asin,
        name: title,
        price: price,
        currency: currency,
        availability: availability,
        image: image,
        affiliateUrl: `https://www.amazon.es/dp/${asin}?tag=${this.trackingTag}`,
        lastUpdated: new Date().toISOString(),
        source: 'PA-API'
      };
      
      console.log(`✅ Producto parseado: ${title} - ${currency}${price}`);
      return result;
      
    } catch (parseError) {
      console.error(`❌ Error parseando respuesta para ${asin}:`, parseError.message);
      return this.createFallbackProduct(asin);
    }
  }

  // Producto de fallback con enlace de afiliado funcional
  createFallbackProduct(asin) {
    return {
      asin: asin,
      name: 'Ver producto en Amazon',
      price: 0,
      currency: '€',
      availability: 'Ver en Amazon',
      image: '',
      affiliateUrl: `https://www.amazon.es/dp/${asin}?tag=${this.trackingTag}`,
      lastUpdated: new Date().toISOString(),
      source: 'fallback'
    };
  }

  // Métodos públicos principales
  async getProductByUrl(url) {
    const asin = this.extractASIN(url);
    if (!asin) {
      throw new Error('URL de Amazon inválida - no se pudo extraer ASIN');
    }

    console.log(`🛍️ Obteniendo producto ${asin} via PA-API`);
    return await this.makeRequest(asin);
  }

  async getProductInfo(asin) {
    if (!asin || !/^[A-Z0-9]{10}$/.test(asin)) {
      throw new Error('ASIN inválido');
    }
    
    return await this.makeRequest(asin);
  }

  // Método de diagnóstico para debuggear problemas
  async diagnose() {
    console.log('\n🔍 DIAGNÓSTICO PA-API');
    console.log('='.repeat(50));
    console.log(`Access Key: ${this.accessKey ? this.accessKey.substring(0, 8) + '...' : 'MISSING'}`);
    console.log(`Secret Key: ${this.secretKey ? 'SET (' + this.secretKey.length + ' chars)' : 'MISSING'}`);
    console.log(`Partner Tag: ${this.partnerTag}`);
    console.log(`Host: ${this.host}`);
    console.log(`Region: ${this.region}`);
    console.log('='.repeat(50));
    
    // Test con ASIN conocido
    const testASIN = 'B08N5WRWNW'; // Echo Dot popular
    console.log(`\n🧪 Probando con ASIN conocido: ${testASIN}`);
    
    try {
      const result = await this.getProductInfo(testASIN);
      console.log(`✅ Test exitoso:`, result);
      return { success: true, result };
    } catch (error) {
      console.log(`❌ Test falló:`, error.message);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new PaapiClient();
