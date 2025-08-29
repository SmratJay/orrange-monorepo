'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { 
  HelpCircle, 
  MessageSquare, 
  CheckCircle2, 
  AlertCircle,
  Clock,
  Mail,
  Send
} from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

const faqItems = [
  {
    question: 'How does P2P trading work on Orrange?',
    answer: 'Orrange connects buyers and sellers directly. You can create orders or browse existing ones, agree on terms, and complete trades with verified merchants. All funds are held in escrow for security.',
  },
  {
    question: 'What payment methods are supported?',
    answer: 'We support PayPal, Cash App, UPI, SEPA transfers, Wire transfers, and various local payment methods. The available methods depend on your region and the merchant you\'re trading with.',
  },
  {
    question: 'How are my funds protected?',
    answer: 'All trades use our escrow system. Funds are locked until both parties confirm the transaction is complete. We also have dispute resolution processes and verified merchant ratings.',
  },
  {
    question: 'What are the trading fees?',
    answer: 'Orrange charges a small platform fee (typically 0.5-2%) depending on the payment method. This fee is clearly shown before you confirm any trade.',
  },
  {
    question: 'How long do transactions take?',
    answer: 'Transaction times vary by payment method: UPI (5-15 mins), PayPal (1-3 hours), SEPA (1-2 days), Wire transfers (2-5 days). Most digital payments are processed within an hour.',
  },
  {
    question: 'Can I cancel an order?',
    answer: 'You can cancel orders that haven\'t been accepted yet. Once a merchant accepts your order, you\'ll need to contact support or work with the merchant to resolve any issues.',
  },
  {
    question: 'How do I become a verified merchant?',
    answer: 'To become a merchant, complete identity verification, connect your payment methods, and maintain good trading history. Verified merchants get priority visibility and can set their own rates.',
  },
  {
    question: 'What if there\'s a dispute?',
    answer: 'If there\'s a problem with your trade, you can open a dispute through the order page. Our support team will investigate and help resolve the issue fairly.',
  },
];

interface ContactForm {
  name: string;
  email: string;
  subject: string;
  message: string;
}

