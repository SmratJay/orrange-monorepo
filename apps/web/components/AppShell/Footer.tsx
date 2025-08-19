'use client';

import Link from 'next/link';
import { Twitter, MessageSquare, ExternalLink } from 'lucide-react';
import { motion } from 'framer-motion';

const links = [
  { name: 'Docs', href: '/docs', external: true },
  { name: 'Status', href: '/status', external: true },
  { name: 'Terms', href: '/legal' },
  { name: 'Privacy', href: '/legal' },
  { name: 'Contact', href: '/support' },
];

const socials = [
  { name: 'Twitter', href: 'https://twitter.com/orrange', icon: Twitter },
  { name: 'Discord', href: 'https://discord.gg/orrange', icon: MessageSquare },
];

export function Footer() {
  return (
    <motion.footer 
      className="glass-enhanced border-t border-glassBorder/30 mt-auto shadow-glass-enhanced"
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.8, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col sm:flex-row items-center justify-between space-y-4 sm:space-y-0">
          {/* Links */}
          <div className="flex items-center space-x-6">
            {links.map((link) => (
              <Link 
                key={link.name} 
                href={link.href}
                className="flex items-center space-x-1 text-sm text-textSecondary hover:text-orangeNeon transition-all duration-500 hover:scale-105"
                {...(link.external && { target: '_blank', rel: 'noopener noreferrer' })}
              >
                <span>{link.name}</span>
                {link.external && <ExternalLink className="w-3 h-3" />}
              </Link>
            ))}
          </div>

          {/* Brand + Socials */}
          <div className="flex items-center space-x-6">
            <div className="flex items-center space-x-4">
              {socials.map((social) => {
                const Icon = social.icon;
                return (
                  <Link
                    key={social.name}
                    href={social.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-textSecondary hover:text-orangeNeon transition-all duration-500 hover:scale-110"
                  >
                    <Icon className="w-4 h-4" />
                  </Link>
                );
              })}
            </div>
            
            <div className="text-sm text-textSecondary">
              © 2024 Orrange. All rights reserved.
            </div>
          </div>
        </div>
      </div>
    </motion.footer>
  );
}