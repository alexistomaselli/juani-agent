import 'dotenv/config';
import { processPublicMessage } from '../src/agents/publicoAgent.js';

async function runTest() {
  const whatsappNumber = '543388410486';

  console.log("=== TEST 1: Saludo y consulta de catálogo ===");
  const reply1 = await processPublicMessage(
    whatsappNumber, 
    "Hola Juani! Quería saber qué tenés para vender y a cuánto?"
  );
  console.log("\n💬 Juani responde:\n", reply1);
  console.log("\n============================================\n");

  console.log("=== TEST 2: Intento de compra de Pizzetas (x12) ===");
  const reply2 = await processPublicMessage(
    whatsappNumber, 
    "Buenísimo! Anotame 2 paquetes de las Pizzetas (x12), soy Alex y es para entregar en Calle Falsa 123."
  );
  console.log("\n💬 Juani responde:\n", reply2);
  console.log("\n============================================\n");

  console.log("=== TEST 3: Cliente pide producto desactivado (Prepizzetas x6) ===");
  const reply3 = await processPublicMessage(
    whatsappNumber, 
    "Hola Juani, che una pregunta, ¿tenés prepizzetas de 6 unidades? Me gustaría pedir 3 paquetes de esas."
  );
  console.log("\n💬 Juani responde:\n", reply3);
  console.log("\n============================================\n");
  // TEST 4 — Replica del bug: cliente da nombre + dirección juntos, el bot DEBE crear el pedido ya
  const whatsappBug = '5493388430068';
  console.log("=== TEST 4 (BUG REPLAY): Bot pregunta por datos, cliente los da todos juntos → debe crear pedido sin pedir confirmación ===");

  // Simula que el bot ya preguntó nombre y dirección
  const { conversationStore } = await import('../src/memory/conversationStore.js');
  await conversationStore.addMessage(whatsappBug, { role: 'user', content: '¿Qué tenés para vender?' });
  await conversationStore.addMessage(whatsappBug, { role: 'assistant', content: '¡Hola! Hoy tenemos Pizzetas x12 a $5000 cada paquete. ¿Querés pedir? Si es así, decime: ¿cuántos paquetes, tu nombre y dirección de entrega?' });
  await conversationStore.addMessage(whatsappBug, { role: 'user', content: 'si, 2 paquetes' });
  await conversationStore.addMessage(whatsappBug, { role: 'assistant', content: '¡Buenísimo! Te anoto 2 paquetes de Pizzetas (x12) 🍕. ¿Me decís tu nombre y a qué dirección te las llevamos?' });

  // El cliente responde con nombre + dirección
  const reply4 = await processPublicMessage(whatsappBug, 'alexis en calle mathe 757, ese es mi numero');
  console.log("\n💬 Juani responde:\n", reply4);
  console.log("\n============================================\n");
}

runTest().catch(console.error);
