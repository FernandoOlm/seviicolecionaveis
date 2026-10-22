ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS hand_delivery_fee_history jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS hand_delivery_fee_confirmed_at timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS hand_delivery_fee_confirmed_by uuid;

CREATE OR REPLACE FUNCTION public.guard_hand_delivery_fee()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (NEW.hand_delivery_fee_status IS DISTINCT FROM OLD.hand_delivery_fee_status
      OR NEW.hand_delivery_fee_history IS DISTINCT FROM OLD.hand_delivery_fee_history
      OR NEW.hand_delivery_fee_confirmed_at IS DISTINCT FROM OLD.hand_delivery_fee_confirmed_at
      OR NEW.hand_delivery_fee_confirmed_by IS DISTINCT FROM OLD.hand_delivery_fee_confirmed_by)
     AND auth.uid() IS NOT NULL
     AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Somente administradores podem alterar o pagamento da entrega';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_hand_delivery_fee ON public.orders;
CREATE TRIGGER trg_guard_hand_delivery_fee BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.guard_hand_delivery_fee();