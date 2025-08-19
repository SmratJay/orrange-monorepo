// Order management routes for Orrange P2P API
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { nanoid } from 'nanoid';
import Decimal from 'decimal.js';

const prisma = new PrismaClient();

// Request interfaces
interface CreateOrderRequest {
  Body: {
    orderType: 'MARKET' | 'LIMIT';
    side: 'BUY' | 'SELL';
    asset: string;
    fiatCurrency: string;
    amount: string;
    price: string;
    paymentMethods: string[];
    minTradeAmount?: string;
    expiresAt?: string;
  };
}

interface UpdateOrderRequest {
  Params: {
    id: string;
  };
  Body: {
    price?: string;
    amount?: string;
    paymentMethods?: string[];
    status?: 'ACTIVE' | 'CANCELLED';
  };
}

interface GetOrdersRequest {
  Querystring: {
    asset?: string;
    fiatCurrency?: string;
    side?: 'BUY' | 'SELL';
    status?: string;
    limit?: number;
    offset?: number;
    sortBy?: 'price' | 'createdAt' | 'amount';
    sortOrder?: 'asc' | 'desc';
  };
}

async function orderRoutes(fastify: FastifyInstance) {
  
  // POST /orders - Create new order
  fastify.post<CreateOrderRequest>('/', {
    schema: {
      tags: ['Orders'],
      description: 'Create a new trading order',
      body: {
        type: 'object',
        required: ['orderType', 'side', 'asset', 'fiatCurrency', 'amount', 'price', 'paymentMethods'],
        properties: {
          orderType: { type: 'string', enum: ['MARKET', 'LIMIT'] },
          side: { type: 'string', enum: ['BUY', 'SELL'] },
          asset: { type: 'string' },
          fiatCurrency: { type: 'string' },
          amount: { type: 'string' },
          price: { type: 'string' },
          paymentMethods: { 
            type: 'array', 
            items: { type: 'string' },
            minItems: 1,
          },
          minTradeAmount: { type: 'string' },
          expiresAt: { type: 'string', format: 'date-time' },
        },
      },
    },
    preHandler: [(fastify as any).authenticate, (fastify as any).validateOrderLimits],
  }, async (request: FastifyRequest<CreateOrderRequest>, reply: FastifyReply) => {
    try {
      const user = (request as any).user;
      const orderData = request.body;

      // Validate amounts
      const amount = new Decimal(orderData.amount);
      const price = new Decimal(orderData.price);
      const totalValue = amount.mul(price);

      // Validate minimum amounts
      if (amount.lte(0) || price.lte(0)) {
        return reply.code(400).send({
          error: 'Amount and price must be greater than 0',
        });
      }

      // Generate order hash and nonce
      const nonce = Date.now();
      const orderHash = nanoid(32);

      // Create order
      const order = await prisma.order.create({
        data: {
          id: nanoid(),
          orderType: orderData.orderType,
          side: orderData.side,
          asset: orderData.asset.toUpperCase(),
          fiatCurrency: orderData.fiatCurrency.toUpperCase(),
          amount: amount.toString(),
          price: price.toString(),
          totalValue: totalValue.toString(),
          minTradeAmount: orderData.minTradeAmount || amount.toString(),
          paymentMethods: orderData.paymentMethods,
          orderHash,
          signature: '', // TODO: Implement signature verification
          nonce: BigInt(nonce),
          deadline: orderData.expiresAt ? new Date(orderData.expiresAt) : new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h default
          status: 'PENDING',
          creatorId: user.id,
          expiresAt: orderData.expiresAt ? new Date(orderData.expiresAt) : undefined,
        },
        include: {
          creator: {
            select: {
              id: true,
              walletAddress: true,
              reputationScore: true,
              tradeCount: true,
            },
          },
        },
      });

      // Publish to Redis for real-time updates
      try {
        await (fastify as any).redis.publish(
          `orderbook:${orderData.asset.toUpperCase()}-${orderData.fiatCurrency.toUpperCase()}`,
          JSON.stringify({
            type: 'order_created',
            order,
            timestamp: Date.now(),
          })
        );
      } catch (redisError) {
        fastify.log.warn('Failed to publish order to Redis:', redisError);
      }

      return {
        success: true,
        data: order,
      };

    } catch (error) {
      fastify.log.error('Create order error:', error);
      return reply.code(500).send({
        error: 'Failed to create order',
      });
    }
  });

  // GET /orders - Get orders with filtering
  fastify.get<GetOrdersRequest>('/', {
    schema: {
      tags: ['Orders'],
      description: 'Get orders with optional filtering',
      querystring: {
        type: 'object',
        properties: {
          asset: { type: 'string' },
          fiatCurrency: { type: 'string' },
          side: { type: 'string', enum: ['BUY', 'SELL'] },
          status: { type: 'string' },
          limit: { type: 'number', minimum: 1, maximum: 100, default: 20 },
          offset: { type: 'number', minimum: 0, default: 0 },
          sortBy: { type: 'string', enum: ['price', 'createdAt', 'amount'], default: 'createdAt' },
          sortOrder: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
        },
      },
    },
  }, async (request: FastifyRequest<GetOrdersRequest>, reply: FastifyReply) => {
    try {
      const {
        asset,
        fiatCurrency,
        side,
        status,
        limit = 20,
        offset = 0,
        sortBy = 'createdAt',
        sortOrder = 'desc',
      } = request.query;

      // Build where clause
      const where: any = {
        status: status || { in: ['ACTIVE', 'PARTIAL'] },
      };

      if (asset) where.asset = asset.toUpperCase();
      if (fiatCurrency) where.fiatCurrency = fiatCurrency.toUpperCase();
      if (side) where.side = side;

      // Get orders with pagination
      const orders = await prisma.order.findMany({
        where,
        include: {
          creator: {
            select: {
              id: true,
              walletAddress: true,
              reputationScore: true,
              tradeCount: true,
            },
          },
        },
        orderBy: {
          [sortBy]: sortOrder,
        },
        take: limit,
        skip: offset,
      });

      // Get total count for pagination
      const totalCount = await prisma.order.count({ where });

      return {
        success: true,
        data: {
          orders,
          pagination: {
            total: totalCount,
            limit,
            offset,
            hasMore: offset + limit < totalCount,
          },
        },
      };

    } catch (error) {
      fastify.log.error('Get orders error:', error);
      return reply.code(500).send({
        error: 'Failed to get orders',
      });
    }
  });

  // GET /orders/book/:pair - Get order book
  fastify.get<{ Params: { pair: string } }>('/book/:pair', {
    schema: {
      tags: ['Orders'],
      description: 'Get order book for a trading pair',
      params: {
        type: 'object',
        required: ['pair'],
        properties: {
          pair: { type: 'string' },
        },
      },
    },
  }, async (request: FastifyRequest<{ Params: { pair: string } }>, reply: FastifyReply) => {
    try {
      const pair = request.params.pair.toUpperCase();
      const [asset, fiatCurrency] = pair.split('-');

      if (!asset || !fiatCurrency) {
        return reply.code(400).send({
          error: 'Invalid trading pair format. Use ASSET-FIAT (e.g., BTC-USD)',
        });
      }

      // Get buy orders (highest price first)
      const buyOrders = await prisma.order.findMany({
        where: {
          asset,
          fiatCurrency,
          side: 'BUY',
          status: { in: ['ACTIVE', 'PARTIAL'] },
        },
        include: {
          creator: {
            select: {
              reputationScore: true,
              tradeCount: true,
            },
          },
        },
        orderBy: {
          price: 'desc',
        },
        take: 50, // Limit order book depth
      });

      // Get sell orders (lowest price first)
      const sellOrders = await prisma.order.findMany({
        where: {
          asset,
          fiatCurrency,
          side: 'SELL',
          status: { in: ['ACTIVE', 'PARTIAL'] },
        },
        include: {
          creator: {
            select: {
              reputationScore: true,
              tradeCount: true,
            },
          },
        },
        orderBy: {
          price: 'asc',
        },
        take: 50,
      });

      // Calculate market stats
      const lastTrade = await prisma.trade.findFirst({
        where: {
          asset,
          fiatCurrency,
          status: 'COMPLETED',
        },
        orderBy: {
          completedAt: 'desc',
        },
      });

      return {
        success: true,
        data: {
          pair,
          bids: buyOrders,
          asks: sellOrders,
          lastPrice: lastTrade?.price || null,
          timestamp: Date.now(),
        },
      };

    } catch (error) {
      fastify.log.error('Get order book error:', error);
      return reply.code(500).send({
        error: 'Failed to get order book',
      });
    }
  });

  // PUT /orders/:id - Update order
  fastify.put<UpdateOrderRequest>('/:id', {
    schema: {
      tags: ['Orders'],
      description: 'Update an existing order',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
        },
      },
      body: {
        type: 'object',
        properties: {
          price: { type: 'string' },
          amount: { type: 'string' },
          paymentMethods: { type: 'array', items: { type: 'string' } },
          status: { type: 'string', enum: ['ACTIVE', 'CANCELLED'] },
        },
        minProperties: 1,
      },
    },
    preHandler: [(fastify as any).authenticate],
  }, async (request: FastifyRequest<UpdateOrderRequest>, reply: FastifyReply) => {
    try {
      const user = (request as any).user;
      const { id } = request.params;
      const updates = request.body;

      // Check if order exists and belongs to user
      const existingOrder = await prisma.order.findFirst({
        where: {
          id,
          creatorId: user.id,
          status: { not: 'CANCELLED' },
        },
      });

      if (!existingOrder) {
        return reply.code(404).send({
          error: 'Order not found or cannot be updated',
        });
      }

      // Prepare update data
      const updateData: any = {};
      
      if (updates.price) {
        const newPrice = new Decimal(updates.price);
        if (newPrice.lte(0)) {
          return reply.code(400).send({
            error: 'Price must be greater than 0',
          });
        }
        updateData.price = newPrice.toString();
        
        // Recalculate total value
        updateData.totalValue = newPrice.mul(existingOrder.amount).toString();
      }

      if (updates.amount) {
        const newAmount = new Decimal(updates.amount);
        if (newAmount.lte(0)) {
          return reply.code(400).send({
            error: 'Amount must be greater than 0',
          });
        }
        updateData.amount = newAmount.toString();
        
        // Recalculate total value
        const currentPrice = new Decimal(existingOrder.price);
        updateData.totalValue = newAmount.mul(currentPrice).toString();
      }

      if (updates.paymentMethods) {
        updateData.paymentMethods = updates.paymentMethods;
      }

      if (updates.status) {
        updateData.status = updates.status;
      }

      // Update version number
      updateData.version = existingOrder.version + 1;

      // Update order
      const updatedOrder = await prisma.order.update({
        where: { id },
        data: updateData,
        include: {
          creator: {
            select: {
              id: true,
              walletAddress: true,
              reputationScore: true,
              tradeCount: true,
            },
          },
        },
      });

      // Publish update to Redis
      try {
        await (fastify as any).redis.publish(
          `orderbook:${existingOrder.asset}-${existingOrder.fiatCurrency}`,
          JSON.stringify({
            type: 'order_updated',
            order: updatedOrder,
            timestamp: Date.now(),
          })
        );
      } catch (redisError) {
        fastify.log.warn('Failed to publish order update to Redis:', redisError);
      }

      return {
        success: true,
        data: updatedOrder,
      };

    } catch (error) {
      fastify.log.error('Update order error:', error);
      return reply.code(500).send({
        error: 'Failed to update order',
      });
    }
  });

  // GET /orders/my - Get user's orders
  fastify.get('/my', {
    schema: {
      tags: ['Orders'],
      description: 'Get current user\'s orders',
      querystring: {
        type: 'object',
        properties: {
          status: { type: 'string' },
          limit: { type: 'number', minimum: 1, maximum: 100, default: 20 },
          offset: { type: 'number', minimum: 0, default: 0 },
        },
      },
    },
    preHandler: [(fastify as any).authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = (request as any).user;
      const { status, limit = 20, offset = 0 } = request.query as any;

      const where: any = {
        creatorId: user.id,
      };

      if (status) {
        where.status = status;
      }

      const orders = await prisma.order.findMany({
        where,
        orderBy: {
          createdAt: 'desc',
        },
        take: limit,
        skip: offset,
      });

      const totalCount = await prisma.order.count({ where });

      return {
        success: true,
        data: {
          orders,
          pagination: {
            total: totalCount,
            limit,
            offset,
            hasMore: offset + limit < totalCount,
          },
        },
      };

    } catch (error) {
      fastify.log.error('Get user orders error:', error);
      return reply.code(500).send({
        error: 'Failed to get user orders',
      });
    }
  });
}

export default orderRoutes;
