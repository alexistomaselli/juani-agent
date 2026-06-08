import { CoreMessage } from 'ai';
import { supabase } from '../lib/supabase.js';

const MAX_MESSAGES = 20;

// Fallback en memoria por si falla Supabase
const memoryFallback = new Map<string, CoreMessage[]>();

export const conversationStore = {
  getHistory: async (whatsapp: string): Promise<CoreMessage[]> => {
    try {
      // 1. Buscar la conversación
      const { data: conversation, error: convError } = await supabase
        .from('Conversation')
        .select('id')
        .eq('whatsapp', whatsapp)
        .maybeSingle();

      if (convError || !conversation) {
        return memoryFallback.get(whatsapp) || [];
      }

      // 2. Traer los últimos N mensajes ordenados cronológicamente (limitado a últimas 24 horas)
      const twentyFourHoursAgo = new Date();
      twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

      const { data: messages, error } = await supabase
        .from('ChatMessage')
        .select('role, content')
        .eq('conversationId', conversation.id)
        .gte('createdAt', twentyFourHoursAgo.toISOString())
        .order('createdAt', { ascending: true })
        .limit(MAX_MESSAGES);

      if (error || !messages) {
        console.error('Error fetching messages from Supabase, using fallback:', error);
        return memoryFallback.get(whatsapp) || [];
      }

      return messages.map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content
      }));
    } catch (err) {
      console.error('Exception in getHistory, using fallback:', err);
      return memoryFallback.get(whatsapp) || [];
    }
  },

  addMessage: async (whatsapp: string, message: CoreMessage) => {
    // Primero guardar en memoria (para redundancia rápida)
    const history = memoryFallback.get(whatsapp) || [];
    history.push(message);
    if (history.length > MAX_MESSAGES) {
      history.splice(0, history.length - MAX_MESSAGES);
    }
    memoryFallback.set(whatsapp, history);

    try {
      // Si el contenido es un array u otro tipo, convertirlo a string
      let contentText = '';
      if (typeof message.content === 'string') {
        contentText = message.content;
      } else if (Array.isArray(message.content)) {
        // Encontrar la primera parte del texto
        const textPart = message.content.find(part => part.type === 'text');
        contentText = textPart && 'text' in textPart ? textPart.text : JSON.stringify(message.content);
      } else {
        contentText = JSON.stringify(message.content);
      }

      // 1. Obtener o crear conversación
      let conversationId: string;
      const { data: existingConv } = await supabase
        .from('Conversation')
        .select('id')
        .eq('whatsapp', whatsapp)
        .maybeSingle();

      if (existingConv) {
        conversationId = existingConv.id;
        
        // Actualizar último mensaje
        await supabase
          .from('Conversation')
          .update({
            lastMessage: contentText,
            lastMessageAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          })
          .eq('id', conversationId);
      } else {
        // Crear conversación
        const { data: newConv, error: createError } = await supabase
          .from('Conversation')
          .insert({
            whatsapp,
            lastMessage: contentText,
            lastMessageAt: new Date().toISOString(),
            status: 'ACTIVE'
          })
          .select('id')
          .single();

        if (createError || !newConv) {
          throw new Error(`Failed to create conversation: ${createError?.message}`);
        }
        conversationId = newConv.id;
      }

      // 2. Insertar mensaje en ChatMessage
      await supabase
        .from('ChatMessage')
        .insert({
          conversationId,
          role: message.role,
          content: contentText,
          createdAt: new Date().toISOString()
        });

    } catch (err) {
      console.error('Error saving message to Supabase:', err);
    }
  },

  clearHistory: async (whatsapp: string) => {
    memoryFallback.delete(whatsapp);
    try {
      await supabase
        .from('Conversation')
        .delete()
        .eq('whatsapp', whatsapp);
    } catch (err) {
      console.error('Error clearing history from Supabase:', err);
    }
  }
};
