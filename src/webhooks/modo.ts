import { Request, Response } from 'express';
import { getChatMode, setChatMode, ChatMode } from '../memory/chatModeStore.js';

const VALID_MODES: ChatMode[] = ['NORMAL', 'COORDINATING', 'DELIVERING'];

// Token de seguridad simple para que no cualquiera pueda cambiar modos
const OPERATOR_SECRET = process.env.OPERATOR_SECRET || 'juani-secret';

/**
 * GET /modo/:whatsapp
 * Consulta el modo actual de un cliente.
 */
export const getModoHandler = async (req: Request, res: Response) => {
  const { whatsapp } = req.params;
  const secret = req.headers['x-operator-secret'];

  if (secret !== OPERATOR_SECRET) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  if (!whatsapp) {
    return res.status(400).json({ error: 'Falta el número de WhatsApp' });
  }

  const mode = await getChatMode(whatsapp);
  console.log(`🔍 [MODO] Consulta de modo para ${whatsapp}: ${mode}`);

  return res.json({
    whatsapp,
    chat_mode: mode,
    timestamp: new Date().toISOString(),
  });
};

/**
 * POST /modo/:whatsapp
 * Body: { "mode": "COORDINATING" | "DELIVERING" | "NORMAL" }
 * Cambia manualmente el modo de chat de un cliente.
 */
export const setModoHandler = async (req: Request, res: Response) => {
  const { whatsapp } = req.params;
  const { mode } = req.body as { mode: ChatMode };
  const secret = req.headers['x-operator-secret'];

  if (secret !== OPERATOR_SECRET) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  if (!whatsapp) {
    return res.status(400).json({ error: 'Falta el número de WhatsApp' });
  }

  if (!mode || !VALID_MODES.includes(mode)) {
    return res.status(400).json({
      error: `Modo inválido. Valores posibles: ${VALID_MODES.join(', ')}`,
    });
  }

  await setChatMode(whatsapp, mode);
  console.log(`✅ [MODO] Modo de ${whatsapp} cambiado manualmente a: ${mode}`);

  return res.json({
    success: true,
    whatsapp,
    chat_mode: mode,
    timestamp: new Date().toISOString(),
  });
};
