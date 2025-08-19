'use client';

import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { FileText, Shield, Calendar } from 'lucide-react';
import { motion } from 'framer-motion';

export default function LegalPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h1 className="text-3xl font-bold text-textPrimary mb-2">Legal Information</h1>
        <p className="text-textSecondary">
          Our terms of service and privacy policy.
        </p>
      </motion.div>

      {/* Legal Tabs */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        <Tabs defaultValue="terms" className="space-y-6">
          <TabsList className="glass-card p-1">
            <TabsTrigger value="terms" className="data-[state=active]:bg-orangeNeon/20 data-[state=active]:text-orangeNeon">
              <FileText className="w-4 h-4 mr-2" />
              Terms of Service
            </TabsTrigger>
            <TabsTrigger value="privacy" className="data-[state=active]:bg-orangeNeon/20 data-[state=active]:text-orangeNeon">
              <Shield className="w-4 h-4 mr-2" />
              Privacy Policy
            </TabsTrigger>
          </TabsList>

          {/* Terms of Service */}
          <TabsContent value="terms" className="space-y-6">
            <Card className="glass-card p-8">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-textPrimary">Terms of Service</h2>
                <Badge className="bg-orangeNeon/20 text-orangeNeon border-orangeNeon/30">
                  <Calendar className="w-3 h-3 mr-1" />
                  Updated: Jan 15, 2024
                </Badge>
              </div>

              <div className="prose prose-invert max-w-none space-y-6">
                <section>
                  <h3 className="text-xl font-semibold text-textPrimary mb-3">1. Agreement to Terms</h3>
                  <p className="text-textSecondary leading-relaxed">
                    By accessing and using Orrange ("the Service"), you accept and agree to be bound by the terms and provision of this agreement. If you do not agree to abide by the above, please do not use this service.
                  </p>
                </section>

                <section>
                  <h3 className="text-xl font-semibold text-textPrimary mb-3">2. Description of Service</h3>
                  <p className="text-textSecondary leading-relaxed">
                    Orrange is a peer-to-peer trading platform that allows users to trade stablecoins for fiat currencies through various payment methods. We provide the technology infrastructure to facilitate these trades but do not act as a financial institution or money transmitter.
                  </p>
                </section>

                <section>
                  <h3 className="text-xl font-semibold text-textPrimary mb-3">3. User Responsibilities</h3>
                  <div className="text-textSecondary leading-relaxed space-y-2">
                    <p>Users are responsible for:</p>
                    <ul className="list-disc list-inside space-y-1 ml-4">
                      <li>Providing accurate and truthful information</li>
                      <li>Complying with all applicable laws and regulations</li>
                      <li>Maintaining the security of their account credentials</li>
                      <li>Reporting suspicious activity or security breaches</li>
                      <li>Paying all applicable fees and taxes</li>
                    </ul>
                  </div>
                </section>

                <section>
                  <h3 className="text-xl font-semibold text-textPrimary mb-3">4. Trading Rules</h3>
                  <div className="text-textSecondary leading-relaxed space-y-2">
                    <p>All trades on the platform must adhere to the following rules:</p>
                    <ul className="list-disc list-inside space-y-1 ml-4">
                      <li>Complete transactions within agreed timeframes</li>
                      <li>Use only verified payment methods</li>
                      <li>Communicate respectfully with trading partners</li>
                      <li>Report disputes through proper channels</li>
                      <li>Honor agreed-upon exchange rates and terms</li>
                    </ul>
                  </div>
                </section>

                <section>
                  <h3 className="text-xl font-semibold text-textPrimary mb-3">5. Fees and Payments</h3>
                  <p className="text-textSecondary leading-relaxed">
                    Orrange charges platform fees for successful trades, typically ranging from 0.5% to 2% depending on the payment method used. All fees are clearly displayed before trade confirmation. Users are responsible for any additional fees charged by their payment providers.
                  </p>
                </section>

                <section>
                  <h3 className="text-xl font-semibold text-textPrimary mb-3">6. Risk Disclosure</h3>
                  <p className="text-textSecondary leading-relaxed">
                    Cryptocurrency trading involves substantial risk of loss. Users should only trade with funds they can afford to lose. Orrange does not guarantee profits or protection against losses. Market volatility, regulatory changes, and technical issues may affect trading outcomes.
                  </p>
                </section>

                <section>
                  <h3 className="text-xl font-semibold text-textPrimary mb-3">7. Limitation of Liability</h3>
                  <p className="text-textSecondary leading-relaxed">
                    Orrange provides the platform "as is" without warranties of any kind. We are not liable for any direct, indirect, incidental, or consequential damages arising from the use of our service, including but not limited to financial losses, technical failures, or security breaches.
                  </p>
                </section>

                <section>
                  <h3 className="text-xl font-semibold text-textPrimary mb-3">8. Termination</h3>
                  <p className="text-textSecondary leading-relaxed">
                    Either party may terminate this agreement at any time. Upon termination, users retain access to their funds but may not initiate new trades. Orrange reserves the right to suspend or terminate accounts that violate these terms or engage in fraudulent activity.
                  </p>
                </section>

                <section>
                  <h3 className="text-xl font-semibold text-textPrimary mb-3">9. Changes to Terms</h3>
                  <p className="text-textSecondary leading-relaxed">
                    Orrange reserves the right to modify these terms at any time. Users will be notified of significant changes via email or platform notification. Continued use of the service after changes constitutes acceptance of the new terms.
                  </p>
                </section>

                <section>
                  <h3 className="text-xl font-semibold text-textPrimary mb-3">10. Contact Information</h3>
                  <p className="text-textSecondary leading-relaxed">
                    For questions about these terms, please contact us at legal@orrange.com or through our support center.
                  </p>
                </section>
              </div>
            </Card>
          </TabsContent>

          {/* Privacy Policy */}
          <TabsContent value="privacy" className="space-y-6">
            <Card className="glass-card p-8">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-textPrimary">Privacy Policy</h2>
                <Badge className="bg-orangeNeon/20 text-orangeNeon border-orangeNeon/30">
                  <Calendar className="w-3 h-3 mr-1" />
                  Updated: Jan 15, 2024
                </Badge>
              </div>

              <div className="prose prose-invert max-w-none space-y-6">
                <section>
                  <h3 className="text-xl font-semibold text-textPrimary mb-3">1. Information We Collect</h3>
                  <div className="text-textSecondary leading-relaxed space-y-2">
                    <p>We collect information you provide directly to us, such as:</p>
                    <ul className="list-disc list-inside space-y-1 ml-4">
                      <li>Account registration information (name, email, phone)</li>
                      <li>Identity verification documents</li>
                      <li>Payment method information</li>
                      <li>Trading history and transaction data</li>
                      <li>Communications with our support team</li>
                    </ul>
                  </div>
                </section>

                <section>
                  <h3 className="text-xl font-semibold text-textPrimary mb-3">2. How We Use Your Information</h3>
                  <div className="text-textSecondary leading-relaxed space-y-2">
                    <p>We use the collected information to:</p>
                    <ul className="list-disc list-inside space-y-1 ml-4">
                      <li>Provide and maintain our trading platform</li>
                      <li>Process and facilitate trades</li>
                      <li>Verify user identity and prevent fraud</li>
                      <li>Comply with legal and regulatory requirements</li>
                      <li>Send important service notifications</li>
                      <li>Improve our services and user experience</li>
                    </ul>
                  </div>
                </section>

                <section>
                  <h3 className="text-xl font-semibold text-textPrimary mb-3">3. Information Sharing</h3>
                  <p className="text-textSecondary leading-relaxed">
                    We do not sell or rent your personal information to third parties. We may share your information in the following circumstances: with service providers who help us operate our platform, when required by law or to comply with legal processes, to protect our rights and prevent fraud, or with your explicit consent.
                  </p>
                </section>

                <section>
                  <h3 className="text-xl font-semibold text-textPrimary mb-3">4. Data Security</h3>
                  <p className="text-textSecondary leading-relaxed">
                    We implement industry-standard security measures to protect your information, including encryption, secure servers, multi-factor authentication, and regular security audits. However, no method of transmission over the internet is 100% secure, and we cannot guarantee absolute security.
                  </p>
                </section>

                <section>
                  <h3 className="text-xl font-semibold text-textPrimary mb-3">5. Data Retention</h3>
                  <p className="text-textSecondary leading-relaxed">
                    We retain your information for as long as necessary to provide our services, comply with legal obligations, resolve disputes, and enforce our agreements. Account information is typically retained for 7 years after account closure for regulatory compliance purposes.
                  </p>
                </section>

                <section>
                  <h3 className="text-xl font-semibold text-textPrimary mb-3">6. Your Rights</h3>
                  <div className="text-textSecondary leading-relaxed space-y-2">
                    <p>You have the right to:</p>
                    <ul className="list-disc list-inside space-y-1 ml-4">
                      <li>Access and review your personal information</li>
                      <li>Correct inaccurate or incomplete data</li>
                      <li>Request deletion of your data (subject to legal requirements)</li>
                      <li>Opt out of non-essential communications</li>
                      <li>Request data portability</li>
                    </ul>
                  </div>
                </section>

                <section>
                  <h3 className="text-xl font-semibold text-textPrimary mb-3">7. Cookies and Tracking</h3>
                  <p className="text-textSecondary leading-relaxed">
                    We use cookies and similar technologies to enhance user experience, analyze usage patterns, and provide personalized content. You can control cookie settings through your browser, but some features may not function properly if cookies are disabled.
                  </p>
                </section>

                <section>
                  <h3 className="text-xl font-semibold text-textPrimary mb-3">8. International Transfers</h3>
                  <p className="text-textSecondary leading-relaxed">
                    Your information may be transferred to and processed in countries other than your own. We ensure appropriate safeguards are in place to protect your information in accordance with applicable privacy laws and this policy.
                  </p>
                </section>

                <section>
                  <h3 className="text-xl font-semibold text-textPrimary mb-3">9. Children's Privacy</h3>
                  <p className="text-textSecondary leading-relaxed">
                    Our service is not intended for individuals under 18 years of age. We do not knowingly collect personal information from children. If we become aware that we have collected information from a child, we will take steps to delete it promptly.
                  </p>
                </section>

                <section>
                  <h3 className="text-xl font-semibold text-textPrimary mb-3">10. Contact Us</h3>
                  <p className="text-textSecondary leading-relaxed">
                    If you have questions about this privacy policy or our data practices, please contact us at privacy@orrange.com or through our support center. We will respond to your inquiries within 30 days.
                  </p>
                </section>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </motion.div>
    </div>
  );
}