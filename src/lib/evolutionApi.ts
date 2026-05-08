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
          delay: 1200, // Simular que está escribiendo
          linkPreview: false
        },
        {
          headers: {
            apikey: API_KEY
          }
        }
      );
      return response.data;
    } catch (error: any) {
      console.error(`Error sending message to ${number} on instance ${instance}:`, error.response?.data || error.message);
      throw error;
    }
  }
};
