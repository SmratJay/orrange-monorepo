// Enhanced Dispute Management Service for Orrange P2P
import { PrismaClient, P2PDisputeReason, P2PDisputeStatus } from '@prisma/client';
import { NotificationService } from './NotificationService';
import { EventEmitter } from 'events';

export interface EvidenceSubmission {
  type: 'IMAGE' | 'DOCUMENT' | 'TEXT' | 'PAYMENT_PROOF';
  url?: string; // IPFS hash or secure storage URL
  description: string;
  submittedBy: string;
  submittedAt: Date;
}

export interface DisputeResolution {
  resolutionType: 'BUYER_FAVOR' | 'SELLER_FAVOR' | 'SPLIT' | 'CANCELLED';
  compensationAmount?: string;
  reasoning: string;
  resolvedBy: string;
}

export class EnhancedDisputeService extends EventEmitter {
  private prisma: PrismaClient;
  private notificationService: NotificationService;

  constructor(prisma: PrismaClient, notificationService: NotificationService) {
    super();
    this.prisma = prisma;
    this.notificationService = notificationService;
  }

  // Submit evidence for a dispute
  async submitEvidence(tradeId: string, userId: string, evidence: {
    type: 'IMAGE' | 'DOCUMENT' | 'TEXT' | 'PAYMENT_PROOF';
    url?: string;
    description: string;
  }) {
    const dispute = await this.prisma.p2PDispute.findFirst({
      where: { tradeId },
      include: { trade: true }
    });

    if (!dispute) {
      throw new Error('Dispute not found');
    }

    // Verify user is part of the trade
    if (userId !== dispute.trade.sellerId && userId !== dispute.trade.buyerId) {
      throw new Error('Unauthorized to submit evidence');
    }

    const evidenceEntry: EvidenceSubmission = {
      type: evidence.type,
      url: evidence.url,
      description: evidence.description,
      submittedBy: userId,
      submittedAt: new Date()
    };

    // Update dispute with new evidence
    const updatedDispute = await this.prisma.p2PDispute.update({
      where: { id: dispute.id },
      data: {
        evidence: {
          push: evidenceEntry
        },
        status: 'AWAITING_EVIDENCE' // Update status to reflect new evidence
      },
      include: {
        trade: true,
        initiator: true,
        arbitrator: true
      }
    });

    // Notify arbitrator of new evidence
    if (dispute.assignedTo) {
      await this.notificationService.sendArbitratorNotification(
        dispute.assignedTo,
        'NEW_EVIDENCE',
        `New evidence submitted for dispute ${dispute.id}`
      );
    }

    this.emit('evidenceSubmitted', { dispute: updatedDispute, evidence: evidenceEntry });
    return updatedDispute;
  }

  // Get comprehensive dispute details for moderators
  async getDisputeDetails(tradeId: string, moderatorId: string) {
    // Verify moderator role
    const moderator = await this.prisma.user.findUnique({
      where: { id: moderatorId }
    });

    if (!moderator || (moderator.role !== 'MODERATOR' && moderator.role !== 'ARBITRATOR' && moderator.role !== 'ADMIN')) {
      throw new Error('Insufficient permissions to view dispute details');
    }

    const dispute = await this.prisma.p2PDispute.findFirst({
      where: { tradeId },
      include: {
        trade: {
          include: {
            seller: {
              select: {
                id: true,
                p2pNickname: true,
                reputationScore: true,
                completedTrades: true,
                disputeRatio: true
              }
            },
            buyer: {
              select: {
                id: true,
                p2pNickname: true,
                reputationScore: true,
                completedTrades: true,
                disputeRatio: true
              }
            },
            chats: {
              orderBy: { createdAt: 'asc' },
              take: 50 // Latest 50 messages for context
            }
          }
        },
        initiator: {
          select: {
            id: true,
            p2pNickname: true,
            reputationScore: true,
            completedTrades: true
          }
        },
        arbitrator: {
          select: {
            id: true,
            p2pNickname: true
          }
        }
      }
    });

    return dispute;
  }

