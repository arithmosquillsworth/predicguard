# PredicGuard Project Summary

## Overview
Security-first prediction market agents with comprehensive risk management and anti-manipulation features.

## Structure

### Source Code (src/)
```
src/
├── agents/
│   ├── base-agent.ts          # Abstract base class for all agents
│   ├── conservative-bot.ts    # Conservative strategy (1% max, 70% conf)
│   ├── balanced-bot.ts        # Balanced strategy (5% max, 50% conf)
│   ├── aggressive-bot.ts      # Aggressive strategy (10% max, 30% conf)
│   ├── run-conservative.ts    # Entry point
│   ├── run-balanced.ts        # Entry point
│   └── run-aggressive.ts      # Entry point
├── risk/
│   └── position-sizing.ts     # Kelly criterion, stop losses, drawdown
├── security/
│   └── anti-manipulation.ts   # Whale detection, wash trading, sandwich
├── audit/
│   └── audit-trail.ts         # On-chain logging with crypto proofs
├── integrations/
│   └── reputation.ts          # 8004scan integration
├── utils/
│   └── helpers.ts             # Utilities and formatters
├── __tests__/
│   └── security.test.ts       # Comprehensive security test suite
└── index.ts                   # Main exports
```

### Smart Contracts (contracts/)
- **PredicGuardAudit.sol** - On-chain audit trail with reputation tracking
- **PredicGuardRiskManager.sol** - On-chain risk enforcement

### Scripts (scripts/)
- **deploy-audit.ts** - Deploy audit contract
- **deploy-risk-manager.ts** - Deploy risk manager

## Key Features

### Risk Management
1. **Kelly Criterion Position Sizing**
   - Configurable Kelly fraction (conservative: 0.1, aggressive: 0.5)
   - Max position percentage caps
   - Volatility-adjusted sizing

2. **Stop Loss Management**
   - Fixed stop loss
   - Take profit targets
   - Trailing stops

3. **Drawdown Protection**
   - Daily loss limits
   - Total drawdown limits
   - Cooldown periods

4. **Portfolio Balancing**
   - Target allocations
   - Rebalancing triggers
   - Concentration risk monitoring

### Anti-Manipulation
1. **Whale Detection**
   - Large order detection
   - Price impact calculation
   - Volume ratio analysis

2. **Wash Trading Detection**
   - Self-trading detection
   - Circular trading patterns
   - Volume inflation alerts

3. **Oracle Monitoring**
   - Multi-source consensus
   - Staleness detection
   - Deviation alerts

4. **Sandwich Protection**
   - Mempool analysis
   - Pattern detection
   - Slippage recommendations

### Audit Trail
1. **Cryptographic Logging**
   - SHA-256 hashes of all entries
   - Merkle tree verification
   - Signature validation

2. **On-Chain Storage**
   - Smart contract logging
   - Reputation tracking
   - Batch operations

3. **Verification**
   - Third-party verification
   - Tamper detection
   - Report generation

### Reputation Integration
1. **8004scan API**
   - Address reputation scores
   - Security flag checking
   - Contract verification

2. **Local Guard**
   - Address blocking
   - Pre-trade checks
   - Warning systems

## Agent Configurations

| Feature | Conservative | Balanced | Aggressive |
|---------|-------------|----------|------------|
| Max Position | 1% | 5% | 10% |
| Min Confidence | 70% | 50% | 30% |
| Kelly Fraction | 0.1 | 0.25 | 0.5 |
| Stop Loss | 2% | 5% | 10% |
| Take Profit | 5% | 15% | 30% |
| Daily Drawdown | 3% | 5% | 15% |
| Total Drawdown | 10% | 20% | 50% |
| Rebalance | As needed | Weekly | Monthly |

## Usage

```bash
# Install
npm install

# Test
npm test
npm run test:security

# Run agents
npm run agent:conservative
npm run agent:balanced
npm run agent:aggressive

# Deploy contracts
npm run deploy:audit
npm run deploy:risk
```

## Security Test Coverage
- Risk management calculations
- Stop loss triggers
- Drawdown protection
- Whale detection
- Wash trading detection
- Oracle health monitoring
- Sandwich attack detection
- Audit trail integrity
- Entry verification
- Integration tests

## Files Created
- 24 TypeScript files
- 2 Solidity contracts
- 3 Markdown documentation files
- 4 Configuration files
- 2 Deployment scripts
- 1 Example file
- 1 Comprehensive test suite (500+ lines)
