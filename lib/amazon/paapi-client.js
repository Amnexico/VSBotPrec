'use strict';
const ProductAdvertisingAPIv1 = require('paapi5-nodejs-sdk');

class PaapiClient {
  constructor() {
    this.defaultApi = new ProductAdvertisingAPIv1.DefaultApi();

    // Configurar credenciales
    this.defaultApi.accessKey = 'AKPAHU7D3E1755448096';
    this.defaultApi.secretKey = 'Fb/vzlEB3i8OpMFlgOLeLr+z1lc1EC1S4zdVae/H';
    this.defaultApi.region = 'eu-west-1';
    this.defaultApi.host = 'webservices.amazon.es';

    this.partnerTag = 'vsoatg-21';
    this.marketplace = 'www.amazon.es';
  }

  extractASIN(url) {
    const asinMatch = url.match(/\/([A-Z0-9]{10})(?:[/?]|$)/);
    return asinMatch ? asinMatch[1] : null;
  }

  async getProductInfo(asin) {
    try {
      const getItemsRequest = new ProductAdvertisingAPIv1.GetItemsRequest();
      
      getItemsRequest['PartnerTag'] = this.partnerTag;
      getItemsRequest['PartnerType'] = ProductAdvertisingAPIv1.PartnerType.ASSOCIATES;
      getItemsRequest['Marketplace'] = this.marketplace;
      getItemsRequest['ItemIds'] = [asin];
      getItemsRequest['Resources'] = [
        'ItemInfo.Title',
        'Offers.Listings.Price',
        'Offers.Listings.Availability.Message',
        'Offers.Listings.DeliveryInfo.IsAmazonFulfilled',
        'Images.Primary.Large'
      ];

      const response = await this.defaultApi.getItems(getItemsRequest);
      
      if (response.ItemsResult && response.ItemsResult.Items && response.ItemsResult.Items.length > 0) {
        return this.parseProductData(response.ItemsResult.Items[0]);
      } else {
        throw new Error('Producto no encontrado');
      }
    } catch (error) {
      console.error('Error PA-API:', error);
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
