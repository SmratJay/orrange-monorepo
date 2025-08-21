import { PrismaClient } from '@prisma/client';
import { ethers } from 'ethers';

export class EscrowService {
  private prisma: PrismaClient;
  private provider: ethers.JsonRpcProvider;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    // Initialize with a default RPC provider - should be configured via env
    this.provider = new ethers.JsonRpcProvider(
      process.env.RPC_URL || 'https://rpc.ankr.com/eth'
    );
  }

  async createEscrow(tradeId: string, amount: string, cryptoAsset: string, chainId: number = 1) {
    try {
      // Create escrow record in database
      const escrow = await this.prisma.p2PEscrow.create({
        data: {
          tradeId,
          contractAddress: '', // Will be updated after deployment
          cryptoAsset,
          amount: amount,
          chainId,
          status: 'CREATED',
        },
      });

      return escrow;
    } catch (error) {
      console.error('Failed to create escrow:', error);
      throw new Error('Escrow creation failed');
    }
  }

  async fundEscrow(escrowId: string, txHash: string) {
    try {
      const escrow = await this.prisma.p2PEscrow.update({
        where: { id: escrowId },
        data: {
          fundTxHash: txHash,
          fundedAt: new Date(),
          status: 'FUNDED',
        },
      });

      return escrow;
    } catch (error) {
      console.error('Failed to fund escrow:', error);
      throw new Error('Escrow funding failed');
    }
  }

  async releaseEscrow(escrowId: string, txHash: string) {
    try {
      const escrow = await this.prisma.p2PEscrow.update({
        where: { id: escrowId },
        data: {
          releaseTxHash: txHash,
          releasedAt: new Date(),
          status: 'RELEASED',
        },
      });

      return escrow;
    } catch (error) {
      console.error('Failed to release escrow:', error);
      throw new Error('Escrow release failed');
    }
  }

  async refundEscrow(escrowId: string, txHash: string) {
    try {
      const escrow = await this.prisma.p2PEscrow.update({
        where: { id: escrowId },
        data: {
          refundTxHash: txHash,
          refundedAt: new Date(),
          status: 'REFUNDED',
        },
      });

      return escrow;
    } catch (error) {
      console.error('Failed to refund escrow:', error);
      throw new Error('Escrow refund failed');
    }
  }

  async getEscrowStatus(tradeId: string) {
    try {
      const escrow = await this.prisma.p2PEscrow.findUnique({
        where: { tradeId },
      });

      return escrow;
    } catch (error) {
      console.error('Failed to get escrow status:', error);
      throw new Error('Failed to retrieve escrow status');
    }
  }
}
