import 'dotenv/config';
import express, { Request, Response } from 'express';
import { operatorWebhook } from './webhooks/operador.js';
import { publicWebhook } from './webhooks/publico.js';
import { getModoHandler, setModoHandler } from './webhooks/modo.js';
import { evolutionApi } from './lib/evolutionApi.js';

const app = express();
const port = process.env.PORT || 3001;

app.use(express.json());

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({ 
    status: 'ok', 
    service: 'juani-agent',
    version: '1.1.0-public-agent-dynamic-schedule-and-delivery',
    config: {
      supabaseConfigured: !!process.env.SUPABASE_URL && !!process.env.SUPABASE_ANON_KEY,
      allowedOperatorsSet: !!process.env.ALLOWED_OPERATORS,
      operatorsCount: process.env.ALLOWED_OPERATORS?.split(',').length || 0
    }
  });
});

// Webhooks
app.post('/webhook/operador', operatorWebhook);
app.post('/webhook/publico', publicWebhook);

// Operador: gestión manual de modos de chat
app.get('/modo/:whatsapp', getModoHandler);
app.post('/modo/:whatsapp', setModoHandler);

// Operador: envío manual de mensajes de WhatsApp desde el dashboard
app.post('/send-message', async (req: Request, res: Response) => {
  const secret = req.headers['x-operator-secret'];
  const OPERATOR_SECRET = process.env.OPERATOR_SECRET || 'juani-secret';

  if (secret !== OPERATOR_SECRET) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const { whatsapp, message } = req.body as { whatsapp: string; message: string };

  if (!whatsapp || !message) {
    return res.status(400).json({ error: 'Faltan campos: whatsapp y message son requeridos' });
  }

  try {
    const instance = process.env.EVOLUTION_INSTANCE_PUBLICO || 'juani-publico';
    await evolutionApi.sendText(instance, whatsapp, message);
    console.log(`📤 [SEND-MESSAGE] Mensaje enviado a ${whatsapp}: "${message}"`);
    return res.json({ success: true, whatsapp, message });
  } catch (err: any) {
    console.error('[SEND-MESSAGE] Error:', err.message);
    return res.status(500).json({ error: 'Error al enviar el mensaje por WhatsApp' });
  }
});

app.listen(port, () => {
  console.log(`🚀 Juani Agent running on http://localhost:${port}`);
  console.log(`📊 Connected to Supabase: ${!!process.env.SUPABASE_URL}`);
});
