# KisanDirect Product Completion Audit

Generated from:

- `/Users/kelvinjagani/Downloads/startup/KisanDirect_SRS_v1.0.docx`
- `/Users/kelvinjagani/Downloads/startup/feature.docx`
- `graphify-out/graph.json`
- `graphify-out/GRAPH_REPORT.md`

## Graphify Snapshot

- Code graph: 1,384 nodes, 1,729 edges, 120 communities.
- Strong implementation communities: listings, offers/RFQ, orders/escrow, DigiLocker KYC, e-Challan, cold storage, notifications, AgriStore, trust score, TDS/ledger, frontend buyer/farmer flows.
- Thin or absent graph signals: ONDC, MapMyIndia, GSTN verification, admin console breadth, API gateway/developer portal, real Bhashini voice input, mobile/offline Phase 4, designer marketplace, custom-domain automation.

## Requirement Status

| Module | Status | Notes |
| --- | --- | --- |
| A. Farmer onboarding | Partial | OTP, DigiLocker, bank/KYC screens, FPO bulk routes, KisanID, trust score exist. Needs full 12-language QA, penny-drop production wiring, GPS consent UX, icon-only walkthrough polish. |
| B. Produce listing | Partial | Camera/photo flow, Vision hook, mandi price cache, listing lifecycle jobs, search indexing exist. Patched KD-FR-B-009 price guardrail to require override justification above 300% mandi price. Needs real voice input, quality certificate attachments, moderation workflow for flagged images. |
| C. Buyer discovery | Partial | Anonymous catalogue, filters, listing pages, Buy Now/Offer, RFQ and subscriptions hooks exist. Needs wishlist UI/API, richer institutional dashboard, WhatsApp/email order summaries hardening. |
| D. Transaction/payment | Partial | Razorpay, escrow jobs, payment pipeline tests, ledger/TDS/invoice services exist. Needs full production reconciliation runbooks, commission config UI, partial cancellation API, Form 16A generation. |
| E. Logistics/cold storage | Partial | Cold storage routes/services/page and e-Challan system exist. Needs MapMyIndia map integration, transport aggregation, GPS delivery tracking, temperature alert surfacing. |
| F. AgriStore | Partial | Builder, templates, public storefronts, analytics routes/pages exist. Needs designer marketplace, paid-tier watermark/domain controls, external embed widget. |
| G. Price intelligence | Partial | AgMarkNet ingestion, market intelligence, price alerts, supply forecast worker exist. Needs production endpoint mapping, stale-price UI warning, 30-day chart UX, government data API. |
| H. Disputes | Partial | Dispute service/routes/workers exist. Needs full admin case console and multilingual decision delivery path. |
| I. Admin/API gateway/mobile | Mostly remaining | Admin routes are narrow; no Kong/developer portal/ONDC implementation; native mobile/offline remains roadmap. |

## Next Implementation Queue

1. Complete listing guardrails and farmer-facing listing UX. Status: started.
2. Replace placeholder notification fallback worker with real shared notification service delivery.
3. Add wishlist/saved listings API and buyer UI.
4. Add admin moderation queue for flagged listing photos and high-price overrides.
5. Add MapMyIndia-backed cold storage map and distance-aware RFQ quote sorting.
6. Add stale mandi price warning to listing creation and buyer listing pages.
7. Add institutional buyer order-history CSV dashboard.
8. Add API-gateway/developer-portal skeleton only after core marketplace flows are stable.
