import { Request, Response } from 'express';
import { processPublicMessage } from '../agents/publicoAgent.js';
import { evolutionApi } from '../lib/evolutionApi.js';
import { EvolutionWebhookPayload } from '../types/evolution.js';
import {
  detectModeFromOperatorMessage,
  getChatMode,
  setChatMode,
  hasShoppingIntent,
} from '../memory/chatModeStore.js';
import { conversationStore } from '../memory/conversationStore.js';

// Deduplicación: evita procesar el mismo mensaje dos veces (Evolution API puede re-entregar webhooks)
const processedMessages = new Set<string>();
const MESSAGE_TTL_MS = 60_000; // 1 minuto de TTL para limpiar el Set

function markMessageProcessed(messageId: string) {
  processedMessages.add(messageId);
  setTimeout(() => processedMessages.delete(messageId), MESSAGE_TTL_MS);
}

export const publicWebhook = async (req: Request, res: Response) => {
  const body = req.body as EvolutionWebhookPayload;

  if (body.event !== 'messages.upsert') {
    return res.status(200).send('Event ignored');
  }

  const messageData = body.data;
  
  if (!messageData || !messageData.key) {
    return res.status(200).send('Invalid message data');
  }

  const isFromMe = messageData.key.fromMe;
  const remoteJid = messageData.key.remoteJid;
  if (!remoteJid) {
    return res.status(200).send('No remoteJid found');
  }

  const whatsappNumber = remoteJid.split('@')[0];

  const text = messageData.message?.conversation || 
               messageData.message?.extendedTextMessage?.text || 
               messageData.message?.imageMessage?.caption || 
               messageData.message?.videoMessage?.caption ||
               messageData.message?.documentMessage?.caption || "";

  if (!text) {
    return res.status(200).send('No text found');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MENSAJES DEL OPERADOR HUMANO (fromMe = true)
  // El agente los "escucha" pero nunca responde.
  // Si contienen frases clave → activan modo COORDINATING o DELIVERING.
  // ─────────────────────────────────────────────────────────────────────────
  if (isFromMe) {
    console.log(`👤 [PUBLICO] Mensaje del OPERADOR para ${whatsappNumber}: "${text}"`);

    const newMode = detectModeFromOperatorMessage(text);
    if (newMode) {
      await setChatMode(whatsappNumber, newMode);
      console.log(`🔄 [PUBLICO] Modo de ${whatsappNumber} cambiado a ${newMode}`);
    }

    // Inyectamos el mensaje del operador en el historial del cliente,
    // para que la IA tenga contexto si el cliente responde algo inesperado.
    await conversationStore.addMessage(whatsappNumber, {
      role: 'assistant',
      content: `[OPERADOR HUMANO]: ${text}`,
    });

    // El operador no genera respuesta automática. Silencio total.
    return res.status(200).send('Operator message processed');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MENSAJES DEL CLIENTE
  // ─────────────────────────────────────────────────────────────────────────

  // Deduplicar por messageId para evitar doble procesamiento
  const messageId = messageData.key.id;
  if (messageId && processedMessages.has(messageId)) {
    console.log(`⚠️ [PUBLICO] Mensaje duplicado ignorado: ${messageId}`);
    return res.status(200).send('Duplicate message ignored');
  }
  if (messageId) markMessageProcessed(messageId);

  console.log(`📩 [PUBLICO] Mensaje de ${whatsappNumber}: ${text}`);

  // Verificar el modo actual del cliente
  const currentMode = await getChatMode(whatsappNumber);
  console.log(`🧩 [PUBLICO] Modo actual de ${whatsappNumber}: ${currentMode}`);

  // Si el cliente está en modo COORDINATING o DELIVERING,
  // solo responde si hay intención de compra. Si no, silencio.
  if (currentMode === 'COORDINATING' || currentMode === 'DELIVERING') {
    const wantsToBuy = hasShoppingIntent(text);

    if (!wantsToBuy) {
      console.log(`🔇 [PUBLICO] Modo ${currentMode} → Sin intención de compra. Silencio.`);
      // Igual guardamos el mensaje en el historial para que el humano lo vea
      await conversationStore.addMessage(whatsappNumber, { role: 'user', content: text });
      return res.status(200).send('Silenced: operator mode active');
    }

    // Hay intención de compra: reactivar modo NORMAL y responder
    console.log(`🛒 [PUBLICO] Intención de compra detectada. Reactivando modo NORMAL para ${whatsappNumber}`);
    await setChatMode(whatsappNumber, 'NORMAL');
  }

  try {
    const responseText = await processPublicMessage(whatsappNumber, text);

    // Enviar respuesta via Evolution API
    try {
      const instance = process.env.EVOLUTION_INSTANCE_PUBLICO || 'juani-publico';
      await evolutionApi.sendText(instance, whatsappNumber, responseText);
    } catch (sendError) {
      console.error('⚠️ [PUBLICO] Error enviando respuesta a WhatsApp:', sendError instanceof Error ? sendError.message : sendError);
    }

    res.status(200).send('Success');
  } catch (error) {
    console.error('❌ [PUBLICO] Webhook error:', error);
    res.status(500).send('Internal Server Error');
  }
};
