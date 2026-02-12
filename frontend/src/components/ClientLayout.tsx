'use client';

import { useEffect } from 'react';
import { useWheelSenseStore } from '@/store';
import { Sidebar, TopBar, BottomNav } from '@/components/Navigation';

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const { theme } = useWheelSenseStore();

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <div className="app-container">
      <Sidebar />
      <main className="main-content">
        <TopBar />
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
