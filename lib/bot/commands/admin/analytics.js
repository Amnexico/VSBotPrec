'use strict';
const AnalyticsService = require('../../../services/analytics-service');

const stats = async (ctx) => {
  if (!AnalyticsService.isAdmin(ctx.from.id)) {
    return ctx.reply('Acceso denegado');
  }

  await ctx.reply('Generando dashboard de analytics...');
  
  try {
    const ctr = await AnalyticsService.getCTRReport();

    const dashboard = `*VS PrecioBot Analytics Dashboard*

CONVERSION Y MONETIZACION
- CTR Global: ${ctr.ctr} (${ctr.totalClicks}/${ctr.totalAlerts})

Sistema funcionando correctamente.
Usa /listaproductos y /listausuarios para ver detalles.`;

    await ctx.replyWithMarkdown(dashboard);

  } catch (error) {
    console.error('Error generating dashboard:', error);
    await ctx.reply('Error generando dashboard');
  }
};

const listaproductos = async (ctx) => {
  if (!AnalyticsService.isAdmin(ctx.from.id)) {
    return ctx.reply('Acceso denegado');
  }

  try {
    const { ProductStats } = require('../../../models');
    const products = await ProductStats.find({})
      .sort({ totalTrackers: -1 })
      .limit(20);
    
    if (products.length === 0) {
      return ctx.reply('No hay productos registrados');
    }

    let message = `*LISTA COMPLETA DE PRODUCTOS* (${products.length})\n\n`;
    
    products.forEach((p, i) => {
      const ctr = p.totalAlerts > 0 ? ((p.totalClicks / p.totalAlerts) * 100).toFixed(1) : '0';
      message += `${i+1}. ${p.productName || 'Producto'}\n`;
      message += `   ASIN: \`${p.asin}\`\n`;
      message += `   Usuarios: ${p.totalTrackers} | CTR: ${ctr}%\n`;
      message += `   Clicks: ${p.totalClicks} | Alertas: ${p.totalAlerts}\n\n`;
    });

    await ctx.replyWithMarkdown(message);

  } catch (error) {
    console.error('Error getting products list:', error);
    await ctx.reply('Error obteniendo lista de productos');
  }
};

const listausuarios = async (ctx) => {
  if (!AnalyticsService.isAdmin(ctx.from.id)) {
    return ctx.reply('Acceso denegado');
  }

  try {
    const { UserStats, Product } = require('../../../models');
    const users = await UserStats.find({})
      .sort({ totalProducts: -1 })
      .limit(15);
    
    if (users.length === 0) {
      return ctx.reply('No hay usuarios registrados');
    }

    let message = `*LISTA COMPLETA DE USUARIOS* (${users.length})\n\n`;
    
    for (const u of users) {
      const products = await Product.find({ user: u.userId }).limit(5);
      
      message += `${u.firstName || ''} ${u.lastName || ''} (@${u.username || 'sin_username'})\n`;
      message += `   ID: \`${u.userId}\` | Tipo: ${u.userType}\n`;
      message += `   Productos: ${u.totalProducts} | Clicks: ${u.affiliateClicks}\n`;
      
      if (products.length > 0) {
        const productNames = products.map(p => p.name.substring(0, 20) + '...').join(', ');
        message += `   Siguiendo: ${productNames}\n`;
      }
      message += '\n';
    }

    await ctx.replyWithMarkdown(message);

  } catch (error) {
    console.error('Error getting users list:', error);
    await ctx.reply('Error obteniendo lista de usuarios');
  }
};

const ayudaanalytics = async (ctx) => {
  if (!AnalyticsService.isAdmin(ctx.from.id)) {
    return ctx.reply('Acceso denegado');
  }

  const helpMessage = `*COMANDOS DE ANALYTICS*

Dashboard Principal:
/stats - Dashboard completo de analytics

Listas Completas:
/listaproductos - Todos los productos con stats
/listausuarios - Todos los usuarios con sus productos

Utilidades:
/ayudaanalytics - Esta ayuda

Todos los comandos son exclusivos para admin (ID: 615957202)`;

  await ctx.replyWithMarkdown(helpMessage);
};

module.exports = {
  stats,
  listaproductos,
  listausuarios,
  ayudaanalytics
};
