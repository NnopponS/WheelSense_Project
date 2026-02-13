'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminMapRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/admin/map-zone');
  }, [router]);

  return null;
}
