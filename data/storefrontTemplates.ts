export type StorefrontTemplate = {
  id: string;
  name: string;
  thumbnail: string;
  description: string;
  html: string;
};

export const STOREFRONT_TEMPLATES: Record<string, StorefrontTemplate[]> = {
  FPO_PROFILE: [
    {
      id: 'fpo-classic',
      name: 'Classic FPO Profile',
      thumbnail: 'https://cdn.kisandirect.in/templates/fpo-classic.jpg',
      description: 'Clean profile page for Farmer Producer Organizations',
      html: `<!-- Full HTML for FPO classic template -->
<section class="fpo-hero" style="background:linear-gradient(135deg,#2d8a4e,#1a5c32);color:white;padding:60px 20px;text-align:center">
  <h1 class="fpo-name">{{FPO Name}}</h1>
  <p class="fpo-tagline">{{Member Count}} Member Farmers | {{State}}</p>
  <div class="fpo-verified-badge">✓ NABARD Verified FPO</div>
</section>
<section class="fpo-crops" style="padding:40px 20px;max-width:1200px;margin:0 auto">
  <h2>Our Produce</h2>
  <div data-widget="live-listings"></div>
</section>
<section class="fpo-contact" style="background:#f8f9fa;padding:40px 20px">
  <h2>Contact Us</h2>
  <div><a href="https://wa.me/91{{phone}}" class="kd-whatsapp-btn">Chat on WhatsApp</a></div>
</section>`,
    },
    {
      id: 'fpo-pioneer',
      name: 'Pioneer FPO Showcase',
      thumbnail: 'https://cdn.kisandirect.in/templates/fpo-pioneer.jpg',
      description: 'Bold landing page for progressive farmer collectives',
      html: `<!-- Pioneer FPO template HTML -->
<section style="padding:70px 20px;background:#062f14;color:#f8fafc;text-align:center;">
  <h1>{{FPO Name}}</h1>
  <p class="subtitle">Empowering {{State}} farms with market access and quality assurance.</p>
</section>
<section style="padding:50px 20px;max-width:1100px;margin:0 auto;">
  <div class="cards-grid">
    <div class="card"><h3>Traceable Crops</h3><p>Verified farm-to-market supply chains.</p></div>
    <div class="card"><h3>Member Benefits</h3><p>Fair pricing and support services for farmers.</p></div>
    <div class="card"><h3>Cold Storage Ready</h3><p>Inventory preserved for export and retail.</p></div>
  </div>
</section>
<section style="padding:40px 20px;background:#e7f6ed;">
  <h2>Latest Listings</h2>
  <div data-widget="live-listings"></div>
</section>`,
    },
    {
      id: 'fpo-community',
      name: 'Community FPO Story',
      thumbnail: 'https://cdn.kisandirect.in/templates/fpo-community.jpg',
      description: 'Story-driven FPO page with social proof and mission highlights',
      html: `<!-- Community FPO template HTML -->
<section class="hero" style="padding:60px 20px;background:#fff8eb;color:#0f172a;text-align:center;">
  <p class="eyebrow">Community Powered Farming</p>
  <h1>{{FPO Name}} — {{State}}’s trusted farm cooperative</h1>
</section>
<section style="max-width:1200px;margin:0 auto;padding:40px 20px;">
  <div class="feature-row">
    <article><h2>500+ Farmer Members</h2><p>From smallholders to aggregation partners.</p></article>
    <article><h2>Organic &amp; Sustainable</h2><p>Certified lab-tested crop batches.</p></article>
  </div>
</section>
<section style="padding:40px 20px;background:#f5f5f5;">
  <h2>Fresh Inventory</h2>
  <div data-widget="live-listings"></div>
</section>`,
    },
    {
      id: 'fpo-export-ready',
      name: 'Export Ready FPO',
      thumbnail: 'https://cdn.kisandirect.in/templates/fpo-export-ready.jpg',
      description: 'Exporter-friendly FPO storefront for global buyers',
      html: `<!-- Export Ready FPO template HTML -->
<section style="padding:60px 20px;background:#022c22;color:#eef2f7;text-align:center;">
  <h1>{{FPO Name}}</h1>
  <p>Premium farm produce, export-quality packaging, and traceable sourcing.</p>
</section>
<section style="padding:50px 20px;max-width:1100px;margin:0 auto;">
  <div class="export-cards">
    <div class="card"><h3>Quality Assurance</h3><p>Third-party lab inspection available.</p></div>
    <div class="card"><h3>Shipping Support</h3><p>Cold-chain logistics and export compliance.</p></div>
  </div>
</section>
<section style="padding:40px 20px;background:#f8fafc;">
  <h2>Latest Batch Listings</h2>
  <div data-widget="live-listings"></div>
</section>`,
    },
    {
      id: 'fpo-trust',
      name: 'Trust & Traceability',
      thumbnail: 'https://cdn.kisandirect.in/templates/fpo-trust.jpg',
      description: 'Trust-driven FPO page with compliance badges and farmer stories',
      html: `<!-- Trust & Traceability FPO template HTML -->
<section class="hero" style="padding:60px 20px;background:#f3f9f3;color:#0f172a;text-align:center;">
  <h1>{{FPO Name}}</h1>
  <p>Verified supply chains with farmer-first pricing and compliance documentation.</p>
</section>
<section style="padding:40px 20px;max-width:1100px;margin:0 auto;">
  <div class="trust-grid">
    <div><strong>Traceability</strong><p>Batch-level farm origin data.</p></div>
    <div><strong>Certifications</strong><p>Organic, Fair Trade, and GOTS-ready.</p></div>
    <div><strong>Social Impact</strong><p>Sustainable livelihoods and rural growth.</p></div>
  </div>
</section>
<section style="padding:40px 20px;background:#fff;">
  <h2>Contact the FPO</h2>
  <div><a class="kd-whatsapp-btn" href="https://wa.me/91{{phone}}">Connect on WhatsApp</a></div>
</section>`,
    },
  ],
  COLD_STORAGE: [
    {
      id: 'cold-storage-modern',
      name: 'Modern Cold Storage Listing',
      thumbnail: 'https://cdn.kisandirect.in/templates/cold-storage-modern.jpg',
      description: 'Showcase your cold storage facility capacity and booking',
      html: `<!-- Cold storage template HTML -->
<section style="padding:60px 20px;background:#0b3d2e;color:#f8fafc;text-align:center;">
  <h1>{{Facility Name}}</h1>
  <p>Temperature-controlled storage for perishables, with capacity, pricing, and booking details.</p>
</section>
<section style="padding:40px 20px;max-width:1100px;margin:0 auto;display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px;">
  <div><h2>Capacity</h2><p>{{Total MT}} MT available</p></div>
  <div><h2>Cold Chain</h2><p>24/7 monitoring and HACCP-ready protocols.</p></div>
  <div><h2>Booking</h2><p>Instant reservation for traders and exporters.</p></div>
</section>
<section style="padding:40px 20px;background:#eef7f1;">
  <h2>Facility Highlights</h2>
  <div data-widget="facility-highlights"></div>
</section>`,
    },
    {
      id: 'cold-storage-network',
      name: 'Cold Storage Network',
      thumbnail: 'https://cdn.kisandirect.in/templates/cold-storage-network.jpg',
      description: 'Network-style page for multiple cold store outlets',
      html: `<!-- Cold storage network template HTML -->
<section style="padding:60px 20px;background:#122c38;color:#f8fafc;text-align:center;">
  <h1>{{Brand Name}}</h1>
  <p>Multi-location cold storage and logistics network across the region.</p>
</section>
<section style="padding:40px 20px;max-width:1200px;margin:0 auto;">
  <div class="facility-summary">
    <div><h3>Locations</h3><p>{{Locations}}</p></div>
    <div><h3>Temperature Range</h3><p>{{Temp Range}}</p></div>
    <div><h3>Capacity</h3><p>{{Capacity}}</p></div>
  </div>
</section>
<section style="padding:40px 20px;background:#f4fbf9;">
  <h2>Book Storage</h2>
  <div><button class="kd-action-btn">Request a Quote</button></div>
</section>`,
    },
    {
      id: 'cold-storage-tech',
      name: 'Tech-Driven Cold Store',
      thumbnail: 'https://cdn.kisandirect.in/templates/cold-storage-tech.jpg',
      description: 'Premium page for cold storage with IoT and temperature monitoring',
      html: `<!-- Tech Driven Cold Storage template HTML -->
<section style="padding:60px 20px;background:#071f1b;color:#e7f5f0;text-align:center;">
  <h1>{{Facility Name}}</h1>
  <p>Real-time monitoring, refrigerated warehousing, and quality assurance.</p>
</section>
<section style="padding:40px 20px;max-width:1100px;margin:0 auto;">
  <div class="tech-features">
    <article><h3>IoT Sensors</h3><p>Live temperature dashboards.</p></article>
    <article><h3>Cold Chain</h3><p>End-to-end monitoring.</p></article>
  </div>
</section>
<section style="padding:40px 20px;background:#f1fbf8;">
  <h2>Storage Capacity</h2>
  <div data-widget="capacity-display"></div>
</section>`,
    },
    {
      id: 'cold-storage-audit',
      name: 'Cold Storage Audit',
      thumbnail: 'https://cdn.kisandirect.in/templates/cold-storage-audit.jpg',
      description: 'Page for compliance, audits and cold storage certifications',
      html: `<!-- Cold storage audit template HTML -->
<section style="padding:60px 20px;background:#142c34;color:#f5faf9;text-align:center;">
  <h1>{{Facility Name}}</h1>
  <p>Certified cold storage for food safety, pharmaceuticals and export shipments.</p>
</section>
<section style="padding:40px 20px;max-width:1100px;margin:0 auto;">
  <ul class="audit-list">
    <li>HACCP certified</li>
    <li>Temperature audit logs</li>
    <li>24/7 security</li>
  </ul>
</section>
<section style="padding:40px 20px;background:#eef7f2;">
  <h2>Talk to our cold chain team</h2>
  <a class="kd-action-btn" href="mailto:{{email}}">Request inspection</a>
</section>`,
    },
    {
      id: 'cold-storage-fresh',
      name: 'Fresh Produce Storage',
      thumbnail: 'https://cdn.kisandirect.in/templates/cold-storage-fresh.jpg',
      description: 'Fresh produce-focused cold storage page for traders and retailers',
      html: `<!-- Fresh Produce Cold Storage template HTML -->
<section style="padding:60px 20px;background:#1f432f;color:#f9fbf7;text-align:center;">
  <h1>{{Facility Name}}</h1>
  <p>Optimized storage for fruits, vegetables, and seasonal harvests.</p>
</section>
<section style="padding:40px 20px;max-width:1100px;margin:0 auto;">
  <div class="produce-highlights">
    <article><h3>Clean Storage</h3><p>Hygienic, food-safe conditions.</p></article>
    <article><h3>Rapid Access</h3><p>Easy loading for retail and wholesale orders.</p></article>
  </div>
</section>
<section style="padding:40px 20px;background:#f7fbf6;">
  <h2>Book Cold Storage</h2>
  <div data-widget="storage-booking"></div>
</section>`,
    },
  ],
  EXPORTER: [
    {
      id: 'exporter-portfolio',
      name: 'Export Portfolio',
      thumbnail: 'https://cdn.kisandirect.in/templates/exporter-portfolio.jpg',
      description: 'Professional portfolio for agricultural exporters',
      html: `<!-- Exporter template HTML -->
<section style="padding:60px 20px;background:#102f53;color:#f4f9ff;text-align:center;">
  <h1>{{Exporter Name}}</h1>
  <p>Agri export services for spices, oilseeds, grains and fresh produce.</p>
</section>
<section style="padding:40px 20px;max-width:1100px;margin:0 auto;display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:20px;">
  <article><h2>Products</h2><p>Quality produce with global export readiness.</p></article>
  <article><h2>Markets</h2><p>Middle East, Europe and Asia buyers.</p></article>
</section>
<section style="padding:40px 20px;background:#f3f8ff;">
  <h2>Our Certifications</h2>
  <div class="export-certificates"></div>
</section>`,
    },
    {
      id: 'exporter-trust',
      name: 'Exporter Trust Page',
      thumbnail: 'https://cdn.kisandirect.in/templates/exporter-trust.jpg',
      description: 'Trust-first exporter page for compliance and shipment credentials',
      html: `<!-- Exporter trust template HTML -->
<section style="padding:60px 20px;background:#0d2540;color:#f7fbff;text-align:center;">
  <h1>{{Exporter Name}}</h1>
  <p>Transparency, compliance, and global distribution for agri-commodities.</p>
</section>
<section style="padding:40px 20px;max-width:1100px;margin:0 auto;">
  <div class="trust-highlights">
    <div><strong>FDA / FSSAI</strong></div>
    <div><strong>ISO Certified</strong></div>
    <div><strong>Export Logistics</strong></div>
  </div>
</section>
<section style="padding:40px 20px;background:#eef4ff;">
  <h2>Talk to Our Export Desk</h2>
  <a class="kd-action-btn" href="mailto:{{email}}">Request a Quote</a>
</section>`,
    },
    {
      id: 'exporter-fresh',
      name: 'Fresh Export Showcase',
      thumbnail: 'https://cdn.kisandirect.in/templates/exporter-fresh.jpg',
      description: 'Showcase fresh produce exports with logistics and packing details',
      html: `<!-- Fresh Export Showcase template HTML -->
<section style="padding:60px 20px;background:#1b3c2d;color:#f5f9f2;text-align:center;">
  <h1>{{Exporter Name}}</h1>
  <p>Fresh vegetables, fruits, spices and grains shipped with cold-chain support.</p>
</section>
<section style="padding:40px 20px;max-width:1100px;margin:0 auto;">
  <div class="export-products">
    <article><h3>Fresh Produce</h3><p>Premium export-grade crops.</p></article>
    <article><h3>Packing</h3><p>Custom export cartons and palletization.</p></article>
  </div>
</section>
<section style="padding:40px 20px;background:#f4fff7;">
  <h2>Current Export Offers</h2>
  <div data-widget="export-offers"></div>
</section>`,
    },
    {
      id: 'exporter-global',
      name: 'Global Exporter Landing',
      thumbnail: 'https://cdn.kisandirect.in/templates/exporter-global.jpg',
      description: 'Exporter landing page for international buyers and trade partners',
      html: `<!-- Global Exporter Landing template HTML -->
<section style="padding:60px 20px;background:#053049;color:#eef7ff;text-align:center;">
  <h1>{{Exporter Name}}</h1>
  <p>Connecting Indian agribusiness with global buyers through trusted supply chains.</p>
</section>
<section style="padding:40px 20px;max-width:1100px;margin:0 auto;">
  <div class="global-advantages">
    <div><strong>Custom Export</strong><p>Tailored shipments and packaging.</p></div>
    <div><strong>Quality Control</strong><p>Pre-shipment inspection and lab tests.</p></div>
  </div>
</section>
<section style="padding:40px 20px;background:#f1f8ff;">
  <h2>Export Enquiries</h2>
  <a class="kd-action-btn" href="mailto:{{email}}">Contact Export Desk</a>
</section>`,
    },
    {
      id: 'exporter-sustain',
      name: 'Sustainable Exporter',
      thumbnail: 'https://cdn.kisandirect.in/templates/exporter-sustain.jpg',
      description: 'Eco-friendly exporter page for certified sustainable crops',
      html: `<!-- Sustainable Exporter template HTML -->
<section style="padding:60px 20px;background:#0f3823;color:#eef7ea;text-align:center;">
  <h1>{{Exporter Name}}</h1>
  <p>Certified sustainable agricultural exports with carbon-conscious logistics.</p>
</section>
<section style="padding:40px 20px;max-width:1100px;margin:0 auto;">
  <div class="sustain-highlights">
    <div><strong>Organic</strong></div>
    <div><strong>Low Carbon</strong></div>
    <div><strong>Fair Trade</strong></div>
  </div>
</section>
<section style="padding:40px 20px;background:#f4fff4;">
  <h2>Buyer Inquiries</h2>
  <a class="kd-action-btn" href="mailto:{{email}}">Request Export Details</a>
</section>`,
    },
  ],
  INPUT_SUPPLIER: [
    {
      id: 'input-catalogue',
      name: 'Input Supplier Catalogue',
      thumbnail: 'https://cdn.kisandirect.in/templates/input-catalogue.jpg',
      description: 'Product catalogue for seeds, fertilisers, pesticides suppliers',
      html: `<!-- Input supplier template HTML -->
<section style="padding:60px 20px;background:#183f2f;color:#f7fbf6;text-align:center;">
  <h1>{{Supplier Name}}</h1>
  <p>High-quality farm inputs, seeds, micronutrients and crop protection products.</p>
</section>
<section style="padding:40px 20px;max-width:1100px;margin:0 auto;display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px;">
  <article><h3>Seeds</h3><p>{{Seed Categories}}</p></article>
  <article><h3>Fertilizers</h3><p>{{Fertilizer Types}}</p></article>
  <article><h3>Protection</h3><p>{{Crop Care Solutions}}</p></article>
</section>
<section style="padding:40px 20px;background:#eef7ee;">
  <h2>Request a Catalogue</h2>
  <a class="kd-action-btn" href="mailto:{{email}}">Send Enquiry</a>
</section>`,
    },
    {
      id: 'input-supplies',
      name: 'Supplies Showcase',
      thumbnail: 'https://cdn.kisandirect.in/templates/input-supplies.jpg',
      description: 'Showcase the latest farm inputs and promotional offers',
      html: `<!-- Input Supplies template HTML -->
<section style="padding:60px 20px;background:#0e3b2a;color:#f7faf7;text-align:center;">
  <h1>{{Supplier Name}}</h1>
  <p>Seeds, nutrients, crop protection and farm supplies for every harvest.</p>
</section>
<section style="padding:40px 20px;max-width:1100px;margin:0 auto;">
  <div class="offer-cards">
    <article><h3>Seasonal Discounts</h3><p>Bulk pricing for FPOs and traders.</p></article>
    <article><h3>Quality Brands</h3><p>Trusted partner products.</p></article>
  </div>
</section>
<section style="padding:40px 20px;background:#eff7ef;">
  <h2>Contact Sales</h2>
  <a class="kd-action-btn" href="mailto:{{email}}">Order Now</a>
</section>`,
    },
    {
      id: 'input-agri-support',
      name: 'Agri Support Supplier',
      thumbnail: 'https://cdn.kisandirect.in/templates/input-agri-support.jpg',
      description: 'Supplier page focused on advisory, inputs and farm services',
      html: `<!-- Agri Support Supplier template HTML -->
<section style="padding:60px 20px;background:#1a3c28;color:#f6fbf5;text-align:center;">
  <h1>{{Supplier Name}}</h1>
  <p>Complete farm input solutions with advisory support and delivery.</p>
</section>
<section style="padding:40px 20px;max-width:1100px;margin:0 auto;">
  <div class="support-highlights">
    <div><strong>Advisory</strong><p>Crop management support.</p></div>
    <div><strong>Inputs</strong><p>Seeds, fertilizer, and crop care.</p></div>
    <div><strong>Delivery</strong><p>Direct to farm logistics.</p></div>
  </div>
</section>
<section style="padding:40px 20px;background:#eef9ef;">
  <h2>Get a Quote</h2>
  <a class="kd-action-btn" href="mailto:{{email}}">Talk to Us</a>
</section>`,
    },
    {
      id: 'input-tech',
      name: 'Input Tech Catalogue',
      thumbnail: 'https://cdn.kisandirect.in/templates/input-tech.jpg',
      description: 'Modern input supplier page with product categories and offers',
      html: `<!-- Input Tech Catalogue template HTML -->
<section style="padding:60px 20px;background:#0d392e;color:#eef9f2;text-align:center;">
  <h1>{{Supplier Name}}</h1>
  <p>Smart inputs for higher yield, traceability and farm efficiency.</p>
</section>
<section style="padding:40px 20px;max-width:1100px;margin:0 auto;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));display:grid;gap:20px;">
  <article><h3>Seed Varieties</h3></article>
  <article><h3>Bio Inputs</h3></article>
  <article><h3>Soil Nutrition</h3></article>
</section>
<section style="padding:40px 20px;background:#f3fcf5;">
  <h2>Order Now</h2>
  <button class="kd-action-btn">Download Catalogue</button>
</section>`,
    },
    {
      id: 'input-farmcare',
      name: 'Farm Care Products',
      thumbnail: 'https://cdn.kisandirect.in/templates/input-farmcare.jpg',
      description: 'Seed and farm care product page for retail and wholesale buyers',
      html: `<!-- Farm Care Products template HTML -->
<section style="padding:60px 20px;background:#142f26;color:#f5fbf6;text-align:center;">
  <h1>{{Supplier Name}}</h1>
  <p>Trusted farm care products for healthy crops and better yield.</p>
</section>
<section style="padding:40px 20px;max-width:1100px;margin:0 auto;display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px;">
  <article><h3>Seeds</h3><p>High-performance varieties.</p></article>
  <article><h3>Fertilizers</h3><p>Nutrient-rich blends.</p></article>
  <article><h3>Pesticides</h3><p>Safe and effective solutions.</p></article>
</section>
<section style="padding:40px 20px;background:#effaf3;">
  <h2>Place an Order</h2>
  <a class="kd-action-btn" href="mailto:{{email}}">Contact Sales</a>
</section>`,
    },
  ],
};
