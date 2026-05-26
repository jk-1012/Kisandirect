'use client';
import { useEffect } from 'react';

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

type Props = { slug: string };

export default function PageViewRecorder({ slug }: Props) {
  useEffect(() => {
    async function recordView() {
      await fetch(`${apiBase}/api/v1/agristore/page/${slug}/view`, {
        method: 'POST',
        keepalive: true
      });
    }
    recordView();
  }, [slug]);

  return null;
}
