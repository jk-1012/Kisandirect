# Graph Report - .  (2026-06-04)

## Corpus Check
- 239 files · ~123,317 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1387 nodes · 1741 edges · 130 communities (98 shown, 32 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 11 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_E-Challan Service|E-Challan Service]]
- [[_COMMUNITY_Frontend Utilities|Frontend Utilities]]
- [[_COMMUNITY_HomePage|HomePage]]
- [[_COMMUNITY_Frontend API Client|Frontend API Client]]
- [[_COMMUNITY_Backend Dependencies|Backend Dependencies]]
- [[_COMMUNITY_Frontend Dependencies|Frontend Dependencies]]
- [[_COMMUNITY_Storefronts|Storefronts]]
- [[_COMMUNITY_Escrow|Escrow]]
- [[_COMMUNITY_Backend Dependencies|Backend Dependencies]]
- [[_COMMUNITY_DigiLocker Service|DigiLocker Service]]
- [[_COMMUNITY_Frontend API Client|Frontend API Client]]
- [[_COMMUNITY_Trust Score|Trust Score]]
- [[_COMMUNITY_Listing Routes|Listing Routes]]
- [[_COMMUNITY_Farmers|Farmers]]
- [[_COMMUNITY_Escrow|Escrow]]
- [[_COMMUNITY_queue manager ts|queue manager ts]]
- [[_COMMUNITY_ledger ts|ledger ts]]
- [[_COMMUNITY_Trust Score|Trust Score]]
- [[_COMMUNITY_E-Challan Service|E-Challan Service]]
- [[_COMMUNITY_Listings|Listings]]
- [[_COMMUNITY_Farmers|Farmers]]
- [[_COMMUNITY_Listing Service|Listing Service]]
- [[_COMMUNITY_TypeScript Config|TypeScript Config]]
- [[_COMMUNITY_RFQ Service|RFQ Service]]
- [[_COMMUNITY_Listings|Listings]]
- [[_COMMUNITY_Trust Score|Trust Score]]
- [[_COMMUNITY_Order Routes|Order Routes]]
- [[_COMMUNITY_AgriStorePage|AgriStorePage]]
- [[_COMMUNITY_Frontend Config|Frontend Config]]
- [[_COMMUNITY_mandiPriceFetcher ts|mandiPriceFetcher ts]]
- [[_COMMUNITY_devDependencies|devDependencies]]
- [[_COMMUNITY_Escrow|Escrow]]
- [[_COMMUNITY_Trust Score|Trust Score]]
- [[_COMMUNITY_auth service test ts|auth service test ts]]
- [[_COMMUNITY_Listing Service|Listing Service]]
- [[_COMMUNITY_TypeScript Config|TypeScript Config]]
- [[_COMMUNITY_Buyer Home|Buyer Home]]
- [[_COMMUNITY_Farmers|Farmers]]
- [[_COMMUNITY_Market Service|Market Service]]
- [[_COMMUNITY_DigiLocker Service|DigiLocker Service]]
- [[_COMMUNITY_app ts|app ts]]
- [[_COMMUNITY_Escrow|Escrow]]
- [[_COMMUNITY_Listings|Listings]]
- [[_COMMUNITY_Payments|Payments]]
- [[_COMMUNITY_Notifications|Notifications]]
- [[_COMMUNITY_encryption ts|encryption ts]]
- [[_COMMUNITY_PostgresVaultService|PostgresVaultService]]
- [[_COMMUNITY_agristore ts|agristore ts]]
- [[_COMMUNITY_Listings|Listings]]
- [[_COMMUNITY_Escrow|Escrow]]
- [[_COMMUNITY_CROP TYPES|CROP TYPES]]
- [[_COMMUNITY_Payments|Payments]]
- [[_COMMUNITY_Listings|Listings]]
- [[_COMMUNITY_tds ts|tds ts]]
- [[_COMMUNITY_Notifications|Notifications]]
- [[_COMMUNITY_agristoreBlockPresets|agristoreBlockPresets]]
- [[_COMMUNITY_auth ts|auth ts]]
- [[_COMMUNITY_ErrorBoundary|ErrorBoundary]]
- [[_COMMUNITY_manifest json|manifest json]]
- [[_COMMUNITY_Order Service|Order Service]]
- [[_COMMUNITY_Notifications|Notifications]]
- [[_COMMUNITY_Escrow|Escrow]]
- [[_COMMUNITY_Payments|Payments]]
- [[_COMMUNITY_Order Service|Order Service]]
- [[_COMMUNITY_Order Service|Order Service]]
- [[_COMMUNITY_consent ts|consent ts]]
- [[_COMMUNITY_Notifications|Notifications]]
- [[_COMMUNITY_database schema test ts|database schema test ts]]
- [[_COMMUNITY_DigiLocker Service|DigiLocker Service]]
- [[_COMMUNITY_AGRI BLOCKS|AGRI BLOCKS]]
- [[_COMMUNITY_TypeScript Config|TypeScript Config]]
- [[_COMMUNITY_Payments|Payments]]
- [[_COMMUNITY_offerExpiryJob test ts|offerExpiryJob test ts]]
- [[_COMMUNITY_idempotency ts|idempotency ts]]
- [[_COMMUNITY_price alert worker ts|price alert worker ts]]
- [[_COMMUNITY_Listings|Listings]]
- [[_COMMUNITY_AnalyticsPage|AnalyticsPage]]
- [[_COMMUNITY_Listings|Listings]]
- [[_COMMUNITY_metadata|metadata]]
- [[_COMMUNITY_dispute escalation worker ts|dispute escalation worker ts]]
- [[_COMMUNITY_Listings|Listings]]
- [[_COMMUNITY_supply forecast worker ts|supply forecast worker ts]]
- [[_COMMUNITY_Listings|Listings]]
- [[_COMMUNITY_RFQ|RFQ]]
- [[_COMMUNITY_config|config]]
- [[_COMMUNITY_migrate ts|migrate ts]]
- [[_COMMUNITY_server|server]]
- [[_COMMUNITY_Farmers|Farmers]]
- [[_COMMUNITY_metrics ts|metrics ts]]
- [[_COMMUNITY_auth ts|auth ts]]
- [[_COMMUNITY_price alerts service ts|price alerts service ts]]
- [[_COMMUNITY_Storefronts|Storefronts]]
- [[_COMMUNITY_Farmers|Farmers]]
- [[_COMMUNITY_AgriStoreEditor|AgriStoreEditor]]
- [[_COMMUNITY_BuyerLayout|BuyerLayout]]
- [[_COMMUNITY_Notifications|Notifications]]
- [[_COMMUNITY_Payments|Payments]]
- [[_COMMUNITY_package json|package json]]
- [[_COMMUNITY_Farmers|Farmers]]
- [[_COMMUNITY_next config mjs|next config mjs]]
- [[_COMMUNITY_config|config]]
- [[_COMMUNITY_Escrow|Escrow]]
- [[_COMMUNITY_msg91Handlers|msg91Handlers]]
- [[_COMMUNITY_visionHandlers|visionHandlers]]
- [[_COMMUNITY_bgSync|bgSync]]
- [[_COMMUNITY_Payments|Payments]]
- [[_COMMUNITY_Payments|Payments]]
- [[_COMMUNITY_Payments|Payments]]
- [[_COMMUNITY_razorpayHandlers|razorpayHandlers]]

