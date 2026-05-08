import express from 'express';
import dotenv from 'dotenv';
import { operatorWebhook } from './webhooks/operador';
import { publicWebhook } from './webhooks/publico';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'juani-agent' });
});

// Webhooks
app.post('/webhook/operador', operatorWebhook);
app.post('/webhook/publico', publicWebhook);

app.listen(port, () => {
  console.log(`🚀 Juani Agent running on http://localhost:${port}`);
  console.log(`🔗 Dashboard API: ${process.env.DASHBOARD_API_URL}`);
});
