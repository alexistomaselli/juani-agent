BEGIN;
-- Existing catalog entries remain uncounted until the operator enters availability.
ALTER TABLE public."Product" ADD COLUMN stock integer;
ALTER TABLE public."Product" ALTER COLUMN stock SET DEFAULT 0;
ALTER TABLE public."Product" ADD CONSTRAINT product_stock_nonnegative CHECK (stock IS NULL OR stock >= 0);
-- Records predating stock control have no reservation to return on cancellation.
ALTER TABLE public."Order" ADD COLUMN "stockReserved" integer NOT NULL DEFAULT 0;
ALTER TABLE public."Order" ADD CONSTRAINT order_stock_reserved_nonnegative CHECK ("stockReserved" >= 0);

CREATE FUNCTION public.juani_order_stock() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  old_product public."Product".id%TYPE;
  old_reserved integer := 0;
  target_reserved integer := 0;
  delta integer := 0;
  product_row public."Product"%ROWTYPE;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    old_product := OLD."productId";
    old_reserved := OLD."stockReserved";
  END IF;

  IF TG_OP = 'DELETE' THEN
    -- Deleting a pending booking returns its reservation. Deleting a delivered
    -- sale does not put already-consumed goods back on the shelf.
    IF OLD.status = 'PENDING' AND old_reserved > 0 THEN
      UPDATE public."Product" SET stock = stock + old_reserved, "updatedAt" = now() WHERE id = old_product AND stock IS NOT NULL;
    END IF;
    RETURN OLD;
  END IF;

  -- Lock both products in a stable order for concurrent product swaps.
  PERFORM id FROM public."Product"
    WHERE id = NEW."productId" OR id = old_product ORDER BY id FOR UPDATE;
  SELECT * INTO product_row FROM public."Product" WHERE id = NEW."productId";

  IF TG_OP = 'UPDATE' AND OLD."productId" IS NOT DISTINCT FROM NEW."productId"
     AND OLD.quantity IS NOT DISTINCT FROM NEW.quantity AND OLD.status IS NOT DISTINCT FROM NEW.status THEN
    NEW."stockReserved" := old_reserved;
    RETURN NEW;
  END IF;

  IF NEW.status <> 'CANCELLED' AND (NEW.quantity IS NULL OR NEW.quantity < 1) THEN
    RAISE EXCEPTION USING MESSAGE = 'JUANI_INVALID_QUANTITY', DETAIL = 'La cantidad debe ser mayor que cero.';
  END IF;

  IF NEW.status <> 'CANCELLED' AND NEW."productId" IS NOT NULL THEN
    IF product_row.id IS NULL THEN
      RAISE EXCEPTION USING MESSAGE = 'JUANI_PRODUCT_UNAVAILABLE';
    END IF;
    IF TG_OP = 'INSERT' OR old_product IS DISTINCT FROM NEW."productId" OR OLD.status = 'CANCELLED' THEN
      IF NOT product_row.active THEN RAISE EXCEPTION USING MESSAGE = 'JUANI_PRODUCT_UNAVAILABLE'; END IF;
      IF product_row.stock IS NOT NULL THEN target_reserved := NEW.quantity; END IF;
    ELSE
      -- Historical bookings are not retroactively deducted; only quantity deltas
      -- after stock control begins reserve additional packs.
      target_reserved := old_reserved;
      IF product_row.stock IS NOT NULL THEN
        target_reserved := greatest(0, old_reserved + NEW.quantity - OLD.quantity);
      END IF;
    END IF;
  END IF;

  IF old_product IS DISTINCT FROM NEW."productId" THEN
    IF old_reserved > 0 THEN
      UPDATE public."Product" SET stock = stock + old_reserved, "updatedAt" = now() WHERE id = old_product AND stock IS NOT NULL;
    END IF;
    delta := target_reserved;
  ELSE
    delta := target_reserved - old_reserved;
  END IF;

  IF delta > 0 AND NOT product_row.active THEN
    RAISE EXCEPTION USING MESSAGE = 'JUANI_PRODUCT_UNAVAILABLE';
  END IF;
  IF delta > 0 AND product_row.stock < delta THEN
    RAISE EXCEPTION USING MESSAGE = 'JUANI_STOCK_INSUFFICIENT',
      DETAIL = format('Stock disponible: %s packs.', product_row.stock);
  END IF;
  IF delta <> 0 THEN
    UPDATE public."Product" SET stock = stock - delta, "updatedAt" = now()
      WHERE id = NEW."productId" AND stock IS NOT NULL;
  END IF;
  NEW."stockReserved" := target_reserved;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.juani_order_stock() FROM PUBLIC;
CREATE TRIGGER juani_order_stock_trigger BEFORE INSERT OR UPDATE OR DELETE
  ON public."Order" FOR EACH ROW EXECUTE FUNCTION public.juani_order_stock();
COMMENT ON COLUMN public."Product".stock IS 'Available packs. NULL only for legacy products whose stock has not yet been counted.';
COMMENT ON COLUMN public."Order"."stockReserved" IS 'Packs deducted by the stock trigger; legacy bookings start at zero. Managed exclusively by the trigger.';
COMMIT;
