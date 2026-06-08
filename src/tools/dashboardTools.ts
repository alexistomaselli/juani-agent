import { tool } from 'ai';
import { z } from 'zod';
import { supabase } from '../lib/supabase.js';
import { randomUUID } from 'crypto';

export const dashboardTools = {
  listar_productos: tool({
    description: 'Obtiene el catálogo de productos disponibles. "description" contiene información pública del producto para ofrecer al cliente. "agentInstructions" contiene instrucciones internas exclusivas para ti sobre cómo interpretar cantidades y vender el producto. NUNCA menciones las "agentInstructions" en tu respuesta al cliente, úsalas solo para guiar tu lógica interna.',
    parameters: z.object({}),
    execute: async () => {
      try {
        const { data, error } = await supabase
          .from('Product')
          .select('id, name, price, cost, unitsPerPackage, active, description, agentInstructions')
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
      deliveryAddress: z.string().optional().describe('Dirección de entrega del pedido (calle, número, etc.)'),
    }),
    execute: async (params) => {
      try {
        // 1. Buscar o crear el cliente
        console.log('Creando pedido para:', params.customerName, 'WhatsApp:', params.whatsapp, 'Dirección:', params.deliveryAddress);
        let customerId: string | null = null;

        if (params.whatsapp) {
          const { data: existing } = await supabase
            .from('Customer')
            .select('id, name, address')
            .eq('whatsapp', params.whatsapp)
            .maybeSingle();

          if (existing) {
            console.log('Cliente existente encontrado:', existing.id);
            customerId = existing.id;
            
            // Actualizar nombre y dirección si cambiaron
            const updates: any = { updatedAt: new Date().toISOString() };
            let needUpdate = false;
            if (existing.name !== params.customerName && params.customerName.length > 3) {
              updates.name = params.customerName;
              needUpdate = true;
            }
            if (params.deliveryAddress && existing.address !== params.deliveryAddress && params.deliveryAddress.length > 3) {
              updates.address = params.deliveryAddress;
              needUpdate = true;
            }
            if (needUpdate) {
              await supabase
                .from('Customer')
                .update(updates)
                .eq('id', customerId);
            }
          } else {
            console.log('Creando nuevo cliente...');
            const { data: newCustomer, error: custErr } = await supabase
              .from('Customer')
              .insert({ 
                name: params.customerName, 
                whatsapp: params.whatsapp,
                address: params.deliveryAddress || null
              })
              .select('id')
              .single();
            if (custErr) throw custErr;
            customerId = newCustomer!.id;
          }
        } else {
          // Sin whatsapp: crear cliente anónimo
          const { data: newCustomer, error: custErr } = await supabase
            .from('Customer')
            .insert({ 
              name: params.customerName,
              address: params.deliveryAddress || null
            })
            .select('id')
            .single();
          if (custErr) throw custErr;
          customerId = newCustomer!.id;
        }

        // 2. Obtener precio del producto (mejorado: busca por ID o por nombre)
        console.log('Buscando producto:', params.product, 'ID:', params.productId);
        let { data: product, error: prodErr } = await supabase
          .from('Product')
          .select('id, price, cost, unitsPerPackage, name')
          .eq('id', params.productId)
          .maybeSingle();

        // Si no encontró por ID, intentamos por nombre (fuzzy match simple)
        if (!product) {
          console.log('Producto no encontrado por ID, intentando por nombre...');
          const { data: searchResult } = await supabase
            .from('Product')
            .select('id, price, cost, unitsPerPackage, name')
            .ilike('name', `%${params.product.split(' ')[0]}%`)
            .eq('active', true)
            .limit(1)
            .maybeSingle();
          
          product = searchResult;
        }

        if (prodErr || !product) {
          console.error('Producto no encontrado:', params.product);
          return { success: false, error: `El producto "${params.product}" no fue encontrado en el catálogo. Por favor, verificá el nombre.` };
        }

        const totalAmount = product.price * params.quantity;

        // 3. Obtener el siguiente orderNumber
        const { data: maxOrder } = await supabase
          .from('Order')
          .select('orderNumber')
          .order('orderNumber', { ascending: false })
          .limit(1);

        const nextNumber = (maxOrder?.[0]?.orderNumber || 0) + 1;
        console.log('Número de pedido asignado:', nextNumber);

        // 4. Crear el pedido
        const newOrderId = randomUUID();
        const { data: order, error: orderErr } = await supabase
          .from('Order')
          .insert({
            id: newOrderId,
            customerName: params.customerName,
            whatsapp: params.whatsapp || '',
            customerId,
            productId: product.id,
            product: product.name,
            quantity: params.quantity,
            unitPrice: product.price,
            unitCost: product.cost,
            totalAmount,
            isPaid: params.isPaid ?? false,
            status: 'PENDING',
            orderNumber: nextNumber,
            deliverySequence: nextNumber,
            deliveryAddress: params.deliveryAddress || null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          })
          .select('id, orderNumber, product, quantity, totalAmount, isPaid')
          .single();

        if (orderErr) {
          console.error('Error al insertar el pedido:', orderErr);
          throw orderErr;
        }

        console.log('Pedido creado exitosamente:', order.orderNumber);

        return {
          success: true,
          order,
          message: `✅ Pedido #${order!.orderNumber} registrado: ${order!.quantity}x ${order!.product} ($${order!.totalAmount?.toLocaleString()}) para ${params.customerName}.${order!.isPaid ? ' 💰 Marcado como pagado.' : ' ⏳ Pendiente de cobro.'}`,
        };
      } catch (error: any) {
        console.error('Error en crear_pedido:', error);
        return {
          success: false,
          error: `Error técnico al crear el pedido: ${error.message || 'Desconocido'}`,
        };
      }
    },
  }),

  verificar_pedidos_pendientes: tool({
    description: 'Verifica si un número de WhatsApp ya tiene pedidos pendientes (status PENDING) en el sistema.',
    parameters: z.object({
      whatsapp: z.string().describe('Número de WhatsApp a verificar (sin prefijo ni sufijos)'),
    }),
    execute: async (params) => {
      try {
        console.log('Verificando pedidos pendientes para:', params.whatsapp);
        const { data, error } = await supabase
          .from('Order')
          .select('id, orderNumber, product, quantity, totalAmount, status, createdAt')
          .eq('whatsapp', params.whatsapp)
          .eq('status', 'PENDING')
          .order('createdAt', { ascending: false });

        if (error) throw error;

        return {
          hasPendingOrders: data && data.length > 0,
          pendingOrders: data || [],
        };
      } catch (error: any) {
        console.error('Error en verificar_pedidos_pendientes:', error.message);
        return { error: 'No se pudo verificar el estado de los pedidos.' };
      }
    },
  }),

  buscar_cliente_por_whatsapp: tool({
    description: 'Busca a un cliente en la base de datos usando su número de WhatsApp. Útil para verificar si ya tenemos su nombre y dirección.',
    parameters: z.object({
      whatsapp: z.string().describe('Número de WhatsApp a verificar (sin prefijo +)'),
    }),
    execute: async (params) => {
      try {
        const { data, error } = await supabase
          .from('Customer')
          .select('id, name, address, whatsapp')
          .eq('whatsapp', params.whatsapp)
          .maybeSingle();

        if (error) throw error;
        return { exists: !!data, customer: data };
      } catch (error: any) {
        console.error('Error buscando cliente:', error.message);
        return { error: 'No se pudo buscar al cliente.' };
      }
    },
  }),

  buscar_ultimo_pedido: tool({
    description: 'Busca el último pedido (o los más recientes) realizado por un número de WhatsApp. Útil para consultar estado o para modificar un pedido recién hecho.',
    parameters: z.object({
      whatsapp: z.string().describe('Número de WhatsApp del cliente (sin prefijo +)'),
    }),
    execute: async (params) => {
      try {
        const { data, error } = await supabase
          .from('Order')
          .select('id, orderNumber, product, quantity, totalAmount, status, isPaid, deliveryAddress, createdAt')
          .eq('whatsapp', params.whatsapp)
          .order('createdAt', { ascending: false })
          .limit(3);

        if (error) throw error;
        return { orders: data || [] };
      } catch (error: any) {
        console.error('Error buscando último pedido:', error.message);
        return { error: 'No se pudieron buscar los pedidos.' };
      }
    },
  }),

  modificar_pedido: tool({
    description: 'Modifica un pedido existente (solo si su estado es PENDING). Permite cambiar cantidad, dirección o marcarlo como CANCELLED.',
    parameters: z.object({
      orderId: z.union([z.string(), z.number()]).describe('UUID del pedido o el Número de Pedido (ej: 55)'),
      quantity: z.number().optional().describe('Nueva cantidad de paquetes'),
      deliveryAddress: z.string().optional().describe('Nueva dirección de entrega'),
      status: z.enum(['PENDING', 'CANCELLED']).optional().describe('Para cancelar el pedido, envía CANCELLED'),
    }),
    execute: async (params) => {
      try {
        // Buscar el pedido por UUID o por orderNumber
        let query = supabase.from('Order').select('id, unitPrice, status');
        
        const parsedNumber = parseInt(String(params.orderId), 10);
        // Si el parámetro es puramente numérico (ej: "55" o 55), buscar por orderNumber
        if (!isNaN(parsedNumber) && String(parsedNumber) === String(params.orderId)) {
          query = query.eq('orderNumber', parsedNumber);
        } else {
          query = query.eq('id', params.orderId);
        }

        const { data: order, error: orderErr } = await query.maybeSingle();
          
        if (orderErr || !order) return { success: false, error: 'Pedido no encontrado.' };
        if (order.status !== 'PENDING' && params.status !== 'CANCELLED') {
           return { success: false, error: 'Solo se pueden modificar pedidos en estado PENDING.' };
        }

        const updates: any = { updatedAt: new Date().toISOString() };
        if (params.quantity !== undefined) {
          updates.quantity = params.quantity;
          updates.totalAmount = params.quantity * order.unitPrice;
        }
        if (params.deliveryAddress !== undefined) updates.deliveryAddress = params.deliveryAddress;
        if (params.status !== undefined) updates.status = params.status;

        const { data: updatedOrder, error: updateErr } = await supabase
          .from('Order')
          .update(updates)
          .eq('id', order.id)
          .select('id, orderNumber, product, quantity, totalAmount, status, deliveryAddress')
          .single();

        if (updateErr) throw updateErr;

        return {
          success: true,
          order: updatedOrder,
          message: `✅ Pedido #${updatedOrder.orderNumber} modificado exitosamente.`
        };
      } catch (error: any) {
        console.error('Error modificando pedido:', error.message);
        return { success: false, error: 'Error técnico al modificar el pedido.' };
      }
    },
  }),
};
