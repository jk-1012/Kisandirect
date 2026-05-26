'use client';
import { useEffect, useRef, useState } from 'react';
import grapesjs from 'grapesjs';
import 'grapesjs/dist/css/grapes.min.css';

const AGRI_BLOCKS = [
  {
    id: 'live-crop-availability',
    label: 'Live Crop Availability',
    category: 'KisanDirect Blocks',
    content: `
      <div class="kd-crop-widget" data-widget="live-listings" data-farmer-id="{{farmer_id}}">
        <div class="kd-widget-header">🌾 Available Produce</div>
        <div class="kd-listings-container" id="kd-live-listings">
          <p class="kd-loading">Loading latest listings...</p>
        </div>
        <script>
          (function() {
            fetch('https://kisandirect.in/api/v1/listings/search?farmer_id={{farmer_id}}&limit=6')
              .then(r => r.json())
              .then(data => {
                const container = document.getElementById('kd-live-listings');
                if (!container) return;
                container.innerHTML = data.results.map(l => 
                  '<div class="kd-listing-card">' +
                    '<div class="kd-crop-name">' + l.crop.display_name.en + '</div>' +
                    '<div class="kd-price">₹' + l.price_per_kg_inr + '/kg</div>' +
                    '<div class="kd-qty">' + l.quantity_remaining_kg + ' kg available</div>' +
                  '</div>'
                ).join('');
              })
              .catch(() => {
                const container = document.getElementById('kd-live-listings');
                if (container) container.innerHTML = '<p class="kd-error">Unable to load listings.</p>';
              });
          })();
        </script>
      </div>
    `,
    media: '<svg viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5z"/></svg>',
  },
  {
    id: 'price-ticker',
    label: 'Mandi Price Ticker',
    category: 'KisanDirect Blocks',
    content: `
      <div class="kd-price-ticker" data-widget="mandi-prices" data-crops="TOMATO,ONION,POTATO">
        <div class="kd-ticker-header">📊 Today's Mandi Prices</div>
        <div id="kd-price-list" class="kd-price-list">
          <div class="kd-price-row"><span>Tomato</span><span id="kd-tomato-price">Loading...</span></div>
          <div class="kd-price-row"><span>Onion</span><span id="kd-onion-price">Loading...</span></div>
          <div class="kd-price-row"><span>Potato</span><span id="kd-potato-price">Loading...</span></div>
        </div>
        <small class="kd-price-update">Prices updated every 4 hours from AgMarkNet</small>
      </div>
    `,
    media: '<svg viewBox="0 0 24 24"><path d="M3 3v18h18"/><path d="M7 12l4-4 4 4 4-4"/></svg>',
  },
  {
    id: 'whatsapp-contact',
    label: 'WhatsApp Contact Button',
    category: 'KisanDirect Blocks',
    content: `
      <a href="https://wa.me/91{{phone_number}}?text=Hello, I found you on KisanDirect" 
         class="kd-whatsapp-btn" target="_blank" rel="noopener noreferrer">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967c-.273-.099-.471-.148-.67.15c-.197.297-.767.966-.94 1.164c-.173.199-.347.223-.644.075c-.297-.15-1.255-.463-2.39-1.475c-.883-.788-1.48-1.761-1.653-2.059c-.173-.297-.018-.458.13-.606c.134-.133.298-.347.446-.52c.149-.174.198-.298.298-.497c.099-.198.05-.371-.025-.52c-.075-.149-.669-1.612-.916-2.207c-.242-.579-.487-.5-.669-.51c-.173-.008-.371-.01-.57-.01c-.198 0-.52.074-.792.372c-.272.297-1.04 1.016-1.04 2.479c0 1.462 1.065 2.875 1.213 3.074c.149.198 2.096 3.2 5.077 4.487c.709.306 1.262.489 1.694.625c.712.227 1.36.195 1.871.118c.571-.085 1.758-.719 2.006-1.413c.248-.694.248-1.289.173-1.413c-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214l-3.741.982l.998-3.648l-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884c2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
        Chat on WhatsApp
      </a>
    `,
    media: '<svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
  },
  {
    id: 'trust-badge',
    label: 'KisanDirect Trust Badge',
    category: 'KisanDirect Blocks',
    content: `
      <div class="kd-trust-badge">
        <div class="kd-badge-icon">🌾</div>
        <div class="kd-badge-text">
          <strong>Verified on KisanDirect</strong>
          <span>KYC Verified Seller</span>
        </div>
        <a href="https://kisandirect.in" target="_blank" rel="noopener noreferrer" class="kd-badge-link">View Profile →</a>
      </div>
    `,
    media: '<svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
  },
];

