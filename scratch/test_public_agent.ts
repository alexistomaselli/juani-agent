import 'dotenv/config';
import { processPublicMessage } from '../src/agents/publicoAgent.js';
import { conversationStore } from '../src/memory/conversationStore.js';

const WHATSAPP = '5493388430068'; // número real de la prueba

async function runTest() {
  // Limpiamos el historial para empezar desde cero
  await conversationStore.clearHistory(WHATSAPP);
  console.log('🧹 Historial limpiado\n');

  // === TURNO 1: El usuario pregunta qué hay para vender ===
  console.log('📱 Alexis: "hola, que tenes para vender?"');
  const r1 = await processPublicMessage(WHATSAPP, 'hola, que tenes para vender?');
  console.log(`🤖 Juani: "${r1}"\n`);

  // === TURNO 2: Pide 2 paquetes ===
  console.log('📱 Alexis: "si 2 paquetes"');
  const r2 = await processPublicMessage(WHATSAPP, 'si 2 paquetes');
  console.log(`🤖 Juani: "${r2}"\n`);

  // === TURNO 3: Da nombre + dirección (aquí es donde fallaba) ===
  console.log('📱 Alexis: "alexis, calle Matheu 755 y si, ese es mi whatsapp"');
  const r3 = await processPublicMessage(WHATSAPP, 'alexis, calle Matheu 755 y si, ese es mi whatsapp');
  console.log(`🤖 Juani: "${r3}"\n`);

  // Verificamos si se creó el pedido
  if (r3.includes('#') || r3.toLowerCase().includes('pedido')) {
    console.log('✅ ÉXITO: El pedido fue creado en el Turno 3');
  } else {
    console.log('❌ FALLO: El bot NO creó el pedido. Respuesta inesperada.');
  }
}

runTest().catch(console.error);

