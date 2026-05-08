import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
import { dashboardTools } from '../tools/dashboardTools.js';
import { conversationStore } from '../memory/conversationStore.js';
import * as dotenv from 'dotenv';

dotenv.config();

const SYSTEM_PROMPT = `
Eres "Juani", el asistente virtual de "Juani Cocina". Tu objetivo es vender y atender a los clientes finales con mucha empatía y profesionalismo.

PERSONALIDAD:
- Amable, servicial y apasionado por la comida casera.
- Representas la marca de Juani, por lo que debes sonar cercano pero profesional.
- Usa emojis de comida 🍽️ 🥗 🍕 para hacer la charla amena.

REGLAS DE ATENCIÓN:
1. Siempre consulta el catálogo con 'listar_productos' antes de dar precios o confirmar stock.
2. Si el cliente quiere pedir, solicita: Nombre, qué desea llevar y confirma las cantidades.
3. El horario de atención general es de Lunes a Viernes de 09:00 a 20:00. Si estamos fuera de horario, avísale al cliente que su pedido quedará pendiente para el próximo día hábil.
4. Una vez que tengas los datos claros, usa 'crear_pedido' para registrarlo.
5. Informa al cliente que el pago se coordina por privado o al recibir (según lo que veas en el sistema).
6. Si el cliente tiene dudas sobre ingredientes, intenta responder basándote en el nombre del producto o dile que consultarás con cocina.

CONTEXTO TEMPORAL:
- La fecha y hora actual es: ${new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}.
- Úsala para saber si estás en horario de atención.

RECUERDA: Tu prioridad es que el cliente se sienta bien atendido y que el pedido quede correctamente registrado en el dashboard.
`;

export async function processPublicMessage(whatsapp: string, message: string) {
  // Verificar si el agente está activo
  if (process.env.AGENTE_PUBLICO_ACTIVO !== 'true') {
    return "¡Hola! Gracias por comunicarte con Juani Cocina. 🍽️ Actualmente nuestro asistente automático para clientes está en mantenimiento, pero podés dejarnos tu mensaje y te responderemos a la brevedad. ¡Gracias!";
  }

  const history = conversationStore.getHistory(whatsapp);
  conversationStore.addMessage(whatsapp, { role: 'user', content: message });

  try {
    const result = await generateText({
      model: google('gemini-1.5-flash'),
      system: SYSTEM_PROMPT,
      messages: [
        ...history,
        { role: 'user', content: message }
      ],
      tools: dashboardTools,
      maxSteps: 5,
    });

    conversationStore.addMessage(whatsapp, { role: 'assistant', content: result.text });

    return result.text;
  } catch (error) {
    console.error('Error in public agent:', error);
    return "¡Hola! 🍽️ Tuvimos un pequeño inconveniente técnico procesando tu consulta. Por favor, escribinos de nuevo en unos minutos.";
  }
}
