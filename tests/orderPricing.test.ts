import { strict as assert } from 'node:assert';
import { test, mock } from 'node:test';

// These tests exercise the actual bot tools using synthetic records only.
process.env.SUPABASE_URL = 'http://127.0.0.1:1';
process.env.SUPABASE_ANON_KEY = 'test-only';
mock.method(globalThis, 'fetch', () => { throw new Error('Network access forbidden in pricing tests'); });
const { supabase } = await import('../src/lib/supabase.js');
const { dashboardTools } = await import('../src/tools/dashboardTools.js');
const options = { toolCallId: 'pricing-test', messages: [] };

type Read = { table: string; data: unknown; error?: { message: string } };
function database(reads: Read[]) {
  const writes: { table: string; operation: string; values: Record<string, unknown> }[] = [];
  const pending = [...reads];
  const stub = mock.method(supabase, 'from', ((table: string) => {
    const next = pending.shift();
    assert.ok(next, `Unexpected query: ${table}`);
    assert.equal(table, next.table);
    const response = { data: next.data, error: next.error ?? null };
    const query = {
      select() { return query; }, eq() { return query; }, order() { return query; }, limit() { return query; },
      maybeSingle: async () => response,
      single: async () => response,
      then(resolve: (value: typeof response) => unknown) { return Promise.resolve(response).then(resolve); },
      insert(values: Record<string, unknown>) { writes.push({ table, operation: 'insert', values }); return query; },
      update(values: Record<string, unknown>) { writes.push({ table, operation: 'update', values }); return query; },
    };
    return query;
  }) as unknown as typeof supabase.from);
  return { writes, finish() { stub.mock.restore(); assert.equal(pending.length, 0); } };
}

const original = { id: 'synthetic-order', quantity: 2, unitPrice: 5000, status: 'PENDING' };

test('bot creation captures catalog price, cost and total for the panel', async () => {
  const db = database([
    { table: 'Product', data: { id: 'synthetic-product', name: 'Test product', price: 6000, cost: 2000, unitsPerPackage: 2, active: true, stock: 4 } },
    { table: 'Customer', data: { id: 'synthetic-customer', name: 'Test', address: null } },
    { table: 'Order', data: [{ orderNumber: 1 }] },
    { table: 'Order', data: { id: 'synthetic-order', orderNumber: 2, quantity: 2, totalAmount: 12000 } },
  ]);
  try {
    const result = await dashboardTools.crear_pedido.execute!({ customerName: 'Test', whatsapp: 'synthetic-contact', product: 'Test product', productId: 'synthetic-product', quantity: 2 }, options);
    assert.equal(result.success, true);
    assert.equal(db.writes.length, 1);
    assert.equal(db.writes[0].values.unitPrice, 6000);
    assert.equal(db.writes[0].values.unitCost, 2000);
    assert.equal(db.writes[0].values.totalAmount, 12000);
  } finally { db.finish(); }
});

test('bot quantity change uses the saved price without reading the current catalog', async () => {
  const db = database([{ table: 'Order', data: original }, { table: 'Order', data: original }]);
  try {
    const result = await dashboardTools.modificar_pedido.execute!({ orderId: original.id, quantity: 3 }, options);
    assert.equal(result.success, true);
    assert.equal(db.writes[0].values.totalAmount, 15000);
    assert.equal(db.writes[0].values.quantity, 3);
    assert.equal('unitPrice' in db.writes[0].values, false);
    assert.equal('unitCost' in db.writes[0].values, false);
  } finally { db.finish(); }
});

test('same quantity and address changes omit financial fields, preserving discounts', async () => {
  const db = database([{ table: 'Order', data: original }, { table: 'Order', data: original }]);
  try {
    await dashboardTools.modificar_pedido.execute!({ orderId: original.id, quantity: 2, deliveryAddress: 'Synthetic address' }, options);
    assert.equal(db.writes[0].values.deliveryAddress, 'Synthetic address');
    for (const field of ['totalAmount', 'quantity', 'unitPrice', 'unitCost']) assert.equal(field in db.writes[0].values, false);
  } finally { db.finish(); }
});

test('missing historical price blocks quantity changes without writing a fabricated zero', async () => {
  const db = database([{ table: 'Order', data: { ...original, unitPrice: null } }]);
  try {
    const result = await dashboardTools.modificar_pedido.execute!({ orderId: original.id, quantity: 3 }, options);
    assert.equal(result.success, false);
    assert.equal(db.writes.length, 0);
  } finally { db.finish(); }
});

test('zero historical price remains valid', async () => {
  const db = database([{ table: 'Order', data: { ...original, unitPrice: 0 } }, { table: 'Order', data: original }]);
  try {
    const result = await dashboardTools.modificar_pedido.execute!({ orderId: original.id, quantity: 3 }, options);
    assert.equal(result.success, true);
    assert.equal(db.writes[0].values.totalAmount, 0);
  } finally { db.finish(); }
});

test('both tool schemas reject fractional, zero and negative pack quantities', () => {
  for (const quantity of [0, -1, 1.5]) {
    assert.equal(dashboardTools.modificar_pedido.parameters.safeParse({ orderId: original.id, quantity }).success, false);
    assert.equal(dashboardTools.crear_pedido.parameters.safeParse({ customerName: 'Test', product: 'Test', productId: 'synthetic-product', quantity }).success, false);
  }
});


test('active products with zero stock return the Instagram restock message without writing', async () => {
  const db = database([{ table: 'Product', data: { id: 'synthetic-product', name: 'Test', price: 6000, cost: 2000, active: true, stock: 0 } }]);
  try {
    const result = await dashboardTools.crear_pedido.execute!({ customerName: 'Test', product: 'Test', productId: 'synthetic-product', quantity: 1 }, options);
    assert.equal(result.success, false);
    assert.match('error' in result ? result.error ?? '' : '', /sin stock.*Instagram/);
    assert.equal(db.writes.length, 0);
  } finally { db.finish(); }
});

test('insufficient positive stock asks for an available quantity without writing', async () => {
  const db = database([{ table: 'Product', data: { id: 'synthetic-product', name: 'Test', price: 6000, cost: 2000, active: true, stock: 2 } }]);
  try {
    const result = await dashboardTools.crear_pedido.execute!({ customerName: 'Test', product: 'Test', productId: 'synthetic-product', quantity: 3 }, options);
    assert.equal(result.success, false);
    assert.match('error' in result ? result.error ?? '' : '', /quedan 2 packs/);
    assert.equal(db.writes.length, 0);
  } finally { db.finish(); }
});

test('database stock conflict is reported as failure instead of a confirmed order', async () => {
  const db = database([
    { table: 'Product', data: { id: 'synthetic-product', name: 'Test', price: 6000, cost: 2000, active: true, stock: 1 } },
    { table: 'Customer', data: { id: 'synthetic-customer', name: 'Test', address: null } },
    { table: 'Order', data: [{ orderNumber: 1 }] },
    { table: 'Order', data: null, error: { message: 'JUANI_STOCK_INSUFFICIENT' } },
  ]);
  try {
    const result = await dashboardTools.crear_pedido.execute!({ customerName: 'Test', whatsapp: 'synthetic-contact', product: 'Test', productId: 'synthetic-product', quantity: 1 }, options);
    assert.equal(result.success, false);
    assert.match('error' in result ? result.error ?? '' : '', /stock cambió/);
  } finally { db.finish(); }
});
