import { Request, Response } from 'express';
import { processOperatorMessage } from '../agents/operadorAgent.js';
import { evolutionApi } from '../lib/evolutionApi.js';
import { EvolutionWebhookPayload } from '../types/evolution.js';

export const operatorWebhook = async (req: Request, res: Response) => {
  const body = req.body as EvolutionWebhookPayload;

  // 1. Validar que sea un mensaje entrante (upsert) y no sea enviado por el bot (fromMe)
  if (body.event !== 'messages.upsert') {
    return res.status(200).send('OK');
  }

  const message = body.data;
  if (message.key.fromMe) {
    return res.status(200).send('OK');
  }

  // 2. Extraer el número de WhatsApp del remitente
  // Si es un grupo, el remitente real está en 'participant'
  // Si es chat individual, está en 'remoteJid'
  const isGroup = message.key.remoteJid.endsWith('@g.us');
  const senderJid = isGroup ? message.key.participant : message.key.remoteJid;
  
  if (!senderJid) {
    console.log('No sender JID found, ignoring message');
    return res.status(200).send('OK');
  }

  const senderNumber = senderJid.split('@')[0];
  const groupJid = isGroup ? message.key.remoteJid : null;

  // 3. Verificar si el remitente es un operador permitido
  const allowedOperators = process.env.ALLOWED_OPERATORS?.split(',') || [];
  const isAllowed = allowedOperators.some(op => senderNumber.includes(op));

  if (!isAllowed) {
    console.log(`Mensaje ignorado de ${senderNumber} (no es un operador permitido)`);
    return res.status(200).send('OK');
  }

  // 4. Obtener el texto del mensaje
  const messageText = message.message?.conversation || 
                     message.message?.extendedTextMessage?.text || 
                     message.message?.imageMessage?.caption || "";

  if (!messageText) {
    return res.status(200).send('OK');
  }

  console.log(`🤖 Procesando mensaje de operador ${senderNumber}: ${messageText.substring(0, 50)}...`);

  try {
    // 5. Procesar el mensaje con el agente
    const response = await processOperatorMessage(senderNumber, messageText);

    // 6. Enviar la respuesta de vuelta
    // Enviamos al JID original (si era grupo, al grupo; si era privado, al privado)
    await evolutionApi.sendText(
      process.env.EVOLUTION_INSTANCE_OPERADOR || 'juani-operador',
      message.key.remoteJid,
      response
    );

    res.status(200).send('OK');
  } catch (error) {
    console.error('Error in operator webhook:', error);
    res.status(500).send('Internal Server Error');
  }
};
