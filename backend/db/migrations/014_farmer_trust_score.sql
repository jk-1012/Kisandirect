CREATE TABLE public.reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  review_id VARCHAR(30) UNIQUE NOT NULL,
  review_type VARCHAR(30) NOT NULL DEFAULT 'ORDER',
  target_user_id UUID NOT NULL REFERENCES public.users(id),
  author_user_id UUID NOT NULL REFERENCES public.users(id),
  order_id UUID REFERENCES public.orders(id),
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comments TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reviews_target_user_id ON public.reviews(target_user_id);
CREATE INDEX idx_reviews_order_id ON public.reviews(order_id);

CREATE OR REPLACE FUNCTION public.calculate_farmer_trust_score(farmer_id UUID)
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
  kyc_score INTEGER := 0;
  profile_photo_score INTEGER := 0;
  annual_payout_score INTEGER := 0;
  completed_orders INTEGER := 0;
  review_score INTEGER := 0;
  average_rating NUMERIC := 0;
  disputes_lost INTEGER := 0;
  disputes_won INTEGER := 0;
  dispute_score INTEGER := 0;
  total_score INTEGER := 0;
BEGIN
  SELECT
    CASE WHEN UPPER(u.kyc_status) = 'VERIFIED' THEN 20 ELSE 0 END,
    CASE WHEN u.profile_photo_url IS NOT NULL THEN 10 ELSE 0 END,
    COALESCE(fp.annual_payout_inr, 0)
  INTO kyc_score, profile_photo_score, annual_payout_score
  FROM public.users u
  LEFT JOIN public.farmer_profiles fp ON fp.user_id = u.id
  WHERE u.id = farmer_id;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  annual_payout_score := CASE WHEN annual_payout_score >= 100000 THEN 5 ELSE 0 END;

  SELECT COUNT(*)
  INTO completed_orders
  FROM public.orders o
  WHERE o.farmer_id = farmer_id
    AND o.order_status IN ('DELIVERED', 'RELEASED', 'DISPUTE_RESOLVED_FARMER');

  SELECT AVG(r.rating)
  INTO average_rating
  FROM public.reviews r
  WHERE r.target_user_id = farmer_id;

  IF average_rating IS NOT NULL THEN
    review_score := LEAST(20, GREATEST(0, ROUND((average_rating - 1) * 5))::INTEGER);
  ELSE
    review_score := 0;
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE d.status IN ('RESOLVED_BUYER_FAVOR', 'AUTO_CLOSED_FARMER')),
    COUNT(*) FILTER (WHERE d.status = 'RESOLVED_FARMER_FAVOR')
  INTO disputes_lost, disputes_won
  FROM public.disputes d
  WHERE d.farmer_id = farmer_id;

  dispute_score := GREATEST(-30, (disputes_won * 10) - (disputes_lost * 20));

  total_score := 30
    + kyc_score
    + profile_photo_score
    + annual_payout_score
    + LEAST(20, completed_orders * 2)
    + review_score
    + dispute_score;

  IF total_score < 0 THEN
    total_score := 0;
  ELSIF total_score > 100 THEN
    total_score := 100;
  END IF;

  RETURN total_score;
END;
$$;
