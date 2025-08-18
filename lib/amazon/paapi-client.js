'use strict';
const https = require('https');

class PaapiClient {
  constructor() {
    this.trackingTag = process.env.AMAZON_TRACKING_TAG || 'vsoatg-21';
    this.cache = new Map(); // Cache en memoria para evitar scraping repetido
    this.cacheTimeout = 30 * 60 * 1000; // 30 minutos
    
    console.log('Sistema de scraping Amazon optimizado inicializado');
  }

  extractASIN(url) {
    let asinMatch = url.match(/\/([A-Z0-9]{10})(?:[/?]|$)/);
    if (!asinMatch) asinMatch = url.match(/\/dp\/([A-Z0-9]{10})/);
    return asinMatch ? asinMatch[1] : null;
  }

  // Cache inteligente
  getCached(asin) {
    const cached = this.cache.get(asin);
    if (cached && (Date.now() - cached.timestamp < this.cacheTimeout)) {
      console.log(`Usando cache para ${asin}`);
      return cached.data;
    }
    return null;
  }

  setCache(asin, data) {
    this.cache.set(asin, {
      data: data,
      timestamp: Date.now()
    });
  }

  // Scraping súper optimizado con múltiples estrategias
  async getProductFromScraping(asin) {
    // Verificar cache primero
    const cached = this.getCached(asin);
    if (cached) return cached;

    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1'
    ];

    const randomUA = userAgents[Math.floor(Math.random() * userAgents.length)];
    
    // Delay aleatorio para parecer más humano
    const delay = Math.floor(Math.random() * 3000) + 1000;
    await new Promise(resolve => setTimeout(resolve, delay));

    console.log(`🔍 Intentando scraping para ${asin} con UA: ${randomUA.substring(0, 50)}...`);

