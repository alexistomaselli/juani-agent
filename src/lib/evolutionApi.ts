import axios from 'axios';

const API_URL = process.env.EVOLUTION_API_URL?.replace(/\/$/, '');
const API_KEY = process.env.EVOLUTION_API_KEY;

export const evolutionApi = {
  sendText: async (instance: string, number: string, text: string) => {
    // Evolution expects a plain number, not a JID (strip @s.whatsapp.net if present)
    const cleanNumber = number.includes('@') ? number.split('@')[0] : number;
    try {
      const response = await axios.post(
        `${API_URL}/message/sendText/${instance}`,
        {
          number: cleanNumber,
          text,
          delay: 1200,
          linkPreview: false
        },
        {
          headers: { apikey: API_KEY }
        }
      );
      return response.data;
    } catch (error: any) {
      console.error(`Error sending message:`, error.response?.data || error.message);
      throw error;
    }
  },

  createInstance: async (instanceName: string) => {
    try {
      const response = await axios.post(
        `${API_URL}/instance/create`,
        {
          instanceName,
          qrcode: true,
          integration: "WHATSAPP-BAILEYS"
        },
        {
          headers: { apikey: API_KEY }
        }
      );
      return response.data;
    } catch (error: any) {
      console.error(`Error creating instance ${instanceName}:`, error.response?.data || error.message);
      throw error;
    }
  },

  setWebhook: async (instanceName: string, webhookUrl: string) => {
    try {
      const response = await axios.post(
        `${API_URL}/webhook/set/${instanceName}`,
        {
          webhook: {
            url: webhookUrl,
            enabled: true,
          },
          events: [
            "messages.upsert"
          ]
        },
        {
          headers: { apikey: API_KEY }
        }
      );
      return response.data;
    } catch (error: any) {
      console.error(`Error setting webhook for ${instanceName}:`, error.response?.data || error.message);
      throw error;
    }
  }
};