  // Escalate dispute to moderator
  async escalateToModerator(tradeId: string, escalatedBy: string) {
    const dispute = await this.prisma.p2PDispute.findFirst({
      where: { tradeId },
      include: { trade: true }
    });

    if (!dispute) {
      throw new Error('Dispute not found');
    }

    // Find available moderator (simple round-robin for now)
    const availableModerator = await this.prisma.user.findFirst({
      where: {
        role: { in: ['MODERATOR', 'ARBITRATOR'] },
        isActive: true
      },
      orderBy: { createdAt: 'asc' } // Simple assignment logic
    });

    if (!availableModerator) {
      throw new Error('No moderators available');
    }

    const updatedDispute = await this.prisma.p2PDispute.update({
      where: { id: dispute.id },
      data: {
        assignedTo: availableModerator.id,
        status: 'ARBITRATOR_ASSIGNED'
      },
      include: {
        trade: true,
        arbitrator: true
      }
    });

    // Notify assigned moderator
    await this.notificationService.sendArbitratorNotification(
      availableModerator.id,
      'DISPUTE_ASSIGNED',
      `New dispute assigned: Trade ${tradeId}`
    );

    this.emit('disputeEscalated', { dispute: updatedDispute, moderator: availableModerator });
    return updatedDispute;
  }

  // Resolve dispute (moderator action)
  async resolveDispute(disputeId: string, moderatorId: string, resolution: DisputeResolution) {
    // Verify moderator permissions
    const moderator = await this.prisma.user.findUnique({
      where: { id: moderatorId }
    });

    if (!moderator || (moderator.role !== 'MODERATOR' && moderator.role !== 'ARBITRATOR' && moderator.role !== 'ADMIN')) {
      throw new Error('Insufficient permissions to resolve dispute');
    }

    const dispute = await this.prisma.p2PDispute.findUnique({
      where: { id: disputeId },
      include: { 
        trade: {
          include: {
            seller: true,
            buyer: true
          }
        }
      }
    });

    if (!dispute) {
      throw new Error('Dispute not found');
    }

    // Update dispute with resolution
    const resolvedDispute = await this.prisma.p2PDispute.update({
      where: { id: disputeId },
      data: {
        status: 'RESOLVED',
        resolution: resolution.reasoning,
        resolutionType: resolution.resolutionType,
        compensationAmount: resolution.compensationAmount,
        resolvedAt: new Date()
      },
      include: {
        trade: {
          include: {
            seller: true,
            buyer: true
          }
        }
      }
    });

    // Update trade status based on resolution
    let newTradeStatus: any = 'DISPUTED';
    if (resolution.resolutionType === 'BUYER_FAVOR') {
      newTradeStatus = 'COMPLETED'; // Release to buyer
    } else if (resolution.resolutionType === 'SELLER_FAVOR') {
      newTradeStatus = 'CANCELLED'; // Refund to seller
    }

    await this.prisma.p2PTrade.update({
      where: { id: dispute.tradeId },
      data: { status: newTradeStatus }
    });

    // Notify both parties
    await this.notificationService.sendDisputeResolvedNotification(
      dispute.trade.sellerId,
      disputeId,
      resolution
    );
    await this.notificationService.sendDisputeResolvedNotification(
      dispute.trade.buyerId,
      disputeId,
      resolution
    );

    this.emit('disputeResolved', { dispute: resolvedDispute, resolution });
    return resolvedDispute;
  }

