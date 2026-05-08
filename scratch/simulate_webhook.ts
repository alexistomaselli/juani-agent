import axios from 'axios';

const WEBHOOK_URL = 'http://localhost:3001/webhook/operador';

const payload = {
  event: 'messages.upsert',
  instance: 'juani-operador',
  data: {
    key: {
      remoteJid: '543388410486@s.whatsapp.net',
      fromMe: false,
      id: 'ABC123XYZ'
    },
    message: {
      conversation: 'Hola, quiero pedir 2 prepizzas para Alex'
    },
    pushName: 'Alex'
  }
};

async function test() {
  try {
    console.log('Sending webhook payload...');
    const response = await axios.post(WEBHOOK_URL, payload);
    console.log('Response:', response.status, response.data);
  } catch (error: any) {
    console.error('Error:', error.response?.status, error.response?.data || error.message);
  }
}

test();
