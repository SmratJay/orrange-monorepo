# Orrange P2P Trading Platform

A decentralized peer-to-peer trading platform featuring secure escrow systems, enhanced authentication, and real-time trading capabilities.

## Project Overview

Orrange provides a secure and efficient environment for peer-to-peer cryptocurrency trading, combining traditional financial system security with decentralized finance innovation.

### Key Features

- **Secure Escrow System**: Multi-signature smart contracts with advanced security protocols
- **Enhanced Authentication**: Wallet-based authentication with 2FA and device fingerprinting  
- **Real-time Trading**: Order matching with professional trading tools
- **Multi-Platform Support**: Web application with mobile and admin interfaces planned
- **Real-Time Analytics**: Comprehensive trading analytics and market insights

## Architecture

Monorepo structure built with modern technologies:

### Frontend Applications
- **Web App** (`apps/web/`): Next.js 14+ with TypeScript and Tailwind CSS

### Backend Services
- **API Service** (`services/api/`): Fastify with TypeScript and Prisma ORM

### Shared Packages
- **Authentication** (`packages/auth/`): Unified auth logic across platforms
- **UI Components** (`packages/ui/`): Reusable React components
- **Validation** (`packages/validation/`): Zod-based schema validation
- **Chain Utilities** (`packages/chains/`): Blockchain interaction utilities
- **Shared Types** (`packages/shared/`): TypeScript definitions and utilities

### Smart Contracts
- **Escrow Contract** (`contracts/`): Solidity smart contracts for secure transactions

## Development Status

### Completed Features
- Secure escrow system with multi-signature security
- Enhanced authentication with wallet verification and 2FA
- Core API infrastructure with comprehensive security middleware
- P2P advertisement and trading system
- Real-time WebSocket communication
- Database schema and services
- [ ] Real-time matching engine with Redis order book
- [ ] WebSocket integration for live updates
- [ ] Professional trading tools (limit orders, stop-loss, etc.)
- [ ] Advanced order types and execution strategies
## Technology Stack

### Frontend
- **Framework**: Next.js 14+, React 18+
- **Styling**: Tailwind CSS, Radix UI
- **State Management**: Zustand
- **Blockchain**: Ethers.js, WalletConnect

### Backend
- **Runtime**: Node.js with TypeScript
- **Framework**: Fastify
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: JWT with wallet signatures

### DevOps & Tools
- **Monorepo**: pnpm workspaces with Turbo
- **Linting**: ESLint, Prettier
- **Testing**: Jest
- **Version Control**: Git

## Quick Start

### Prerequisites
- Node.js 18+ 
- pnpm 8+
- PostgreSQL 14+

### Installation

1. Clone the repository:
```bash
git clone https://github.com/SmratJay/orrange-p2p-platform.git
cd orrange-p2p-platform
```

2. Install dependencies:
```bash
pnpm install
```

3. Set up environment variables:
```bash
cp .env.example .env
# Configure your environment variables
```

4. Set up the database:
```bash
cd services/api
npx prisma migrate dev
```

2. Install dependencies:
```bash
pnpm install
```

3. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. Set up the database:
```bash
cd services/api
npx prisma generate
npx prisma db push
```

5. Start the development servers:
```bash
# Start API server
cd services/api
pnpm dev

# Start web application (in another terminal)
cd apps/web
pnpm dev
```

## Documentation

- [Development Guide](./DEVELOPMENT.md)
- [Project Roadmap](./PROJECT_STATUS_ROADMAP.md)
- [Database Setup](./services/api/DATABASE_SETUP.md)

## Contributing

We welcome contributions from the community. Please follow these steps:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature-name`
3. Make your changes and add tests
4. Ensure all tests pass: `pnpm test`
5. Submit a pull request

## Security

Security is our top priority. We implement:

- Multi-signature escrow contracts
- Comprehensive input validation
- Rate limiting and DDoS protection
- Regular security audits

If you discover a security vulnerability, please create a private security advisory on GitHub.

## License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.

## Support

- **GitHub Issues**: [Report bugs or request features](https://github.com/SmratJay/orrange-p2p-platform/issues)

---

**Disclaimer**: This platform is currently in development. Use caution when trading and conduct your own research.
