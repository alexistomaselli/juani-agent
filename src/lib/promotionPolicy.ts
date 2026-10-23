import { supabase } from './supabase.js';
import { formatPromotionStatus, type PromotionStatus } from './promotionMessage.js';

export const PROMOTION_RULES = `
PROMOCIÓN: los pedidos vigentes suman porciones al registrarse. La base determina avance y beneficio.
Después de crear/modificar/cancelar, el sistema agrega el estado real devuelto por la herramienta: no escribas por tu cuenta porciones, posiciones, premios ni descuentos promocionales en el texto libre.
Para consultas sobre la promo usá buscar_ultimo_pedido y consultar_promocion con UUID real y WhatsApp del cliente; el sistema agregará la respuesta actual. No uses valores del historial.
Mostrá siempre el totalAmount devuelto por crear_pedido/modificar_pedido. Si promoDiscountPercent es positivo, ese importe YA incluye el descuento: nunca lo descuentes otra vez ni uses precio*cantidad para reemplazarlo.
No prometas un producto específico ni una notificación automática. No crees otro pedido si el pedido se guardó pero no se pudo consultar la promoción.
`;

export async function readOrderPromotion(orderId: string, whatsapp: string): Promise<PromotionStatus[] | null> {
  if (!whatsapp) return null;
  try {
    const { data, error } = await supabase.rpc('promo_order_status', { p_order: orderId, p_whatsapp: whatsapp }).abortSignal(AbortSignal.timeout(5000));
    if (error) throw error;
    return data as PromotionStatus[];
  } catch {
    // An enrichment failure must never turn a committed order into a failed order/retry.
    console.error('No se pudo consultar el estado promocional del pedido.');
    return null;
  }
}

export function appendPromotionStatus(text: string, results: { result: unknown }[]): string {
  const latest = new Map<string, { status: PromotionStatus; gained: number; changed: boolean }>();
  let unavailable = false;
  for (const entry of results) {
    const r = entry.result as { promotions?: PromotionStatus[] | null; promotionAction?: string; success?: boolean };
    if (!r || !r.promotionAction || r.success === false) continue;
    unavailable = r.promotions === null;
    for (const status of r.promotions ?? []) {
      const prior = latest.get(status.campaign_id ?? status.name);
      latest.set(status.campaign_id ?? status.name, { status, gained: (prior?.gained ?? 0) + (r.promotionAction === 'created' ? status.earned_in_order : 0), changed: r.promotionAction === 'updated' });
    }
  }
  const messages = [...latest.values()].map(({ status, gained, changed }) => formatPromotionStatus(status, changed ? null : gained));
  if (unavailable) messages.push('No pude consultar el avance de la promoción en este momento; no vuelvas a registrar un pedido que ya fue confirmado.');
  return messages.length ? `${text}\n\n${messages.join('\n\n')}` : text;
}