export default function SupportPage() {
  const [submitting, setSubmitting] = useState(false);
  
  const { register, handleSubmit, reset, formState: { errors } } = useForm<ContactForm>();

  const onSubmit = async (data: ContactForm) => {
    setSubmitting(true);
    
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    toast.success('Support ticket created successfully!');
    reset();
    setSubmitting(false);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h1 className="text-3xl font-bold text-textPrimary mb-2">Support Center</h1>
        <p className="text-textSecondary">
          Get help with your P2P trading questions and issues.
        </p>
      </motion.div>

      {/* System Status */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        <Card className="glass-card p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-3 h-3 bg-success rounded-full animate-pulse-glow"></div>
              <div>
                <h3 className="text-lg font-semibold text-textPrimary">System Status</h3>
                <p className="text-textSecondary">All systems operational</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-success">99.9%</div>
                <div className="text-xs text-textSecondary">Uptime</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-textPrimary">2.1s</div>
                <div className="text-xs text-textSecondary">Avg Response</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-orangeNeon">0</div>
                <div className="text-xs text-textSecondary">Active Issues</div>
              </div>
            </div>
          </div>
        </Card>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* FAQ Section */}
        <motion.div 
          className="lg:col-span-2"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <Card className="glass-card p-8">
            <h2 className="text-2xl font-bold text-textPrimary mb-6 flex items-center">
              <HelpCircle className="w-6 h-6 mr-2 text-orangeNeon" />
              Frequently Asked Questions
            </h2>

            <Accordion type="single" collapsible className="space-y-2">
              {faqItems.map((item, index) => (
                <AccordionItem 
                  key={index} 
                  value={`item-${index}`}
                  className="glass-card rounded-lg px-4"
                >
                  <AccordionTrigger className="text-left text-textPrimary hover:text-orangeNeon transition-colors duration-300">
                    {item.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-textSecondary leading-relaxed">
                    {item.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </Card>
        </motion.div>

        {/* Contact Form */}
        <motion.div 
          className="space-y-6"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <Card className="glass-card p-6">
            <h3 className="text-xl font-semibold text-textPrimary mb-6 flex items-center">
              <MessageSquare className="w-5 h-5 mr-2 text-orangeNeon" />
              Contact Support
            </h3>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <Label className="text-textPrimary mb-2 block">Name</Label>
                <Input
                  {...register('name', { required: 'Name is required' })}
                  placeholder="Your full name"
                  className="input-field"
                />
                {errors.name && (
                  <p className="text-danger text-sm mt-1">{errors.name.message}</p>
                )}
              </div>

              <div>
                <Label className="text-textPrimary mb-2 block">Email</Label>
                <Input
                  {...register('email', { 
                    required: 'Email is required',
                    pattern: {
                      value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                      message: 'Invalid email address'
                    }
                  })}
                  type="email"
                  placeholder="your@email.com"
                  className="input-field"
                />
                {errors.email && (
                  <p className="text-danger text-sm mt-1">{errors.email.message}</p>
                )}
              </div>

              <div>
                <Label className="text-textPrimary mb-2 block">Subject</Label>
                <Input
                  {...register('subject', { required: 'Subject is required' })}
                  placeholder="What do you need help with?"
                  className="input-field"
                />
                {errors.subject && (
                  <p className="text-danger text-sm mt-1">{errors.subject.message}</p>
                )}
              </div>

              <div>
                <Label className="text-textPrimary mb-2 block">Message</Label>
                <Textarea
                  {...register('message', { required: 'Message is required' })}
                  placeholder="Describe your issue in detail..."
                  className="input-field min-h-32 resize-none"
                />
                {errors.message && (
                  <p className="text-danger text-sm mt-1">{errors.message.message}</p>
                )}
              </div>

              <Button 
                type="submit" 
                disabled={submitting} 
                className="w-full btn-primary"
              >
                {submitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-background border-t-transparent rounded-full animate-spin mr-2" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Send Message
                  </>
                )}
              </Button>
            </form>

            <div className="mt-6 p-4 bg-orangeNeon/10 border border-orangeNeon/30 rounded-lg">
              <p className="text-sm text-textPrimary">
                <strong>Response Time:</strong> We typically respond within 4-6 hours during business hours.
              </p>
            </div>
          </Card>

          {/* Quick Actions */}
          <Card className="glass-card p-6">
            <h3 className="text-lg font-semibold text-textPrimary mb-4">Quick Actions</h3>
            
            <div className="space-y-3">
              <Button variant="outline" className="w-full btn-secondary justify-start">
                <Mail className="w-4 h-4 mr-2" />
                Email: support@orrange.com
              </Button>
              
              <Button variant="outline" className="w-full btn-secondary justify-start">
                <MessageSquare className="w-4 h-4 mr-2" />
                Live Chat (Coming Soon)
              </Button>
              
              <Button variant="outline" className="w-full btn-secondary justify-start">
                <Clock className="w-4 h-4 mr-2" />
                Check Ticket Status
              </Button>
            </div>
          </Card>

          {/* Response Time Info */}
          <Card className="glass-card p-6">
            <h3 className="text-lg font-semibold text-textPrimary mb-4">Support Hours</h3>
            
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-textSecondary">Email Support</span>
                <Badge className="bg-success/20 text-success border-success/30">
                  24/7
                </Badge>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-textSecondary">Live Chat</span>
                <Badge variant="secondary" className="bg-white/10">
                  Coming Soon
                </Badge>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-textSecondary">Phone Support</span>
                <Badge className="bg-warning/20 text-warning border-warning/30">
                  VIP Only
                </Badge>
              </div>
            </div>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}