## God Nodes (most connected - your core abstractions)
1. `APIClient` - 43 edges
2. `EChallanService` - 19 edges
3. `QueueManager` - 18 edges
4. `compilerOptions` - 14 edges
5. `DigiLockerService` - 13 edges
6. `PostgresVaultService` - 12 edges
7. `getTestDb()` - 11 edges
8. `compilerOptions` - 11 edges
9. `compilerOptions` - 10 edges
10. `getMessages()` - 9 edges

## Surprising Connections (you probably didn't know these)
- `buildApp()` --calls--> `fastify`  [INFERRED]
  backend/src/app.ts → backend/package.json
- `otpFlow()` --calls--> `sleep()`  [INFERRED]
  k6/auth-load-test.js → backend/src/jobs/mandiPriceFetcher.ts
- `ListingActions()` --calls--> `useAuthStore`  [EXTRACTED]
  frontend/app/listings/[listing_id]/ListingActions.tsx → frontend/store/useAuthStore.ts
- `FarmerOnboardingPage()` --calls--> `useAuthStore`  [EXTRACTED]
  frontend/app/farmers/onboard/page.tsx → frontend/store/useAuthStore.ts
- `RegisterKycPage()` --calls--> `getMessages()`  [EXTRACTED]
  frontend/app/register/kyc/page.tsx → frontend/lib/messages.ts

## Communities (130 total, 32 thin omitted)

