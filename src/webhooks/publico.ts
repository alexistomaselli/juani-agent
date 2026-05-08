import { Request, Response } from 'express';
import { processPublicMessage } from '../agents/publicoAgent.js';
import { evolutionApi } from '../lib/evolutionApi.js';
import { EvolutionWebhookPayload } from '../types/evolution.js';

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
  
  if (isFromMe) {
    return res.status(200).send('Message from bot ignored');
  }

  const text = messageData.message?.conversation || 
               messageData.message?.extendedTextMessage?.text || 
               messageData.message?.imageMessage?.caption || 
               messageData.message?.videoMessage?.caption ||
               messageData.message?.documentMessage?.caption || "";
  
  const remoteJid = messageData.key.remoteJid;
  if (!remoteJid) {
    return res.status(200).send('No remoteJid found');
  }

  const whatsappNumber = remoteJid.split('@')[0];

  if (!text) {
    return res.status(200).send('No text found');
  }

  console.log(`📩 [PUBLICO] Mensaje de ${whatsappNumber}: ${text}`);

  try {
    const responseText = await processPublicMessage(whatsappNumber, text);

    // 4. Enviar respuesta via Evolution API
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
