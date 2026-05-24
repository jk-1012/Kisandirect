CREATE INDEX idx_listings_crop_status ON public.listings(crop_type, status);
CREATE INDEX idx_listings_expiry ON public.listings(expires_at) WHERE status = 'ACTIVE';
CREATE INDEX idx_listings_farmer ON public.listings(farmer_id);
CREATE INDEX idx_listings_geo ON public.listings USING GIST(ST_MakePoint(geo_lng, geo_lat));

CREATE INDEX idx_orders_payment_status ON public.orders(payment_status);
CREATE INDEX idx_orders_farmer ON public.orders(farmer_id);
CREATE INDEX idx_orders_buyer ON public.orders(buyer_id);

CREATE INDEX idx_otp_phone_expires ON public.otp_sessions(phone, expires_at);
