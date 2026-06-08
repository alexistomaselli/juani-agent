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
};
