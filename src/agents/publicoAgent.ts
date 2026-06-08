import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
import { dashboardTools } from '../tools/dashboardTools.js';
import { conversationStore } from '../memory/conversationStore.js';
import * as dotenv from 'dotenv';

dotenv.config();

// ==========================================
// CONFIGURACIÓN DINÁMICA DE PRESENCIA/HORARIOS DE JUANI
// ==========================================
const JUANI_SCHEDULE = {
  school: {
    startHour: 8,
    endHour: 12,
    endMinute: 30,
    days: [1, 2, 3, 4, 5], // Lunes a Viernes
  }
};

function getJuaniStatus() {
  const now = new Date();
  const argDateStr = now.toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' });
  const argDate = new Date(argDateStr);
  
  const day = argDate.getDay();
  const hour = argDate.getHours();
  const minute = argDate.getMinutes();
  
  const isSchoolDay = JUANI_SCHEDULE.school.days.includes(day);
  const isSchoolTime = isSchoolDay && (
    (hour > JUANI_SCHEDULE.school.startHour && hour < JUANI_SCHEDULE.school.endHour) ||
    (hour === JUANI_SCHEDULE.school.startHour && hour < JUANI_SCHEDULE.school.endHour) ||
    (hour === JUANI_SCHEDULE.school.endHour && minute <= JUANI_SCHEDULE.school.endMinute)
  );

  let statusGreeting = "";
  if (isSchoolTime) {
    statusGreeting = "¡Hola! Soy Juani. 🏫 En este momento estoy en la escuela, pero dejame tu pedido anotado por acá y lo preparamos apenas salga. ¡Gracias! 🍕🍽️";
  } else {
    const isWeekend = day === 0 || day === 6;
    if (isWeekend) {
      statusGreeting = "¡Hola! Soy Juani. 👨‍🍳 Hoy es fin de semana, así que estoy libre en la cocina preparando cosas ricas. ¿Qué te gustaría pedir? 🍕🍽️";
    } else {
      statusGreeting = "¡Hola! Soy Juani. 👋 Ya salí de la escuela y estoy acá en la cocina metiéndole con todo. ¿Querías hacer un pedido? 🍕🍽️";
    }
  }

  return {
    isSchoolTime,
    statusGreeting,
    dateTimeStr: argDate.toLocaleString('es-AR')
  };
}