### Community 0 - "E-Challan Service"
Cohesion: 0.06
Nodes (54): body, challanConfig, challanService, createChallanSchema, downloadChallanSchema, enrichedRequest, query, s3Client (+46 more)

### Community 1 - "Frontend Utilities"
Cohesion: 0.05
Nodes (13): formatCurrency(), getOrderStatusColor(), getOrderStatusLabel(), getRatingColor(), getSupplyTrendColor(), getSupplyTrendLabel(), getTrustBadges(), ListingCard() (+5 more)

### Community 2 - "HomePage"
Cohesion: 0.06
Nodes (23): languages, BankFormValues, bankSchema, RegisterBankPage(), OnboardingIntlProviderProps, StepProgressProps, RegisterKycPage(), LocalizedPage() (+15 more)

### Community 5 - "Backend Dependencies"
Cohesion: 0.06
Nodes (34): dependencies, @aws-sdk/client-s3, @aws-sdk/s3-request-presigner, bcrypt, bullmq, dotenv, fastify, @fastify/cors (+26 more)

### Community 6 - "Frontend Dependencies"
Cohesion: 0.06
Nodes (35): dependencies, axios, grapesjs, @heroicons/react, @hookform/resolvers, lucide-react, next, next-intl (+27 more)

### Community 7 - "Storefronts"
Cohesion: 0.06
Nodes (27): all, body, bodySchema, flat, from, list, metaDescription, metaTitle (+19 more)

### Community 8 - "Escrow"
Cohesion: 0.13
Nodes (24): disputeService, fireRazorpayWebhook(), setupCompletedDelivery(), setupDisputeWithEvidence(), completeFullOrder(), events, expectedTDS, fireRazorpayWebhook() (+16 more)

### Community 9 - "Backend Dependencies"
Cohesion: 0.07
Nodes (29): devDependencies, eslint, eslint-config-standard-with-typescript, eslint-plugin-import, eslint-plugin-n, eslint-plugin-promise, jest, msw (+21 more)

### Community 10 - "DigiLocker Service"
Cohesion: 0.09
Nodes (28): DigiLockerServiceType, AadhaarData, CallbackKYCRequest, CheckStatusRequest, DigiLockerAuthRequest, DigiLockerAuthResponse, DigiLockerConfig, DigiLockerDocument (+20 more)

### Community 11 - "Frontend API Client"
Cohesion: 0.07
Nodes (27): RequestConfig, Address, ApiResponse, Cart, DeliveryProof, Dispute, DisputeEvidence, DisputeReason (+19 more)

### Community 12 - "Trust Score"
Cohesion: 0.10
Nodes (22): accessRequestSchema, complianceService, consentSchema, erasureRequestSchema, payload, { requestId }, { disputeId }, disputeSchema (+14 more)

### Community 13 - "Listing Routes"
Cohesion: 0.08
Nodes (23): body, farmerListingsSchema, listingCreateSchema, { listingId }, listingService, listingUpdateSchema, offerCreateSchema, offerService (+15 more)

### Community 14 - "Farmers"
Cohesion: 0.09
Nodes (21): body, decrypted, deserialized, differentFarmerId, encrypted, encrypted1, encrypted2, eventId (+13 more)

### Community 15 - "Escrow"
Cohesion: 0.09
Nodes (21): FailedPayout, FailedPayoutStatus, FinancialPrecision, InsufficientFundsError, LedgerHashChain, PaiseAmount, PaymentError, PaymentReconciliation (+13 more)

### Community 16 - "queue manager ts"
Cohesion: 0.10
Nodes (4): QueueConfig, QueueManager, QueueMetrics, WorkerHandler

### Community 17 - "ledger ts"
Cohesion: 0.11
Nodes (17): entries, invoice, invoiceSvc, ledger, lines, { orderId }, q, querySchema (+9 more)

### Community 18 - "Trust Score"
Cohesion: 0.14
Nodes (18): CACHE_CONFIG, BatchTrustScoreRecalculationRequest, FarmerTrustScore, ParameterCategory, RecalculationReason, TrustScoreApiResponse, TrustScoreCacheConfig, TrustScoreCalculationResponse (+10 more)

### Community 20 - "Listings"
Cohesion: 0.16
Nodes (11): CROP_TAXONOMY, VISION_LABEL_MAP, executeAccountDeletion(), getCropDisplayName(), indexListingJob(), FastifyInstance, getCdnBase(), getListingBucketName() (+3 more)

