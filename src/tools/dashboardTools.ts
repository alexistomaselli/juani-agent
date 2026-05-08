import axios from 'axios';
import { tool } from 'ai';
import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const API_URL = process.env.DASHBOARD_API_URL || 'http://localhost:3000';

export const dashboardTools = {
  listar_productos: tool({
    description: 'Obtiene el catálogo de productos disponibles con sus precios.',
    parameters: z.object({}),
    execute: async () => {
      try {
        const response = await axios.get(`${API_URL}/api/products`);
        return response.data;
      } catch (error) {
        console.error('Error fetching products:', error);
        return { error: 'No se pudo obtener el catálogo de productos.' };
      }
    },
  }),

  crear_pedido: tool({
    description: 'Registra un nuevo pedido en el sistema.',
    parameters: z.object({
      customerName: z.string().describe('Nombre del cliente'),
      whatsapp: z.string().describe('Número de WhatsApp del cliente'),
      product: z.string().describe('Nombre del producto o descripción'),
      quantity: z.number().describe('Cantidad de paquetes'),
      unitPrice: z.number().optional().describe('Precio unitario del producto'),
      productId: z.string().optional().describe('ID del producto si se conoce'),
      isPaid: z.boolean().optional().describe('Si el pedido ya fue pagado'),
    }),
    execute: async (params) => {
      try {
        const response = await axios.post(`${API_URL}/api/orders`, params);
        const order = response.data;
        return { 
          success: true, 
          order: order,
          message: `Pedido #${order.orderNumber} registrado: ${params.quantity}x ${order.product} ($${order.totalAmount}) para ${params.customerName}.`
        };
      } catch (error: any) {
        console.error('Error creating order:', error.response?.data || error.message);
        return { 
          success: false, 
          error: error.response?.data?.error || 'No se pudo crear el pedido.' 
        };
      }
    },
  }),
};