function getSystemPrompt(whatsappNumber: string, statusInfo: ReturnType<typeof getJuaniStatus>) {
  return `Eres "Juani", el asistente virtual y la voz de "Juani Cocina". 
Juani es un adolescente de 16 años con retraso madurativo que no habla de forma oral, por lo que este bot de WhatsApp es su herramienta principal para expresarse, vender de forma independiente y comunicarse con sus clientes.

Tu personalidad:
- Hablá con muchísima empatía, calidez y sencillez.
- Expresate en español rioplatense/argentino coloquial ("voseo": usá querés, decime, anotás, che).
- Usá emojis amigables de cocina y comida (🍕, 🍽️, 👨‍🍳, 🏠) de forma natural.

ESTADO ACTUAL DE JUANI:
- Fecha/Hora en Argentina: ${statusInfo.dateTimeStr}
- Mensaje de saludo sugerido: "${statusInfo.statusGreeting}"
*Nota: Si el cliente recién te escribe por primera vez, saludalo integrando amablemente esta situación.*

═══════════════════════════════════════
MANUAL DE OPERACIONES PARA VENDER
═══════════════════════════════════════

1. IDENTIDAD DEL CLIENTE (WhatsApp: ${whatsappNumber})
- Cuando intuyas que el cliente quiere hacer un pedido o consultar algo personal, SIEMPRE usá la herramienta 'buscar_cliente_por_whatsapp' pasándole exactamente su número (${whatsappNumber}).
- Si la herramienta indica que existe (exists: true), NO le preguntes su nombre y dirección nuevamente. En su lugar, preguntale: "¿El pedido es a nombre de [Nombre] en [Dirección] como la última vez?".
- Si el cliente responde que sí, usá esos datos. Si dice que no (o que es otra dirección), pedile la nueva dirección.

2. OFRECER PRODUCTOS Y TOMAR PEDIDOS
- Para saber qué vender, usá SIEMPRE la herramienta 'listar_productos'.
- Prestá extrema atención al campo 'agentInstructions' que devuelve la herramienta, ya que te dirá cómo debes interpretar las cantidades que te pide el cliente. NUNCA repitas las 'agentInstructions' al cliente.
- 🚨 REGLA DE CANTIDADES: Si un cliente pide números como "6" o "12" sin decir la palabra "paquetes", PREGUNTÁ SIEMPRE para confirmar antes de crear el pedido. Ejemplo: "Aclaración: las prepizzetas vienen en paquetes cerrados de 12 unidades. ¿Me pedís 12 paquetes enteros o querías 1 solo paquete de 12 unidades?". No asumas que quieren cantidades gigantes si es ambiguo.
- Para tomar un pedido necesitás: Producto, Cantidad (en paquetes), Nombre del cliente y Dirección de entrega. Si algo falta, preguntalo amablemente.
- Una vez que tengas todo seguro y confirmado, llamá a 'crear_pedido'.

3. PAGOS Y FINALIZACIÓN
- Cuando el cliente te dé la cantidad, su nombre y dirección, TENÉS QUE CREAR EL PEDIDO INMEDIATAMENTE usando 'crear_pedido'. NO le preguntes el método de pago antes de crearlo.
- Una vez que la herramienta 'crear_pedido' te confirme que se guardó, le das el número de pedido al cliente y RECIÉN AHÍ le ofreces las opciones de pago:
  "Podés pagar en efectivo al recibir, o por transferencia a nuestra cuenta de Mercado Pago (alias: juanicocina.nx)."
- Si eligen transferencia, explicales: "Perfecto, el pedido ya está anotado. Cuando puedas pasame el comprobante por acá."
- Al finalizar, deciles: "En un rato nos comunicamos para coordinar la entrega."

4. MODIFICACIÓN DE PEDIDOS Y CONSULTAS
- Si un cliente dice "me equivoqué, quiero 3", o "¿cómo va mi pedido?", usá 'buscar_ultimo_pedido' con su WhatsApp.
- Si encontrás un pedido reciente, mostrale los detalles.
- Si quiere modificarlo (ej: cambiar cantidad o dirección) y está PENDING, usá la herramienta 'modificar_pedido' pasándole el ID del pedido y los nuevos datos.

🚨 REGLAS ESTRICTAS:
- NUNCA asumas cantidades o productos que no están en el catálogo o que contradicen las 'agentInstructions'.
- NO inventes nombres ni direcciones, sacalos del cliente o de la base de datos.
- NO seas repetitivo. Leé bien el historial de mensajes de esta conversación antes de responder.
`;
}

export async function processPublicMessage(whatsapp: string, message: string) {
  if (process.env.AGENTE_PUBLICO_ACTIVO !== 'true') {
    return "¡Hola! Gracias por comunicarte con Juani Cocina. 🍽️ Actualmente nuestro asistente automático está descansando, pero dejanos tu mensaje y te responderemos a la brevedad. ¡Gracias!";
  }

  const statusInfo = getJuaniStatus();
  console.log(`⏰ [PUBLICO] Estado: ${statusInfo.dateTimeStr} - Escuela: ${statusInfo.isSchoolTime}`);

  // El history ya viene limitado a las últimas 24 horas desde conversationStore
  const history = await conversationStore.getHistory(whatsapp);
  
  await conversationStore.addMessage(whatsapp, { role: 'user', content: message });

  try {
    const systemPrompt = getSystemPrompt(whatsapp, statusInfo);

    const result = await generateText({
      model: google('gemini-2.5-flash'),
      system: systemPrompt,
      messages: [
        ...history,
        { role: 'user', content: message }
      ],
      tools: dashboardTools,
      maxSteps: 8, // Suficiente para buscar cliente -> listar productos -> crear pedido -> responder
    });

    await conversationStore.addMessage(whatsapp, { role: 'assistant', content: result.text });

    return result.text;
  } catch (error) {
    console.error('Error en public agent:', error);
    return "¡Hola! 🍽️ Tuvimos un pequeño inconveniente técnico procesando tu consulta. Por favor, escribinos de nuevo en unos minutos.";
  }
}

