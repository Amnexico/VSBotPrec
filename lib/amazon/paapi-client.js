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
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/121.0'
    ];

    const randomUA = userAgents[Math.floor(Math.random() * userAgents.length)];
    
    // Delay aleatorio para parecer más humano
    const delay = Math.floor(Math.random() * 2000) + 500;
    await new Promise(resolve => setTimeout(resolve, delay));

    return new Promise((resolve) => {
      const options = {
        hostname: 'www.amazon.es',
        path: `/dp/${asin}`,
        method: 'GET',
        headers: {
          'User-Agent': randomUA,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Cache-Control': 'max-age=0'
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            const product = this.extractProductData(data, asin);
            this.setCache(asin, product);
            resolve(product);
          } catch (error) {
            console.error(`Error extrayendo datos para ${asin}:`, error.message);
            const fallback = this.createFallbackProduct(asin);
            resolve(fallback);
          }
        });
      });

      req.on('error', (error) => {
        console.error(`Error de conexión para ${asin}:`, error.message);
        resolve(this.createFallbackProduct(asin));
      });

      req.setTimeout(10000, () => {
        req.destroy();
        console.log(`Timeout para ${asin}`);
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

    // Múltiples patrones para extraer el título
    const titlePatterns = [
      /<title[^>]*>([^<]+)<\/title>/i,
      /<h1[^>]*class="[^"]*a-size-large[^"]*"[^>]*>([^<]+)<\/h1>/i,
      /<span[^>]*id="productTitle"[^>]*>([^<]+)<\/span>/i,
      /<h1[^>]*id="title"[^>]*>([^<]+)<\/h1>/i
    ];

    for (const pattern of titlePatterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        name = match[1]
          .replace(/Amazon\.es:\s*/i, '')
          .replace(/\s*:\s*Amazon\.es.*$/i, '')
          .trim();
        if (name.length > 10) break; // Si encontramos un título decente, usar ese
      }
    }

    // Múltiples patrones para extraer precio
    const pricePatterns = [
      /<span[^>]*class="[^"]*a-price-whole[^"]*"[^>]*>([0-9,.]+)</i,
      /<span[^>]*class="[^"]*a-offscreen[^"]*"[^>]*>€\s*([0-9,.]+)/i,
      /"price"[^>]*>[€\s]*([0-9,.]+)/i,
      /class="a-price-symbol">€<\/span><span[^>]*>([0-9,.]+)/i,
      /precio[^>]*>[€\s]*([0-9,.]+)/i,
      /<span[^>]*>([0-9]+,[0-9]{2})\s*€<\/span>/i
    ];

    for (const pattern of pricePatterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        const priceStr = match[1].replace(/\./g, '').replace(',', '.');
        const parsedPrice = parseFloat(priceStr);
        if (parsedPrice > 0) {
          price = parsedPrice;
          break;
        }
      }
    }

    // Extraer imagen principal
    const imagePatterns = [
      /"hiRes":"([^"]+)"/i,
      /"large":"([^"]+)"/i,
      /id="landingImage"[^>]*src="([^"]+)"/i,
      /class="[^"]*a-dynamic-image[^"]*"[^>]*src="([^"]+)"/i
    ];

    for (const pattern of imagePatterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        image = match[1].replace(/\\/g, '');
        break;
      }
    }

    // Detectar disponibilidad
    if (html.includes('En stock') || html.includes('Disponible')) {
      availability = 'En stock';
    } else if (html.includes('Agotado') || html.includes('No disponible')) {
      availability = 'Agotado';
    } else if (html.includes('Envío en')) {
      availability = 'Disponible con envío';
    }

    return {
      asin: asin,
      name: name,
      price: price,
      currency: '€',
      availability: availability,
      image: image,
      affiliateUrl: `https://www.amazon.es/dp/${asin}?tag=${this.trackingTag}`,
      lastUpdated: new Date().toISOString()
    };
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
