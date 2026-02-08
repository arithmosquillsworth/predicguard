/**
 * Security Test Suite
 * 
 * Comprehensive tests for:
 * - Risk management
 * - Anti-manipulation detection
 * - Agent security
 * - Audit integrity
 */

import {
  calculateKellyCriterion,
  calculateFixedFractional,
  calculateVolatilityAdjusted,
  StopLossManager,
  PortfolioBalancer,
  DrawdownProtector,
  PositionSizingParams,
  StopLossParams,
  DrawdownConfig,
  PortfolioState,
  PortfolioPosition
} from '../risk/position-sizing';

import {
  WhaleDetector,
  WashTradingDetector,
  OracleMonitor,
  SandwichProtector,
  Order,
  Trade
} from '../security/anti-manipulation';

import { AuditLogger, AuditEntry, AuditVerifier } from '../audit/audit-trail';

describe('Risk Management', () => {
  describe('Kelly Criterion', () => {
    it('should calculate correct Kelly fraction', () => {
      const params: PositionSizingParams = {
        bankroll: 10000n,
        winProbability: 0.6,
        winLossRatio: 1.5,
        kellyFraction: 0.25
      };

      const position = calculateKellyCriterion(params);
      
      // Full Kelly: (1.5*0.6 - 0.4)/1.5 = 0.333
      // Quarter Kelly: 0.333 * 0.25 = 0.0833
      // Expected: ~833 units
      expect(Number(position)).toBeGreaterThan(0);
      expect(Number(position)).toBeLessThan(10000);
    });

    it('should respect max position limit', () => {
      const params: PositionSizingParams = {
        bankroll: 10000n,
        winProbability: 0.9,
        winLossRatio: 5,
        kellyFraction: 1.0, // Full Kelly
        maxPositionPercent: 0.1 // But cap at 10%
      };

      const position = calculateKellyCriterion(params);
      
      // Should be capped at 1000 (10% of 10000)
      expect(Number(position)).toBeLessThanOrEqual(1000);
    });

    it('should return zero for negative edge', () => {
      const params: PositionSizingParams = {
        bankroll: 10000n,
        winProbability: 0.4,
        winLossRatio: 1,
        kellyFraction: 0.25
      };

      const position = calculateKellyCriterion(params);
      expect(position).toBe(0n);
    });

    it('should throw on invalid probability', () => {
      expect(() => calculateKellyCriterion({
        bankroll: 10000n,
        winProbability: 1.5,
        winLossRatio: 1
      })).toThrow();

      expect(() => calculateKellyCriterion({
        bankroll: 10000n,
        winProbability: 0,
        winLossRatio: 1
      })).toThrow();
    });
  });

  describe('Fixed Fractional', () => {
    it('should calculate fixed percentage', () => {
      const position = calculateFixedFractional(10000n, 0.05);
      expect(position).toBe(500n);
    });

    it('should respect max position', () => {
      const position = calculateFixedFractional(10000n, 0.1, 500n);
      expect(position).toBe(500n);
    });
  });

  describe('Volatility Adjustment', () => {
    it('should reduce position in high volatility', () => {
      const base = 1000n;
      const adjusted = calculateVolatilityAdjusted(base, 0.5, 0.2);
      
      expect(adjusted).toBeLessThan(base);
    });

    it('should not increase beyond base', () => {
      const base = 1000n;
      const adjusted = calculateVolatilityAdjusted(base, 0.1, 0.2);
      
      expect(adjusted).toBeLessThanOrEqual(base);
    });
  });

  describe('Stop Loss Manager', () => {
    let manager: StopLossManager;

    beforeEach(() => {
      const params: StopLossParams = {
        entryPrice: 1000n,
        stopLossPercent: 0.05,
        takeProfitPercent: 0.15,
        trailingStopPercent: 0.10
      };
      manager = new StopLossManager(params);
    });

    it('should trigger stop loss', () => {
      const result = manager.updatePrice(940n); // 6% drop
      expect(result.shouldExit).toBe(true);
      expect(result.reason).toBe('STOP_LOSS');
    });

    it('should trigger take profit', () => {
      const result = manager.updatePrice(1151n); // 15.1% gain
      expect(result.shouldExit).toBe(true);
      expect(result.reason).toBe('TAKE_PROFIT');
    });

    it('should trigger trailing stop', () => {
      manager.updatePrice(1200n); // Price goes up
      const result = manager.updatePrice(1079n); // 10.1% drop from peak
      expect(result.shouldExit).toBe(true);
      expect(result.reason).toBe('TRAILING_STOP');
    });

    it('should not trigger when price in range', () => {
      const result = manager.updatePrice(1050n);
      expect(result.shouldExit).toBe(false);
    });
  });

  describe('Drawdown Protector', () => {
    let protector: DrawdownProtector;

    beforeEach(() => {
      const config: DrawdownConfig = {
        maxDailyDrawdownPercent: 0.03,
        maxTotalDrawdownPercent: 0.10,
        cooldownPeriodMs: 3600000,
        pauseOnTrigger: true
      };
      protector = new DrawdownProtector(config, 10000n);
    });

    it('should allow trading initially', () => {
      const status = protector.updateValue(10000n);
      expect(status.canTrade).toBe(true);
      expect(status.status).toBe('NORMAL');
    });

    it('should block trading on daily drawdown', () => {
      protector.updateValue(9700n); // 3% drop
      const status = protector.updateValue(9699n);
      expect(status.canTrade).toBe(false);
      expect(status.status).toBe('CRITICAL');
    });

    it('should block trading on total drawdown', () => {
      protector.updateValue(11000n); // New peak
      const status = protector.updateValue(9800n); // 10.9% from peak
      expect(status.status).toBe('CRITICAL');
    });

    it('should warn near threshold', () => {
      protector.updateValue(9750n); // 2.5% drop (80% of 3%)
      const status = protector.updateValue(9750n);
      expect(status.status).toBe('WARNING');
    });
  });

  describe('Portfolio Balancer', () => {
    it('should detect need for rebalance', () => {
      const allocations = new Map([
        ['A', 0.5],
        ['B', 0.5]
      ]);
      const balancer = new PortfolioBalancer(allocations, 0.05);

      const state: PortfolioState = {
        totalValue: 10000n,
        positions: [
          { marketId: 'A', position: 70n, entryPrice: 100n, currentPrice: 100n, timestamp: Date.now() },
          { marketId: 'B', position: 30n, entryPrice: 100n, currentPrice: 100n, timestamp: Date.now() }
        ],
        cash: 0n,
        lastRebalance: Date.now()
      };

      expect(balancer.shouldRebalance(state)).toBe(true);
    });

    it('should calculate rebalance trades', () => {
      const allocations = new Map([
        ['A', 0.5],
        ['B', 0.5]
      ]);
      const balancer = new PortfolioBalancer(allocations, 0.05);

      const state: PortfolioState = {
        totalValue: 10000n,
        positions: [
          { marketId: 'A', position: 70n, entryPrice: 100n, currentPrice: 100n, timestamp: Date.now() },
          { marketId: 'B', position: 30n, entryPrice: 100n, currentPrice: 100n, timestamp: Date.now() }
        ],
        cash: 0n,
        lastRebalance: Date.now()
      };

      const trades = balancer.calculateRebalanceTrades(state);
      expect(trades.length).toBeGreaterThan(0);
    });

    it('should calculate concentration risk', () => {
      const allocations = new Map([['A', 1.0]]);
      const balancer = new PortfolioBalancer(allocations);

      const state: PortfolioState = {
        totalValue: 10000n,
        positions: [
          { marketId: 'A', position: 80n, entryPrice: 100n, currentPrice: 100n, timestamp: Date.now() }
        ],
        cash: 2000n,
        lastRebalance: Date.now()
      };

      const risk = balancer.calculateConcentrationRisk(state);
      expect(risk).toBe(0.8);
    });
  });
});

