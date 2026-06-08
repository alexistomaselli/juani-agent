import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
import { dashboardTools } from '../tools/dashboardTools.js';
import { conversationStore } from '../memory/conversationStore.js';
import { supabase } from '../lib/supabase.js';
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

async function getJuaniStatus() {
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

  // Fetch store settings from DB
  let isVacationMode = false;
  let vacationMessage = "";
  let deliveryDaysInfo = "";

  try {
    const { data } = await supabase.from('StoreSettings').select('*').limit(1).single();
    if (data) {
      isVacationMode = data.isVacationMode;
      vacationMessage = data.vacationMessage;
      deliveryDaysInfo = data.deliveryDaysInfo;
    }
  } catch (err) {
    console.error('Error fetching StoreSettings:', err);
  }

  let statusGreeting = "";
  
  if (isVacationMode && vacationMessage) {
    statusGreeting = vacationMessage;
  } else if (isSchoolTime) {
    statusGreeting = "¡Hola! Soy Juani. 🏫 En este momento estoy en la escuela, pero dejame tu pedido anotado por acá y lo preparamos apenas salga.";
  } else {
    const isWeekend = day === 0 || day === 6;
    if (isWeekend) {
      statusGreeting = "¡Hola! Soy Juani. 👨‍🍳 Hoy es fin de semana, así que estoy libre en la cocina preparando cosas ricas.";
    } else {
      statusGreeting = "¡Hola! Soy Juani. 👋 Ya salí de la escuela y estoy acá en la cocina metiéndole con todo.";
    }
  }

  return {
    isSchoolTime,
    isVacationMode,
    statusGreeting,
    deliveryDaysInfo,
    dateTimeStr: argDate.toLocaleString('es-AR')
  };
}

function getSystemPrompt(whatsappNumber: string, statusInfo: Awaited<ReturnType<typeof getJuaniStatus>>) {
  return `Eres "Juani", el asistente virtual y la voz de "Juani Cocina". 
Juani es un adolescente de 16 años con retraso madurativo que no habla de forma oral, por lo que este bot de WhatsApp es su herramienta principal para expresarse, vender de forma independiente y comunicarse con sus clientes.

Tu personalidad:
- Hablá con muchísima empatía, calidez y sencillez.
- Expresate en español rioplatense/argentino coloquial ("voseo": usá querés, decime, anotás, che).
- Usá emojis amigables de cocina y comida (🍕, 🍽️, 👨‍🍳, 🏠) de forma natural.

ESTADO ACTUAL DE LA TIENDA Y DE JUANI:
- Fecha/Hora en Argentina: ${statusInfo.dateTimeStr}
- Información de Reparto/Horarios: "${statusInfo.deliveryDaysInfo}" (Usá esta info si te preguntan cuándo reparten o entregan).
- Mensaje de saludo sugerido: "${statusInfo.statusGreeting}"

*INSTRUCCIÓN CRÍTICA PARA EL PRIMER MENSAJE:*
Si el cliente te escribe por primera vez (ej. dice "Hola"), DEBES:
1. Usar el "Mensaje de saludo sugerido" tal cual.
2. Usar la herramienta 'listar_productos' para ver qué hay activo.
3. Terminar tu mensaje ofreciendo activamente uno de esos productos de forma súper tentadora para persuadirlo a comprar (ej: "¿Te tiento con un paquete de prepizzetas integrales riquísimas por $5000?"). 
PROHIBIDO terminar el saludo inicial con frases genéricas y aburridas como "¿En qué puedo ayudarte hoy?". ¡Sos un vendedor entusiasta!

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
- Cuando el cliente te confirme la cantidad, su nombre y dirección, TENÉS QUE CREAR EL PEDIDO INMEDIATAMENTE usando la herramienta 'crear_pedido'. NO le preguntes el método de pago antes de crearlo.
- 🚨 REGLA EXTREMA: PROHIBIDO inventar números de pedido o alucinar que el pedido se creó. SOLAMENTE podés confirmar el pedido y dar un número si la herramienta 'crear_pedido' te devuelve un éxito y un 'orderNumber'. Si no llamaste a la herramienta, NO ESTÁ CREADO.
- Una vez que la herramienta 'crear_pedido' te confirme que se guardó correctamente, DEBES mostrarle el resumen al cliente obligatoriamente con este formato de lista (sin textos largos):
  - Producto: [nombre del producto]
  - Cantidad: [cantidad en paquetes]
  - Dirección: [dirección]
  - Nombre: [nombre del cliente]
  - Monto: $[monto total calculado]

- Debajo de esa lista, RECIÉN AHÍ le ofreces las opciones de pago usando esta frase exacta:
  "Tu número de pedido es el #[Número devuelto por la herramienta]. Podés pagar en efectivo al recibir, o por transferencia al alias juanicocina.nx"
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
- IMPORTANTE: NUNCA DEBES DEVOLVER UNA RESPUESTA VACÍA. SIEMPRE debes responderle al usuario con texto, ya sea para pedir un dato faltante (como la dirección), para confirmar un pedido, o para avisar si hubo un error.
`;
}

export async function processPublicMessage(whatsapp: string, message: string) {
  if (process.env.AGENTE_PUBLICO_ACTIVO !== 'true') {
    return "¡Hola! Gracias por comunicarte con Juani Cocina. 🍽️ Actualmente nuestro asistente automático está descansando, pero dejanos tu mensaje y te responderemos a la brevedad. ¡Gracias!";
  }

  // 1. Obtener estado en tiempo real de Juani
  const statusInfo = await getJuaniStatus();
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

    let responseText = result.text;
    if (!responseText || responseText.trim() === '') {
      console.warn('⚠️ La IA devolvió una respuesta vacía. Aplicando fallback.');
      responseText = "Entendido. ¿Me podrías confirmar tu dirección exacta para poder continuar con el pedido?";
    }

    await conversationStore.addMessage(whatsapp, { role: 'assistant', content: responseText });

    return responseText;
  } catch (error) {
    console.error('Error en public agent:', error);
    return "¡Hola! 🍽️ Tuvimos un pequeño inconveniente técnico procesando tu consulta. Por favor, escribinos de nuevo en unos minutos.";
  }
}

