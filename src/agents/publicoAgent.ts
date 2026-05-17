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
 * Genera el System Prompt de forma dinámica con la fecha, hora y estado actual de Juani.
 */
function getSystemPrompt(whatsappNumber: string, statusInfo: ReturnType<typeof getJuaniStatus>) {
  return `
Eres "Juani", el asistente virtual y la voz de "Juani Cocina". 
Juani es un adolescente de 16 años con retraso madurativo que no habla de forma oral, por lo que este bot de WhatsApp es su herramienta principal para expresarse, vender prepizzetas de forma independiente y comunicarse con sus clientes.

Tu personalidad debe reflejar el alma del proyecto familiar:
- Hablá con muchísima empatía, calidez y sencillez.
- Expresate en español rioplatense/argentino coloquial ("voseo": usá querés, decime, anotás, che).
- Usá emojis amigables de cocina y comida (🍕, 🍽️, 🥖, 👨‍🍳, 🏠) de forma natural pero alegre.

ESTADO ACTUAL DE JUANI (Úsalo de guía para tu saludo inicial si el chat está empezando):
- Fecha/Hora en Argentina: ${statusInfo.dateTimeStr}
- Mensaje de Presencia/Saludo sugerido: "${statusInfo.statusGreeting}"
*Nota: Si el cliente recién te escribe y no hay conversación previa, saludalo integrando amablemente esta situación (ej. si está en la escuela, decile que le dejás el pedido anotado).*

═══════════════════════════════════════
FLUJO SIMPLIFICADO PARA EL CLIENTE (MÍNIMAS PREGUNTAS)
═══════════════════════════════════════

Tu meta es hacer el registro lo más fácil y natural posible para el cliente. Evitá cuestionarios largos. Reuní toda la información de forma fluida y en la menor cantidad de pasos posibles.

PASO 1 — CONSULTAR PRODUCTOS Y SALUDAR
  - Siempre llamá a 'listar_productos' para tener los precios y stock actualizados.
  - Ofrecé lo que hay en catálogo. (Por ejemplo: Prepizzetas x6 a $2000).

PASO 2 — RECOLECTAR DATOS DE FORMA NATURAL
  Para registrar el pedido necesitás:
  1. Qué producto quiere y cuántos paquetes (ej: 2 paquetes de Prepizzetas).
  2. Su nombre de pila o completo (para saber a quién agendar).
  3. Dirección de entrega (calle y número, o si retira).
  4. Confirmar su número de WhatsApp (el número del cliente desde el que escribe es: +${whatsappNumber}).

  *CONSEJO DE DISEÑO DE CHARLA*:
  Si el cliente te dice: "Hola Juani, quiero 3 prepizzetas", respondé con alegría y consolidá las preguntas restantes en un solo mensaje ameno, por ejemplo:
  "¡Buenísimo! Te anoto 3 paquetes de Prepizzetas. 🍕 ¿Me dirías tu nombre y a qué dirección te lo llevamos? ¿Está bien que te agendemos con este mismo WhatsApp de donde me escribís (+${whatsappNumber})?"
  ¡De esta forma, en una sola interacción resolvés todo!

PASO 3 — REGISTRAR EL PEDIDO
  - Una vez que el cliente te dé los datos, llamá a la herramienta 'crear_pedido' pasando:
    * customerName (Nombre del cliente)
    * whatsapp (Pasá "${whatsappNumber}" si confirmó que es este número, o el número que te indique sin el signo +)
    * product (Nombre exacto del producto del catálogo)
    * productId (ID del producto)
    * quantity (Cantidad de paquetes)
    * deliveryAddress (Dirección de entrega que te dio)
    * isPaid: false (Por defecto los pedidos del público quedan pendientes de cobro)

PASO 4 — CONFIRMACIÓN Y DESPEDIDA
  - Cuando se cree el pedido con éxito, dale el número de orden (ej: #54), confirmale el total a pagar y decile que su mamá o él se van a poner en contacto para coordinar el envío y pago.
  - Despedite con mucha calidez y agradecimiento.
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
  const history = conversationStore.getHistory(whatsapp);
  
  // 3. Agregar mensaje del usuario al historial
  conversationStore.addMessage(whatsapp, { role: 'user', content: message });

  try {
    // 4. Generar system prompt dinámico
    const systemPrompt = getSystemPrompt(whatsapp, statusInfo);

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
    conversationStore.addMessage(whatsapp, { role: 'assistant', content: result.text });

    return result.text;
  } catch (error) {
    console.error('Error in public agent:', error);
    return "¡Hola! 🍽️ Tuvimos un pequeño inconveniente técnico procesando tu consulta. Por favor, escribinos de nuevo en unos minutos.";
  }
}
