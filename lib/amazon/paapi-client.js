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

  extractASIN(url) {
    const asinMatch = url.match(/\/([A-Z0-9]{10})(?:[/?]|$)/);
    return asinMatch ? asinMatch[1] : null;
  }

  createSignature(method, uri, queryString, headers, payload, timestamp) {
    const dateStamp = timestamp.toISOString().substr(0, 10).replace(/-/g, '');
    const amzDate = timestamp.toISOString().replace(/[:-]|\.\d{3}/g, '');
    
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
    
    const algorithm = 'AWS4-HMAC-SHA256';
    const credentialScope = `${dateStamp}/${this.region}/${this.service}/aws4_request`;
    const stringToSign = [
      algorithm,
      amzDate,
      credentialScope,
      crypto.createHash('sha256').update(canonicalRequest).digest('hex')
    ].join('\n');
    
    const kDate = crypto.createHmac('sha256', `AWS4${this.secretKey}`).update(dateStamp).digest();
    const kRegion = crypto.createHmac('sha256', kDate).update(this.region).digest();
    const kService = crypto.createHmac('sha256', kRegion).update(this.service).digest();
    const kSigning = crypto.createHmac('sha256', kService).update('aws4_request').digest();
    const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');
    
    return signature;
  }

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
              reject(new Error(`PA-API Error: ${res.statusCode} - ${data}`));
            }
          } catch (error) {
            reject(new Error(`Error parsing PA-API response: ${error.message}`));
          }
        });
      });
      
      req.on('error', (error) => {
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
        'Images.Primary.Large'
      ]
    };
    
    try {
      const response = await this.makeRequest('GetItems', payload);
      
      if (response.ItemsResult && response.ItemsResult.Items && response.ItemsResult.Items.length > 0) {
        return this.parseProductData(response.ItemsResult.Items[0]);
      } else {
        throw new Error('Producto no encontrado en PA-API');
      }
    } catch (error) {
      console.error('Error en PA-API:', error);
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
      image: null
    };

    if (item.ItemInfo && item.ItemInfo.Title) {
      productData.name = item.ItemInfo.Title.DisplayValue;
    }

    if (item.Offers && item.Offers.Listings && item.Offers.Listings.length > 0) {
      const listing = item.Offers.Listings[0];
      
      if (listing.Price && listing.Price.Amount) {
        productData.price = listing.Price.Amount;
        productData.currency = listing.Price.CurrencyCode === 'EUR' ? '€' : listing.Price.CurrencyCode;
      }

      if (listing.Availability && listing.Availability.Message) {
        productData.availability = listing.Availability.Message;
      }
    }

    if (item.Images && item.Images.Primary && item.Images.Primary.Large) {
      productData.image = item.Images.Primary.Large.URL;
    }

    return productData;
  }

  async getProductByUrl(url) {
    const asin = this.extractASIN(url);
    if (!asin) {
      throw new Error('URL de Amazon inválida - no se pudo extraer ASIN');
    }
    
    return await this.getProductInfo(asin);
  }
}

module.exports = new PaapiClient();

module.exports = new PaapiClient();
