import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { QueryProvider } from '@/lib/providers/QueryProvider';
import { Toaster } from '@/components/ui/toaster';

const inter = Inter({ 
  subsets: ['latin'],
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'Orrange - Global P2P Crypto Trading',
  description: 'Trade stablecoins with global liquidity. Non-custodial P2P trading hub for stablecoins and real-world payouts.',
  keywords: 'crypto, trading, P2P, stablecoin, USDT, USDC, DAI, PayPal, UPI, SEPA',
  authors: [{ name: 'Orrange Team' }],
  creator: 'Orrange',
  publisher: 'Orrange',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  themeColor: '#FF7A1A',
  colorScheme: 'dark',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} font-sans`}>
        <QueryProvider>
          {children}
          <Toaster />
        </QueryProvider>
      </body>
    </html>
  );
}