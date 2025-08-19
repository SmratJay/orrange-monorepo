'use client';

import { TopNav } from '@/components/AppShell/TopNav';
import { Sidebar } from '@/components/AppShell/Sidebar';
import { BottomNav } from '@/components/AppShell/BottomNav';
import { Footer } from '@/components/AppShell/Footer';

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <TopNav />
      
      <div className="flex flex-1 overflow-hidden">
        {/* Desktop Sidebar */}
        <div className="hidden md:block">
          <Sidebar />
        </div>
        
        {/* Main Content */}
        <main className="flex-1 overflow-auto">
          <div className="max-w-7xl mx-auto p-6">
            {children}
          </div>
          <Footer />
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <BottomNav />
    </div>
  );
}