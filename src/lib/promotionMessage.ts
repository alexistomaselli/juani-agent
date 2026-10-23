export interface PromotionStatus {
  campaign_id?: string; name: string; target: number; accumulated: number; delivered: number; pending: number;
  earned_in_order: number; completion_rank: number | null;
  benefit: 'PRIZE' | 'DISCOUNT' | null; benefit_status: 'PENDING' | 'USED' | 'REVIEW' | null;
  discount_percent: number; prize_secured: boolean; waiting: boolean; discount_applied: number;
}
export function formatPromotionStatus(p: PromotionStatus, gained: number | null = null): string {
  const intro = gained ? `🍕 Con esta compra sumaste ${gained} ${gained === 1 ? 'porción' : 'porciones'}. ` : '🍕 ';
  const progress = `Tu llavero lleva ${p.accumulated} de ${p.target} porciones.`;
  if (p.benefit_status === 'REVIEW') return `${intro}${progress} El beneficio requiere revisión del equipo por un ajuste de pedidos.`;
  if (p.accumulated < p.target) return `${intro}${progress} Te faltan ${p.target - p.accumulated} para completarlo.`;
  if (p.benefit === 'PRIZE') return `${intro}${progress} ¡Llavero completo! ${p.benefit_status === 'USED' ? 'Tu premio ya fue entregado.' : p.prize_secured ? 'Tenés tu lugar para premio asegurado; elegís entre los disponibles al retirarlo.' : 'Tenés un lugar reservado para premio. Queda asegurado cuando estén entregadas las porciones necesarias.'}`;
  if (p.benefit === 'DISCOUNT') return `${intro}${progress} ¡Llavero completo! ${p.benefit_status === 'USED' ? p.discount_applied ? `Aplicamos tu ${p.discount_percent}% de descuento a este pedido; el total informado ya lo incluye.` : `Ya utilizaste tu ${p.discount_percent}% de descuento.` : `Tenés un ${p.discount_percent}% de descuento disponible para tu próxima compra.${p.waiting ? ' Estás en lista de espera para premio: si una cancelación libera un lugar y te corresponde por orden, el premio reemplazará tu descuento mientras no lo hayas utilizado.' : ''}`}`;
  return `${intro}${progress} ¡Llavero completo! Consultamos el beneficio con el equipo.`;
}
