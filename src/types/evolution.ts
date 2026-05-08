export interface EvolutionMessage {
  key: {
    remoteJid: string;
    fromMe: boolean;
    id: string;
    participant?: string;
  };
  message?: {
    conversation?: string;
    extendedTextMessage?: {
      text?: string;
    };
    imageMessage?: {
      caption?: string;
      url?: string;
      mimetype?: string;
    };
    videoMessage?: {
      caption?: string;
      url?: string;
      mimetype?: string;
    };
    audioMessage?: {
      url?: string;
      mimetype?: string;
    };
    documentMessage?: {
      caption?: string;
      url?: string;
      mimetype?: string;
      fileName?: string;
    };
  };
  messageTimestamp?: number;
  pushName?: string;
  instanceId?: string;
}

export interface EvolutionWebhookPayload {
  event: 'messages.upsert' | 'messages.update' | 'presence.update' | string;
  instance: string;
  data: EvolutionMessage;
  destination?: string;
  date_time?: string;
}
