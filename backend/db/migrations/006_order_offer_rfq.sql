ALTER TABLE public.orders
  ADD COLUMN order_type VARCHAR(20) NOT NULL DEFAULT 'BUY_NOW',
  ADD COLUMN request_details TEXT;

COMMENT ON COLUMN public.orders.order_type IS 'BUY_NOW, MAKE_OFFER, RFQ';
COMMENT ON COLUMN public.orders.request_details IS 'Buyer-submitted RFQ message or offer notes';
