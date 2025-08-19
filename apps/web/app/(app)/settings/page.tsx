'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  User, 
  Bell, 
  Shield, 
  Palette,
  Wallet,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Moon,
  Globe
} from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

const securityChecklist = [
  { label: 'Email verified', completed: true, icon: CheckCircle2 },
  { label: 'Phone number verified', completed: true, icon: CheckCircle2 },
  { label: 'Identity documents uploaded', completed: false, icon: AlertTriangle },
  { label: 'Two-factor authentication enabled', completed: false, icon: Clock },
  { label: 'Wallet connected', completed: true, icon: CheckCircle2 },
];

export default function SettingsPage() {
  const [notifications, setNotifications] = useState({
    orderUpdates: true,
    priceAlerts: false,
    newsletter: true,
    security: true,
  });

  const handleNotificationChange = (key: string, value: boolean) => {
    setNotifications(prev => ({ ...prev, [key]: value }));
    toast.success('Notification preferences updated');
  };

  const handleSaveProfile = () => {
    toast.success('Profile updated successfully');
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h1 className="text-3xl font-bold text-textPrimary mb-2">Settings</h1>
        <p className="text-textSecondary">
          Manage your account preferences and security settings.
        </p>
      </motion.div>

      {/* Settings Tabs */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        <Tabs defaultValue="profile" className="space-y-6">
          <TabsList className="glass-card p-1">
            <TabsTrigger value="profile" className="data-[state=active]:bg-orangeNeon/20 data-[state=active]:text-orangeNeon">
              <User className="w-4 h-4 mr-2" />
              Profile
            </TabsTrigger>
            <TabsTrigger value="notifications" className="data-[state=active]:bg-orangeNeon/20 data-[state=active]:text-orangeNeon">
              <Bell className="w-4 h-4 mr-2" />
              Notifications
            </TabsTrigger>
            <TabsTrigger value="security" className="data-[state=active]:bg-orangeNeon/20 data-[state=active]:text-orangeNeon">
              <Shield className="w-4 h-4 mr-2" />
              Security
            </TabsTrigger>
            <TabsTrigger value="appearance" className="data-[state=active]:bg-orangeNeon/20 data-[state=active]:text-orangeNeon">
              <Palette className="w-4 h-4 mr-2" />
              Appearance
            </TabsTrigger>
          </TabsList>

          {/* Profile Tab */}
          <TabsContent value="profile" className="space-y-6">
            <Card className="glass-card p-8">
              <h3 className="text-xl font-semibold text-textPrimary mb-6">Profile Information</h3>
              
              <div className="space-y-6">
                <div className="flex items-center space-x-6">
                  <div className="w-20 h-20 bg-gradient-to-br from-orangeNeon to-orangeGlow rounded-full flex items-center justify-center">
                    <User className="w-8 h-8 text-background" />
                  </div>
                  <div>
                    <h4 className="text-lg font-medium text-textPrimary">Trader_Pro</h4>
                    <p className="text-textSecondary">Member since January 2024</p>
                    <Badge className="bg-success/20 text-success border-success/30 mt-2">
                      Verified Trader
                    </Badge>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <Label className="text-textPrimary mb-2 block">Username</Label>
                    <Input 
                      defaultValue="Trader_Pro" 
                      className="input-field" 
                      disabled 
                    />
                    <p className="text-xs text-textSecondary mt-1">
                      Username cannot be changed
                    </p>
                  </div>

                  <div>
                    <Label className="text-textPrimary mb-2 block">Email</Label>
                    <Input 
                      defaultValue="trader@example.com" 
                      className="input-field"
                      type="email" 
                    />
                  </div>

                  <div>
                    <Label className="text-textPrimary mb-2 block">First Name</Label>
                    <Input 
                      defaultValue="John" 
                      className="input-field" 
                    />
                  </div>

                  <div>
                    <Label className="text-textPrimary mb-2 block">Last Name</Label>
                    <Input 
                      defaultValue="Doe" 
                      className="input-field" 
                    />
                  </div>

                  <div className="md:col-span-2">
                    <Label className="text-textPrimary mb-2 block">Bio (Optional)</Label>
                    <Input 
                      defaultValue="Experienced P2P trader with 500+ successful transactions" 
                      className="input-field" 
                      placeholder="Tell others about yourself..."
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button onClick={handleSaveProfile} className="btn-primary">
                    Save Changes
                  </Button>
                </div>
              </div>
            </Card>
          </TabsContent>

          {/* Notifications Tab */}
          <TabsContent value="notifications" className="space-y-6">
            <Card className="glass-card p-8">
              <h3 className="text-xl font-semibold text-textPrimary mb-6">Notification Preferences</h3>
              
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium text-textPrimary">Order Updates</h4>
                    <p className="text-sm text-textSecondary">
                      Get notified when your orders are accepted, completed, or disputed
                    </p>
                  </div>
                  <Switch
                    checked={notifications.orderUpdates}
                    onCheckedChange={(value) => handleNotificationChange('orderUpdates', value)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium text-textPrimary">Price Alerts</h4>
                    <p className="text-sm text-textSecondary">
                      Receive alerts when exchange rates reach your target levels
                    </p>
                  </div>
                  <Switch
                    checked={notifications.priceAlerts}
                    onCheckedChange={(value) => handleNotificationChange('priceAlerts', value)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium text-textPrimary">Newsletter</h4>
                    <p className="text-sm text-textSecondary">
                      Weekly updates on market trends and platform features
                    </p>
                  </div>
                  <Switch
                    checked={notifications.newsletter}
                    onCheckedChange={(value) => handleNotificationChange('newsletter', value)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium text-textPrimary">Security Alerts</h4>
                    <p className="text-sm text-textSecondary">
                      Important security notifications (recommended)
                    </p>
                  </div>
                  <Switch
                    checked={notifications.security}
                    onCheckedChange={(value) => handleNotificationChange('security', value)}
                  />
                </div>
              </div>
            </Card>
          </TabsContent>

          {/* Security Tab */}
          <TabsContent value="security" className="space-y-6">
            <Card className="glass-card p-8">
              <h3 className="text-xl font-semibold text-textPrimary mb-6">Security Checklist</h3>
              
              <div className="space-y-4">
                {securityChecklist.map((item, index) => {
                  const Icon = item.icon;
                  return (
                    <div key={index} className="flex items-center justify-between p-4 glass-card rounded-lg">
                      <div className="flex items-center space-x-3">
                        <Icon className={`w-5 h-5 ${
                          item.completed ? 'text-success' : 'text-warning'
                        }`} />
                        <span className={`font-medium ${
                          item.completed ? 'text-textPrimary' : 'text-textSecondary'
                        }`}>
                          {item.label}
                        </span>
                      </div>
                      
                      {item.completed ? (
                        <Badge className="bg-success/20 text-success border-success/30">
                          Complete
                        </Badge>
                      ) : (
                        <Button variant="outline" size="sm" className="btn-secondary">
                          Setup
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="mt-6 p-4 bg-orangeNeon/10 border border-orangeNeon/30 rounded-lg">
                <h4 className="font-medium text-textPrimary mb-2">Security Score: 60%</h4>
                <p className="text-sm text-textSecondary">
                  Complete the remaining items to improve your account security and unlock higher trading limits.
                </p>
              </div>
            </Card>

            {/* Wallet Connection */}
            <Card className="glass-card p-8">
              <h3 className="text-xl font-semibold text-textPrimary mb-6 flex items-center">
                <Wallet className="w-5 h-5 mr-2" />
                Wallet Connection
              </h3>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 glass-card rounded-lg">
                  <div>
                    <h4 className="font-medium text-textPrimary">MetaMask</h4>
                    <p className="text-sm text-textSecondary">0x1234...abcd</p>
                  </div>
                  <Badge className="bg-success/20 text-success border-success/30">
                    Connected
                  </Badge>
                </div>

                <Button variant="outline" className="w-full btn-secondary">
                  Connect Additional Wallet
                </Button>
              </div>
            </Card>
          </TabsContent>

          {/* Appearance Tab */}
          <TabsContent value="appearance" className="space-y-6">
            <Card className="glass-card p-8">
              <h3 className="text-xl font-semibold text-textPrimary mb-6">Theme & Appearance</h3>
              
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <Moon className="w-5 h-5 text-orangeNeon" />
                    <div>
                      <h4 className="font-medium text-textPrimary">Dark Mode</h4>
                      <p className="text-sm text-textSecondary">
                        Currently using dark theme (default)
                      </p>
                    </div>
                  </div>
                  <Switch checked={true} disabled />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <Globe className="w-5 h-5 text-orangeNeon" />
                    <div>
                      <h4 className="font-medium text-textPrimary">Language</h4>
                      <p className="text-sm text-textSecondary">
                        Select your preferred language
                      </p>
                    </div>
                  </div>
                  <Badge variant="secondary" className="bg-white/10">
                    English (US)
                  </Badge>
                </div>

                <div className="p-4 bg-orangeNeon/10 border border-orangeNeon/30 rounded-lg">
                  <p className="text-sm text-textPrimary">
                    <strong>Note:</strong> Orrange currently supports dark mode only. Light mode and additional languages will be available in future updates.
                  </p>
                </div>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </motion.div>
    </div>
  );
}