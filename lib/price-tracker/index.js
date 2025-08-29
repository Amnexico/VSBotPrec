// ============================================================================
// CORRECCIONES PARA lib/services/offer-service.js
// ============================================================================

// 1. REEMPLAZAR el método formatOfferMessage (TODO EN NEGRITA):
formatOfferMessage(data) {
  const discountPercent = ((data.oldPrice - data.newPrice) / data.oldPrice * 100).toFixed(0);
  
  let message = `**🆚 ${data.name}**\n\n`;
  message += `**🔥 ${data.newPrice.toFixed(2)}${data.currency}**\n\n`;
  message += `**📈 Precio anterior: ${data.oldPrice.toFixed(2)}${data.currency} (-${discountPercent}%)**\n`;
  
  if (data.stats.isHistoricalMin) {
    message += `**⚡ Mínimo histórico**\n\n`;
  } else if (data.stats.is30DayMin) {
    message += `**⚡ Mínimo últimos 30 días**\n\n`;
  } else {
    message += `**⚡ Mínimo últimos 30 días: ${data.stats.minPrice30Days.toFixed(2)}${data.currency}**\n\n`;
  }
  
  message += `**✅ ${data.affiliateUrl}**\n\n`;
  message += `**📱 Más ofertas: @vacuumspain**`;
  
  return message;
}

// 2. REEMPLAZAR el método publishToChannels (VOLVER A sendPhoto NORMAL):
async publishToChannels(message, imageUrl, affiliateUrl) {
  const results = { group: null, channel: null };
  
  try {
    // Keyboard con botón de enlace
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.url('✅ Ver Oferta en Amazon', affiliateUrl)]
    ]);
    
    // Obtener instancia del bot
    let telegram = this.telegram;
    
    if (!telegram) {
      console.log('🔄 Obteniendo instancia del bot...');
      const Bot = require('../bot');
      const botInstance = Bot.getBotInstance();
      
      if (!botInstance) {
        throw new Error('❌ No se puede obtener la instancia del bot');
      }
      
      telegram = botInstance.telegram;
      this.telegram = telegram;
    }
    
    console.log('📡 Publicando en canales...', {
      hasTelegram: !!telegram,
      groupId: this.VACUUM_GROUP_ID,
      channelId: this.VACUUM_CHANNEL_ID,
      hasImage: !!imageUrl,
      imageUrl: imageUrl
    });
    
    // Publicar en grupo
    try {
      const groupOptions = {
        parse_mode: 'Markdown',
        ...keyboard
      };
      
      // Agregar thread_id si está configurado
      if (this.VACUUM_THREAD_ID) {
        groupOptions.message_thread_id = parseInt(this.VACUUM_THREAD_ID);
      }
      
      if (imageUrl) {
        groupOptions.caption = message;
        console.log('📷 Enviando foto al grupo:', imageUrl);
        // VOLVER A sendPhoto NORMAL (no sendDocument)
        results.group = await telegram.sendPhoto(this.VACUUM_GROUP_ID, imageUrl, groupOptions);
      } else {
        console.log('📝 Enviando solo texto al grupo');
        results.group = await telegram.sendMessage(this.VACUUM_GROUP_ID, message, groupOptions);
      }
      
      console.log('✅ Publicado en grupo exitosamente');
    } catch (groupError) {
      console.error('❌ Error publishing to group:', groupError);
      results.group = { error: groupError.message };
    }
    
    // Publicar en canal
    try {
      const channelOptions = {
        parse_mode: 'Markdown',
        ...keyboard
      };
      
      if (imageUrl) {
        channelOptions.caption = message;
        console.log('📷 Enviando foto al canal:', imageUrl);
        // VOLVER A sendPhoto NORMAL (no sendDocument)
        results.channel = await telegram.sendPhoto(this.VACUUM_CHANNEL_ID, imageUrl, channelOptions);
      } else {
        console.log('📝 Enviando solo texto al canal');
        results.channel = await telegram.sendMessage(this.VACUUM_CHANNEL_ID, message, channelOptions);
      }
      
      console.log('✅ Publicado en canal exitosamente');
    } catch (channelError) {
      console.error('❌ Error publishing to channel:', channelError);
      results.channel = { error: channelError.message };
    }
    
  } catch (error) {
    console.error('❌ Error general en publishToChannels:', error);
    results.error = error.message;
  }
  
  return results;
}

// ============================================================================
// ALTERNATIVA: OBTENER IMAGEN DE MAYOR RESOLUCIÓN DESDE AMAZON
// ============================================================================

// 3. MEJORAR el método getProductImage para obtener imagen de mejor calidad:
async getProductImage(asin) {
  try {
    console.log(`🖼️ Obteniendo imagen para ASIN: ${asin}`);
    
    // Primero intentar desde la base de datos
    const product = await Product.findOne({ asin });
    if (product?.image) {
      console.log('✅ Imagen encontrada en base de datos');
      // Modificar URL de imagen para obtener mayor resolución
      let imageUrl = product.image;
      
      // Si es una imagen de Amazon, intentar obtener versión de mayor resolución
      if (imageUrl.includes('amazon')) {
        // Reemplazar el tamaño de la imagen por uno más grande
        imageUrl = imageUrl.replace(/\._[A-Z0-9,_]+_\./, '._AC_SL1000_.');
        console.log('🔍 URL de imagen mejorada:', imageUrl);
      }
      
      return imageUrl;
    }
    
    // Si no está en BD, obtener desde PA-API
    const paapiClient = require('../amazon/paapi-client');
    const productInfo = await paapiClient.getProductInfo(asin);
    
    if (productInfo && productInfo.image) {
      console.log('✅ Imagen obtenida desde PA-API');
      
      let imageUrl = productInfo.image;
      
      // Mejorar calidad de imagen de Amazon
      if (imageUrl.includes('amazon')) {
        imageUrl = imageUrl.replace(/\._[A-Z0-9,_]+_\./, '._AC_SL1000_.');
        console.log('🔍 URL de imagen PA-API mejorada:', imageUrl);
      }
      
      // Actualizar la imagen en todos los productos con este ASIN
      await Product.updateMany(
        { asin: asin },
        { $set: { image: imageUrl } }
      );
      
      return imageUrl;
    }
    
    console.log('⚠️ No se pudo obtener imagen');
    return null;
    
  } catch (error) {
    console.error('Error obteniendo imagen del producto:', error);
    return null;
  }
}
