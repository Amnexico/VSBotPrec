'use strict';
const https = require('https');
const crypto = require('crypto');

class PaapiClient {
  constructor() {
    // Configuración PA-API usando variables de entorno de Railway
    this.accessKey = process.env.AMAZON_ACCESS_KEY;
    this.secretKey = process.env.AMAZON_SECRET_KEY;
    this.partnerTag = process.env.AMAZON_PARTNER_TAG;
    this.trackingTag = process.env.AMAZON_TRACKING_TAG;
    
    // Configuración específica para España
    this.host = 'webservices.amazon.es';
    this.region = 'eu-west-1';
    this.service = 'ProductAdvertisingAPI';
    
    // Validar configuración
    this.validateConfig();
    
    console.log('PA-API Cliente inicializado para Amazon España');
  }

  validateConfig() {
    // Validar que tenemos todas las credenciales requeridas
    if (!this.accessKey || !this.secretKey || !this.partnerTag || !this.trackingTag) {
      throw new Error('Faltan variables de entorno requeridas: AMAZON_ACCESS_KEY, AMAZON_SECRET_KEY, AMAZON_PARTNER_TAG, AMAZON_TRACKING_TAG');
    }

    console.log('PA-API configurado correctamente');
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

  // Payload optimizado con recursos VALIDADOS para Amazon España
  createPayload(asin) {
    return {
      ItemIds: [asin],
      Resources: [
        // Información básica del producto
        'ItemInfo.Title',
        'ItemInfo.Features',
        'Images.Primary.Medium',
        
        // RECURSOS OFFERS VALIDADOS PARA DESCUENTOS
        'Offers.Listings.Price',
        'Offers.Listings.SavingBasis',
        'Offers.Listings.Availability.Message',
        'Offers.Listings.Condition',
        'Offers.Listings.Promotions',
        'Offers.Listings.ProgramEligibility.IsPrimeExclusive',
        'Offers.Listings.DeliveryInfo.IsPrimeEligible',
        'Offers.Listings.DeliveryInfo.IsFreeShippingEligible',
        'Offers.Summaries.HighestPrice',
        'Offers.Summaries.LowestPrice'
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

  // Parser completamente optimizado para extraer TODOS los tipos de descuentos
  parseResponse(response, asin) {
    try {
      const item = response.ItemsResult.Items[0];
      
      console.log('=== ANÁLISIS COMPLETO DE DESCUENTOS ===');
      console.log('Respuesta completa item:', JSON.stringify(item, null, 2));
      
      // Extraer información básica
      let title = 'Producto Amazon';
      if (item.ItemInfo?.Title?.DisplayValue) {
        title = item.ItemInfo.Title.DisplayValue;
      }
      
      // Buscar ofertas de productos NUEVOS - solo Offers
      const newOffers = this.filterNewOffers(item.Offers?.Listings || []);
      const bestOffer = newOffers.length > 0 ? newOffers[0] : (item.Offers?.Listings?.[0] || null);
      
      console.log('Mejor oferta (Offers):', JSON.stringify(bestOffer, null, 2));
      
      // Inicializar variables de precio
      let finalPrice = 0;
      let listPrice = 0;
      let displayPrice = 0;
      let currency = '€';
      let totalSavings = 0;
      let promotionDetails = [];
      let dealInfo = null;
      
      // PASO 1: Extraer precio base y precio con descuentos automáticos
      if (bestOffer?.Price) {
        finalPrice = bestOffer.Price.Amount || 0;
        displayPrice = finalPrice;
        currency = bestOffer.Price.Currency === 'EUR' ? '€' : (bestOffer.Price.Currency || '€');
      }
      
      // PASO 2: Extraer precio original (SavingBasis)
      if (bestOffer?.SavingBasis) {
        listPrice = bestOffer.SavingBasis.Amount || 0;
      }
      
      // PASO 3: Analizar promociones en Offers
      if (bestOffer?.Promotions) {
        console.log('=== PROMOCIONES OFFERS DETECTADAS ===');
        console.log(JSON.stringify(bestOffer.Promotions, null, 2));
        
        bestOffer.Promotions.forEach((promo, index) => {
          console.log(`Promoción ${index + 1}:`, JSON.stringify(promo, null, 2));
          
          let discountAmount = 0;
          let description = 'Promoción disponible';
          
          // Intentar extraer cantidad de descuento de diferentes campos
          if (promo.DiscountAmount) {
            discountAmount = parseFloat(promo.DiscountAmount);
          } else if (promo.DiscountPercent) {
            discountAmount = (finalPrice * parseFloat(promo.DiscountPercent)) / 100;
          } else if (promo.DiscountDisplayAmount) {
            // Intentar parsear cantidad del texto de display
            const match = promo.DiscountDisplayAmount.match(/(\d+(?:[.,]\d+)?)/);
            if (match) {
              discountAmount = parseFloat(match[1].replace(',', '.'));
            }
          }
          
          if (promo.Title) {
            description = promo.Title;
          } else if (promo.DiscountDisplayAmount) {
            description = promo.DiscountDisplayAmount;
          }
          
          promotionDetails.push({
            type: promo.Type || 'Promoción',
            description: description,
            amount: discountAmount,
            source: 'Offers'
          });
        });
      }
      
      // PASO 4: Eliminar análisis OffersV2 (no disponible)
      
      // PASO 5: Eliminar promociones OffersV2 (no disponible)
      
      // PASO 6: Detectar ofertas Prime y otras elegibilidades
      let isPrimeExclusive = false;
      let isPrimeEligible = false;
      
      if (bestOffer?.ProgramEligibility?.IsPrimeExclusive) {
        isPrimeExclusive = true;
        promotionDetails.push({
          type: 'Prime Exclusivo',
          description: 'Oferta exclusiva para miembros Prime',
          amount: 0,
          source: 'Eligibility'
        });
      }
      
      if (bestOffer?.DeliveryInfo?.IsPrimeEligible) {
        isPrimeEligible = true;
      }
      
      // PASO 7: Calcular ahorros totales
      totalSavings = 0;
      
      // Ahorro desde precio original (SavingBasis)
      if (listPrice > finalPrice) {
        totalSavings += (listPrice - finalPrice);
      }
      
      // Ahorros adicionales de promociones específicas
      promotionDetails.forEach(promo => {
        if (promo.amount > 0) {
          totalSavings += promo.amount;
        }
      });
      
      // PASO 8: Calcular precio final con todos los descuentos
      let calculatedFinalPrice = finalPrice;
      let additionalSavings = 0;
      
      promotionDetails.forEach(promo => {
        if (promo.amount > 0 && promo.source !== 'Eligibility') {
          additionalSavings += promo.amount;
        }
      });
      
      // Solo aplicar descuentos adicionales si no están ya reflejados en el precio
      if (additionalSavings > 0 && listPrice === 0) {
        calculatedFinalPrice = Math.max(0, finalPrice - additionalSavings);
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
        price: calculatedFinalPrice, // PRECIO FINAL CON TODOS LOS DESCUENTOS DETECTADOS
        listPrice: listPrice || finalPrice, // Precio original o precio base
        displayPrice: finalPrice, // Precio mostrado en Amazon
        currency: currency,
        hasPromotion: promotionDetails.length > 0 || totalSavings > 0,
        promotionDetails: promotionDetails,
        dealInfo: dealInfo,
        totalSavings: totalSavings,
        isPrimeExclusive: isPrimeExclusive,
        isPrimeEligible: isPrimeEligible,
        availability: availability,
        image: image,
        affiliateUrl: `https://www.amazon.es/dp/${asin}?tag=${this.trackingTag}`,
        lastUpdated: new Date().toISOString(),
        source: 'PA-API-Optimized'
      };
      
      // Log detallado para debugging
      console.log('=== RESULTADO FINAL ===');
      console.log(`Producto: ${title}`);
      console.log(`Precio original (listPrice): ${listPrice}€`);
      console.log(`Precio mostrado (displayPrice): ${finalPrice}€`);
      console.log(`Precio final calculado: ${calculatedFinalPrice}€`);
      console.log(`Promociones encontradas: ${promotionDetails.length}`);
      console.log(`Deal detectado: ${dealInfo ? 'SÍ' : 'NO'}`);
      console.log(`Ahorro total: ${totalSavings.toFixed(2)}€`);
      console.log(`Prime exclusivo: ${isPrimeExclusive ? 'SÍ' : 'NO'}`);
      console.log('Promociones:', JSON.stringify(promotionDetails, null, 2));
      console.log('========================');
      
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
      listPrice: 0,
      displayPrice: 0,
      currency: '€',
      hasPromotion: false,
      promotionDetails: [],
      dealInfo: null,
      totalSavings: 0,
      isPrimeExclusive: false,
      isPrimeEligible: false,
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

    console.log(`Obteniendo producto ${asin} via PA-API optimizado`);
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
