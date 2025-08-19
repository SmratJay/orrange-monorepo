// Notification Service for Orrange P2P API
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

export interface NotificationData {
  type: 'ORDER_MATCHED' | 'TRADE_COMPLETED' | 'PAYMENT_RECEIVED' | 'DISPUTE_CREATED';
  title: string;
  message: string;
  userId: string;
  metadata?: Record<string, any>;
}

export class NotificationService {
  private prisma: PrismaClient;
  private redis: Redis;

  constructor(prisma: PrismaClient, redis: Redis) {
    this.prisma = prisma;
    this.redis = redis;
  }

  async sendNotification(notification: NotificationData): Promise<void> {
    try {
      // Store notification in Redis for real-time delivery
      await this.redis.lpush(
        `notifications:${notification.userId}`,
        JSON.stringify({
          ...notification,
          timestamp: new Date().toISOString(),
          read: false
        })
      );

      // Keep only last 100 notifications per user
      await this.redis.ltrim(`notifications:${notification.userId}`, 0, 99);

      // TODO: Send push notification, email, etc.
      console.log(`📧 Notification sent to ${notification.userId}: ${notification.title}`);

    } catch (error) {
      console.error('Error sending notification:', error);
    }
  }

  async getNotifications(userId: string, limit: number = 50): Promise<any[]> {
    try {
      const notifications = await this.redis.lrange(
        `notifications:${userId}`,
        0,
        limit - 1
      );

      return notifications.map(n => JSON.parse(n));
    } catch (error) {
      console.error('Error getting notifications:', error);
      return [];
    }
  }

  async markAsRead(userId: string, notificationIndex: number): Promise<void> {
    try {
      const notification = await this.redis.lindex(
        `notifications:${userId}`,
        notificationIndex
      );

      if (notification) {
        const parsed = JSON.parse(notification);
        parsed.read = true;

        await this.redis.lset(
          `notifications:${userId}`,
          notificationIndex,
          JSON.stringify(parsed)
        );
      }
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  }

  async sendOrderMatchedNotification(userId: string, orderId: string, matchedAmount: number): Promise<void> {
    await this.sendNotification({
      type: 'ORDER_MATCHED',
      title: 'Order Matched!',
      message: `Your order has been matched for ${matchedAmount} tokens`,
      userId,
      metadata: { orderId, matchedAmount }
    });
  }

  async sendTradeCompletedNotification(userId: string, tradeId: string, amount: number): Promise<void> {
    await this.sendNotification({
      type: 'TRADE_COMPLETED',
      title: 'Trade Completed',
      message: `Trade completed successfully for ${amount} tokens`,
      userId,
      metadata: { tradeId, amount }
    });
  }

  async sendDisputeCreatedNotification(userId: string, disputeId: string): Promise<void> {
    await this.sendNotification({
      type: 'DISPUTE_CREATED',
      title: 'Dispute Created',
      message: 'A new dispute has been created for your order',
      userId,
      metadata: { disputeId }
    });
  }
}
