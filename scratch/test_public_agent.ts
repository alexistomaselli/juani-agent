import 'dotenv/config';
import { processPublicMessage } from '../src/agents/publicoAgent.js';
import { conversationStore } from '../src/memory/conversationStore.js';

const WHATSAPP = '5493388430068';

async function runTest() {
  await conversationStore.clearHistory(WHATSAPP);
  console.log('🧹 Historial limpiado\n');

  // === Conversación dinámica ===
  const turns = [
    'Hola, qué venden?',
    'Quiero 2 paquetes de pizzetas',
    'Soy Alexis y mi direccion es Matheu 755',
    'Me equivoqué, quiero cambiar mi pedido a 3 paquetes por favor',
  ];

  for (const msg of turns) {
    console.log(`📱 Cliente: "${msg}"`);
    const reply = await processPublicMessage(WHATSAPP, msg);
    console.log(`🤖 Juani: "${reply}"\n`);
  }
}

runTest().catch(console.error);

