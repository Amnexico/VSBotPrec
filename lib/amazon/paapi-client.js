'use strict';
const https = require('https');
const crypto = require('crypto');

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
    console.log(`Access Key: ${this.accessKey ? this.accessKey.substring(0, 8) + '...' : 'NOT SET'}`);
    console.log(`Secret Key: ${this.secretKey ? 'SET (' + this.secretKey.length + ' chars)' : 'NOT SET'}`);
    console.log(`Partner Tag: ${this.partnerTag}`);
    console.log(`Tracking Tag: ${this.trackingTag}`);

    // Validar que tenemos credenciales
    if (!this.accessKey || !this.secretKey) {
      throw new Error('Faltan credenciales de Amazon PA-API');
    }

    // Validar formato de Partner Tag
    if (!this.partnerTag.includes('-21')) {
      console.warn(`Warning: Partner Tag "${this.partnerTag}" no termina en -21`);
    }

    console.log('Configuración PA-API validada correctamente');
  }

  extractASIN(url) {
    let asinMatch = url.match(/\/([A-Z0-9]{10})(?:[/?]|$)/);
    if (!asinMatch) asinMatch = url.match(/\/dp\/([A-Z0-9]{10})/);
    return asinMatch ? asinMatch[1] : null;
  }

  // Generar timestamp para AWS (IGUAL QUE EL BOT QUE FUNCIONA)
  getAmzDate() {
    return new Date().toISOString().replace(/[:\-]|\.\d{3}/g, '');
  }

  // Crear firma AWS4 (IMPLEMENTACION EXACTA DEL BOT QUE FUNCIONA)
  createSignature(method, canonicalUri, queryString, headers, payload, secretKey, amzDate) {
    const dateStamp = amzDate.slice(0, 8);
    
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
        canonicalUri,
        queryString,
        canonicalHeaders,
        signedHeaders,
        payloadHash
    ].join('\n');
    
    const algorithm = 'AWS4-HMAC-SHA256';
    const credentialScope = `${dateStamp}/${this.region}/ProductAdvertisingAPI/aws4_request`;
    const stringToSign = [
        algorithm,
        amzDate,
        credentialScope,
        crypto.createHash('sha256').update(canonicalRequest).digest('hex')
    ].join('\n');
    
    const kDate = crypto.createHmac('sha256', 'AWS4' + secretKey).update(dateStamp).digest();
    const kRegion = crypto.createHmac('sha256', kDate).update(this.region).digest();
    const kService = crypto.createHmac('sha256', kRegion).update('ProductAdvertisingAPI').digest();
    const kSigning = crypto.createHmac('sha256', kService).update('aws4_request').digest();
    
    const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');
    
    return {
        signature,
        signedHeaders,
        credentialScope
    };
  }

  // Crear payload con recursos válidos según documentación oficial
  createPayload(asin) {
    return {
      ItemIds: [asin],
      Resources: [
        'ItemInfo.Title',
        'Offers.Listings.Price',
        'Offers.Listings.SavingBasis',
        'Offers.Listings.Availability.Message',
        'Offers.Listings.Condition',
        'Offers.Listings.MerchantInfo',
        'Offers.Listings.DeliveryInfo.IsAmazonFulfilled',
        'Offers.Listings.DeliveryInfo.IsFreeShippingEligible',
        'Offers.Listings.DeliveryInfo.IsPrimeEligible',
        'Offers.Summaries.HighestPrice',
        'Offers.Summaries.LowestPrice',
        'ItemInfo.Features',
        'Images.Primary.Medium'
      ],
      PartnerTag: this.partnerTag,
      PartnerType: 'Associates',
      Marketplace: 'www.amazon.es'
    };
  }

  // Llamada a la API usando la implementación EXACTA del bot que funciona
  async getProductInfo(asin) {
    try {
      const amzDate = this.getAmzDate();
      const method = 'POST';
      const canonicalUri = '/paapi5/getitems';
      const queryString = '';
      
      const payload = JSON.stringify(this.createPayload(asin));
      
      // Headers EXACTOS del bot que funciona
      const headers = {
        'Content-Encoding': 'amz-1.0',
        'Content-Type': 'application/json; charset=utf-8',
        'Host': this.host,
        'X-Amz-Date': amzDate,
        'X-Amz-Target': 'com.amazon.paapi5.v1.ProductAdvertisingAPIv1.GetItems'
      };
      
      const sigData = this.createSignature(method, canonicalUri, queryString, headers, payload, this.secretKey, amzDate);
      
      headers['Authorization'] = `AWS4-HMAC-SHA256 Credential=${this.accessKey}/${sigData.credentialScope}, SignedHeaders=${sigData.signedHeaders}, Signature=${sigData.signature}`;
      
      console.log(`Intentando PA-API para ${asin}`);
      console.log(`Payload:`, JSON.stringify(this.createPayload(asin), null, 2));
      
      return new Promise((resolve, reject) => {
        const options = {
          hostname: this.host,
          path: canonicalUri,
          method: method,
          headers: headers,
          timeout: 10000
        };

        const req = https.request(options, (res) => {
          let data = '';
          
          console.log(`Status Code: ${res.statusCode}`);
          
          res.on('data', (chunk) => data += chunk);
          
          res.on('end', () => {
            console.log(`Response recibida: ${data.length} caracteres`);
            
            try {
              const response = JSON.parse(data);
              
              if (res.statusCode === 200 && response.ItemsResult?.Items) {
                console.log(`PA-API Success para ${asin}`);
                resolve(this.parseResponse(response, asin));
              } else {
                console.error(`PA-API Error para ${asin}:`);
                console.error(`Status: ${res.statusCode}`);
                console.error(`Response:`, JSON.stringify(response, null, 2));
                reject(new Error(`PA-API Error ${res.statusCode}: ${JSON.stringify(response)}`));
              }
            } catch (parseError) {
              console.error(`JSON Parse Error:`, parseError.message);
              reject(new Error(`Invalid JSON response: ${parseError.message}`));
            }
          });
        });

        req.on('error', (error) => {
          console.error(`Request Error para ${asin}:`, error.message);
          reject(error);
        });

        req.setTimeout(10000, () => {
          req.destroy();
          reject(new Error('Request timeout'));
        });

        req.write(payload);
        req.end();
      });
      
    } catch (error) {
      console.error('Error en API de Amazon:', error.message);
      throw error;
    }
  }

  // Parser completo para extraer información incluyendo vendedor
  parseResponse(response, asin) {
    try {
      const item = response.ItemsResult.Items[0];
      
      // Log promociones para debugging
      if (item.Offers?.Listings?.[0]?.Promotions) {
        console.log('Promociones detectadas:', JSON.stringify(item.Offers.Listings[0].Promotions, null, 2));
      }
      
      if (item.Offers?.Listings?.[0]?.SavingBasis) {
        console.log('Precio original (SavingBasis):', JSON.stringify(item.Offers.Listings[0].SavingBasis, null, 2));
      }
      
      // Extraer información básica
      let title = 'Producto Amazon';
      if (item.ItemInfo?.Title?.DisplayValue) {
        title = item.ItemInfo.Title.DisplayValue;
      }
      
      // Buscar la mejor oferta de productos NUEVOS solamente
      const bestOffer = this.getBestNewOffer(item.Offers?.Listings || []);
      
      // Extraer información del vendedor
      let sellerInfo = this.getSellerInfo(bestOffer);
      
      // Extraer precio base
      let price = 0;
      let originalPrice = 0;
      let currency = 'EUR';
      let hasPromotion = false;
      let promotionInfo = '';
      
      if (bestOffer?.Price) {
        const priceInfo = bestOffer.Price;
        price = priceInfo.Amount || 0;
        currency = priceInfo.Currency || 'EUR';
      }
      
      // Extraer precio original (antes de descuentos)
      if (bestOffer?.SavingBasis) {
        const savingBasis = bestOffer.SavingBasis;
        originalPrice = savingBasis.Amount || 0;
        hasPromotion = originalPrice > price;
      }
      
      // Extraer disponibilidad
      let availability = 'Disponible';
      if (bestOffer?.Availability?.Message) {
        availability = bestOffer.Availability.Message;
      }
      
      // Extraer imagen
      let image = '';
      if (item.Images?.Primary?.Medium?.URL) {
        image = item.Images.Primary.Medium.URL;
      }
      
      const result = {
        asin: asin,
        name: title,
        price: price,
        originalPrice: originalPrice,
        currency: currency,
        hasPromotion: hasPromotion,
        promotionInfo: promotionInfo,
        availability: availability,
        image: image,
        affiliateUrl: `https://www.amazon.es/dp/${asin}?tag=${this.trackingTag}`,
        lastUpdated: new Date().toISOString(),
        source: 'PA-API',
        // CAMPOS DE VENDEDOR
        sellerType: sellerInfo.type,
        sellerName: sellerInfo.name,
        sellerEmoji: sellerInfo.emoji
      };
      
      console.log(`Producto parseado: ${title} - ${currency}${price}${hasPromotion ? ` (original: ${originalPrice})` : ''}`);
      console.log(`Vendedor: ${sellerInfo.emoji} ${sellerInfo.name} (${sellerInfo.type})`);
      if (promotionInfo) {
        console.log(`Promoción detectada: ${promotionInfo}`);
      }
      
      return result;
      
    } catch (parseError) {
      console.error(`Error parseando respuesta para ${asin}:`, parseError.message);
      return this.createFallbackProduct(asin);
    }
  }

  // NUEVO MÉTODO: Buscar la mejor oferta de productos NUEVOS
  getBestNewOffer(listings) {
    if (!listings || listings.length === 0) return null;
    
    // Filtrar solo productos NUEVOS
    const newOffers = listings.filter(offer => 
      offer.Condition?.Value === 'New' || !offer.Condition // Si no hay condición, asumimos que es nuevo
    );
    
    if (newOffers.length === 0) return listings[0]; // Fallback a la primera oferta
    
    // Prioridad 1: Amazon directo
    const amazonDirect = newOffers.find(offer => 
      this.isAmazonDirect(offer)
    );
    if (amazonDirect) return amazonDirect;
    
    // Prioridad 2: Vendedor externo con FBA (gestionado por Amazon)
    const fbaOffers = newOffers.filter(offer => 
      this.isAmazonFulfilled(offer) && !this.isAmazonDirect(offer)
    );
    if (fbaOffers.length > 0) {
      // Ordenar por precio y tomar el más barato
      return fbaOffers.sort((a, b) => (a.Price?.Amount || 0) - (b.Price?.Amount || 0))[0];
    }
    
    // Prioridad 3: Vendedor externo
    const externalOffers = newOffers.filter(offer => 
      !this.isAmazonFulfilled(offer)
    );
    if (externalOffers.length > 0) {
      return externalOffers.sort((a, b) => (a.Price?.Amount || 0) - (b.Price?.Amount || 0))[0];
    }
    
    return newOffers[0]; // Fallback
  }

  // NUEVO MÉTODO: Determinar si es vendido por Amazon directamente
  isAmazonDirect(offer) {
    const merchantName = offer.MerchantInfo?.Name || '';
    return merchantName.toLowerCase().includes('amazon') && 
           (this.isAmazonFulfilled(offer) || merchantName.includes('Amazon.es'));
  }

  // NUEVO MÉTODO: Determinar si es enviado por Amazon
  isAmazonFulfilled(offer) {
    return offer.DeliveryInfo?.IsAmazonFulfilled === true;
  }

  // MÉTODO COMPLETO: Obtener información completa del vendedor
  getSellerInfo(offer) {
    if (!offer) {
      return {
        type: 'unknown',
        name: 'Vendedor desconocido',
        emoji: '❓'
      };
    }
    
    const merchantName = offer.MerchantInfo?.Name || 'Vendedor desconocido';
    const isAmazonFulfilled = this.isAmazonFulfilled(offer);
    const isAmazonDirect = this.isAmazonDirect(offer);
    
    if (isAmazonDirect) {
      return {
        type: 'amazon_direct',
        name: 'Amazon',
        emoji: '✅'
      };
    } else if (isAmazonFulfilled) {
      return {
        type: 'fba',
        name: merchantName,
        emoji: '🟦'
      };
    } else {
      return {
        type: 'external',
        name: merchantName,
        emoji: '⚠️'
      };
    }
  }

  // Producto de fallback con enlace de afiliado funcional
  createFallbackProduct(asin) {
    return {
      asin: asin,
      name: 'Ver producto en Amazon',
      price: 0,
      originalPrice: 0,
      currency: 'EUR',
      hasPromotion: false,
      promotionInfo: '',
      availability: 'Ver en Amazon',
      image: '',
      affiliateUrl: `https://www.amazon.es/dp/${asin}?tag=${this.trackingTag}`,
      lastUpdated: new Date().toISOString(),
      source: 'fallback',
      sellerType: 'unknown',
      sellerName: 'Vendedor desconocido',
      sellerEmoji: '❓'
    };
  }

  // Métodos públicos principales manteniendo compatibilidad
  async getProductByUrl(url) {
    const asin = this.extractASIN(url);
    if (!asin) {
      throw new Error('URL de Amazon inválida - no se pudo extraer ASIN');
    }

    console.log(`Obteniendo producto ${asin} via PA-API`);
    return await this.getProductInfo(asin);
  }

  // Método de diagnóstico
  async diagnose() {
    console.log('\nDIAGNÓSTICO PA-API');
    console.log('='.repeat(50));
    console.log(`Access Key: ${this.accessKey ? this.accessKey.substring(0, 8) + '...' : 'MISSING'}`);
    console.log(`Secret Key: ${this.secretKey ? 'SET (' + this.secretKey.length + ' chars)' : 'MISSING'}`);
    console.log(`Partner Tag: ${this.partnerTag}`);
    console.log(`Host: ${this.host}`);
    console.log(`Region: ${this.region}`);
    console.log('='.repeat(50));
    
    // Test con ASIN conocido
    const testASIN = 'B08N5WRWNW'; // Echo Dot popular
    console.log(`\nProbando con ASIN conocido: ${testASIN}`);
    
    try {
      const result = await this.getProductInfo(testASIN);
      console.log(`Test exitoso:`, result);
      return { success: true, result };
    } catch (error) {
      console.log(`Test falló:`, error.message);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new PaapiClient();
