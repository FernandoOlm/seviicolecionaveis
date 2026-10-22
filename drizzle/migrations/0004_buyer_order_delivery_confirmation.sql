ALTER TABLE public.orders ADD COLUMN buyer_received_at timestamptz, ADD COLUMN buyer_received_by uuid;
COMMENT ON COLUMN public.orders.buyer_received_at IS 'Timestamp of complete receipt confirmed by the buyer';
COMMENT ON COLUMN public.orders.buyer_received_by IS 'Authenticated buyer who confirmed complete receipt';
CREATE FUNCTION public.confirm_order_receipt(_order_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_order public.orders%ROWTYPE; v_previous text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
 SELECT * INTO v_order FROM public.orders WHERE id = _order_id AND user_id = auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Order not found or access denied' USING ERRCODE = '42501'; END IF;
 IF v_order.status NOT IN ('shipped', 'awaiting_pickup') THEN RAISE EXCEPTION 'Order status does not allow receipt confirmation' USING ERRCODE = '22023'; END IF;
 v_previous := v_order.status;
 UPDATE public.orders SET status = 'delivered', buyer_received_at = now(), buyer_received_by = auth.uid(), reschedule_required = false, updated_at = now() WHERE id = _order_id RETURNING * INTO v_order;
 RETURN jsonb_build_object('id',v_order.id,'status',v_order.status,'buyer_received_at',v_order.buyer_received_at,'buyer_received_by',v_order.buyer_received_by,'recipient_name',v_order.recipient_name,'email',v_order.email,'previous_status',v_previous);
END;
$$;
REVOKE ALL ON FUNCTION public.confirm_order_receipt(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_order_receipt(uuid) TO authenticated;