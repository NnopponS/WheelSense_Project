'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function UserAiAssistantRedirect() {
    const router = useRouter();
    useEffect(() => { router.replace('/user/ai'); }, [router]);
    return null;
}
