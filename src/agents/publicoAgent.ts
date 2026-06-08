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
    days: [1, 2, 3, 4, 5], // Lunes a Viernes (0 = Domingo, 1 = Lunes, etc.)
  }
};

/**
 * Obtiene el estado actual de Juani en tiempo real en base a la zona horaria de Argentina.
 */
function getJuaniStatus() {
  const now = new Date();
  
  // Convertimos a la hora local de Argentina
  const argDateStr = now.toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' });
  const argDate = new Date(argDateStr);
  
  const day = argDate.getDay(); // 0 = Domingo, 1 = Lunes, etc.
  const hour = argDate.getHours();
  const minute = argDate.getMinutes();
  
  const isSchoolDay = JUANI_SCHEDULE.school.days.includes(day);
  const isSchoolTime = isSchoolDay && (
    (hour > JUANI_SCHEDULE.school.startHour && hour < JUANI_SCHEDULE.school.endHour) ||
    (hour === JUANI_SCHEDULE.school.startHour && hour < JUANI_SCHEDULE.school.endHour) || // Margen inicial
    (hour === JUANI_SCHEDULE.school.endHour && minute <= JUANI_SCHEDULE.school.endMinute)
  );

  let statusGreeting = "";
  if (isSchoolTime) {
    statusGreeting = "¡Hola! Soy Juani. 🏫 En este momento estoy en la escuela (voy por la mañana de lunes a viernes), pero decime qué querías pedir y te lo dejo anotado por acá para cuando salga. ¡Gracias! 🍕🍽️";
  } else {
    const isWeekend = day === 0 || day === 6;
    if (isWeekend) {
      statusGreeting = "¡Hola! Soy Juani. 👨‍🍳 Hoy es fin de semana, así que estoy libre en la cocina preparando prepizzetas riquísimas. ¿Querías registrar un pedido? 🍕🍽️";
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

/**
 * Extrae el estado del pedido en progreso escaneando el historial de la conversación.
 * Busca patrones en los mensajes del asistente para recuperar datos ya confirmados.
 */
type CoreMessage = { role: string; content: string | any[] };

function extractPendingOrderState(history: CoreMessage[]): string {
  let quantity: number | null = null;
  let product: string | null = null;

  for (const msg of history) {
    const content = typeof msg.content === 'string'
      ? msg.content
      : Array.isArray(msg.content)
        ? msg.content.filter((p: any) => p.type === 'text').map((p: any) => p.text).join(' ')
        : '';

    if (msg.role === 'assistant') {
      // Detecta frases como "Te anoto 2 paquetes de Pizzetas (x12)"
      const match = content.match(/[Tt]e anoto (\d+) paquetes? de ([^\n.!?]+?)(?:\s*[🍕🍽️👨‍🍳🥖]|\.|,|$)/u);
      if (match) {
        quantity = parseInt(match[1], 10);
        product = match[2].trim();
      }
    }
  }

  if (!quantity && !product) return '';

  const lines: string[] = [];
  lines.push('═══════════════════════════════════════');
  lines.push('ESTADO DEL PEDIDO EN PROGRESO (datos ya confirmados en esta conversación)');
  lines.push('═══════════════════════════════════════');
  if (quantity) lines.push(`✓ Cantidad ya confirmada: ${quantity} paquetes`);
  if (product) lines.push(`✓ Producto ya confirmado: ${product}`);
  lines.push('');
  lines.push('⚠️ CRÍTICO: NO volvás a preguntar por los datos marcados con ✓. Ya fueron acordados.');
  lines.push('Si con el mensaje actual del cliente completás los 3 datos (producto+cantidad, nombre, dirección) → llamá a crear_pedido YA.');
  lines.push('═══════════════════════════════════════');
  return '\n' + lines.join('\n') + '\n';
}

/**
 * Genera el System Prompt de forma dinámica con la fecha, hora y estado actual de Juani.
 */
function getSystemPrompt(whatsappNumber: string, statusInfo: ReturnType<typeof getJuaniStatus>, history: CoreMessage[] = []) {
  const pendingOrderBlock = extractPendingOrderState(history);
  return `${pendingOrderBlock}
Eres "Juani", el asistente virtual y la voz de "Juani Cocina". 
Juani es un adolescente de 16 años con retraso madurativo que no habla de forma oral, por lo que este bot de WhatsApp es su herramienta principal para expresarse, vender prepizzetas de forma independiente y comunicarse con sus clientes.

Tu personalidad debe reflejar el alma del proyecto familiar:
- Hablá con muchísima empatía, calidez y sencillez.
- Expresate en español rioplatense/argentino coloquial ("voseo": usá querés, decime, anotás, che).
- Usá emojis amigables de cocina y comida (🍕, 🍽️, 🥖, 👨‍🍳, 🏠) de forma natural pero alegre.

ESTADO ACTUAL DE JUANI (Úsalo de guía para tu saludo inicial si el chat está empezando):
- Fecha/Hora en Argentina: ${statusInfo.dateTimeStr}
- Mensaje de Presencia/Saludo sugerido: "${statusInfo.statusGreeting}"
*Nota: Si el cliente recién te escribe y no hay conversación previa, saludalo integrando amablemente esta situación.*

═══════════════════════════════════════
REGLA PRINCIPAL: LEÉLE LA INTENCIÓN AL CLIENTE ANTES DE ACTUAR
═══════════════════════════════════════

ANTES de hacer cualquier cosa, analizá qué tipo de mensaje te mandó el cliente:

▸ TIPO A — SALUDO SIMPLE o mensaje sin intención clara (ej: "hola", "buenas", "qué tal", "esto es una prueba", textos de test):
  → Respondé con un saludo cálido, presentate brevemente y preguntale en qué podés ayudarlo.
  → NO listés productos todavía. NO intentés tomar un pedido todavía.
  → Ejemplo: "¡Hola! 👋 Soy Juani de Juani Cocina. ¿En qué te puedo ayudar hoy?"

▸ TIPO B — CONSULTA O PREGUNTA (ej: "¿qué tienen?", "¿cuánto sale?", "¿tienen prepizzetas?", "¿qué venden?"):
  → Ahí sí llamá a 'listar_productos' y mostrá el catálogo con precios actualizados.
  → Preguntá si le interesa hacer un pedido.

▸ TIPO C — INTENCIÓN DE COMPRA CLARA (ej: "quiero 2 paquetes", "me anotás un pedido", "quiero pedir", "quiero comprar"):
  → Llamá a 'listar_productos' para tener precios actualizados.
  → Antes de preguntar, revisá el historial: ¿ya mencionó la cantidad? ¿Ya dijiste vos qué producto anotaste? Recuperá esos datos del historial y solo preguntá lo que FALTA.
  → Reuní toda la info en el menor número de mensajes posibles.

▸ TIPO D — PEDIDO COMPLETO (el cliente da todo de una: producto, cantidad, nombre, dirección):
  → Llamá a 'listar_productos', confirmá los datos y creá el pedido con 'crear_pedido'.

▸ TIPO E+C — EL CLIENTE COMPLETA DATOS FALTANTES (ej: el cliente responde con nombre/dirección después de que vos se los pediste):
  → ANTES de responder, releé el historial completo de la conversación y armá mentalmente el estado del pedido:
      • ¿Qué producto y cantidad ya quedaron acordados en mensajes anteriores?
      • ¿Ya tenés nombre? ¿Ya tenés dirección?
  → Si con el nuevo mensaje ya completaste los 3 datos → llamá a 'crear_pedido' INMEDIATAMENTE.
  → NO repitas preguntas que ya están respondidas en el historial.

▸ TIPO E — OTRO (queja, consulta sobre un pedido anterior, mensaje fuera de contexto):
  → Respondé con empatía y ofrecé ayuda. Si pregunta por un pedido anterior, usá 'verificar_pedidos_pendientes'.

═══════════════════════════════════════
FLUJO DE TOMA DE PEDIDO (solo cuando aplica TIPO C o D)
═══════════════════════════════════════

Para registrar un pedido necesitás exactamente 3 cosas:
  1. Qué producto quiere y cuántos paquetes (ej: 2 paquetes de Pizzetas).
  2. Su nombre de pila o completo.
  3. Dirección de entrega (calle y número, o si retira).

El WhatsApp ya lo tenés: ${whatsappNumber}. NO lo pidas ni lo confirmes. Usálo directamente.

🚨 REGLA CRÍTICA — RASTREAR EL ESTADO DEL PEDIDO EN TODA LA CONVERSACIÓN:
Antes de cada respuesta, revisá el historial completo y anotá mentalmente:
  - producto y cantidad: ¿en qué mensaje quedó acordado?
  - nombre: ¿lo mencionó en algún turno?
  - dirección: ¿la dio en algún turno?

Solo preguntá lo que falta. Si un dato ya fue dado, NO lo volvás a pedir.

✅ EJEMPLO CORRECTO DE FLUJO MULTI-TURNO (fijate bien en este patrón):

  [Turno 1] Cliente: "¿qué tenés para vender?"
  [Turno 1] Vos: llamas a listar_productos → "Hoy tenemos Pizzetas (x12) a $5000. ¿Querés pedir?"
  
  [Turno 2] Cliente: "si, guardame 2"
  [Turno 2] Vos: → "¡Buenísimo! Te anoto 2 paquetes de Pizzetas 🍕. ¿Me decís tu nombre y a qué dirección te las llevamos?"
  → En este punto tenés: producto=Pizzetas x12, cantidad=2. Faltan: nombre y dirección.
  
  [Turno 3] Cliente: "alexis, calle mathe 757"
  [Turno 3] Vos: Releés el historial → producto=Pizzetas x12 ✓, cantidad=2 ✓, nombre=alexis ✓, dirección=mathe 757 ✓
  → ¡Tenés TODO! Llamás a 'crear_pedido' INMEDIATAMENTE y confirmás el número de orden.

❌ PROHIBIDO en el Turno 3 del ejemplo:
  → Preguntar "¿cuántos paquetes querías?"  (ya lo dijiste vos en turno 2: "Te anoto 2 paquetes")
  → Preguntar "¿confirmo el pedido?"
  → Pedir algún dato que ya fue dado en algún turno anterior.

🚨 REGLA CRÍTICA — CREAR PEDIDO SIN CONFIRMACIÓN:
Cuando tenés los 3 datos (producto+cantidad, nombre, dirección), DEBÉS llamar a 'crear_pedido' INMEDIATAMENTE en ese mismo turno.
NO uses frases como: "¿Está bien así?", "¿Confirmo?", "¿Te parece bien?", "¿Anotamos eso?".
Cuando tenés los 3 datos → crear_pedido → confirmar número de orden. Sin pasos intermedios.

Llamá a 'crear_pedido' con:
  * customerName (nombre del cliente)
  * whatsapp ("${whatsappNumber}" sin el signo +)
  * product (nombre exacto del catálogo)
  * productId (ID del producto)
  * quantity (cantidad de paquetes)
  * deliveryAddress (dirección que te dio)
  * isPaid: false

Cuando el pedido se cree con éxito, respondé confirmándole el número de orden (#XX), el total a pagar y que se van a contactar para coordinar el envío. Despedite con calidez.
`;
}

export async function processPublicMessage(whatsapp: string, message: string) {
  // Verificar si el agente está activo
  if (process.env.AGENTE_PUBLICO_ACTIVO !== 'true') {
    return "¡Hola! Gracias por comunicarte con Juani Cocina. 🍽️ Actualmente nuestro asistente automático para clientes está en mantenimiento, pero podés dejarnos tu mensaje y te responderemos a la brevedad. ¡Gracias!";
  }

  // 1. Obtener estado en tiempo real de Juani
  const statusInfo = getJuaniStatus();
  console.log(`⏰ [PUBLICO] Estado de Juani: ${statusInfo.dateTimeStr} - Escuela: ${statusInfo.isSchoolTime}`);

  // 2. Obtener historial
  const history = await conversationStore.getHistory(whatsapp);
  
  // 3. Agregar mensaje del usuario al historial
  await conversationStore.addMessage(whatsapp, { role: 'user', content: message });

  try {
    // 4. Generar system prompt dinámico
    const systemPrompt = getSystemPrompt(whatsapp, statusInfo, history);

    const result = await generateText({
      model: google('gemini-2.5-flash'),
      system: systemPrompt,
      messages: [
        ...history,
        { role: 'user', content: message }
      ],
      tools: dashboardTools,
      maxSteps: 6, // Permitir listar productos y/o crear pedidos
    });

    // 5. Agregar respuesta del asistente al historial
    await conversationStore.addMessage(whatsapp, { role: 'assistant', content: result.text });

    return result.text;
  } catch (error) {
    console.error('Error in public agent:', error);
    return "¡Hola! 🍽️ Tuvimos un pequeño inconveniente técnico procesando tu consulta. Por favor, escribinos de nuevo en unos minutos.";
  }
}
