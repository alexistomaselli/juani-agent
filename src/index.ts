import 'dotenv/config';
import express, { Request, Response } from 'express';
import { operatorWebhook } from './webhooks/operador.js';
import { publicWebhook } from './webhooks/publico.js';
import { getModoHandler, setModoHandler } from './webhooks/modo.js';

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

app.listen(port, () => {
  console.log(`🚀 Juani Agent running on http://localhost:${port}`);
  console.log(`📊 Connected to Supabase: ${!!process.env.SUPABASE_URL}`);
});
