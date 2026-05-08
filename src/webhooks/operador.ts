import { Request, Response } from 'express';
import { processOperatorMessage } from '../agents/operadorAgent';
import { evolutionApi } from '../lib/evolutionApi';

export const operatorWebhook = async (req: Request, res: Response) => {
  const body = req.body;

  // 1. Validar que sea un mensaje entrante (upsert) y no sea enviado por el bot (fromMe)
  if (body.event !== 'messages.upsert') {
    return res.status(200).send('Event ignored');
  }

  const messageData = body.data;
  const isFromMe = messageData.key.fromMe;
  
  if (isFromMe) {
    return res.status(200).send('Message from bot ignored');
  }

  // 2. Extraer el texto del mensaje y el número
  // El texto puede estar en conversation, extendedTextMessage, etc.
  const text = messageData.message?.conversation || 
               messageData.message?.extendedTextMessage?.text || 
               messageData.message?.imageMessage?.caption || "";
  
  const remoteJid = messageData.key.remoteJid;
  const whatsappNumber = remoteJid.split('@')[0];

  // 3. Validar que el número esté autorizado
  const allowedNumbers = process.env.ALLOWED_OPERATORS?.split(',').map(n => n.trim()).filter(n => n.length > 0) || [];
  
  if (allowedNumbers.length > 0 && !allowedNumbers.includes(whatsappNumber)) {
    console.log(`⚠️ [OPERADOR] Acceso DENEGADO para el número: ${whatsappNumber}. Permitidos: ${allowedNumbers.length} números.`);
    return res.status(200).send('Unauthorized number');
  }
  
  if (allowedNumbers.length === 0) {
    console.log(`⚠️ [OPERADOR] ATENCIÓN: No hay operadores configurados en ALLOWED_OPERATORS. El acceso es LIBRE.`);
  }

  if (!text) {
    return res.status(200).send('No text found');
  }

  console.log(`📩 [OPERADOR] Mensaje de ${whatsappNumber}: ${text}`);

  // 3. Procesar con el agente
  try {
    const responseText = await processOperatorMessage(whatsappNumber, text);

    // 4. Enviar respuesta via Evolution API
    try {
      const instance = process.env.EVOLUTION_INSTANCE_OPERADOR || 'juani-operador';
      await evolutionApi.sendText(instance, whatsappNumber, responseText);
    } catch (sendError) {
      console.error('⚠️ [OPERADOR] Error enviando respuesta a WhatsApp:', sendError instanceof Error ? sendError.message : sendError);
      // No fallamos el webhook porque el pedido ya podría estar registrado
    }

    res.status(200).send('Success');
  } catch (error) {
    console.error('❌ [OPERADOR] Webhook error:', error);
    res.status(500).send('Internal Server Error');
  }
};
