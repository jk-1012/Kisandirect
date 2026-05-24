CREATE TABLE public.disputes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dispute_id VARCHAR(30) UNIQUE NOT NULL,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  raised_by UUID NOT NULL REFERENCES public.users(id),
  farmer_id UUID NOT NULL REFERENCES public.users(id),
  reason VARCHAR(30) NOT NULL,
  description TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'RAISED',
  evidence_urls TEXT[],
  evidence_deadline_at TIMESTAMPTZ,
  evidence_uploaded_at TIMESTAMPTZ,
  assigned_agent_id UUID REFERENCES public.users(id),
  agent_assigned_at TIMESTAMPTZ,
  decision_type VARCHAR(20),
  decision_farmer_pct INTEGER,
  decision_reasoning TEXT,
  decision_issued_at TIMESTAMPTZ,
  appeal_deadline_at TIMESTAMPTZ,
  appealed_by UUID REFERENCES public.users(id),
  final_decision_type VARCHAR(20),
  final_decision_reasoning TEXT,
  final_decision_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_disputes_order ON public.disputes(order_id);
CREATE INDEX idx_disputes_status ON public.disputes(status);
CREATE INDEX idx_disputes_agent ON public.disputes(assigned_agent_id);

CREATE TABLE public.dispute_audit_log (
  id BIGSERIAL PRIMARY KEY,
  dispute_id UUID NOT NULL REFERENCES public.disputes(id),
  from_status VARCHAR(30),
  to_status VARCHAR(30) NOT NULL,
  actor_id UUID,
  actor_role VARCHAR(20),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.dispute_evidence (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dispute_id UUID NOT NULL REFERENCES public.disputes(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES public.users(id),
  evidence_url TEXT NOT NULL,
  evidence_metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.cold_storages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  storage_id VARCHAR(30) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  provider VARCHAR(100),
  address TEXT,
  geo_lat DECIMAL(10,8),
  geo_lng DECIMAL(11,8),
  location geography(Point,4326) NOT NULL,
  storage_capacity_tons INTEGER NOT NULL DEFAULT 0,
  daily_rate_inr INTEGER NOT NULL DEFAULT 0,
  available BOOLEAN NOT NULL DEFAULT TRUE,
  amenities TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.cold_storage_bookings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id VARCHAR(30) UNIQUE NOT NULL,
  storage_id UUID NOT NULL REFERENCES public.cold_storages(id),
  user_id UUID NOT NULL REFERENCES public.users(id),
  quantity_tons DECIMAL(10,2) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  total_amount_inr INTEGER NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'CONFIRMED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.data_access_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id VARCHAR(30) UNIQUE NOT NULL,
  user_id UUID NOT NULL REFERENCES public.users(id),
  request_type VARCHAR(30) NOT NULL DEFAULT 'ACCESS',
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  request_data JSONB
);

CREATE TABLE public.data_erasure_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id VARCHAR(30) UNIQUE NOT NULL,
  user_id UUID NOT NULL REFERENCES public.users(id),
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  note TEXT
);

CREATE INDEX idx_cold_storages_location ON public.cold_storages USING GIST(location);
CREATE INDEX idx_cold_storage_bookings_user_id ON public.cold_storage_bookings(user_id);
CREATE INDEX idx_data_access_requests_user_id ON public.data_access_requests(user_id);
CREATE INDEX idx_data_erasure_requests_user_id ON public.data_erasure_requests(user_id);
