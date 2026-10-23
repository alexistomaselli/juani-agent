import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatPromotionStatus, type PromotionStatus } from './promotionMessage.js';
const base: PromotionStatus = { name: 'Pizza', target: 6, accumulated: 4, delivered: 0, pending: 4, earned_in_order: 2, completion_rank: null, benefit: null, benefit_status: null, discount_percent: 10, prize_secured: false, waiting: false, discount_applied: 0 };
test('registration reports accumulated packs, cancellation reports current progress without gains', () => {
  assert.match(formatPromotionStatus(base, 2), /sumaste 2 porciones.*4 de 6.*faltan 2/);
  assert.doesNotMatch(formatPromotionStatus({ ...base, accumulated: 2 }, null), /sumaste/);
});
test('reserved and secured prizes are distinct; no specific product promise', () => {
  const p = { ...base, accumulated: 6, benefit: 'PRIZE' as const, benefit_status: 'PENDING' as const };
  assert.match(formatPromotionStatus(p), /reservado/);
  assert.match(formatPromotionStatus({ ...p, delivered: 6, prize_secured: true }), /asegurado/);
});
test('waiting coupon is mutually exclusive with prize and used coupons do not promise waitlist', () => {
  const p = { ...base, accumulated: 6, benefit: 'DISCOUNT' as const, benefit_status: 'PENDING' as const, waiting: true };
  assert.match(formatPromotionStatus(p), /10%.*lista de espera.*reemplazará/);
  assert.doesNotMatch(formatPromotionStatus({ ...p, benefit_status: 'USED' }), /lista de espera|disponible/);
  assert.match(formatPromotionStatus({ ...p, benefit_status: 'USED', discount_applied: 10 }), /total informado ya lo incluye/);
});
test('used benefit below threshold is flagged for review', () => {
  assert.match(formatPromotionStatus({ ...base, benefit_status: 'REVIEW' }), /requiere revisión/);
});