  // Get all disputes for admin dashboard
  async getDisputesDashboard(filters: {
    status?: P2PDisputeStatus;
    assignedTo?: string;
    page?: number;
    limit?: number;
  } = {}) {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (filters.status) where.status = filters.status;
    if (filters.assignedTo) where.assignedTo = filters.assignedTo;

    const disputes = await this.prisma.p2PDispute.findMany({
      where,
      include: {
        trade: {
          include: {
            seller: { select: { id: true, p2pNickname: true } },
            buyer: { select: { id: true, p2pNickname: true } }
          }
        },
        initiator: { select: { id: true, p2pNickname: true } },
        arbitrator: { select: { id: true, p2pNickname: true } }
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit
    });

    const total = await this.prisma.p2PDispute.count({ where });

    return {
      disputes,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }
}

  async createDispute(data: {
    orderId: string;
    complainantId: string;
    defendantId: string;
    reason: string;
    description: string;
  }): Promise<Dispute> {
    try {
      // TODO: Implement actual dispute creation in database
      const dispute: Dispute = {
        id: `dispute_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        orderId: data.orderId,
        complainantId: data.complainantId,
        defendantId: data.defendantId,
        reason: data.reason,
        description: data.description,
        status: 'PENDING',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Send notifications
      await this.notificationService.sendDisputeCreatedNotification(
        data.complainantId,
        dispute.id
      );

      await this.notificationService.sendNotification({
        type: 'DISPUTE_CREATED',
        title: 'Dispute Filed Against You',
        message: `A dispute has been filed for order ${data.orderId}`,
        userId: data.defendantId,
        metadata: { disputeId: dispute.id, orderId: data.orderId }
      });

      console.log(`⚠️ Dispute created: ${dispute.id} for order ${data.orderId}`);
      return dispute;

    } catch (error) {
      console.error('Error creating dispute:', error);
      throw new Error('Failed to create dispute');
    }
  }

  async getDispute(disputeId: string): Promise<Dispute | null> {
    try {
      // TODO: Implement actual dispute fetching
      return null;

    } catch (error) {
      console.error('Error getting dispute:', error);
      return null;
    }
  }

  async getUserDisputes(userId: string): Promise<Dispute[]> {
    try {
      // TODO: Implement actual user disputes fetching
      return [];

    } catch (error) {
      console.error('Error getting user disputes:', error);
      return [];
    }
  }

  async updateDisputeStatus(
    disputeId: string, 
    status: Dispute['status'], 
    updatedBy: string
  ): Promise<boolean> {
    try {
      // TODO: Implement actual dispute status update
      console.log(`📝 Dispute ${disputeId} status updated to ${status} by ${updatedBy}`);
      return true;

    } catch (error) {
      console.error('Error updating dispute status:', error);
      return false;
    }
  }

  async resolveDispute(
    disputeId: string,
    resolution: string,
    resolvedBy: string
  ): Promise<boolean> {
    try {
      // TODO: Implement actual dispute resolution
      const success = await this.updateDisputeStatus(disputeId, 'RESOLVED', resolvedBy);
      
      if (success) {
        // TODO: Get dispute details and send notifications
        console.log(`⚖️ Dispute ${disputeId} resolved: ${resolution}`);
      }

      return success;

    } catch (error) {
      console.error('Error resolving dispute:', error);
      return false;
    }
  }

  async addDisputeMessage(
    disputeId: string,
    userId: string,
    message: string
  ): Promise<boolean> {
    try {
      // TODO: Implement actual dispute message addition
      console.log(`💬 Message added to dispute ${disputeId} by ${userId}`);
      return true;

    } catch (error) {
      console.error('Error adding dispute message:', error);
      return false;
    }
  }

  async getDisputeMessages(disputeId: string): Promise<any[]> {
    try {
      // TODO: Implement actual dispute messages fetching
      return [];

    } catch (error) {
      console.error('Error getting dispute messages:', error);
      return [];
    }
  }

  async escalateDispute(disputeId: string, escalatedBy: string): Promise<boolean> {
    try {
      // TODO: Implement actual dispute escalation
      await this.updateDisputeStatus(disputeId, 'INVESTIGATING', escalatedBy);
      console.log(`📈 Dispute ${disputeId} escalated by ${escalatedBy}`);
      return true;

    } catch (error) {
      console.error('Error escalating dispute:', error);
      return false;
    }
  }

  async getDisputeStatistics(): Promise<any> {
    try {
      // TODO: Implement actual dispute statistics
      return {
        total: 0,
        pending: 0,
        investigating: 0,
        resolved: 0,
        cancelled: 0,
        averageResolutionTime: '0 days'
      };

    } catch (error) {
      console.error('Error getting dispute statistics:', error);
      return {
        total: 0,
        pending: 0,
        investigating: 0,
        resolved: 0,
        cancelled: 0,
        averageResolutionTime: '0 days'
      };
    }
  }
}
