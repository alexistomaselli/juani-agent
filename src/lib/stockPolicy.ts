export const STOCK_RULES = `
REGLA DE STOCK (EN PACKS):
- Consultá listar_productos antes de ofrecer o registrar productos. Un producto activo con stock=0 sigue visible, pero NO está disponible para vender.
- Si piden un producto con stock=0, respondé: "Actualmente nos quedamos sin stock de ese producto, pero en estos días lo vamos a estar renovando y vamos a avisar por Instagram." No inventes fecha ni usuario de Instagram y no crees el pedido.
- Si el stock es positivo pero menor que lo pedido, informá cuántos packs quedan y pedí confirmar una cantidad disponible. Podés ofrecer otros productos activos con stock disponible.
- stock=null significa que aún no se cargó el control de stock; no afirmes una cantidad disponible. Las herramientas validan nuevamente antes de guardar.
- Si una herramienta devuelve error de stock, NO confirmes un pedido o una modificación como exitosa. Consultá de nuevo el catálogo para responder con la disponibilidad actual.
- Crear un pedido descuenta packs, reducir cantidad devuelve la diferencia y cancelar devuelve los packs reservados; no hagas ajustes de stock por tu cuenta.
`;

