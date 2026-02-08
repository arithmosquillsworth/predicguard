# PredicGuard 🛡️

Security-first prediction market agents with anti-manipulation and risk management.

## The Vision

Prediction markets are full of games. Build agents that play fair and win anyway.

## Features

### Risk Management
- **Position Sizing** — Kelly criterion with fractional Kelly safety
- **Stop Losses** — Automatic exits at loss thresholds with trailing stops
- **Portfolio Balancing** — Diversification across markets with rebalancing
- **Drawdown Protection** — Pause trading after losses with cooldown periods

### Anti-Manipulation
- **Whale Detection** — Spot unusual order patterns and price impacts
- **Wash Trading Alerts** — Identify fake volume and circular trading
- **Oracle Monitoring** — Track resolution source integrity and staleness
- **Sandwich Protection** — Detect MEV attacks and protect trades

### Verifiable Performance
- **On-Chain Audit Trail** — Every prediction logged with cryptographic proofs
- **Tamper-Proof Results** — Merkle tree verification of all trades
- **Transparent Strategies** — Open-source agent logic
- **Third-Party Verification** — Independent audit support

### Reputation Integration
- **8004scan Integration** — Cross-reference addresses for security flags
- **On-Chain Reputation** — Build trust through verified performance
- **Blacklist Support** — Block known malicious actors

## Agent Templates

### ConservativeBot 🤖
- Max 1% per trade
- Only high-confidence predictions (>70%)
- Daily loss limit: 3%
- Tight stop losses (2%)
- Avoids volatile markets

```typescript
const bot = new ConservativeBot({
  wallet: { address: '0x...', balance: 10n ** 18n },
  auditLogger,
  customParams: {
    confidenceThreshold: 0.70,
    maxPositionPercent: 0.01,
    stopLossPercent: 0.02
  }
});
```

### BalancedBot ⚖️
- Max 5% per trade
- Medium confidence (50-70%)
- Weekly rebalancing
- Volatility-adjusted sizing
- Moderate risk tolerance

```typescript
const bot = new BalancedBot({
  wallet: { address: '0x...', balance: 10n ** 18n },
  auditLogger,
  customParams: {
    confidenceThreshold: 0.50,
    maxPositionPercent: 0.05
  }
});
```

### AggressiveBot 🚀
- Max 10% per trade
- All confidence levels > 30%
- No strict loss limits (high risk)
- Rapid position changes
- High frequency style

```typescript
const bot = new AggressiveBot({
  wallet: { address: '0x...', balance: 10n ** 18n },
  auditLogger,
  customParams: {
    confidenceThreshold: 0.30,
    maxPositionPercent: 0.10,
    maxPositions: 10
  }
});
```

## Quick Start

```bash
# Clone repository
git clone https://github.com/arithmosquillsworth/predicguard.git
cd predicguard

# Install dependencies
npm install

# Run tests
npm test

# Run security tests
npm run test:security

# Build
npm run build

# Run an agent
npm run agent:conservative
```

## Architecture

```
predicguard/
├── src/
│   ├── agents/           # Agent templates
│   │   ├── base-agent.ts
│   │   ├── conservative-bot.ts
│   │   ├── balanced-bot.ts
│   │   └── aggressive-bot.ts
│   ├── risk/             # Risk management
│   │   └── position-sizing.ts
│   ├── security/         # Anti-manipulation
│   │   └── anti-manipulation.ts
│   ├── audit/            # Audit trail
│   │   └── audit-trail.ts
│   ├── integrations/     # External integrations
│   │   └── reputation.ts
│   └── utils/            # Utilities
│       └── helpers.ts
├── contracts/            # Smart contracts
│   ├── PredicGuardAudit.sol
│   └── PredicGuardRiskManager.sol
└── src/__tests__/        # Test suite
    └── security.test.ts
```

## Risk Management API

### Kelly Criterion
```typescript
import { calculateKellyCriterion } from 'predicguard';

const position = calculateKellyCriterion({
  bankroll: 10000n,
  winProbability: 0.6,
  winLossRatio: 1.5,
  kellyFraction: 0.25, // Quarter Kelly
  maxPositionPercent: 0.05
});
```

