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
    // ✅ CORRECCIÓN CRÍTICA: Agregar "v1" al final
    this.service = 'ProductAdvertisingAPIv1';  // ❌ ANTES: 'ProductAdvertisingAPI'
    
    console.log('PA-API Client inicializado con aws4 - Service:', this.service);
  }

  extractASIN(url) {
    let asinMatch = url.match(/\/([A-Z0-9]{10})(?:[/?]|$)/);
    if (!asinMatch) asinMatch = url.match(/\/dp\/([A-Z0-9]{10})/);
    return asinMatch ? asinMatch[1] : null;
  }

  async makeRequest(operation, payload) {
    const payloadStr = JSON.stringify(payload);
    
    const options = {
      host: this.host,
      path: '/paapi5/getitems',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        // ✅ VERIFICAR: Target header con service correcto
        'X-Amz-Target': `com.amazon.paapi5.v1.ProductAdvertisingAPIv1.${operation}`
      },
      body: payloadStr,
      service: this.service,  // ✅ Ahora usa 'ProductAdvertisingAPIv1'
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
      service: options.service,  // ✅ Log del service correcto
      operation: operation,
      target: options.headers['X-Amz-Target']
    });

    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          console.log(`Respuesta PA-API: ${res.statusCode}`);
          console.log('Headers respuesta:', res.headers);
          console.log('Cuerpo respuesta (primeros 200 chars):', data.substring(0, 200));
          
          try {
            const response = JSON.parse(data);
            if (res.statusCode === 200) {
              resolve(response);
            } else {
              console.error('Error PA-API:', res.statusCode, response);
              reject(new Error(`PA-API Error: ${res.statusCode} - ${response.Errors?.[0]?.Message || data}`));
            }
          } catch (error) {
            console.error('Error parsing response:', error.message, 'Raw data:', data);
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
    
    console.log('Payload enviado:', JSON.stringify(payload, null, 2));
    
    try {
      const response = await this.makeRequest('GetItems', payload);
      
      if (response.ItemsResult && response.ItemsResult.Items && response.ItemsResult.Items.length > 0) {
        return this.parseProductData(response.ItemsResult.Items[0]);
      } else if (response.Errors && response.Errors.length > 0) {
        const errorMsg = response.Errors[0].Message || 'Error desconocido de PA-API';
        console.error('Error en respuesta PA-API:', response.Errors[0]);
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
// DIAGNÓSTICO TEMPORAL - Agregar ANTES de "module.exports = new PaapiClient();"

async function runCredentialDiagnostic() {
  console.log('\n🚀 EJECUTANDO DIAGNÓSTICO PA-API...');
  console.log('=' .repeat(50));
  
  // Test con un ASIN muy común (Echo Dot)
  const testAsin = 'B08N5WRWNW';
  
  const payload = {
    PartnerTag: this.partnerTag,
    PartnerType: 'Associates',
    Marketplace: 'www.amazon.es',
    ItemIds: [testAsin],
    Resources: ['ItemInfo.Title']
  };

  console.log('📋 CONFIGURACIÓN ACTUAL:');
  console.log('- Host:', this.host);
  console.log('- Region:', this.region);
  console.log('- Service:', this.service);
  console.log('- Access Key:', this.accessKey ? this.accessKey.substring(0, 8) + '...' : 'NO DEFINIDA');
  console.log('- Partner Tag:', this.partnerTag);
  console.log('- Test ASIN:', testAsin);
  console.log();

  try {
    const response = await this.makeRequest('GetItems', payload);
    console.log('✅ ÉXITO: Credenciales funcionando correctamente');
    console.log('📦 Respuesta:', JSON.stringify(response, null, 2));
  } catch (error) {
    console.log('❌ ERROR EN DIAGNÓSTICO:', error.message);
    
    if (error.message.includes('InternalFailure')) {
      console.log('\n🔍 ANÁLISIS DEL ERROR InternalFailure:');
      console.log('   1. ❌ Access Key inválida o expirada');
      console.log('   2. ❌ Secret Key incorrecta');
      console.log('   3. ❌ Cuenta no autorizada para PA-API');
      console.log('   4. ❌ Partner Tag no válido para Amazon.es');
      console.log('   5. ❌ Rate limiting severo');
      console.log('\n💡 RECOMENDACIONES:');
      console.log('   - Verificar credenciales en Amazon Developer Console');
      console.log('   - Confirmar que la cuenta está aprobada para PA-API');
      console.log('   - Verificar que el Partner Tag funciona en Amazon.es');
    }
  }
  
  console.log('=' .repeat(50));
  console.log();
}

// Agregar el método a la clase
PaapiClient.prototype.runCredentialDiagnostic = runCredentialDiagnostic;
module.exports = new PaapiClient();
