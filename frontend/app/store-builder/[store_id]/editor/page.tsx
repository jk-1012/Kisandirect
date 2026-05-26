'use client';
import dynamic from 'next/dynamic';

const AgriStoreEditor = dynamic(() => import('../../../../components/AgriStoreEditor'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-screen">
      <div className="text-center">
        <div className="animate-spin h-12 w-12 border-4 border-green-500 border-t-transparent rounded-full mx-auto mb-4" />
        <p className="text-gray-600">Loading store builder...</p>
      </div>
    </div>
  ),
});

export default function EditorPage({ params }: { params: { store_id: string } }) {
  return <AgriStoreEditor storeId={params.store_id} />;
}