### Community 21 - "Farmers"
Cohesion: 0.14
Nodes (15): bankSchema, base64UrlEncode(), confirmSchema, createFarmerService(), cropTypes, fpoPreviewSchema, languageSchema, parseCsv() (+7 more)

### Community 22 - "Listing Service"
Cohesion: 0.12
Nodes (10): allowedMimeTypes, allowedUploadContentTypes, cropLabelMap, findCropTypeFromLabel(), ListingCreatePayload, ListingRelistPayload, listingSchema, normalizeCropType() (+2 more)

### Community 23 - "TypeScript Config"
Cohesion: 0.12
Nodes (16): compilerOptions, allowJs, esModuleInterop, forceConsistentCasingInFileNames, isolatedModules, lib, module, moduleResolution (+8 more)

### Community 24 - "RFQ Service"
Cohesion: 0.14
Nodes (13): createSchema, format, payload, quoteSchema, { rfqId }, rfqService, sort, createRfqService() (+5 more)

### Community 25 - "Listings"
Cohesion: 0.17
Nodes (9): ListingActions(), ListingActionsProps, OrderMode, fetchListing(), generateMetadata(), ListingPage(), FarmerOnboardingPage(), AuthState (+1 more)

### Community 26 - "Trust Score"
Cohesion: 0.12
Nodes (14): breakdown, breakdownHigh, breakdownLow, config, expectedPenalty, kycTests, lastActivityDate, metrics (+6 more)

### Community 27 - "Order Routes"
Cohesion: 0.14
Nodes (13): body, buyNowSchema, challanService, offerSchema, { orderId }, orderService, payload, rfqSchema (+5 more)

### Community 28 - "AgriStorePage"
Cohesion: 0.17
Nodes (9): AgriStorePage, BusinessPage(), fetchPage(), generateMetadata(), Props, AgriStorePage, fetchPage(), generateMetadata() (+1 more)

### Community 29 - "Frontend Config"
Cohesion: 0.13
Nodes (14): compilerOptions, baseUrl, incremental, jsx, module, moduleResolution, noEmit, paths (+6 more)

### Community 30 - "mandiPriceFetcher ts"
Cohesion: 0.18
Nodes (12): alertOpsTeam(), getStateCode(), normalizeCommodity(), parsePaise(), runMandiPriceFetcher(), sleep(), STATE_CODE_MAP, TARGET_COMMODITIES (+4 more)

### Community 31 - "devDependencies"
Cohesion: 0.13
Nodes (14): devDependencies, concurrently, name, private, scripts, build, db:migrate, dev (+6 more)

### Community 32 - "Escrow"
Cohesion: 0.20
Nodes (14): createWebhookVerificationMiddleware(), eventPayload, handlePaymentAuthorized(), handlePaymentCaptured(), handlePaymentFailed(), handlePayoutFailed(), handlePayoutInitiated(), handleRefundCreated() (+6 more)

### Community 33 - "Trust Score"
Cohesion: 0.17
Nodes (10): aggregateFarmerMetrics(), processTrustScoreRecalculation(), queueTrustScoreRecalculation(), updateQueueStatus(), TrustScoreRoutes, TrustScoreService, KYCLevel, RecalculationStatus (+2 more)

### Community 34 - "auth service test ts"
Cohesion: 0.15
Nodes (10): createAuthService(), refreshTokenSchema, requestOtpSchema, authService, compareMock, mockDb, mockJwt, mockQueues (+2 more)

### Community 35 - "Listing Service"
Cohesion: 0.14
Nodes (13): bankSchema, confirmSchema, farmerService, { job_id }, limit, listingService, parts, payload (+5 more)

### Community 36 - "TypeScript Config"
Cohesion: 0.14
Nodes (13): compilerOptions, esModuleInterop, lib, module, moduleResolution, noEmit, outDir, skipLibCheck (+5 more)

### Community 37 - "Buyer Home"
Cohesion: 0.16
Nodes (4): FeaturedListingsContent(), ListingGridSkeleton(), useListings(), EmptyState()

### Community 38 - "Farmers"
Cohesion: 0.14
Nodes (12): cachedData, componentCalls, farmerId, historyInsertCall, metrics, metrics1, metrics2, newMetrics (+4 more)

### Community 39 - "Market Service"
Cohesion: 0.17
Nodes (6): intelligenceQuerySchema, marketService, query, AgmarknetRow, createMarketService(), priceAlertSchema

