const addPrice = async (ctx) => {
  if (ctx.from.id !== ADMIN_USER_ID) {
    return ctx.reply('Comando no autorizado');
  }
  
  const args = ctx.message.text.split(' ');
  // /addprice B0D9YHVZKS 299.99 "Cupón de 30€"
  if (args.length < 4) {
    return ctx.reply('Uso: /addprice ASIN precio "comentario"');
  }
  
  try {
    const asin = args[1];
    const price = parseFloat(args[2]);
    const comment = args.slice(3).join(' ').replace(/"/g, '');
    
    // Crear registro inmediato en historial
    await PriceHistory.create({
      asin,
      price,
      previousPrice: 0,
      timestamp: new Date(),
      currency: 'EUR',
      comment // Nuevo campo para el comentario
    });
    
    // Forzar verificación del producto para activar alertas
    const products = await Product.find({
      $or: [
        { asin: asin },
        { url: { $regex: asin } }
      ]
    });
    
    if (products.length > 0) {
      const priceTracker = require('../../price-tracker');
      for (const product of products) {
        // Simular cambio de precio
        const oldPrice = product.price;
        if (oldPrice !== price) {
          // Actualizar producto con el nuevo precio
          await Product.findByIdAndUpdate(product._id, {
            price: price,
            lastCheck: Math.floor(Date.now() / 1000)
          });
          
          // Emitir evento de cambio de precio
          if (priceTracker.shouldSendAlert(product, price)) {
            priceTracker.emit('update', {
              ...product.toObject(),
              asin: asin,
              oldPrice: oldPrice,
              newPrice: price,
              manualUpdate: true,
              comment: comment,
              changeType: price < oldPrice ? 'price_drop' : 'price_increase'
            });
          }
        }
      }
    }
    
    ctx.reply(`✅ Precio agregado:
📦 ASIN: ${asin}
💰 Precio: ${price}€
📝 ${comment}
👥 Notificaciones enviadas a ${products.length} seguidor(es)`);
    
  } catch (error) {
    ctx.reply(`❌ Error: ${error.message}`);
  }
};

const addHistoricalPrice = async (ctx) => {
  if (ctx.from.id !== ADMIN_USER_ID) {
    return ctx.reply('Comando no autorizado');
  }
  
  const args = ctx.message.text.split(' ');
  // /addhistory B0D9YHVZKS 15/08/2024 299.99 "Precio histórico"
  if (args.length < 5) {
    return ctx.reply('Uso: /addhistory ASIN DD/MM/YYYY precio "comentario"');
  }
  
  try {
    const asin = args[1];
    const dateStr = args[2];
    const price = parseFloat(args[3]);
    const comment = args.slice(4).join(' ').replace(/"/g, '');
    
    // Convertir fecha DD/MM/YYYY
    const [day, month, year] = dateStr.split('/');
    const timestamp = new Date(year, month - 1, day, 12, 0, 0);
    
    await PriceHistory.create({
      asin,
      price,
      previousPrice: 0,
      timestamp,
      currency: 'EUR',
      comment
    });
    
    ctx.reply(`✅ Precio histórico agregado:
📦 ASIN: ${asin}
📅 Fecha: ${timestamp.toLocaleDateString('es-ES')}
💰 Precio: ${price}€
📝 ${comment}`);
    
  } catch (error) {
    ctx.reply(`❌ Error: ${error.message}`);
  }
};
