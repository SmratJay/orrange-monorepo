'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, BookOpen, Plus, Store } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Orders', href: '/orders', icon: BookOpen },
  { name: 'Create', href: '/create-order', icon: Plus },
  { name: 'Merchant', href: '/merchant', icon: Store },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <motion.nav 
      className="glass-card border-t border-glassBorder/50 md:hidden"
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      <div className="flex items-center justify-around py-2">
        {navigation.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link key={item.name} href={item.href} className="flex-1">
              <motion.div
                className={cn(
                  "flex flex-col items-center space-y-1 py-2 px-3",
                  isActive ? "text-orangeNeon" : "text-textSecondary"
                )}
                whileTap={{ scale: 0.95 }}
              >
                <Icon className={cn("w-5 h-5", isActive && "neon-glow")} />
                <span className="text-xs font-medium">{item.name}</span>
              </motion.div>
            </Link>
          );
        })}
      </div>
    </motion.nav>
  );
}