import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
import { dashboardTools } from '../tools/dashboardTools';
import { conversationStore } from '../memory/conversationStore';
import dotenv from 'dotenv';

dotenv.config();

const SYSTEM_PROMPT = `
Eres el Agente Operador de "Juani Cocina". Tu función es ayudar a registrar pedidos de forma rápida y eficiente.

REGLAS DE ORO:
1. Recibirás mensajes que describen pedidos (ej: "Anota 2 milanesas para Maria 3388123456").
2. Debes identificar: Nombre del cliente, WhatsApp, Producto, Cantidad y opcionalmente el Precio Unitario.
3. Si falta el WhatsApp, asume que es el número desde el cual escriben (se te pasará como contexto).
4. Usa la herramienta 'listar_productos' para validar que el producto existe o entender los precios sugeridos.
5. Usa la herramienta 'crear_pedido' para registrar la venta. Si el usuario especifica un precio (ej: "a 5000"), pásalo como 'unitPrice'.
6. Una vez registrado, responde con la confirmación exacta que devuelve la herramienta.
7. Sé directo, amable y eficiente. No uses emojis excesivos, solo el check de confirmación.
8. Si el mensaje no es un pedido, responde amablemente que solo estás para anotar pedidos.

IMPORTANTE: 
- Las cantidades son siempre en "paquetes".
- Si el usuario dice "milanesas", busca en el catálogo algo que coincida (ej: "Milanesas de Pollo").
- Siempre confirma los datos antes de ejecutar la acción si hay mucha ambigüedad, pero si está claro, anótalo de una.
`;

export async function processOperatorMessage(whatsapp: string, message: string) {
  // Obtener historial
  const history = conversationStore.getHistory(whatsapp);
  
  // Agregar mensaje del usuario
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
      maxSteps: 5, // Permitir que llame a herramientas y luego responda
    });

    // Agregar respuesta del asistente al historial
    conversationStore.addMessage(whatsapp, { role: 'assistant', content: result.text });

    return result.text;
  } catch (error) {
    console.error('Error in operator agent:', error);
    return "Lo siento, hubo un error procesando tu pedido. Por favor intentá de nuevo.";
  }
}
