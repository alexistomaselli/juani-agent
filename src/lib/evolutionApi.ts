import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const API_URL = process.env.EVOLUTION_API_URL;
const API_KEY = process.env.EVOLUTION_API_KEY;

export const evolutionApi = {
  sendText: async (instance: string, number: string, text: string) => {
    try {
      const response = await axios.post(
        `${API_URL}/message/sendText/${instance}`,
        {
          number,
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
          url: webhookUrl,
          enabled: true,
          events: [
            "MESSAGES_UPSERT"
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