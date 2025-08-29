'use client';

import Link from 'next/link';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      {/* Simple header with just logo */}
      <header className="glass-enhanced border-b border-glassBorder/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/" className="flex items-center space-x-2">
              <div className="w-8 h-8 gradient-orange rounded-lg flex items-center justify-center shadow-liquid">
                <span className="text-black font-bold text-sm">O</span>
              </div>
              <span className="text-xl font-bold text-textPrimary">Orrange</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1">
        {children}
      </main>
    </div>
  );
}