function getToken() {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('accessToken') ?? '';
}

async function uploadToS3(file: File, path: string) {
  const fileName = `${Date.now()}-${file.name}`;
  const response = await fetch(`/api/v1/storefronts/upload-url?path=${encodeURIComponent(path)}`);
  if (!response.ok) {
    throw new Error('Failed to generate upload URL');
  }

  const { url, key } = await response.json();
  await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  });

  return key;
}

function formatTimeAgo(date: Date) {
  const delta = Math.max(1, Math.floor((Date.now() - date.getTime()) / 1000));
  if (delta < 60) return `${delta}s ago`;
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
  if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`;
  return `${Math.floor(delta / 86400)}d ago`;
}

export default function AgriStoreEditor({ storeId }: { storeId: string }) {
  const editorRef = useRef<HTMLDivElement>(null);
  const gjsRef = useRef<any>(null);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  useEffect(() => {
    if (!editorRef.current) return;

    const editor = grapesjs.init({
      container: editorRef.current,
      height: 'calc(100vh - 64px)',
      width: 'auto',
      storageManager: {
        type: 'remote',
        stepsBeforeSave: 3,
        urlStore: `/api/v1/storefronts/${storeId}/autosave`,
        urlLoad: `/api/v1/storefronts/${storeId}/page-json`,
        params: {},
        headers: { Authorization: `Bearer ${getToken()}` },
      } as any,
      assetManager: {
        uploadFile: async (e: any) => {
          const files = e.dataTransfer ? e.dataTransfer.files : e.target.files;
          for (const file of files) {
            const key = await uploadToS3(file, `storefronts/${storeId}/assets`);
            editor.AssetManager.add({ src: `https://cdn.kisandirect.in/${key}`, name: file.name });
          }
        },
      },
      canvas: {
        styles: ['https://cdn.kisandirect.in/storefront/base.css'],
      },
      plugins: [],
      pluginsOpts: {},
    });

    AGRI_BLOCKS.forEach((block) => {
      editor.BlockManager.add(block.id, {
        label: block.label,
        category: block.category,
        content: block.content,
        media: block.media,
      });
    });

    editor.Panels.addButton('options', [
      {
        id: 'mobile-view',
        className: 'fa fa-mobile',
        command: {
          run: (editorInstance: any) => editorInstance.setDevice('Mobile'),
          stop: (editorInstance: any) => editorInstance.setDevice('Desktop'),
        },
        attributes: { title: 'Mobile View' },
      },
    ] as any);

    gjsRef.current = editor;

    return () => {
      editor.destroy();
    };
  }, [storeId]);

  const handlePublish = async () => {
    setSaving(true);
    try {
      const projectData = gjsRef.current?.getProjectData();
      const html = gjsRef.current?.getHtml();
      const css = gjsRef.current?.getCss();

      await fetch(`/api/v1/storefronts/${storeId}/publish`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ page_json: projectData, html, css }),
      });

      setLastSaved(new Date());
    } catch (error) {
      console.error('Publish failed', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-screen">
      <div className="flex items-center justify-between px-4 py-2 bg-white border-b shadow-sm h-16">
        <div className="flex items-center gap-3">
          <span className="text-green-700 font-bold text-lg">🌾 AgriStore Builder</span>
          {lastSaved && <span className="text-xs text-gray-400">Auto-saved {formatTimeAgo(lastSaved)}</span>}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handlePublish}
            disabled={saving}
            className="bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-lg font-medium disabled:opacity-50"
          >
            {saving ? 'Publishing...' : 'Publish Store'}
          </button>
        </div>
      </div>
      <div ref={editorRef} className="flex-1" />
    </div>
  );
}
