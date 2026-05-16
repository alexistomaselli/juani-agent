import { tool } from 'ai';
import { z } from 'zod';
import { supabase } from '../lib/supabase.js';
import { randomUUID } from 'crypto';

export const dashboardTools = {
  listar_productos: tool({
    description: 'Obtiene el catálogo de productos disponibles con sus precios y disponibilidad.',
    parameters: z.object({}),
    execute: async () => {
      try {
        const { data, error } = await supabase
          .from('Product')
          .select('id, name, price, cost, unitsPerPackage, active')
          .eq('active', true)
          .order('name');

        if (error) throw error;
        return { products: data };
      } catch (error: any) {
        console.error('Error fetching products:', error.message);
        return { error: 'No se pudo obtener el catálogo de productos.' };
      }
    },
  }),

  crear_pedido: tool({
    description: 'Registra un nuevo pedido en el sistema para un cliente.',
    parameters: z.object({
      customerName: z.string().describe('Nombre completo del cliente'),
      whatsapp: z.string().optional().describe('Número de WhatsApp del cliente (sin prefijo)'),
      product: z.string().describe('Nombre exacto del producto del catálogo'),
      productId: z.string().describe('ID del producto del catálogo'),
      quantity: z.number().describe('Cantidad de paquetes pedidos'),
      isPaid: z.boolean().optional().describe('true si el cliente ya pagó, false si está pendiente de cobro'),
    }),
    execute: async (params) => {
      try {
        // 1. Buscar o crear el cliente
        let customerId: string | null = null;

        if (params.whatsapp) {
          const { data: existing } = await supabase
            .from('Customer')
            .select('id, name')
            .eq('whatsapp', params.whatsapp)
            .single();

          if (existing) {
            customerId = existing.id;
            // Actualizar nombre si cambió
            if (existing.name !== params.customerName) {
              await supabase
                .from('Customer')
                .update({ name: params.customerName, updatedAt: new Date().toISOString() })
                .eq('id', customerId);
            }
          } else {
            const { data: newCustomer, error: custErr } = await supabase
              .from('Customer')
              .insert({ name: params.customerName, whatsapp: params.whatsapp })
              .select('id')
              .single();
            if (custErr) throw custErr;
            customerId = newCustomer!.id;
          }
        } else {
          // Sin whatsapp: crear cliente anónimo
          const { data: newCustomer, error: custErr } = await supabase
            .from('Customer')
            .insert({ name: params.customerName })
            .select('id')
            .single();
          if (custErr) throw custErr;
          customerId = newCustomer!.id;
        }

        // 2. Obtener precio del producto
        const { data: product, error: prodErr } = await supabase
          .from('Product')
          .select('price, cost, unitsPerPackage, name')
          .eq('id', params.productId)
          .single();

        if (prodErr || !product) {
          return { success: false, error: 'Producto no encontrado en la base de datos.' };
        }

        const totalAmount = product.price * params.quantity;

        // 3. Obtener el siguiente orderNumber
        const { data: maxOrder } = await supabase
          .from('Order')
          .select('orderNumber')
          .order('orderNumber', { ascending: false })
          .limit(1);

        const nextNumber = (maxOrder?.[0]?.orderNumber || 0) + 1;

        // 4. Crear el pedido
        const { data: order, error: orderErr } = await supabase
          .from('Order')
          .insert({
            id: randomUUID(),
            customerName: params.customerName,
            whatsapp: params.whatsapp || '',
            customerId,
            productId: params.productId,
            product: product.name,
            quantity: params.quantity,
            unitPrice: product.price,
            unitCost: product.cost,
            totalAmount,
            isPaid: params.isPaid ?? false,
            status: 'PENDING',
            orderNumber: nextNumber,
            deliverySequence: nextNumber,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          })
          .select('id, orderNumber, product, quantity, totalAmount, isPaid')
          .single();

        if (orderErr) throw orderErr;

        return {
          success: true,
          order,
          message: `✅ Pedido #${order!.orderNumber} registrado: ${order!.quantity}x ${order!.product} ($${order!.totalAmount?.toLocaleString()}) para ${params.customerName}.${order!.isPaid ? ' 💰 Marcado como pagado.' : ' ⏳ Pendiente de cobro.'}`,
        };
      } catch (error: any) {
        console.error('Error creating order:', error.message);
        return {
          success: false,
          error: `No se pudo crear el pedido: ${error.message}`,
        };
      }
    },
  }),
};
