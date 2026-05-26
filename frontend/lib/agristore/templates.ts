export type AgriStoreTemplate = {
  id: string;
  name: string;
  description: string;
  hero: { title: string; subtitle: string; backgroundImage: string };
  blocks: Array<{ type: string; label: string; content: string }>;
};

export const agriStoreTemplates: AgriStoreTemplate[] = [
  {
    id: 'farm-market',
    name: 'Farm Market',
    description: 'A marketplace page for fresh farm produce with hero, features, and contact.',
    hero: {
      title: 'Fresh produce from India’s farms',
      subtitle: 'Connect directly with growers, discover seasonal inventory, and place orders with escrow protection.',
      backgroundImage: 'https://images.unsplash.com/photo-1506806732259-39c2d0268443?auto=format&fit=crop&w=1400&q=80'
    },
    blocks: [
      { type: 'feature', label: 'Quality & Traceability', content: 'Fresh harvests with certified origin and export-ready handling.' },
      { type: 'feature', label: 'Cold Storage Ready', content: 'Inventory and booking touchpoints for packers and logistics.' },
      { type: 'contact', label: 'Contact', content: 'Call or email your sales manager for bulk orders and cold chain onboarding.' }
    ]
  },
  {
    id: 'cold-chain',
    name: 'Cold Chain',
    description: 'Showcase cold storage capacity, facility listings, and easy buyer onboarding.',
    hero: {
      title: 'Reliable cold storage for perishables',
      subtitle: 'Book capacity, manage inventory, and publish storefront pages for FPOs and traders.',
      backgroundImage: 'https://images.unsplash.com/photo-1518081461905-dae4f60fe52d?auto=format&fit=crop&w=1400&q=80'
    },
    blocks: [
      { type: 'feature', label: 'Temperature Controlled', content: '24/7 monitoring with audit-ready record keeping.' },
      { type: 'feature', label: 'Ready for Exports', content: 'High-quality packhouses and cold stores across Maharashtra and Karnataka.' },
      { type: 'contact', label: 'Request a Quote', content: 'Share your crop, quantity and timeline to get a tailored rate card.' }
    ]
  }
];

export const agristoreBlockPresets = [
  {
    id: 'hero',
    label: 'Hero Section',
    category: 'Agri Blocks',
    content: `<section class="px-6 py-16 bg-white text-slate-900">
      <div class="mx-auto max-w-6xl">
        <h1 class="text-4xl font-semibold mb-4">Farm-to-Buyer storefront</h1>
        <p class="text-lg text-slate-600">Launch an AgriStore page for your FPO, cold storage facility or agri-business in minutes.</p>
      </div>
    </section>`
  },
  {
    id: 'feature',
    label: 'Feature Panel',
    category: 'Agri Blocks',
    content: `<section class="px-6 py-12 bg-slate-50 text-slate-900">
      <div class="mx-auto max-w-6xl grid gap-6 md:grid-cols-3">
        <article class="rounded-3xl bg-white p-6 shadow-sm">
          <h2 class="text-xl font-semibold mb-2">Cold chain compliance</h2>
          <p class="text-slate-600">Track temperature, moisture and transport readiness on a single AgriStore page.</p>
        </article>
        <article class="rounded-3xl bg-white p-6 shadow-sm">
          <h2 class="text-xl font-semibold mb-2">FPO trust score</h2>
          <p class="text-slate-600">Show Pune market buyers your FPO’s verified production and delivery record.</p>
        </article>
        <article class="rounded-3xl bg-white p-6 shadow-sm">
          <h2 class="text-xl font-semibold mb-2">Order escrow</h2>
          <p class="text-slate-600">Collect buyer orders with secure escrow and instant payment release once shipment is confirmed.</p>
        </article>
      </div>
    </section>`
  },
  {
    id: 'contact',
    label: 'Contact Card',
    category: 'Agri Blocks',
    content: `<section class="px-6 py-12 bg-emerald-600 text-white rounded-3xl">
      <div class="mx-auto max-w-4xl">
        <h2 class="text-3xl font-semibold mb-3">Start receiving orders today</h2>
        <p class="max-w-2xl mb-6">Share your listing page and let buyers book inventory directly through secure escrow.</p>
        <div class="grid gap-4 sm:grid-cols-2">
          <div><strong>Phone</strong><p>+91 98765 43210</p></div>
          <div><strong>Email</strong><p>hello@kisandirect.in</p></div>
        </div>
      </div>
    </section>`
  }
];
