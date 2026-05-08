import { CoreMessage } from 'ai';

// Almacén en memoria para el historial de conversaciones
// En una etapa posterior, esto podría moverse a una base de datos o Redis
const memory = new Map<string, CoreMessage[]>();

const MAX_MESSAGES = 20;

export const conversationStore = {
  getHistory: (whatsapp: string): CoreMessage[] => {
    return memory.get(whatsapp) || [];
  },

  addMessage: (whatsapp: string, message: CoreMessage) => {
    const history = memory.get(whatsapp) || [];
    history.push(message);
    
    // Mantener solo los últimos N mensajes
    if (history.length > MAX_MESSAGES) {
      history.splice(0, history.length - MAX_MESSAGES);
    }
    
    memory.set(whatsapp, history);
  },

  clearHistory: (whatsapp: string) => {
    memory.delete(whatsapp);
  }
};
