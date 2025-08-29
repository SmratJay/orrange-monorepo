'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Search, Bell, User, Wifi, Command } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { motion } from 'framer-motion';

export function TopNav() {
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <motion.header 
      className="sticky top-0 z-50 glass-enhanced border-b border-glassBorder/30 shadow-glass-enhanced"
      initial={{ y: -100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand */}
          <Link href="/dashboard" className="flex items-center space-x-2 group">
            <div className="w-8 h-8 gradient-orange rounded-lg flex items-center justify-center group-hover:scale-110 transition-all duration-500 shadow-liquid">
              <span className="text-black font-bold text-sm">O</span>
            </div>
            <span className="text-xl font-bold text-textPrimary">Orrange</span>
          </Link>

          {/* Search */}
          <div className="flex-1 max-w-md mx-8">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-textSecondary" />
              <Input
                placeholder="Search orders, merchants... (⌘K)"
                className="glass-liquid pl-10 pr-12 w-full h-10 text-textPrimary placeholder-textSecondary rounded-lg transition-all duration-500 focus:outline-none focus:ring-2 focus:ring-orangeNeon/50 focus:border-orangeNeon/50 focus:shadow-neon"
                onFocus={() => setSearchOpen(true)}
                onBlur={() => setSearchOpen(false)}
              />
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                <Badge variant="secondary" className="text-xs glass-liquid text-textSecondary">
                  <Command className="w-3 h-3 mr-1" />
                  K
                </Badge>
              </div>
            </div>
          </div>

          {/* Right Section */}
          <div className="flex items-center space-x-4">
            {/* Network Status */}
            <div className="flex items-center space-x-2 glass-liquid px-3 py-1.5 rounded-lg shadow-liquid">
              <div className="relative">
                <Wifi className="w-4 h-4 text-success" />
                <div className="absolute -top-1 -right-1 w-2 h-2 bg-success rounded-full animate-liquid-flow"></div>
              </div>
              <span className="text-xs text-textSecondary hidden sm:inline">Connected</span>
            </div>

            {/* Notifications */}
            <Button variant="ghost" size="sm" className="relative p-2 hover:bg-white/10 transition-all duration-300 hover:scale-110">
              <Bell className="w-5 h-5 text-textSecondary" />
              <div className="absolute -top-1 -right-1 w-2 h-2 bg-orangeNeon rounded-full"></div>
            </Button>

            {/* Profile Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="p-2 hover:bg-white/10 transition-all duration-300 hover:scale-110">
                  <div className="w-6 h-6 gradient-orange rounded-full flex items-center justify-center shadow-liquid">
                    <User className="w-3 h-3 text-black" />
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="glass-enhanced border-glassBorder shadow-glass-enhanced">
                <DropdownMenuItem className="hover:bg-white/10">
                  Profile
                </DropdownMenuItem>
                <DropdownMenuItem className="hover:bg-white/10">
                  Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-glassBorder" />
                <DropdownMenuItem className="hover:bg-white/10 text-danger">
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </motion.header>
  );
}