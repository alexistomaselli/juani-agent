import 'dotenv/config';
import { processPublicMessage } from '../src/agents/publicoAgent.js';
import { conversationStore } from '../src/memory/conversationStore.js';

const WHATSAPP = '5493388430068';

async function runTest() {
  await conversationStore.clearHistory(WHATSAPP);
  console.log('🧹 Historial limpiado\n');

  // === Conversación real de Mariela ===
  const turns = [
    'Hola',
    'Quisiera encargar pizzas',
    'Si si',
    '1 paquete',
    'Mariela a Matheu 757',
    'Sisi',  // ← aquí el bot olvidaba todo y pedía nombre+dirección de nuevo
  ];

  for (const msg of turns) {
    console.log(`📱 Cliente: "${msg}"`);
    const reply = await processPublicMessage(WHATSAPP, msg);
    console.log(`🤖 Juani: "${reply}"\n`);

    // Si ya creó el pedido, terminamos
    if (reply.includes('#') && reply.toLowerCase().includes('pedido')) {
      console.log('✅ ÉXITO: Pedido creado!');
      break;
    }
  }
}

runTest().catch(console.error);