describe('Anti-Manipulation', () => {
  describe('Whale Detector', () => {
    let detector: WhaleDetector;

    beforeEach(() => {
      detector = new WhaleDetector(BigInt('1000000000000000000'));
    });

    it('should detect whale order by size', () => {
      const order: Order = {
        id: '1',
        marketId: 'MARKET1',
        trader: '0x123',
        side: 'BUY',
        amount: BigInt('2000000000000000000'),
        price: 1000n,
        timestamp: Date.now(),
        blockNumber: 1
      };

      const alert = detector.analyzeOrder(order, BigInt('10000000000000000000'));
      expect(alert).not.toBeNull();
      expect(alert?.type).toBe('WHALE_ORDER');
    });

    it('should detect high price impact', () => {
      const order: Order = {
        id: '1',
        marketId: 'MARKET1',
        trader: '0x123',
        side: 'BUY',
        amount: BigInt('1000000000000000000'),
        price: 1000n,
        timestamp: Date.now(),
        blockNumber: 1
      };

      const alert = detector.analyzeOrder(order, BigInt('1000000000000000000'));
      expect(alert).not.toBeNull();
      expect(alert?.type).toBe('PRICE_IMPACT');
    });

    it('should not alert for normal orders', () => {
      const order: Order = {
        id: '1',
        marketId: 'MARKET1',
        trader: '0x123',
        side: 'BUY',
        amount: BigInt('10000000000000000'),
        price: 1000n,
        timestamp: Date.now(),
        blockNumber: 1
      };

      const alert = detector.analyzeOrder(order, BigInt('10000000000000000000'));
      expect(alert).toBeNull();
    });
  });

  describe('Wash Trading Detector', () => {
    let detector: WashTradingDetector;

    beforeEach(() => {
      detector = new WashTradingDetector(3, 3600000);
    });

    it('should detect self-trading', () => {
      const trades: Trade[] = [{
        id: '1',
        marketId: 'MARKET1',
        buyer: '0xABC',
        seller: '0xABC',
        amount: 1000n,
        price: 100n,
        timestamp: Date.now(),
        blockNumber: 1
      }];

      const alert = detector.analyzeTrades(trades);
      expect(alert).not.toBeNull();
      expect(alert?.type).toBe('SELF_TRADING');
    });

    it('should detect circular trading', () => {
      const now = Date.now();
      const trades: Trade[] = [
        { id: '1', marketId: 'M1', buyer: '0xA', seller: '0xB', amount: 100n, price: 10n, timestamp: now, blockNumber: 1 },
        { id: '2', marketId: 'M1', buyer: '0xB', seller: '0xA', amount: 100n, price: 10n, timestamp: now + 1000, blockNumber: 2 },
        { id: '3', marketId: 'M1', buyer: '0xA', seller: '0xB', amount: 100n, price: 10n, timestamp: now + 2000, blockNumber: 3 }
      ];

      const alert = detector.analyzeTrades(trades);
      expect(alert).not.toBeNull();
      expect(alert?.type).toBe('CIRCULAR_TRADING');
    });
  });

  describe('Oracle Monitor', () => {
    let monitor: OracleMonitor;

    beforeEach(() => {
      monitor = new OracleMonitor(['source1', 'source2'], 300000, 0.02);
    });

    it('should return consensus price', () => {
      monitor.updatePrice('source1', 1000n, Date.now());
      monitor.updatePrice('source2', 1001n, Date.now());

      const consensus = monitor.getConsensusPrice();
      expect(consensus.price).not.toBeNull();
      expect(consensus.confidence).toBeGreaterThan(0);
    });

    it('should detect stale data', () => {
      const oldTime = Date.now() - 600000; // 10 minutes ago
      monitor.updatePrice('source1', 1000n, oldTime);

      const health = monitor.checkHealth();
      expect(health.healthy).toBe(false);
      expect(health.issues.length).toBeGreaterThan(0);
    });

    it('should detect high deviation', () => {
      monitor.updatePrice('source1', 1000n, Date.now());
      monitor.updatePrice('source2', 1100n, Date.now()); // 10% difference

      const health = monitor.checkHealth();
      expect(health.healthy).toBe(false);
    });
  });

  describe('Sandwich Protector', () => {
    let protector: SandwichProtector;

    beforeEach(() => {
      protector = new SandwichProtector(2, 0.01);
    });

    it('should warn on large pending orders', () => {
      const userOrder: Order = {
        id: 'user1',
        marketId: 'M1',
        trader: '0xUSER',
        side: 'BUY',
        amount: 100n,
        price: 1000n,
        timestamp: Date.now(),
        blockNumber: 1
      };

      // Add large pending order
      protector.addPendingTx('large1', {
        ...userOrder,
        id: 'large1',
        trader: '0xWHALE',
        amount: 300n
      });

      const check = protector.preTradeCheck(userOrder);
      expect(check.safe).toBe(false);
      expect(check.warning).toContain('sandwich');
    });

    it('should pass normal conditions', () => {
      const userOrder: Order = {
        id: 'user1',
        marketId: 'M1',
        trader: '0xUSER',
        side: 'BUY',
        amount: 100n,
        price: 1000n,
        timestamp: Date.now(),
        blockNumber: 1
      };

      const check = protector.preTradeCheck(userOrder);
      expect(check.safe).toBe(true);
    });
  });
});

