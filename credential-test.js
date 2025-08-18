// credential-test.js - Script para verificar credenciales PA-API
const https = require('https');
const aws4 = require('aws4');

// CREDENCIALES A VERIFICAR
const TEST_CREDENTIALS = {
  // Usando las credenciales fallback actuales
  accessKey: 'AKIAJ3EGVBIPDVM6T4CA',
  secretKey: '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',
  partnerTag: 'vacuumspain-21'
};

async function testCredentials() {
  console.log('🔍 VERIFICANDO CREDENCIALES PA-API...\n');
  
  // Test 1: Verificar con un ASIN conocido que existe
  const testAsin = 'B08N5WRWNW'; // Echo Dot - producto muy común
  
  const payload = {
    PartnerTag: TEST_CREDENTIALS.partnerTag,
    PartnerType: 'Associates',
    Marketplace: 'www.amazon.es',
    ItemIds: [testAsin],
    Resources: ['ItemInfo.Title'] // Mínimo necesario
  };

  const options = {
    host: 'webservices.amazon.es',
    path: '/paapi5/getitems',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'X-Amz-Target': 'com.amazon.paapi5.v1.ProductAdvertisingAPIv1.GetItems'
    },
    body: JSON.stringify(payload),
    service: 'ProductAdvertisingAPIv1',
    region: 'eu-west-1'
  };

  // Firmar con aws4
  aws4.sign(options, {
    accessKeyId: TEST_CREDENTIALS.accessKey,
    secretAccessKey: TEST_CREDENTIALS.secretKey
  });

  console.log('📋 DETALLES DE LA SOLICITUD:');
  console.log('- Host:', options.host);
  console.log('- Path:', options.path);
  console.log('- Access Key:', TEST_CREDENTIALS.accessKey.substring(0, 8) + '...');
  console.log('- Partner Tag:', TEST_CREDENTIALS.partnerTag);
  console.log('- ASIN de prueba:', testAsin);
  console.log('- Target Header:', options.headers['X-Amz-Target']);
  console.log('- Authorization:', options.headers['Authorization']?.substring(0, 50) + '...');
  console.log();

  return new Promise((resolve) => {
    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        console.log('📡 RESPUESTA DE AMAZON:');
        console.log('- Status Code:', res.statusCode);
        console.log('- Headers:', JSON.stringify(res.headers, null, 2));
        console.log('- Body:', data);
        console.log();

        try {
          const response = JSON.parse(data);
          
          if (res.statusCode === 200) {
            console.log('✅ ÉXITO: Credenciales válidas y funcionando');
            if (response.ItemsResult?.Items?.length > 0) {
              console.log('📦 Producto encontrado:', response.ItemsResult.Items[0].ItemInfo?.Title?.DisplayValue);
            }
          } else if (res.statusCode === 404 && response.Output?.__type === 'com.amazon.coral.service#InternalFailure') {
            console.log('❌ ERROR CRÍTICO: InternalFailure (404)');
            console.log('🔍 POSIBLES CAUSAS:');
            console.log('   1. ❌ Access Key o Secret Key incorrectos');
            console.log('   2. ❌ Cuenta no autorizada para PA-API');
            console.log('   3. ❌ Partner Tag no válido para Amazon.es');
            console.log('   4. ❌ Rate limiting extremo');
            console.log('   5. ❌ Cuenta suspendida temporalmente');
          } else if (res.statusCode === 403) {
            console.log('❌ ERROR: Acceso denegado (403)');
            console.log('🔍 CAUSA: Credenciales incorrectas o sin permisos');
          } else {
            console.log('⚠️ OTRO ERROR:', res.statusCode, response);
          }
        } catch (error) {
          console.log('❌ Error parseando respuesta:', error.message);
          console.log('Raw response:', data);
        }
        
        resolve();
      });
    });
    
    req.on('error', (error) => {
      console.error('❌ ERROR DE RED:', error.message);
      resolve();
    });
    
    req.write(JSON.stringify(payload));
    req.end();
  });
}

// FUNCIÓN PARA VERIFICAR PARTNER TAG
async function verifyPartnerTag() {
  console.log('🏷️ VERIFICANDO PARTNER TAG...\n');
  
  // Verificar si el partner tag es válido para España
  const spanishTags = ['vacuumspain-21', 'vsoatg-21'];
  
  console.log('📋 PARTNER TAGS CONFIGURADOS:');
  console.log('- Principal:', TEST_CREDENTIALS.partnerTag);
  console.log('- Tracking: vsoatg-21');
  console.log();
  
  // Verificar formato del tag
  const tagRegex = /^[a-zA-Z0-9-]+$/;
  if (!tagRegex.test(TEST_CREDENTIALS.partnerTag)) {
    console.log('❌ FORMATO DE TAG INVÁLIDO');
    return;
  }
  
  console.log('✅ Formato de tag válido');
  console.log('⚠️ IMPORTANTE: Verificar que el tag esté registrado para Amazon.es');
  console.log();
}

// FUNCIÓN PRINCIPAL
async function runDiagnostic() {
  console.log('🚀 DIAGNÓSTICO PA-API AMAZON ESPAÑA\n');
  console.log('=' .repeat(50));
  console.log();
  
  await verifyPartnerTag();
  await testCredentials();
  
  console.log('=' .repeat(50));
  console.log('🎯 PRÓXIMOS PASOS RECOMENDADOS:\n');
  console.log('1. 🔐 Verificar credenciales en Amazon Developer Console');
  console.log('2. 🏷️ Confirmar que Partner Tag está registrado para Amazon.es');
  console.log('3. 📊 Revisar estado de la cuenta de asociado');
  console.log('4. 📧 Contactar soporte si las credenciales son correctas');
  console.log('5. 🔄 Intentar generar nuevas credenciales');
}

// Ejecutar si es llamado directamente
if (require.main === module) {
  runDiagnostic().catch(console.error);
}

module.exports = { testCredentials, verifyPartnerTag };
