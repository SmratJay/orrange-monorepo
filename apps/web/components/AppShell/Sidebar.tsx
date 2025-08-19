'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard, 
  BookOpen, 
  Plus, 
  Store, 
  ArrowLeftRight, 
  TrendingUp,
  Settings, 
  HelpCircle,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Order Book', href: '/orders', icon: BookOpen },
  { name: 'Create Order', href: '/create-order', icon: Plus },
  { name: 'Merchant Panel', href: '/merchant', icon: Store },
  { name: 'Convert', href: '/convert', icon: ArrowLeftRight },
  { name: 'Analytics', href: '/analytics', icon: TrendingUp },
  { name: 'Settings', href: '/settings', icon: Settings },
  { name: 'Support', href: '/support', icon: HelpCircle },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  return (
    <motion.aside 
      className={cn(
        "glass-enhanced border-r border-glassBorder/30 h-full flex flex-col transition-all duration-500 shadow-glass-enhanced",
        collapsed ? "w-16" : "w-64"
      )}
      initial={{ x: -300, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Collapse Toggle */}
      <div className="flex items-center justify-between p-4 border-b border-glassBorder/30">
        <AnimatePresence>
          {!collapsed && (
            <motion.span 
              className="text-sm font-medium text-textSecondary"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              Navigation
            </motion.span>
          )}
        </AnimatePresence>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCollapsed(!collapsed)}
          className="p-2 hover:bg-white/10 transition-all duration-300 hover:scale-110"
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4 text-textSecondary" />
          ) : (
            <ChevronLeft className="w-4 h-4 text-textSecondary" />
          )}
        </Button>
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 p-4 space-y-2">
        {navigation.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link key={item.name} href={item.href}>
              <motion.div
                className={cn(
                  "flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-all duration-500 group",
                  isActive
                    ? "glass-liquid border border-orangeNeon/30 text-orangeNeon shadow-liquid"
                    : "hover:bg-white/10 text-textSecondary hover:text-textPrimary hover:shadow-liquid"
                )}
                whileHover={{ scale: 1.02, x: 4 }}
                whileTap={{ scale: 0.98 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              >
                <Icon className={cn("w-5 h-5 flex-shrink-0", isActive && "neon-glow")} />
                <AnimatePresence>
                  {!collapsed && (
                    <motion.span 
                      className="font-medium"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      transition={{ duration: 0.3 }}
                    >
                      {item.name}
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.div>
            </Link>
          );
        })}
      </nav>
    </motion.aside>
  );
}