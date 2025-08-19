'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RateTicker } from '@/components/Ticker/RateTicker';
import { Footer } from '@/components/AppShell/Footer';
import { 
  Shield, 
  Zap, 
  Globe, 
  ArrowRight, 
  CheckCircle,
  TrendingUp,
  Users,
  Lock
} from 'lucide-react';
import { motion } from 'framer-motion';

const features = [
  {
    icon: Zap,
    title: 'Real-time Routing',
    description: 'Match with top-rated merchants across rails.',
  },
  {
    icon: Shield,
    title: 'Non-Custodial',
    description: 'Connect wallet, stay in control.',
  },
  {
    icon: Globe,
    title: 'Global Payouts',
    description: 'PayPal, Cash App, UPI, SEPA and more.',
  },
];

const stats = [
  { label: 'Active Merchants', value: '2,847' },
  { label: 'Daily Volume', value: '$12.4M' },
  { label: 'Countries', value: '150+' },
];

const trustBadges = [
  { icon: Lock, label: 'SOC 2 Compliant' },
  { icon: CheckCircle, label: 'Audited Smart Contracts' },
  { icon: Users, label: '24/7 Support' },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <motion.header 
        className="glass-enhanced border-b border-glassBorder/30"
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 gradient-orange rounded-lg flex items-center justify-center shadow-liquid">
                <span className="text-black font-bold text-sm">O</span>
              </div>
              <span className="text-xl font-bold text-textPrimary">Orrange</span>
            </div>

            <div className="flex items-center space-x-4">
              <Link href="/dashboard">
                <Button className="btn-primary shadow-liquid">
                  Open Dashboard
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </motion.header>

      {/* Hero Section */}
      <section className="relative py-20 px-4 sm:px-6 lg:px-8 overflow-hidden gradient-dark">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
          >
            <Badge className="bg-orangeNeon/20 text-orangeNeon border-orangeNeon/30 mb-6">
              Global P2P liquidity, non-custodial, instant.
            </Badge>
            
            <h1 className="text-5xl sm:text-7xl font-bold text-textPrimary mb-6 leading-tight">
              Trade stablecoins with{' '}
              <span className="text-transparent bg-gradient-to-r from-orangeNeon via-orangeGlow to-orangeNeon bg-clip-text animate-liquid-flow">
                global liquidity
              </span>
            </h1>
            
            <p className="text-xl text-textSecondary mb-8 max-w-2xl mx-auto leading-relaxed">
              Orrange is a non-custodial P2P trading hub for stablecoins and real-world payouts.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-4">
              <Link href="/dashboard">
                <Button className="btn-primary text-lg px-8 py-4 shadow-liquid">
                  Open Dashboard
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </Link>
              
              <Button className="glass-liquid text-lg px-8 py-4 text-textPrimary font-medium rounded-lg transition-all duration-500 hover:shadow-neon-hover hover:-translate-y-1">
                Try Demo (No Wallet)
              </Button>
            </div>
          </motion.div>
        </div>

        {/* Background Glow */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-gradient-to-r from-orangeNeon/15 via-orangeGlow/10 to-orangeNeon/15 rounded-full blur-3xl animate-liquid-flow"></div>
          <div className="absolute top-1/4 left-1/4 transform -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-orangeGlow/5 rounded-full blur-2xl animate-float"></div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <motion.div 
            className="grid grid-cols-1 md:grid-cols-3 gap-8"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            {stats.map((stat, index) => (
              <div key={stat.label} className="text-center">
                <div className="text-3xl sm:text-4xl font-bold text-orangeNeon mb-2">
                  {stat.value}
                </div>
                <div className="text-textSecondary">{stat.label}</div>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Live Rates */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
          >
            <RateTicker />
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <motion.div 
            className="text-center mb-16"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.6 }}
          >
            <h2 className="text-3xl sm:text-4xl font-bold text-textPrimary mb-4">
              Built for the future of finance
            </h2>
            <p className="text-xl text-textSecondary max-w-2xl mx-auto">
              Experience seamless P2P trading with enterprise-grade security and global reach.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {features.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <motion.div
                  key={feature.title}
                  className="glass-card rounded-xl p-8 hover:shadow-neon-hover transition-all duration-300 group"
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.8, delay: 0.8 + index * 0.1 }}
                  whileHover={{ scale: 1.02, y: -4 }}
                >
                  <div className="w-12 h-12 bg-orangeNeon/20 rounded-lg flex items-center justify-center mb-6 group-hover:bg-orangeNeon/30 transition-colors duration-300">
                    <Icon className="w-6 h-6 text-orangeNeon neon-glow" />
                  </div>
                  
                  <h3 className="text-xl font-semibold text-textPrimary mb-3">
                    {feature.title}
                  </h3>
                  
                  <p className="text-textSecondary leading-relaxed">
                    {feature.description}
                  </p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Trust Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 1.0 }}
          >
            <h3 className="text-2xl font-bold text-textPrimary mb-8">
              Trusted by traders worldwide
            </h3>
            
            <div className="flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-8">
              {trustBadges.map((badge) => {
                const Icon = badge.icon;
                return (
                  <div key={badge.label} className="flex items-center space-x-2 text-textSecondary">
                    <Icon className="w-5 h-5 text-orangeNeon" />
                    <span className="text-sm font-medium">{badge.label}</span>
                  </div>
                );
              })}
            </div>
          </motion.div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            className="glass-card rounded-2xl p-12"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 1.2 }}
          >
            <h3 className="text-3xl sm:text-4xl font-bold text-textPrimary mb-6">
              Start trading today
            </h3>
            
            <p className="text-xl text-textSecondary mb-8 max-w-2xl mx-auto">
              Join thousands of traders using Orrange for secure, fast, and global P2P transactions.
            </p>

            <Link href="/dashboard">
              <Button className="btn-primary text-lg px-8 py-4">
                Open Dashboard
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>
          </motion.div>
        </div>
      </section>

      <Footer />
    </div>
  );
}