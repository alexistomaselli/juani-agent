export interface EvolutionMessage {
  key: {
    remoteJid: string;
    fromMe: boolean;
    id: string;
  };
  message?: {
    conversation?: string;
    extendedTextMessage?: {
      text?: string;
    };
    imageMessage?: {
      caption?: string;
    };
  };
  pushName?: string;
}

export interface EvolutionWebhookPayload {
  event: string;
  instance: string;
  data: EvolutionMessage;
}
