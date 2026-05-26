import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import PageViewRecorder from './page-view-recorder';

type AgriStorePage = {
  slug: string;
  name: string;
  description: string;
  hero: { title: string; subtitle: string; backgroundImage?: string };
  blocks: Array<{ type: string; [key: string]: unknown }>;
  metadata?: { seoTitle?: string; seoDescription?: string; keywords?: string[] };
};

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

async function fetchPage(slug: string): Promise<AgriStorePage | null> {
  const res = await fetch(`${apiBase}/api/v1/agristore/page/${slug}`, { cache: 'no-store' });
  if (!res.ok) return null;
  return res.json();
}

export async function generateMetadata({ params }: { params: { businessSlug: string } }): Promise<Metadata> {
  const page = await fetchPage(params.businessSlug);
  if (!page) {
    return { title: 'Store not found' };
  }
  return {
    title: page.metadata?.seoTitle ?? page.name,
    description: page.metadata?.seoDescription ?? page.description,
    openGraph: {
      title: page.metadata?.seoTitle ?? page.name,
      description: page.metadata?.seoDescription ?? page.description,
      url: `https://${params.businessSlug}.kisandirect.in`
    }
  };
}

function renderBlock(block: { type: string; [key: string]: any }, index: number, pageName: string) {
  switch (block.type) {
    case 'hero':
      return (
        <section key={index} className="relative overflow-hidden bg-white">
          {block.imageUrl ? (
            <div className="absolute inset-0">
              <img src={block.imageUrl} alt={block.title} className="h-full w-full object-cover opacity-40" />
              <div className="absolute inset-0 bg-slate-950/60" />
            </div>
          ) : null}
          <div className="relative px-6 py-24 sm:px-10 lg:px-16">
            <div className="mx-auto max-w-5xl text-center text-white">
              <p className="text-base uppercase tracking-[0.35em] text-emerald-300">AgriStore</p>
              <h1 className="mt-3 text-4xl font-semibold sm:text-5xl">{block.title}</h1>
              <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-emerald-100">{block.subtitle}</p>
            </div>
          </div>
        </section>
      );
    case 'feature':
      return (
        <article key={index} className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <h2 className="text-2xl font-semibold text-slate-900">{block.title}</h2>
          <p className="mt-3 text-slate-600">{block.description}</p>
        </article>
      );
    case 'gallery':
      return (
        <section key={index} className="grid gap-4 md:grid-cols-2">
          {Array.isArray(block.items)
            ? block.items.map((item: any, idx: number) => (
                <div key={idx} className="overflow-hidden rounded-3xl bg-white shadow-sm">
                  <img src={item.imageUrl} alt={item.caption ?? pageName} className="h-64 w-full object-cover" />
                  {item.caption ? <p className="p-4 text-slate-700">{item.caption}</p> : null}
                </div>
              ))
            : null}
        </section>
      );
    case 'contact':
      return (
        <section key={index} className="rounded-3xl bg-slate-900 p-10 text-white">
          <h2 className="text-3xl font-semibold">{block.heading}</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {block.phone ? (
              <div>
                <p className="text-slate-300">Phone</p>
                <p>{block.phone}</p>
              </div>
            ) : null}
            {block.email ? (
              <div>
                <p className="text-slate-300">Email</p>
                <p>{block.email}</p>
              </div>
            ) : null}
            {block.address ? (
              <div>
                <p className="text-slate-300">Address</p>
                <p>{block.address}</p>
              </div>
            ) : null}
          </div>
        </section>
      );
    case 'rich_text':
      return (
        <section key={index} className="prose prose-slate mx-auto rounded-3xl bg-white p-8 shadow-sm" dangerouslySetInnerHTML={{ __html: block.html }} />
      );
    default:
      return null;
  }
}

export default async function BusinessPage({ params }: { params: { businessSlug: string } }) {
  const page = await fetchPage(params.businessSlug);
  if (!page) {
    notFound();
  }

  return (
    <main className="bg-slate-50 text-slate-900">
      <PageViewRecorder slug={params.businessSlug} />
      <div className="mx-auto max-w-7xl space-y-8 px-4 py-10 sm:px-6 lg:px-8">
        <section className="rounded-3xl bg-white p-8 shadow-sm">
          <div className="space-y-4">
            <p className="text-sm uppercase tracking-[0.3em] text-emerald-600">AgriStore</p>
            <h1 className="text-4xl font-semibold">{page.name}</h1>
            <p className="max-w-3xl text-base leading-7 text-slate-600">{page.description}</p>
          </div>
        </section>

        <div className="space-y-8">{page.blocks.map((block, index) => renderBlock(block, index, page.name))}</div>
      </div>
    </main>
  );
}