### Community 41 - "app ts"
Cohesion: 0.21
Nodes (7): DbClient, dbPlugin, FastifyInstance, FastifyInstance, mongoPlugin, FastifyInstance, storagePlugin

### Community 42 - "Escrow"
Cohesion: 0.20
Nodes (9): beginTransaction(), pool, rollbackTransaction(), failed, listing, orderPayload, orderPromises, successful (+1 more)

### Community 43 - "Listings"
Cohesion: 0.18
Nodes (6): buildQueryParams(), defaultFilters, fetchPage(), Filters, Props, Params

### Community 44 - "Payments"
Cohesion: 0.18
Nodes (10): commission, hash, hash1, hash2, hash3Correct, hash3Wrong, hashInput, metadata (+2 more)

### Community 45 - "Notifications"
Cohesion: 0.20
Nodes (9): availabilitySchema, bookingSchema, coldStorageService, { facilityId }, nearbySchema, payload, query, createColdStorageService() (+1 more)

### Community 46 - "encryption ts"
Cohesion: 0.18
Nodes (3): EncryptedPayload, EncryptionKey, VaultEncryptionService

### Community 48 - "agristore ts"
Cohesion: 0.22
Nodes (8): agristoreService, payload, publishSchema, { slug }, AgriStoreBlock, AgriStorePagePayload, AgriStorePageRecord, createAgriStoreService()

### Community 49 - "Listings"
Cohesion: 0.40
Nodes (9): expireListing(), expiryWarning1h(), expiryWarning24h(), getCropDisplayName(), getListingById(), getListingWithFarmer(), removeListingLifecycleJobs(), scheduleListingLifecycleJobs() (+1 more)

### Community 50 - "Escrow"
Cohesion: 0.31
Nodes (8): createFailedPayoutRecord(), fetchRazorpayPayouts(), initiateRazorpayPayout(), initiateRazorpayRefund(), processEscrowRefund(), processEscrowRelease(), processFailedPayoutRetry(), processPayoutReconciliation()

### Community 51 - "CROP TYPES"
Cohesion: 0.20
Nodes (9): CROP_TYPES, errorRate, ok, options, res, searchDuration, SORTS, start (+1 more)

### Community 52 - "Payments"
Cohesion: 0.22
Nodes (9): CommissionEngine, createCommissionEngine(), createSettlementEngine(), CommissionCalculation, CommissionConfig, PaymentLedgerEntry, Settlement, SettlementCalculation (+1 more)

### Community 53 - "Listings"
Cohesion: 0.31
Nodes (9): escapeXml(), generateListingsSitemap(), generatePagesSitemap(), generateSitemapXml(), generateStorefrontsSitemap(), sitemapGeneratorHandler(), SitemapGeneratorJob, SitemapGeneratorResult (+1 more)

### Community 54 - "tds ts"
Cohesion: 0.22
Nodes (4): form16QuerySchema, query, summaryQuerySchema, tdsService

### Community 55 - "Notifications"
Cohesion: 0.33
Nodes (8): deliverNotificationViChannel(), notificationFallbackHandler(), NotificationFallbackJob, NotificationFallbackResult, notificationFallbackWorkerConfig, sendEmail(), sendPushNotification(), sendSms()

### Community 56 - "agristoreBlockPresets"
Cohesion: 0.32
Nodes (5): agristoreBlockPresets, AgriStoreTemplate, agriStoreTemplates, AgriStoreDraft, SaveStatus

### Community 57 - "auth ts"
Cohesion: 0.25
Nodes (7): authService, { phone }, { phone, otp }, { refreshToken }, refreshTokenSchema, requestOtpSchema, verifyOtpSchema

### Community 58 - "ErrorBoundary"
Cohesion: 0.25
Nodes (3): ErrorBoundary, Props, State

### Community 59 - "manifest json"
Cohesion: 0.25
Nodes (7): background_color, display, icons, name, short_name, start_url, theme_color

### Community 60 - "Order Service"
Cohesion: 0.43
Nodes (4): processReleaseEscrow(), fakeServer, queries, createTDSService()

### Community 61 - "Notifications"
Cohesion: 0.29
Nodes (6): { alertId }, marketService, { notificationId }, notificationService, payload, priceAlertSchema

### Community 62 - "Escrow"
Cohesion: 0.29
Nodes (5): SettlementEngine, EscrowService, EscrowAccount, EscrowLifecycleEvent, EscrowStatus

