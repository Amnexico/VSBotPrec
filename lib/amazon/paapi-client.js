// Modificar el método createPayload para incluir información del vendedor
createPayload(asin) {
  return {
    ItemIds: [asin],
    Resources: [
      'ItemInfo.Title',
      'Offers.Listings.Price',
      'Offers.Listings.SavingBasis',
      'Offers.Listings.Promotions',
      'Offers.Listings.Condition',        // NEW, USED, etc.
      'Offers.Listings.MerchantInfo',     // Información del vendedor
      'Offers.Listings.DeliveryInfo',     // IsAmazonFulfilled
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

// Modificar el método parseResponse para incluir información del vendedor
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
    
    // Extraer información de promociones/cupones
    if (bestOffer?.Promotions) {
      const promotions = bestOffer.Promotions;
      if (promotions.length > 0) {
        promotionInfo = promotions.map(p => p.DisplayValue || 'Promoción disponible').join(', ');
        hasPromotion = true;
      }
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
      // NUEVOS CAMPOS PARA VENDEDOR
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

// NUEVO MÉTODO: Obtener información completa del vendedor
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