    return new Promise((resolve) => {
      const options = {
        hostname: 'www.amazon.es',
        path: `/dp/${asin}`,
        method: 'GET',
        headers: {
          'User-Agent': randomUA,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'es-ES,es;q=0.9,en-US;q=0.8,en;q=0.7',
          'Accept-Encoding': 'gzip, deflate, br',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'cross-site',
          'Sec-Fetch-User': '?1',
          'Cache-Control': 'max-age=0',
          'Referer': 'https://www.google.com/'
        }
      };

      const req = https.request(options, (res) => {
        console.log(`📡 Respuesta HTTP ${res.statusCode} para ${asin}`);
        
        let data = '';
        let rawData = Buffer.alloc(0);
        
        res.on('data', (chunk) => {
          rawData = Buffer.concat([rawData, chunk]);
        });
        
        res.on('end', () => {
          try {
            // Manejar encoding gzip
            if (res.headers['content-encoding'] === 'gzip') {
              const zlib = require('zlib');
              try {
                data = zlib.gunzipSync(rawData).toString('utf-8');
              } catch (gzipError) {
                data = rawData.toString('utf-8');
              }
            } else {
              data = rawData.toString('utf-8');
            }

            console.log(`📄 HTML recibido: ${data.length} caracteres para ${asin}`);
            
            // Debug: verificar si es una página de error
            if (data.includes('captcha') || data.includes('robot')) {
              console.log(`🤖 CAPTCHA detectado para ${asin}`);
            }
            if (data.includes('404') || data.includes('no encontrado')) {
              console.log(`❌ Producto no encontrado para ${asin}`);
            }

            const product = this.extractProductData(data, asin);
            console.log(`✅ Producto extraído: ${product.name} - €${product.price}`);
            
            this.setCache(asin, product);
            resolve(product);
          } catch (error) {
            console.error(`❌ Error extrayendo datos para ${asin}:`, error.message);
            const fallback = this.createFallbackProduct(asin);
            resolve(fallback);
          }
        });
      });

      req.on('error', (error) => {
        console.error(`🔌 Error de conexión para ${asin}:`, error.message);
        resolve(this.createFallbackProduct(asin));
      });

      req.setTimeout(15000, () => {
        req.destroy();
        console.log(`⏱️ Timeout para ${asin}`);
        resolve(this.createFallbackProduct(asin));
      });

      req.end();
    });
  }

  // Extracción mejorada de datos del HTML
  extractProductData(html, asin) {
    let name = 'Producto Amazon';
    let price = 0;
    let image = '';
    let availability = 'Ver disponibilidad';

    console.log(`🔍 Iniciando extracción para ${asin}`);

    // Verificar si la página es válida
    if (html.includes('404') || html.includes('no encontrado') || html.includes('Page Not Found')) {
      console.log(`❌ Página no encontrada para ${asin}`);
      throw new Error('Producto no encontrado');
    }

    // Múltiples patrones para extraer el título (orden de prioridad)
    const titlePatterns = [
      // Título principal del producto
      /<span[^>]*id="productTitle"[^>]*>([^<]+)<\/span>/i,
      /<h1[^>]*class="[^"]*a-size-large[^"]*"[^>]*><span[^>]*>([^<]+)<\/span><\/h1>/i,
      /<h1[^>]*id="title"[^>]*><span[^>]*>([^<]+)<\/span><\/h1>/i,
      // Título alternativo
      /<title[^>]*>([^<]+)<\/title>/i,
      // Otros patrones
      /<h1[^>]*>([^<]+)<\/h1>/i,
      /"title":"([^"]+)"/i
    ];

    for (const pattern of titlePatterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        let extractedName = match[1]
          .replace(/Amazon\.es:\s*/i, '')
          .replace(/\s*:\s*Amazon\.es.*$/i, '')
          .replace(/&amp;/g, '&')
          .replace(/&quot;/g, '"')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .trim();
        
        if (extractedName.length > 10 && !extractedName.includes('Amazon.es')) {
          name = extractedName;
          console.log(`📝 Título encontrado: ${name.substring(0, 50)}...`);
          break;
        }
      }
    }

    // Múltiples patrones para extraer precio (orden de prioridad)
    const pricePatterns = [
      // Precio principal
      /<span[^>]*class="[^"]*a-price-whole[^"]*"[^>]*>([0-9,.]+)<\/span>/i,
      /<span[^>]*class="[^"]*a-offscreen[^"]*"[^>]*>€\s*([0-9,.]+)/i,
      /<span[^>]*class="[^"]*a-price-symbol[^"]*">€<\/span><span[^>]*class="[^"]*a-price-whole[^"]*">([0-9,.]+)<\/span>/i,
      
      // Patrones alternativos
      /"price"[^>]*>€?\s*([0-9,.]+)/i,
      /precio[^>]*>€?\s*([0-9,.]+)/i,
      /<span[^>]*>([0-9]+,[0-9]{2})\s*€<\/span>/i,
      /€\s*([0-9,.]+)/i,
      
      // JSON-LD data
      /"price":"([0-9,.]+)"/i,
      /"priceAmount":"([0-9,.]+)"/i
    ];

    for (const pattern of pricePatterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        const priceStr = match[1].replace(/\./g, '').replace(',', '.');
        const parsedPrice = parseFloat(priceStr);
        if (parsedPrice > 0 && parsedPrice < 999999) { // Validar rango razonable
          price = parsedPrice;
          console.log(`💰 Precio encontrado: €${price}`);
          break;
        }
      }
    }

    // Si no encontramos precio con patrones normales, buscar en JSON
    if (price === 0) {
      try {
        const jsonMatches = html.match(/"priceToPayDisplayString":"([^"]+)"/);
        if (jsonMatches && jsonMatches[1]) {
          const jsonPrice = jsonMatches[1].match(/([0-9,.]+)/);
          if (jsonPrice) {
            const parsedPrice = parseFloat(jsonPrice[1].replace(/\./g, '').replace(',', '.'));
            if (parsedPrice > 0) {
              price = parsedPrice;
              console.log(`💰 Precio JSON encontrado: €${price}`);
            }
          }
        }
      } catch (e) {
        // Ignorar errores de JSON
      }
    }

    // Extraer imagen principal
    const imagePatterns = [
      /"hiRes":"([^"]+)"/i,
      /"large":"([^"]+)"/i,
      /id="landingImage"[^>]*src="([^"]+)"/i,
      /class="[^"]*a-dynamic-image[^"]*"[^>]*src="([^"]+)"/i,
      /"mainImageUrl":"([^"]+)"/i
    ];

    for (const pattern of imagePatterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        image = match[1].replace(/\\/g, '');
        if (image.includes('http')) {
          console.log(`🖼️ Imagen encontrada`);
          break;
        }
      }
    }

    // Detectar disponibilidad con más patrones
    const availabilityPatterns = [
      /En stock/i,
      /Disponible/i,
      /available/i,
      /Quedas? [0-9]+ en stock/i
    ];

    const unavailablePatterns = [
      /Agotado/i,
      /No disponible/i,
      /Currently unavailable/i,
      /Temporalmente sin stock/i
    ];

    let stockFound = false;
    for (const pattern of availabilityPatterns) {
      if (html.match(pattern)) {
        availability = 'En stock';
        stockFound = true;
        break;
      }
    }

    if (!stockFound) {
      for (const pattern of unavailablePatterns) {
        if (html.match(pattern)) {
          availability = 'Agotado';
          break;
        }
      }
    }

    if (html.includes('Envío en') || html.includes('shipping')) {
      availability = 'Disponible con envío';
    }

    console.log(`📊 Disponibilidad: ${availability}`);

    const result = {
      asin: asin,
      name: name,
      price: price,
      currency: '€',
      availability: availability,
      image: image,
      affiliateUrl: `https://www.amazon.es/dp/${asin}?tag=${this.trackingTag}`,
      lastUpdated: new Date().toISOString()
    };

    console.log(`✅ Extracción completada para ${asin}: ${name.substring(0, 30)}... - €${price}`);
    return result;
  }

  // Producto de respaldo con enlace de afiliado funcional
  createFallbackProduct(asin) {
    return {
      asin: asin,
      name: 'Ver producto en Amazon',
      price: 0,
      currency: '€',
      availability: 'Ver en Amazon',
      image: '',
      affiliateUrl: `https://www.amazon.es/dp/${asin}?tag=${this.trackingTag}`,
      lastUpdated: new Date().toISOString()
    };
  }

  async getProductByUrl(url) {
    const asin = this.extractASIN(url);
    if (!asin) {
      throw new Error('URL de Amazon inválida - no se pudo extraer ASIN');
    }

    console.log(`Obteniendo producto ${asin} - Scraping optimizado`);
    return await this.getProductFromScraping(asin);
  }

  // Para compatibilidad con código existente
  async getProductInfo(asin) {
    return await this.getProductByUrl(`https://www.amazon.es/dp/${asin}`);
  }

  // Método para limpiar cache antiguo (opcional)
  cleanCache() {
    const now = Date.now();
    for (const [asin, cached] of this.cache.entries()) {
      if (now - cached.timestamp > this.cacheTimeout) {
        this.cache.delete(asin);
      }
    }
  }

  // Obtener estadísticas del cache
  getCacheStats() {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.keys())
    };
  }
}

module.exports = new PaapiClient();
