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
    // Primero intentar extraer ASIN directamente de URLs normales
    let asinMatch = url.match(/\/([A-Z0-9]{10})(?:[/?]|$)/);
    if (!asinMatch) asinMatch = url.match(/\/dp\/([A-Z0-9]{10})/);
    if (!asinMatch) asinMatch = url.match(/\/gp\/product\/([A-Z0-9]{10})/);
    if (!asinMatch) asinMatch = url.match(/asin=([A-Z0-9]{10})/);
    
    if (asinMatch) {
      return asinMatch[1];
    }
    
    // Si no se encuentra ASIN y es un enlace acortado (amzn.eu o amzn.to), 
    // necesitamos seguir la redirección para obtener la URL completa
    if (url.includes('amzn.eu') || url.includes('amzn.to')) {
      console.log(`Enlace acortado detectado: ${url}`);
      console.log('Nota: Para enlaces acortados, el ASIN se extraerá después de la redirección');
      // Devolver null para indicar que necesita resolución
      return null;
    }
    
    return null;
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

// Crear payload con recursos adicionales para descuentos
  createPayload(asin) {
    return {
      ItemIds: [asin],
      Resources: [
        'ItemInfo.Title',
        'Offers.Listings.Price',
        'Offers.Listings.SavingBasis',
        'Offers.Listings.Availability.Message',
        'Offers.Listings.Condition',
        'Offers.Listings.Promotions',  // NUEVO: Para detectar cupones
        'Offers.Listings.ProgramEligibility.IsPrimeExclusive',  // NUEVO: Para ofertas Prime
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

   // Parser mejorado para extraer descuentos reales
  parseResponse(response, asin) {
    try {
      const item = response.ItemsResult.Items[0];
      
      // Extraer información básica
      let title = 'Producto Amazon';
      if (item.ItemInfo?.Title?.DisplayValue) {
        title = item.ItemInfo.Title.DisplayValue;
      }
      
      // Buscar ofertas de productos NUEVOS
      const newOffers = this.filterNewOffers(item.Offers?.Listings || []);
      const bestOffer = newOffers.length > 0 ? newOffers[0] : (item.Offers?.Listings?.[0] || null);
      
      // Extraer precios con descuentos aplicados
      let finalPrice = 0;
      let listPrice = 0;
      let currency = 'EUR';
      let hasPromotion = false;
      let promotionDetails = [];
      let totalSavings = 0;
      
      if (bestOffer?.Price) {
        const priceInfo = bestOffer.Price;
        finalPrice = priceInfo.Amount || 0;
        currency = priceInfo.Currency || 'EUR';
      }
      
      // Extraer precio original (antes de descuentos)
      if (bestOffer?.SavingBasis) {
        const savingBasis = bestOffer.SavingBasis;
        listPrice = savingBasis.Amount || 0;
        hasPromotion = listPrice > finalPrice;
        totalSavings = listPrice - finalPrice;
      }
      
      // NUEVO: Extraer información de promociones y cupones
      if (bestOffer?.Promotions) {
        console.log('Promociones detectadas:', JSON.stringify(bestOffer.Promotions, null, 2));
        
        bestOffer.Promotions.forEach(promo => {
          if (promo.Type === 'Coupon') {
            promotionDetails.push({
              type: 'Cupón',
              description: promo.DiscountDisplayAmount || 'Descuento disponible',
              amount: promo.DiscountAmount || 0
            });
          } else if (promo.Type === 'Promotion') {
            promotionDetails.push({
              type: 'Oferta',
              description: promo.Title || 'Oferta especial',
              amount: promo.DiscountAmount || 0
            });
          }
        });
      }
      
      // NUEVO: Detectar ofertas Prime exclusivas
      let isPrimeExclusive = false;
      if (bestOffer?.ProgramEligibility?.IsPrimeExclusive) {
        isPrimeExclusive = true;
        promotionDetails.push({
          type: 'Prime',
          description: 'Oferta exclusiva Prime',
          amount: 0
        });
      }
      
      // Calcular precio real final considerando todas las promociones
      let calculatedFinalPrice = finalPrice;
      let additionalSavings = 0;
      
      promotionDetails.forEach(promo => {
        if (promo.amount > 0) {
          additionalSavings += promo.amount;
        }
      });
      
      // Si hay cupones adicionales, restar del precio final
      if (additionalSavings > 0) {
        calculatedFinalPrice = Math.max(0, finalPrice - additionalSavings);
        totalSavings += additionalSavings;
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
        price: calculatedFinalPrice, // PRECIO FINAL CON TODOS LOS DESCUENTOS
        listPrice: listPrice, // Precio original sin descuentos
        displayPrice: finalPrice, // Precio mostrado en Amazon (puede tener algunos descuentos pero no cupones)
        currency: currency,
        hasPromotion: hasPromotion || promotionDetails.length > 0,
        promotionDetails: promotionDetails, // NUEVO: Detalles de cupones y ofertas
        totalSavings: totalSavings, // NUEVO: Ahorro total calculado
        isPrimeExclusive: isPrimeExclusive, // NUEVO: Si es oferta Prime
        availability: availability,
        image: image,
        affiliateUrl: `https://www.amazon.es/dp/${asin}?tag=${this.trackingTag}`,
        lastUpdated: new Date().toISOString(),
        source: 'PA-API'
      };
      
      // Log detallado para debugging
      console.log(`Producto parseado: ${title}`);
      console.log(`Precio mostrado: ${finalPrice}€`);
      console.log(`Precio original: ${listPrice}€`);
      console.log(`Precio final calculado: ${calculatedFinalPrice}€`);
      console.log(`Promociones encontradas: ${promotionDetails.length}`);
      console.log(`Ahorro total: ${totalSavings}€`);
      
      return result;
      
    } catch (parseError) {
      console.error(`Error parseando respuesta para ${asin}:`, parseError.message);
      return this.createFallbackProduct(asin);
    }
  }

  // Método mejorado para resolver enlaces acortados
  async resolveShortUrl(shortUrl) {
    return new Promise((resolve, reject) => {
      // Usar método GET en lugar de HEAD para evitar problemas
      const url = new URL(shortUrl);
      
      const options = {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: 'GET',
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      };

      console.log(`Resolviendo ${shortUrl}`);

      const req = https.request(options, (res) => {
        // Seguir redirecciones manualmente
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          console.log(`Redirección ${res.statusCode}: ${res.headers.location}`);
          resolve(res.headers.location);
        } else if (res.statusCode === 200) {
          // Si no hay redirección pero es 200, usar la URL original
          resolve(shortUrl);
        } else {
          reject(new Error(`Error ${res.statusCode} resolviendo enlace`));
        }
        
        // Consumir response para evitar problemas de memoria
        res.resume();
      });

      req.on('error', reject);
      req.setTimeout(15000, () => {
        req.destroy();
        reject(new Error('Timeout'));
      });

      req.end();
    });
  }
  filterNewOffers(listings) {
    if (!listings || listings.length === 0) return [];
    
    // Filtrar solo productos con condición "New"
    return listings.filter(offer => {
      const condition = offer.Condition?.Value;
      return !condition || condition === 'New'; // Si no hay condición, asumir que es nuevo
    });
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
      source: 'fallback'
    };
  }

  // Métodos públicos principales manteniendo compatibilidad
  async getProductByUrl(url) {
    let finalUrl = url;
    
    // Si es un enlace acortado, resolverlo primero
    if (url.includes('amzn.eu') || url.includes('amzn.to')) {
      try {
        finalUrl = await this.resolveShortUrl(url);
        console.log(`Enlace expandido de ${url} a ${finalUrl}`);
      } catch (error) {
        console.error(`Error resolviendo enlace acortado: ${error.message}`);
        throw new Error('No se pudo resolver el enlace acortado de Amazon');
      }
    }
    
    const asin = this.extractASIN(finalUrl);
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
