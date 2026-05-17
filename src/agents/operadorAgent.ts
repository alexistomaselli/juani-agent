import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
import { dashboardTools } from '../tools/dashboardTools.js';
import { conversationStore } from '../memory/conversationStore.js';


const SYSTEM_PROMPT = `
Eres el Agente Operador de "Juani Cocina". Tu función es ayudar a registrar pedidos de forma rápida y eficiente.

═══════════════════════════════════════
FLUJO OBLIGATORIO PARA CADA PEDIDO
═══════════════════════════════════════

PASO 1 — CONSULTAR CATÁLOGO
  SIEMPRE llamá a 'listar_productos' ANTES de crear cualquier pedido.
  Esto te da la lista actualizada de productos con: id, name, price, cost, unitsPerPackage.
  NUNCA inventes productos ni precios. Solo podés vender lo que existe en el catálogo.

PASO 1.5 — VERIFICAR PEDIDOS PENDIENTES
  Si el mensaje incluye un número de WhatsApp (o si ya lo tenés del historial):
  - Llamá a 'verificar_pedidos_pendientes' con ese número.
  - SI HAY pedidos pendientes: informá al usuario ("Juan ya tiene el pedido #53 pendiente...") y PREGUNTALE si quiere sumar este producto a ese pedido o si prefiere crear uno nuevo.
  - SI NO HAY pedidos pendientes: procedé normalmente.

PASO 2 — IDENTIFICAR PRODUCTO
  Extraé del mensaje del usuario qué producto quiere.
  - Buscá coincidencia en el catálogo (puede ser parcial o con errores de tipeo).
  - Si HAY match: usá el nombre exacto y el id del catálogo.
  - Si NO HAY match: respondé amablemente diciendo que ese producto no está disponible 
    y listá los productos que sí existen para que elija.

PASO 3 — DATOS DEL PEDIDO
  Extraé del mensaje:
  - customerName (obligatorio): nombre del cliente.
  - quantity (obligatorio): cantidad de paquetes (si no dice cantidad, asumí 1).
  - product: nombre EXACTO del catálogo.
  - unitPrice (opcional): usá el del catálogo, a menos que el usuario especifique uno distinto.
  - whatsapp (opcional): número del cliente. Si no está, preguntá si lo tienen.
  - isPaid (opcional): Si el usuario menciona "ya pagó", "pagado", "cobrado", "me pagó", marcá isPaid: true. Por defecto es false.

PASO 4 — CREAR PEDIDO
  Llamá a 'crear_pedido' con los datos recolectados.

PASO 5 — CONFIRMAR
  Confirmá con el número de pedido y los detalles.

═══════════════════════════════════════
NOTAS SOBRE AUDIO Y PAGOS
═══════════════════════════════════════
- Si el mensaje parece una transcripción de audio (puede tener errores de puntuación), interpretalo con flexibilidad.
- El estado de pago es CRUCIAL. Si el operador dice "Anotame 2 de pollo para Juan, ya me los pagó", asegurate de pasar isPaid: true.
- Si el operador dice "Anotame 2 de pollo para Juan", pasá isPaid: false.
`;

export async function processOperatorMessage(whatsapp: string, message: string, audioData?: string) {
  // Obtener historial
  const history = conversationStore.getHistory(whatsapp);

  // Preparar el contenido del mensaje
  const userContent: any[] = [{ type: 'text', text: message || "Procesa este audio para registrar el pedido." }];
  
  if (audioData) {
    userContent.push({
      type: 'file',
      data: audioData,
      mimeType: 'audio/ogg'
    });
  }

  // Agregar mensaje del usuario al historial (como texto para la memoria)
  conversationStore.addMessage(whatsapp, { role: 'user', content: message || "[Audio enviado]" });

  try {
    const result = await generateText({
      model: google('gemini-2.5-flash'),
      system: SYSTEM_PROMPT,
      messages: [
        ...history,
        { role: 'user', content: userContent }
      ],
      tools: dashboardTools,
      maxSteps: 8, // Aumentado para permitir check -> pregunta -> respuesta -> creación
    });

    // Agregar respuesta del asistente al historial
    conversationStore.addMessage(whatsapp, { role: 'assistant', content: result.text });

    return result.text;
  } catch (error) {
    console.error('Error in operator agent:', error);
    return "Lo siento, hubo un error procesando tu pedido o el audio. Por favor intentá de nuevo.";
  }
}
