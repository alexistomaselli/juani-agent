import { supabase } from '../lib/supabase.js';

export type ChatMode = 'NORMAL' | 'COORDINATING' | 'DELIVERING';

const HOURS_24_MS = 24 * 60 * 60 * 1000;

// Frases clave que activan los modos cuando las escribe el OPERADOR HUMANO
const COORDINATING_TRIGGERS = [
  'estamos coordinando los repartos',
  'coordinando los repartos',
  'estamos coordinando el reparto',
  'coordinamos el reparto',
];

const DELIVERING_TRIGGERS = [
  'estamos llevando',
  'estamos yendo',
  'estas en tu casa',
  'estás en tu casa',
  'ahi vamos',
  'ahí vamos',
  'estamos afuera',
  'salimos para alla',
  'salimos para allá',
];

/**
 * Detecta si el texto del operador humano activa un modo especial.
 * Retorna el modo nuevo o null si no hay cambio.
 */
export function detectModeFromOperatorMessage(text: string): ChatMode | null {
  const normalized = text.toLowerCase().trim();

  for (const trigger of DELIVERING_TRIGGERS) {
    if (normalized.includes(trigger)) {
      console.log(`🚚 [CHAT_MODE] Frase de DELIVERING detectada: "${trigger}"`);
      return 'DELIVERING';
    }
  }

  for (const trigger of COORDINATING_TRIGGERS) {
    if (normalized.includes(trigger)) {
      console.log(`📅 [CHAT_MODE] Frase de COORDINATING detectada: "${trigger}"`);
      return 'COORDINATING';
    }
  }

  return null;
}

/**
 * Obtiene el modo actual de chat para un número de WhatsApp.
 * Si la pausa venció (más de 24hs), lo resetea a NORMAL automáticamente.
 */
export async function getChatMode(whatsapp: string): Promise<ChatMode> {
  try {
    const { data, error } = await supabase
      .from('Customer')
      .select('chat_mode, chat_mode_updated_at')
      .eq('whatsapp', whatsapp)
      .maybeSingle();

    if (error || !data) return 'NORMAL';

    const mode = data.chat_mode as ChatMode;

    // Si está pausado, verificar si venció el tiempo de 24hs
    if (mode !== 'NORMAL' && data.chat_mode_updated_at) {
      const updatedAt = new Date(data.chat_mode_updated_at).getTime();
      const now = Date.now();

      if (now - updatedAt > HOURS_24_MS) {
        console.log(`⏰ [CHAT_MODE] Modo "${mode}" de ${whatsapp} venció (más de 24hs). Reseteando a NORMAL.`);
        await setChatMode(whatsapp, 'NORMAL');
        return 'NORMAL';
      }
    }

    return mode || 'NORMAL';
  } catch (err) {
    console.error('[CHAT_MODE] Error al obtener chat_mode:', err);
    return 'NORMAL';
  }
}

/**
 * Actualiza el modo de chat de un cliente.
 */
export async function setChatMode(whatsapp: string, mode: ChatMode): Promise<void> {
  try {
    const { error } = await supabase
      .from('Customer')
      .update({
        chat_mode: mode,
        chat_mode_updated_at: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .eq('whatsapp', whatsapp);

    if (error) throw error;
    console.log(`✅ [CHAT_MODE] Modo de ${whatsapp} actualizado a: ${mode}`);
  } catch (err) {
    console.error('[CHAT_MODE] Error al actualizar chat_mode:', err);
  }
}

/**
 * Usa la IA para detectar si el mensaje de un cliente muestra intención de compra.
 * Solo se llama cuando el cliente está en modo COORDINATING o DELIVERING.
 */
export function hasShoppingIntent(message: string): boolean {
  const normalized = message.toLowerCase();
  const buyingKeywords = [
    'pedido', 'pedir', 'quiero', 'me mandás', 'me mandas',
    'me anotás', 'anotas', 'necesito', 'precio', 'precios',
    'cuánto sale', 'cuanto sale', 'cuánto cuesta', 'cuanto cuesta',
    'que tienen', 'qué tienen', 'qué hay', 'que hay',
    'me das', 'comprar', 'prepizzeta', 'prepizzetas', 'pizza',
    'cuánto me', 'cuanto me', 'me das info', 'me podés', 'me podes',
  ];

  return buyingKeywords.some(kw => normalized.includes(kw));
}