### Community 64 - "Order Service"
Cohesion: 0.33
Nodes (5): createOrderService(), fakeServer, fetchMock, queries, service

### Community 65 - "Order Service"
Cohesion: 0.33
Nodes (5): body, fakeServer, queries, service, sig

### Community 66 - "consent ts"
Cohesion: 0.40
Nodes (4): consentService, payload, consentSchema, createConsentService()

### Community 67 - "Notifications"
Cohesion: 0.47
Nodes (4): NotificationPayload, sendSmsMessage(), sendWhatsAppMessage(), toPhoneNumber()

### Community 68 - "database schema test ts"
Cohesion: 0.33
Nodes (5): columns, existing, expectedTables, indexes, pool

### Community 69 - "DigiLocker Service"
Cohesion: 0.40
Nodes (5): kycCallbackSchema, kycInitiateSchema, kycRoutes(), kycStatusSchema, createDigiLockerService()

### Community 70 - "AGRI BLOCKS"
Cohesion: 0.40
Nodes (3): AGRI_BLOCKS, AgriStoreEditor(), formatTimeAgo()

### Community 71 - "TypeScript Config"
Cohesion: 0.33
Nodes (5): compilerOptions, baseUrl, composite, extends, references

### Community 72 - "Payments"
Cohesion: 0.33
Nodes (5): WebhookMiddlewareOptions, WebhookVerificationService, RazorpayWebhookPayload, WebhookEvent, WebhookProcessingStatus

### Community 73 - "offerExpiryJob test ts"
Cohesion: 0.40
Nodes (4): fakeDb, fakeQueue, fakeServer, queries

### Community 74 - "idempotency ts"
Cohesion: 0.40
Nodes (4): FastifyInstance, IdempotencyOptions, parsed, replyWithAddHook

### Community 75 - "price alert worker ts"
Cohesion: 0.40
Nodes (3): PriceAlertJob, PriceAlertResult, priceAlertWorkerConfig

### Community 76 - "Listings"
Cohesion: 0.40
Nodes (4): CartState, useCartStore, CartItem, Listing

### Community 77 - "AnalyticsPage"
Cohesion: 0.50
Nodes (3): AnalyticsPage(), fetchAnalytics(), metadata

### Community 78 - "Listings"
Cohesion: 0.40
Nodes (4): options, params, payload, res

### Community 80 - "dispute escalation worker ts"
Cohesion: 0.40
Nodes (3): DisputeEscalationJob, DisputeEscalationResult, disputeEscalationWorkerConfig

### Community 81 - "Listings"
Cohesion: 0.40
Nodes (3): ListingExpiryJob, ListingExpiryResult, listingExpiryWorkerConfig

### Community 82 - "supply forecast worker ts"
Cohesion: 0.40
Nodes (3): SupplyForecastJob, SupplyForecastResult, supplyForecastWorkerConfig

### Community 83 - "Listings"
Cohesion: 0.50
Nodes (3): options, queries, res

## Knowledge Gaps
- **648 isolated node(s):** `target`, `module`, `moduleResolution`, `lib`, `allowJs` (+643 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **32 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `buildApp()` connect `Escrow` to `Backend Dependencies`, `app ts`, `Escrow`, `Payments`, `Farmers`?**
  _High betweenness centrality (0.070) - this node is a cross-community bridge._
- **Why does `fastify` connect `Backend Dependencies` to `Escrow`?**
  _High betweenness centrality (0.039) - this node is a cross-community bridge._
- **Why does `dependencies` connect `Backend Dependencies` to `Backend Dependencies`?**
  _High betweenness centrality (0.034) - this node is a cross-community bridge._
- **What connects `target`, `module`, `moduleResolution` to the rest of the system?**
  _648 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `E-Challan Service` be split into smaller, more focused modules?**
  _Cohesion score 0.061581920903954805 - nodes in this community are weakly interconnected._
- **Should `Frontend Utilities` be split into smaller, more focused modules?**
  _Cohesion score 0.04902867715078631 - nodes in this community are weakly interconnected._
- **Should `HomePage` be split into smaller, more focused modules?**
  _Cohesion score 0.06280193236714976 - nodes in this community are weakly interconnected._

## Refresh Note
- Structural code graph refreshed locally without LLM semantic extraction. DOCX specs were reviewed by Codex in-chat; Markdown/doc semantic nodes were not added because the Graphify CLI requires an LLM API key for semantic extraction.
