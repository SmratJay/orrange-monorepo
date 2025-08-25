#!/bin/bash

# ===============================================
# ORRANGE P2P - PRODUCTION DEPLOYMENT SCRIPT
# ===============================================

set -e

echo "🚀 Starting Orrange P2P Production Deployment"
echo "=============================================="

# Check if environment file exists
if [ ! -f ".env.production" ]; then
    echo "❌ .env.production file not found!"
    echo "📋 Copy .env.production.example to .env.production and configure your values"
    exit 1
fi

# Load environment variables
source .env.production

# Check required environment variables
required_vars=("POSTGRES_PASSWORD" "JWT_SECRET" "BLOCKCHAIN_RPC_URL" "ESCROW_CONTRACT_ADDRESS")
for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ]; then
        echo "❌ Required environment variable $var is not set!"
        exit 1
    fi
done

echo "✅ Environment validation passed"

# Create necessary directories
mkdir -p logs
mkdir -p data/postgres
mkdir -p data/redis
mkdir -p nginx/ssl

echo "✅ Directory structure created"

# Generate SSL certificates (self-signed for development)
if [ ! -f "nginx/ssl/server.crt" ]; then
    echo "🔒 Generating SSL certificates..."
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout nginx/ssl/server.key \
        -out nginx/ssl/server.crt \
        -subj "/C=US/ST=CA/L=San Francisco/O=Orrange/OU=IT/CN=localhost"
    echo "✅ SSL certificates generated"
fi

# Build and start services
echo "🏗️  Building Docker images..."
docker-compose -f docker-compose.production.yml build --no-cache

echo "🚀 Starting production services..."
docker-compose -f docker-compose.production.yml up -d

# Wait for services to be healthy
echo "⏳ Waiting for services to be ready..."
sleep 30

# Run database migrations
echo "🗄️  Running database migrations..."
docker-compose -f docker-compose.production.yml exec api pnpm exec prisma migrate deploy

# Health check
echo "🔍 Performing health checks..."
api_health=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/health || echo "000")
web_health=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 || echo "000")

if [ "$api_health" = "200" ] && [ "$web_health" = "200" ]; then
    echo "✅ Health checks passed!"
    echo ""
    echo "🎉 DEPLOYMENT SUCCESSFUL!"
    echo "========================="
    echo "🌐 Web App: http://localhost:3000"
    echo "🔗 API: http://localhost:8080"
    echo "📊 Grafana: http://localhost:3001 (admin/password from .env)"
    echo "📈 Prometheus: http://localhost:9090"
    echo ""
    echo "📋 Next Steps:"
    echo "  1. Configure your domain DNS to point to this server"
    echo "  2. Update CORS settings in production environment"
    echo "  3. Set up proper SSL certificates (Let's Encrypt recommended)"
    echo "  4. Configure backup strategy for PostgreSQL"
    echo ""
else
    echo "❌ Health checks failed!"
    echo "API Health: $api_health"
    echo "Web Health: $web_health"
    echo ""
    echo "🔍 Check logs:"
    echo "docker-compose -f docker-compose.production.yml logs api"
    echo "docker-compose -f docker-compose.production.yml logs web"
    exit 1
fi
