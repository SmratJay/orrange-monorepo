# Orrange P2P Database Infrastructure Setup Guide

## Prerequisites Installation

### 1. PostgreSQL Installation (Windows)
```powershell
# Using Chocolatey (recommended)
choco install postgresql

# Or download from: https://www.postgresql.org/download/windows/
```

### 2. Redis Installation (Windows)
```powershell
# Using Chocolatey
choco install redis-64

# Or use Redis on Windows (WSL2 recommended)
# Or use Docker: docker run -d -p 6379:6379 redis:7-alpine
```

### 3. Database Setup Commands
```powershell
# Start PostgreSQL service
net start postgresql-x64-14

# Start Redis service
net start redis

# Connect to PostgreSQL
psql -U postgres

# Create database and user
CREATE USER orrange WITH PASSWORD 'orrange123';
CREATE DATABASE orrange_dev OWNER orrange;
CREATE DATABASE orrange_prod OWNER orrange;
CREATE DATABASE orrange_shadow OWNER orrange;
GRANT ALL PRIVILEGES ON DATABASE orrange_dev TO orrange;
GRANT ALL PRIVILEGES ON DATABASE orrange_prod TO orrange;
GRANT ALL PRIVILEGES ON DATABASE orrange_shadow TO orrange;
\q
```

## Database Architecture Overview

### Core Tables
- **users**: User profiles and authentication data
- **orders**: Trading orders with full metadata
- **trades**: Matched trading pairs and execution
- **disputes**: Conflict resolution system

### Key Features
- ACID compliance for financial operations
- Optimized indexes for trading queries
- Comprehensive audit trails
- Real-time data synchronization
- Horizontal scaling capability

## Performance Optimizations
- Connection pooling via PgBouncer
- Redis caching for hot data
- Partitioned tables for trade history
- Optimized indexes for order book queries

## Security Features
- Row-level security (RLS)
- Encrypted sensitive data
- Audit logging
- Backup encryption
- Access control policies