### Stop Loss Manager
```typescript
import { StopLossManager } from 'predicguard';

const sl = new StopLossManager({
  entryPrice: 1000n,
  stopLossPercent: 0.05,
  takeProfitPercent: 0.15,
  trailingStopPercent: 0.10
});

const result = sl.updatePrice(950n);
if (result.shouldExit) {
  console.log(`Exit: ${result.reason}`); // STOP_LOSS
}
```

### Drawdown Protection
```typescript
import { DrawdownProtector } from 'predicguard';

const protector = new DrawdownProtector({
  maxDailyDrawdownPercent: 0.05,
  maxTotalDrawdownPercent: 0.20,
  cooldownPeriodMs: 3600000,
  pauseOnTrigger: true
}, initialValue);

const status = protector.updateValue(currentValue);
if (!status.canTrade) {
  console.log('Trading paused:', status.status);
}
```

## Anti-Manipulation API

### Whale Detection
```typescript
import { WhaleDetector } from 'predicguard';

const detector = new WhaleDetector(BigInt('1000000000000000000'));
const alert = detector.analyzeOrder(order, liquidity);

if (alert?.severity === 'CRITICAL') {
  // Block trade
}
```

### Oracle Monitoring
```typescript
import { OracleMonitor } from 'predicguard';

const monitor = new OracleMonitor(['chainlink', 'uniswap'], 300000, 0.02);
monitor.updatePrice('chainlink', price, timestamp);

const { price, confidence } = monitor.getConsensusPrice();
const health = monitor.checkHealth();
```

## Audit Trail API

### Logging
```typescript
import { AuditLogger } from 'predicguard';

const logger = new AuditLogger({
  mode: 'onchain', // or 'local' or 'both'
  rpcUrl: process.env.RPC_URL,
  contractAddress: process.env.AUDIT_CONTRACT,
  privateKey: process.env.PRIVATE_KEY,
  chainId: 8453
});

await logger.logTrade({
  agent: 'ConservativeBot',
  marketId: 'ETH-USD',
  action: 'BUY',
  amount: 100n,
  price: 2500n,
  reason: 'High confidence signal'
});
```

### Verification
```typescript
import { AuditVerifier } from 'predicguard';

const result = AuditVerifier.verifyTrail(entries);
console.log(`Valid: ${result.valid}, Issues: ${result.issues.length}`);
```

## Smart Contracts

### PredicGuardAudit
- Stores cryptographic proofs of agent decisions
- Tracks agent reputation scores
- Supports batch logging for gas efficiency

### PredicGuardRiskManager
- Enforces position limits on-chain
- Tracks drawdown at contract level
- Emergency pause functionality

## Reputation Integration

```typescript
import { ReputationClient, ReputationGuard } from 'predicguard';

const client = new ReputationClient({
  apiKey: process.env.REPUTATION_API_KEY
});

const guard = new ReputationGuard(client, 30);

const { allowed, reason } = await guard.canInteract(address);
if (!allowed) {
  console.log(`Blocked: ${reason}`);
}
```

## Configuration

Create `.env` file:

```bash
# Required
PRIVATE_KEY=your_private_key_here
RPC_URL=https://mainnet.base.org
WALLET_ADDRESS=0x...

# Optional
AUDIT_CONTRACT=0x...
RISK_MANAGER_CONTRACT=0x...
REPUTATION_API_KEY=your_key
```

## Testing

```bash
# Run all tests
npm test

# Run security tests only
npm run test:security

# Run with coverage
npm test -- --coverage
```

## Deployment

See [DEPLOY.md](DEPLOY.md) for detailed deployment instructions.

## Security

See [SECURITY.md](SECURITY.md) for security policy and incident response.

## License

MIT License - See [LICENSE](LICENSE) for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Run tests: `npm test`
4. Submit a pull request

## Support

- Discord: [Join our community](https://discord.gg/predicguard)
- GitHub Issues: [Report bugs](https://github.com/arithmosquillsworth/predicguard/issues)
- Email: support@predicguard.io