# PredicGuard Deployment Scripts

## Prerequisites

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your values
```

## Contract Deployment

### 1. Deploy Audit Contract

```bash
npx hardhat run scripts/deploy-audit.ts --network base
```

### 2. Deploy Risk Manager

```bash
npx hardhat run scripts/deploy-risk-manager.ts --network base
```

### 3. Verify Contracts

```bash
npx hardhat verify --network base <CONTRACT_ADDRESS>
```

## Agent Configuration

### Conservative Bot

```typescript
const bot = new ConservativeBot({
  wallet: {
    address: process.env.WALLET_ADDRESS!,
    balance: BigInt('10000000000000000000')
  },
  auditLogger: new AuditLogger({
    mode: 'onchain',
    rpcUrl: process.env.RPC_URL,
    contractAddress: process.env.AUDIT_CONTRACT!,
    privateKey: process.env.PRIVATE_KEY!,
    chainId: 8453
  })
});
```

## Environment Variables

```bash
# Required
PRIVATE_KEY=your_private_key_here
RPC_URL=https://mainnet.base.org
WALLET_ADDRESS=0x...

# Optional
AUDIT_CONTRACT=0x...
RISK_MANAGER_CONTRACT=0x...
8004SCAN_API_KEY=your_api_key
```

## Production Deployment

1. Run security tests:
```bash
npm run test:security
```

2. Build:
```bash
npm run build
```

3. Start agent:
```bash
npm run agent:conservative
```

## Monitoring

View audit logs:
```bash
npx hardhat run scripts/view-logs.ts --network base
```

Check agent reputation:
```bash
npx hardhat run scripts/check-reputation.ts --network base
```