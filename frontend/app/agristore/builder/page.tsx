'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import 'grapesjs/dist/css/grapes.min.css';
import { agriStoreTemplates, agristoreBlockPresets } from '../../../lib/agristore/templates';

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

type AgriStoreDraft = {
  slug: string;
  name: string;
  description: string;
  heroTitle: string;
  heroSubtitle: string;
  heroImage: string;
  blocks: Array<{ type: string; html: string }>;
};

export default function AgriStoreBuilderPage() {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const grapesEditor = useRef<any>(null);
  const [templateId, setTemplateId] = useState('farm-market');
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [publishResult, setPublishResult] = useState<{ pageUrl: string; cdnUrl: string } | null>(null);
  const [draft, setDraft] = useState<AgriStoreDraft>({
    slug: 'my-farm-store',
    name: 'My Farm Store',
    description: 'A storefront for my farm produce and cold storage services.',
    heroTitle: 'Fresh farm produce delivered with trust',
    heroSubtitle: 'Build your AgriStore and publish directly to your own subdomain.',
    heroImage: 'https://images.unsplash.com/photo-1506806732259-39c2d0268443?auto=format&fit=crop&w=1400&q=80',
    blocks: []
  });

  const selectedTemplate = useMemo(() => agriStoreTemplates.find((t) => t.id === templateId) ?? agriStoreTemplates[0], [templateId]);

  useEffect(() => {
    let mounted = true;

    async function initEditor() {
      if (!editorRef.current) return;
      const grapesjsModule = await import('grapesjs');
      const grapesjs = grapesjsModule.default;

      if (!mounted) return;
      grapesEditor.current = grapesjs.init({
        container: editorRef.current,
        height: '75vh',
        fromElement: false,
        storageManager: false,
        styleManager: { clearProperties: true },
        panels: { defaults: [] },
        blockManager: {
          appendTo: '#block-panel',
          blocks: []
        }
      });

      agristoreBlockPresets.forEach((block) => {
        grapesEditor.current.BlockManager.add(block.id, {
          label: block.label,
          category: block.category,
          content: block.content,
          activate: true
        });
      });

      grapesEditor.current.setComponents(`
        <section style="padding: 4rem 2rem; background: white;">
          <div style="max-width: 900px; margin: 0 auto;">
            <h1>${selectedTemplate.hero.title}</h1>
            <p>${selectedTemplate.hero.subtitle}</p>
          </div>
        </section>
      `);
    }

    initEditor();
    return () => {
      mounted = false;
      if (grapesEditor.current) {
        grapesEditor.current.destroy();
      }
    };
  }, [selectedTemplate]);

  const handleSelectTemplate = (id: string) => {
    setTemplateId(id);
  };

  const handlePublish = async () => {
    if (!grapesEditor.current) return;
    setStatus('saving');
    try {
      const html = grapesEditor.current.getHtml();
      const payload = {
        slug: draft.slug,
        name: draft.name,
        description: draft.description,
        hero: {
          title: draft.heroTitle,
          subtitle: draft.heroSubtitle,
          backgroundImage: draft.heroImage
        },
        blocks: [
          {
            type: 'hero',
            title: draft.heroTitle,
            subtitle: draft.heroSubtitle,
            imageUrl: draft.heroImage,
            ctaText: 'Explore Now',
            ctaUrl: `https://${draft.slug}.kisandirect.in`
          },
          { type: 'rich_text', html }
        ],
        metadata: {
          seoTitle: `${draft.name} | AgriStore on KisanDirect`,
          seoDescription: draft.description,
          keywords: ['farm', 'cold storage', 'agriculture', 'AgriStore']
        }
      };

      const response = await fetch(`${apiBase}/api/v1/agristore/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error('Publish failed');
      }

      const result = await response.json();
      setPublishResult(result);
      setStatus('saved');
    } catch (error) {
      console.error(error);
      setStatus('error');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4 text-slate-900">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 rounded-3xl bg-white p-8 shadow-sm">
          <h1 className="text-4xl font-semibold">AgriStore Builder</h1>
          <p className="mt-3 max-w-2xl text-slate-600">Create a farm storefront using the no-code editor, publish to a branded storefront subdomain, and get instant analytics.</p>
        </header>

        <section className="grid gap-6 xl:grid-cols-[380px_1fr]">
          <aside className="space-y-6 rounded-3xl bg-white p-6 shadow-sm">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Store slug</label>
              <input
                value={draft.slug}
                onChange={(event) => setDraft((prev) => ({ ...prev, slug: event.target.value }))}
                className="w-full rounded-2xl border border-slate-300 px-4 py-3"
                placeholder="farm-store"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Store name</label>
              <input
                value={draft.name}
                onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
                className="w-full rounded-2xl border border-slate-300 px-4 py-3"
                placeholder="My Farm Store"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Hero subtitle</label>
              <input
                value={draft.heroSubtitle}
                onChange={(event) => setDraft((prev) => ({ ...prev, heroSubtitle: event.target.value }))}
                className="w-full rounded-2xl border border-slate-300 px-4 py-3"
                placeholder="Build your AgriStore page in minutes"
              />
            </div>

            <div>
              <h2 className="text-lg font-semibold">Template library</h2>
              <div className="mt-4 space-y-3">
                {agriStoreTemplates.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => handleSelectTemplate(template.id)}
                    className={`block w-full rounded-3xl border px-4 py-4 text-left transition ${templateId === template.id ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-white'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{template.name}</span>
                      {templateId === template.id && <span className="text-xs uppercase text-emerald-700">Selected</span>}
                    </div>
                    <p className="mt-2 text-sm text-slate-600">{template.description}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm text-slate-600">Published page</p>
              {publishResult ? (
                <div className="mt-4 space-y-2 text-sm">
                  <p><strong>URL:</strong> <a className="text-emerald-700" href={publishResult.pageUrl}>{publishResult.pageUrl}</a></p>
                  <p><strong>CDN preview:</strong> <a className="text-emerald-700" href={publishResult.cdnUrl}>{publishResult.cdnUrl}</a></p>
                </div>
              ) : (
                <p className="mt-4 text-slate-500">Publish your page to generate a storefront subdomain and CDN page.</p>
              )}
            </div>

            <button
              type="button"
              onClick={handlePublish}
              className="mt-4 w-full rounded-3xl bg-emerald-600 px-6 py-4 text-base font-semibold text-white transition hover:bg-emerald-700"
            >
              {status === 'saving' ? 'Publishing...' : 'Publish Storefront'}
            </button>
            {status === 'error' && <p className="text-sm text-red-600">Publishing failed. Check your auth session and backend settings.</p>}
          </aside>

          <main className="space-y-6">
            <section className="rounded-3xl bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold">Editor</h2>
              <div className="mt-4 text-sm text-slate-500">Drag blocks onto the canvas, then publish to make your AgriStore available at <strong>{`https://${draft.slug}.kisandirect.in`}</strong>.</div>
            </section>

            <div className="grid gap-6 xl:grid-cols-[280px_1fr]">
              <div className="rounded-3xl bg-white p-6 shadow-sm">
                <h3 className="font-semibold">Block Library</h3>
                <div id="block-panel" className="mt-4 space-y-4 text-sm text-slate-600" />
              </div>

              <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                <div ref={editorRef} className="min-h-[600px]" />
              </div>
            </div>
          </main>
        </section>
      </div>
    </div>
  );
}