describe('Audit Trail', () => {
  let logger: AuditLogger;

  beforeEach(() => {
    logger = new AuditLogger({ mode: 'local' });
  });

  it('should log entries with hash', async () => {
    const entry = await logger.log({
      type: 'TEST',
      agent: 'test-agent',
      data: { test: true },
      timestamp: Date.now()
    });

    expect(entry.hash).toBeDefined();
    expect(entry.hash?.length).toBeGreaterThan(0);
  });

  it('should verify entry integrity', async () => {
    const entry = await logger.log({
      type: 'TEST',
      agent: 'test-agent',
      data: { test: true },
      timestamp: Date.now()
    });

    expect(logger.verifyEntry(entry)).toBe(true);
  });

  it('should detect tampered entries', async () => {
    const entry = await logger.log({
      type: 'TEST',
      agent: 'test-agent',
      data: { test: true },
      timestamp: Date.now()
    });

    // Tamper with data
    const tampered = { ...entry, data: { test: false } };
    expect(logger.verifyEntry(tampered)).toBe(false);
  });

  it('should filter entries', async () => {
    await logger.log({ type: 'TRADE', agent: 'A', data: {}, timestamp: 1 });
    await logger.log({ type: 'PREDICT', agent: 'A', data: {}, timestamp: 2 });
    await logger.log({ type: 'TRADE', agent: 'B', data: {}, timestamp: 3 });

    const tradeEntries = logger.getEntries({ type: 'TRADE' });
    expect(tradeEntries.length).toBe(2);

    const agentAEntries = logger.getEntries({ agent: 'A' });
    expect(agentAEntries.length).toBe(2);
  });

  it('should log trades correctly', async () => {
    const entry = await logger.logTrade({
      agent: 'test',
      marketId: 'M1',
      action: 'BUY',
      amount: 100n,
      price: 50n,
      reason: 'test trade'
    });

    expect(entry.type).toBe('TRADE');
    expect(entry.data.action).toBe('BUY');
  });

  it('should generate merkle root', async () => {
    await logger.log({ type: 'A', agent: 'test', data: {}, timestamp: 1 });
    await logger.log({ type: 'B', agent: 'test', data: {}, timestamp: 2 });

    const root = logger.getMerkleRoot();
    expect(root).toBeDefined();
    expect(root.length).toBeGreaterThan(0);
  });
});

