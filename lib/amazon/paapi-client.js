'use strict';
const crypto = require('crypto');
const https = require('https');

class PaapiClient {
  constructor() {
    // Debug de variables de entorno
    console.log('=== DEBUG VARIABLES ===');
    console.log('process.env.AMAZON_ACCESS_KEY:', process.env.AMAZON_ACCESS_KEY || 'NO DEFINIDA');
    console.log('process.env.AMAZON_SECRET_KEY:', process.env.AMAZON_SECRET_KEY ? 'EXISTE' : 'NO EXISTE');
    console.log('process.env.AMAZON_PARTNER_TAG:', process.env.AMAZON_PARTNER_TAG || 'NO DEFINIDA');
    console.log('process.env.AMAZON_TRACKING_TAG:', process.env.AMAZON_TRACKING_TAG || 'NO DEFINIDA');
    console.log('Todas las variables env:', Object.keys(process.env).filter(k => k.startsWith('AMAZON')));
    
    // Usar variables de entorno para seguridad
    this.accessKey = process.env.AMAZON_ACCESS_KEY;
    this.secretKey = process.env.AMAZON_SECRET_KEY;
    this.partnerTag = process.env.AMAZON_PARTNER_TAG || 'vacuumspain-21';
    this.trackingTag = process.env.AMAZON_TRACKING_TAG || 'vsoatg-21';
    
    // FALLBACK TEMPORAL - mientras debuggeamos las variables
    if (!this.accessKey || this.accessKey === 'YOUR_ACCESS_KEY') {
      console.log('⚠️ Usando credenciales hardcoded como fallback');
      // Usar credenciales más antiguas (más estables)
      this.accessKey = 'AKIAJ3EGVBIPDVM6T4CA';
      this.secretKey = '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';
    }
    
    // Configuración fija para Amazon España (basada en documentación oficial)
    this.host = 'webservices.amazon.es';
    this.region = 'eu-west-1';
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
    // Usar endpoint correcto basado en la documentación oficial
    const uri = '/paapi5/getitems';
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
    
    // Debug: Log del payload
    console.log('=== PAYLOAD ===');
    console.log(JSON.stringify(payload, null, 2));
    
    const signature = this.createSignature(method, uri, queryString, headers, payloadStr, timestamp);
    
    const dateStamp = timestamp.toISOString().substr(0, 10).replace(/-/g, '');
    const credentialScope = `${dateStamp}/${this.region}/${this.service}/aws4_request`;
    const authorizationHeader = `AWS4-HMAC-SHA256 Credential=${this.accessKey}/${credentialScope}, SignedHeaders=content-type;host;x-amz-date;x-amz-target, Signature=${signature}`;
    
    headers['Authorization'] = authorizationHeader;
    headers['Content-Length'] = Buffer.byteLength(payloadStr);
    
    // Debug: Log de headers (ocultar credenciales)
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
          // Debug: Log de respuesta
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

  // Buscar productos por URL con configuración fija
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
      // Si PA-API falla, usar scraping como fallback
      console.log('⚠️ PA-API falló, usando scraping como fallback...');
      return await this.fallbackToScraping(url, asin);
    }
  }

  // Fallback a scraping cuando PA-API falla
  async fallbackToScraping(url, asin) {
    console.log('Iniciando scraping fallback para:', url);
    
    try {
      // Implementación básica de scraping sin puppeteer
      const https = require('https');
      const cheerio = require('cheerio');
      
      return new Promise((resolve, reject) => {
        const options = {
          hostname: 'www.amazon.es',
          path: `/dp/${asin}`,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Cache-Control': 'max-age=0',
            'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1'
          }
        };
        
        const req = https.get(options, (res) => {
          let data = '';
          
          res.on('data', (chunk) => {
            data += chunk;
          });
          
          res.on('end', () => {
            try {
              const $ = cheerio.load(data);
              
              // Extraer datos con selectores más específicos
              const productData = {
                asin: asin,
                name: this.extractNameFromPage($),
                price: this.extractPriceFromPage($),
                currency: '€',
                availability: this.extractAvailabilityFromPage($),
                image: this.extractImageFromPage($),
                affiliateUrl: `https://www.amazon.es/dp/${asin}?tag=${this.trackingTag}`
              };
              
              console.log('Scraping exitoso:', productData);
              resolve(productData);
            } catch (parseError) {
              console.error('Error parseando HTML:', parseError);
              reject(new Error('Error extrayendo datos del producto via scraping'));
            }
          });
        });
        
        req.on('error', (error) => {
          console.error('Error en scraping fallback:', error);
          reject(new Error('Error de conexión en scraping fallback'));
        });
        
        req.setTimeout(10000); // Timeout de 10 segundos
      });
      
    } catch (error) {
      console.error('Error en fallback scraping:', error);
      // Última opción: datos mínimos para que el bot no falle completamente
      return {
        asin: asin,
        name: 'Producto Amazon',
        price: 0,
        currency: '€',
        availability: 'Disponible',
        image: '',
        affiliateUrl: `https://www.amazon.es/dp/${asin}?tag=${this.trackingTag}`
      };
    }
  }

  // Extraer nombre de HTML (múltiples selectores)
  extractNameFromPage($) {
    const nameSelectors = [
      '#productTitle',
      '.product-title',
      '.a-size-large.product-title-word-break',
      '[data-automation-id="title"]',
      'h1 span',
      '.a-size-large'
    ];
    
    for (const selector of nameSelectors) {
      const nameText = $(selector).text().trim();
      if (nameText && nameText.length > 5) { // Filtrar textos muy cortos
        return nameText;
      }
    }
    return 'Producto Amazon';
  }

  // Extraer precio de HTML (implementación mejorada)
  extractPriceFromPage($) {
    const priceSelectors = [
      '.a-price.a-text-price.a-size-medium.apexPriceToPay .a-offscreen',
      '.a-price-whole',
      '.a-offscreen',
      '#price_inside_buybox',
      '.a-price .a-offscreen',
      '.a-price-symbol + .a-price-whole',
      '[data-automation-id="price"] .a-offscreen'
    ];
    
    for (const selector of priceSelectors) {
      const priceElement = $(selector).first();
      const priceText = priceElement.text().trim();
      
      if (priceText) {
        // Limpiar el texto del precio
        const cleanPrice = priceText
          .replace(/[€$£¥]/g, '') // Quitar símbolos de moneda
          .replace(/\s/g, '') // Quitar espacios
          .replace(/\./g, '') // Quitar puntos (separadores de miles)
          .replace(/,/g, '.'); // Convertir comas a puntos decimales
        
        const price = parseFloat(cleanPrice);
        if (!isNaN(price) && price > 0) {
          console.log(`Precio encontrado con selector "${selector}": ${price}`);
          return price;
        }
      }
    }
    
    console.log('No se pudo extraer precio, devolviendo 0');
    return 0;
  }

  // Extraer disponibilidad de HTML (implementación mejorada)
  extractAvailabilityFromPage($) {
    const availabilitySelectors = [
      '#availability span',
      '#availability .a-size-medium',
      '.a-accordion-row-a11y',
      '[data-automation-id="availability"]',
      '.a-size-medium.a-color-success',
      '.a-size-medium.a-color-price'
    ];
    
    for (const selector of availabilitySelectors) {
      const availText = $(selector).text().trim();
      if (availText && availText.length > 2) {
        console.log(`Disponibilidad encontrada: ${availText}`);
        return availText;
      }
    }
    return 'Consultar disponibilidad';
  }

  // Extraer imagen de HTML
  extractImageFromPage($) {
    const imageSelectors = [
      '#landingImage',
      '.a-dynamic-image',
      '[data-automation-id="main-image"]',
      '.a-image-wrapper img'
    ];
    
    for (const selector of imageSelectors) {
      const imgSrc = $(selector).attr('src') || $(selector).attr('data-src');
      if (imgSrc && imgSrc.startsWith('http')) {
        return imgSrc;
      }
    }
    return '';
  }
}

module.exports = new PaapiClient();