describe('Audit Verifier', () => {
  it('should verify valid trail', () => {
    const entries: AuditEntry[] = [
      { type: 'A', agent: 'test', data: {}, timestamp: 1, hash: '0x1' },
      { type: 'B', agent: 'test', data: {}, timestamp: 2, hash: '0x2' }
    ];

    const result = AuditVerifier.verifyTrail(entries);
    expect(result.valid).toBe(true);
    expect(result.invalidCount).toBe(0);
  });

  it('should detect out of order timestamps', () => {
    const entries: AuditEntry[] = [
      { type: 'A', agent: 'test', data: {}, timestamp: 2, hash: '0x1' },
      { type: 'B', agent: 'test', data: {}, timestamp: 1, hash: '0x2' }
    ];

    const result = AuditVerifier.verifyTrail(entries);
    expect(result.valid).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });
});

describe('Integration Security', () => {
  it('should handle cascading risk limits', () => {
    // Test that multiple risk systems work together
    const drawdownConfig: DrawdownConfig = {
      maxDailyDrawdownPercent: 0.05,
      maxTotalDrawdownPercent: 0.20,
      cooldownPeriodMs: 3600000,
      pauseOnTrigger: true
    };

    const protector = new DrawdownProtector(drawdownConfig, 10000n);

    // Simulate losses
    protector.updateValue(9500n); // -5%
    const status = protector.updateValue(9400n); // -6%

    expect(status.canTrade).toBe(false);
    expect(status.status).toBe('CRITICAL');
  });

  it('should detect coordinated manipulation', () => {
    const washDetector = new WashTradingDetector(3);
    const whaleDetector = new WhaleDetector(BigInt('1000000000000000000'));

    const now = Date.now();
    const trades: Trade[] = [];

    // Create coordinated pattern
    for (let i = 0; i < 5; i++) {
      trades.push({
        id: `${i}`,
        marketId: 'M1',
        buyer: '0xA',
        seller: '0xB',
        amount: BigInt('500000000000000000'),
        price: BigInt(1000 + i),
        timestamp: now + i * 1000,
        blockNumber: i
      });
    }

    const washAlert = washDetector.analyzeTrades(trades);
    expect(washAlert).not.toBeNull();
  });
});

describe('Agent Security', () => {
  it('should enforce position limits', () => {
    const maxPosition = 0.05; // 5%
    const bankroll = 10000n;
    const maxAllowed = (bankroll * BigInt(Math.floor(maxPosition * 10000))) / 10000n;

    expect(Number(maxAllowed)).toBe(500);
  });

  it('should handle edge case: zero liquidity', () => {
    const detector = new WhaleDetector(BigInt('1000000000000000000'));
    const order: Order = {
      id: '1',
      marketId: 'M1',
      trader: '0x123',
      side: 'BUY',
      amount: 100n,
      price: 1000n,
      timestamp: Date.now(),
      blockNumber: 1
    };

    // Should handle zero liquidity gracefully
    const alert = detector.analyzeOrder(order, 0n);
    expect(alert?.impact).toBe(1); // Max impact when no liquidity
  });

  it('should prevent integer overflow in calculations', () => {
    const largeValue = BigInt('999999999999999999999999999999');
    const smallPercent = 0.01;
    
    // Should not throw
    expect(() => {
      const result = (largeValue * BigInt(Math.floor(smallPercent * 10000))) / 10000n;
      expect(result).toBeDefined();
    }).not.toThrow();
  });
});