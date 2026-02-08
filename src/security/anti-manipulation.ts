/**
 * Anti-Manipulation Detection Module
 * 
 * Security features:
 * - Whale detection (unusual order patterns)
 * - Wash trading alerts
 * - Oracle monitoring
 * - Sandwich protection
 */

export interface Order {
  id: string;
  marketId: string;
  trader: string;
  side: 'BUY' | 'SELL';
  amount: bigint;
  price: bigint;
  timestamp: number;
  blockNumber: number;
}

export interface Trade {
  id: string;
  marketId: string;
  buyer: string;
  seller: string;
  amount: bigint;
  price: bigint;
  timestamp: number;
  blockNumber: number;
}

export interface WhaleAlert {
  type: 'WHALE_ORDER' | 'WHALE_TRADE' | 'PRICE_IMPACT';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  trader: string;
  marketId: string;
  amount: bigint;
  impact: number;
  message: string;
  timestamp: number;
}

export interface WashTradingAlert {
  type: 'CIRCULAR_TRADING' | 'SELF_TRADING' | 'VOLUME_INFLATION';
  severity: 'MEDIUM' | 'HIGH' | 'CRITICAL';
  addresses: string[];
  marketId: string;
  volume: bigint;
  confidence: number;
  timestamp: number;
}

export interface OracleStatus {
  source: string;
  isActive: boolean;
  lastUpdate: number;
  price: bigint;
  deviation: number;
  stalenessMs: number;
  confidence: number;
}

export interface SandwichAlert {
  type: 'FRONT_RUN' | 'BACK_RUN' | 'SANDWICH_ATTACK';
  victim: string;
  attacker: string;
  marketId: string;
  lossAmount: bigint;
  timestamp: number;
  blockNumber: number;
}

/**
 * Whale Detection System
 * Identifies unusual order patterns and large position changes
 */
export class WhaleDetector {
  private volumeThreshold: bigint;
  private priceImpactThreshold: number;
  private historyWindowMs: number;
  private orderHistory: Map<string, Order[]>;
  private volume24h: Map<string, bigint>;

  constructor(
    volumeThreshold: bigint,
    priceImpactThreshold: number = 0.02,
    historyWindowMs: number = 86400000
  ) {
    this.volumeThreshold = volumeThreshold;
    this.priceImpactThreshold = priceImpactThreshold;
    this.historyWindowMs = historyWindowMs;
    this.orderHistory = new Map();
    this.volume24h = new Map();
  }

  analyzeOrder(order: Order, currentLiquidity: bigint): WhaleAlert | null {
    const alerts: WhaleAlert[] = [];

    // Check absolute size
    if (order.amount >= this.volumeThreshold) {
      alerts.push({
        type: 'WHALE_ORDER',
        severity: 'HIGH',
        trader: order.trader,
        marketId: order.marketId,
        amount: order.amount,
        impact: this.calculatePriceImpact(order.amount, currentLiquidity),
        message: `Large order detected: ${order.amount.toString()} units`,
        timestamp: Date.now()
      });
    }

    // Check price impact
    const impact = this.calculatePriceImpact(order.amount, currentLiquidity);
    if (impact >= this.priceImpactThreshold) {
      alerts.push({
        type: 'PRICE_IMPACT',
        severity: impact > 0.05 ? 'CRITICAL' : 'MEDIUM',
        trader: order.trader,
        marketId: order.marketId,
        amount: order.amount,
        impact,
        message: `High price impact detected: ${(impact * 100).toFixed(2)}%`,
        timestamp: Date.now()
      });
    }

    // Check relative to 24h volume
    const marketVolume = this.volume24h.get(order.marketId) || 0n;
    if (marketVolume > 0n) {
      const relativeSize = Number(order.amount) / Number(marketVolume);
      if (relativeSize > 0.1) {
        alerts.push({
          type: 'WHALE_TRADE',
          severity: relativeSize > 0.25 ? 'CRITICAL' : 'HIGH',
          trader: order.trader,
          marketId: order.marketId,
          amount: order.amount,
          impact: relativeSize,
          message: `Order represents ${(relativeSize * 100).toFixed(1)}% of 24h volume`,
          timestamp: Date.now()
        });
      }
    }

    // Store order
    this.storeOrder(order);

    return alerts.length > 0 ? alerts[0] : null;
  }

  analyzeTrade(trade: Trade, ordersBefore: Order[], ordersAfter: Order[]): WhaleAlert | null {
    // Detect if this was a whale absorbing liquidity
    const buyOrdersBefore = ordersBefore.filter(o => o.side === 'BUY' && o.amount >= this.volumeThreshold / 10n);
    const sellOrdersBefore = ordersBefore.filter(o => o.side === 'SELL' && o.amount >= this.volumeThreshold / 10n);

    if (buyOrdersBefore.length < 3 && sellOrdersBefore.length < 3) {
      // Thin order book, large trade more significant
      if (trade.amount >= this.volumeThreshold / 2n) {
        return {
          type: 'WHALE_TRADE',
          severity: 'MEDIUM',
          trader: trade.buyer,
          marketId: trade.marketId,
          amount: trade.amount,
          impact: 0,
          message: 'Large trade in thin market',
          timestamp: Date.now()
        };
      }
    }

    return null;
  }

  private calculatePriceImpact(amount: bigint, liquidity: bigint): number {
    if (liquidity === 0n) return 1;
    // Simplified constant product AMM impact calculation
    return Number(amount) / (Number(liquidity) + Number(amount));
  }

  private storeOrder(order: Order): void {
    const marketOrders = this.orderHistory.get(order.marketId) || [];
    marketOrders.push(order);
    
    // Clean old orders
    const cutoff = Date.now() - this.historyWindowMs;
    const filtered = marketOrders.filter(o => o.timestamp > cutoff);
    
    this.orderHistory.set(order.marketId, filtered);
  }

  updateVolume(marketId: string, volume: bigint): void {
    this.volume24h.set(marketId, volume);
  }
}

/**
 * Wash Trading Detector
 * Identifies fake volume and self-trading patterns
 */
export class WashTradingDetector {
  private minTradeCount: number;
  private timeWindowMs: number;
  private tradeHistory: Map<string, Trade[]>;
  private addressPairs: Map<string, number>;

  constructor(minTradeCount: number = 3, timeWindowMs: number = 3600000) {
    this.minTradeCount = minTradeCount;
    this.timeWindowMs = timeWindowMs;
    this.tradeHistory = new Map();
    this.addressPairs = new Map();
  }

  analyzeTrades(trades: Trade[]): WashTradingAlert | null {
    const now = Date.now();
    const cutoff = now - this.timeWindowMs;

    for (const trade of trades) {
      // Check self-trading
      if (trade.buyer.toLowerCase() === trade.seller.toLowerCase()) {
        return {
          type: 'SELF_TRADING',
          severity: 'CRITICAL',
          addresses: [trade.buyer],
          marketId: trade.marketId,
          volume: trade.amount,
          confidence: 1.0,
          timestamp: now
        };
      }

      // Store and analyze patterns
      this.storeTrade(trade);
      
      const pattern = this.detectCircularTrading(trade.marketId, cutoff);
      if (pattern) {
        return pattern;
      }
    }

    // Check for volume inflation
    const inflationAlert = this.detectVolumeInflation(cutoff);
    if (inflationAlert) {
      return inflationAlert;
    }

    return null;
  }

  private detectCircularTrading(marketId: string, cutoff: number): WashTradingAlert | null {
    const trades = this.tradeHistory.get(marketId) || [];
    const recentTrades = trades.filter(t => t.timestamp > cutoff);

    // Build trading graph
    const graph = new Map<string, Set<string>>();
    const volumeBetween = new Map<string, bigint>();

    for (const trade of recentTrades) {
      const buyer = trade.buyer.toLowerCase();
      const seller = trade.seller.toLowerCase();
      
      if (!graph.has(buyer)) graph.set(buyer, new Set());
      if (!graph.has(seller)) graph.set(seller, new Set());
      
      graph.get(buyer)!.add(seller);
      graph.get(seller)!.add(buyer);

      const pair = [buyer, seller].sort().join('-');
      const current = volumeBetween.get(pair) || 0n;
      volumeBetween.set(pair, current + trade.amount);
    }

    // Detect cycles (simplified - just check mutual trading)
    for (const [addr1, connections] of graph) {
      for (const addr2 of connections) {
        const pair = [addr1, addr2].sort().join('-');
        const volume = volumeBetween.get(pair) || 0n;
        
        // Check if they trade back and forth frequently
        const tradesBetween = recentTrades.filter(
          t => 
            (t.buyer.toLowerCase() === addr1 && t.seller.toLowerCase() === addr2) ||
            (t.buyer.toLowerCase() === addr2 && t.seller.toLowerCase() === addr1)
        );

        if (tradesBetween.length >= this.minTradeCount) {
          return {
            type: 'CIRCULAR_TRADING',
            severity: 'HIGH',
            addresses: [addr1, addr2],
            marketId,
            volume,
            confidence: Math.min(tradesBetween.length / 10, 1.0),
            timestamp: Date.now()
          };
        }
      }
    }

    return null;
  }

  private detectVolumeInflation(cutoff: number): WashTradingAlert | null {
    // Look for addresses that only trade with each other
    const pairCounts = new Map<string, number>();

    for (const [marketId, trades] of this.tradeHistory) {
      const recentTrades = trades.filter(t => t.timestamp > cutoff);
      
      for (const trade of recentTrades) {
        const pair = [trade.buyer, trade.seller].sort().join('-');
        pairCounts.set(pair, (pairCounts.get(pair) || 0) + 1);
      }
    }

    // Find pairs with suspiciously high trade counts
    for (const [pair, count] of pairCounts) {
      if (count >= this.minTradeCount * 2) {
        const addresses = pair.split('-');
        return {
          type: 'VOLUME_INFLATION',
          severity: count > 20 ? 'CRITICAL' : 'MEDIUM',
          addresses,
          marketId: 'multiple',
          volume: 0n,
          confidence: Math.min(count / 50, 1.0),
          timestamp: Date.now()
        };
      }
    }

    return null;
  }

  private storeTrade(trade: Trade): void {
    const marketTrades = this.tradeHistory.get(trade.marketId) || [];
    marketTrades.push(trade);
    this.tradeHistory.set(trade.marketId, marketTrades);
  }
}

/**
 * Oracle Monitor
 * Tracks oracle health and price reliability
 */
export class OracleMonitor {
  private sources: string[];
  private maxStalenessMs: number;
  private maxDeviationPercent: number;
  private sourceStates: Map<string, OracleStatus>;

  constructor(
    sources: string[],
    maxStalenessMs: number = 300000,
    maxDeviationPercent: number = 0.02
  ) {
    this.sources = sources;
    this.maxStalenessMs = maxStalenessMs;
    this.maxDeviationPercent = maxDeviationPercent;
    this.sourceStates = new Map();
  }

  updatePrice(source: string, price: bigint, timestamp: number): OracleStatus {
    const now = Date.now();
    const stalenessMs = now - timestamp;

    // Calculate deviation from other sources
    const deviations: number[] = [];
    for (const [otherSource, state] of this.sourceStates) {
      if (otherSource !== source && state.price > 0n) {
        const dev = Math.abs(Number(price - state.price)) / Number(state.price);
        deviations.push(dev);
      }
    }

    const avgDeviation = deviations.length > 0 
      ? deviations.reduce((a, b) => a + b, 0) / deviations.length 
      : 0;

    const status: OracleStatus = {
      source,
      isActive: stalenessMs < this.maxStalenessMs && avgDeviation < this.maxDeviationPercent,
      lastUpdate: timestamp,
      price,
      deviation: avgDeviation,
      stalenessMs,
      confidence: this.calculateConfidence(stalenessMs, avgDeviation)
    };

    this.sourceStates.set(source, status);
    return status;
  }

  getConsensusPrice(): { price: bigint | null; confidence: number } {
    const activeSources = Array.from(this.sourceStates.values())
      .filter(s => s.isActive);

    if (activeSources.length === 0) {
      return { price: null, confidence: 0 };
    }

    // Simple median
    const prices = activeSources.map(s => s.price).sort((a, b) => Number(a - b));
    const median = prices[Math.floor(prices.length / 2)];

    // Confidence based on agreement
    const deviations = activeSources.map(s => 
      Math.abs(Number(s.price - median)) / Number(median)
    );
    const avgDeviation = deviations.reduce((a, b) => a + b, 0) / deviations.length;
    const confidence = Math.max(0, 1 - avgDeviation * 10);

    return { price: median, confidence };
  }

  checkHealth(): { healthy: boolean; issues: string[] } {
    const issues: string[] = [];

    for (const source of this.sources) {
      const state = this.sourceStates.get(source);
      
      if (!state) {
        issues.push(`${source}: No data received`);
        continue;
      }

      if (state.stalenessMs > this.maxStalenessMs) {
        issues.push(`${source}: Stale data (${(state.stalenessMs / 1000).toFixed(0)}s old)`);
      }

      if (state.deviation > this.maxDeviationPercent) {
        issues.push(`${source}: High deviation (${(state.deviation * 100).toFixed(2)}%)`);
      }
    }

    return {
      healthy: issues.length === 0,
      issues
    };
  }

  private calculateConfidence(stalenessMs: number, deviation: number): number {
    const stalenessScore = Math.max(0, 1 - stalenessMs / this.maxStalenessMs);
    const deviationScore = Math.max(0, 1 - deviation / this.maxDeviationPercent);
    return (stalenessScore + deviationScore) / 2;
  }
}

/**
 * Sandwich Attack Detector
 * Protects against MEV sandwich attacks
 */
export class SandwichProtector {
  private blockWindow: number;
  private maxSlippagePercent: number;
  private pendingTxs: Map<string, Order>;
  private blockHistory: Map<number, Trade[]>;

  constructor(blockWindow: number = 2, maxSlippagePercent: number = 0.01) {
    this.blockWindow = blockWindow;
    this.maxSlippagePercent = maxSlippagePercent;
    this.pendingTxs = new Map();
    this.blockHistory = new Map();
  }

  preTradeCheck(userOrder: Order): {
    safe: boolean;
    warning?: string;
    recommendedSlippage?: number;
  } {
    const marketOrders = Array.from(this.pendingTxs.values())
      .filter(o => o.marketId === userOrder.marketId);

    // Check for pending large orders
    const largeOrders = marketOrders.filter(o => 
      o.amount >= userOrder.amount * 2n && o.trader !== userOrder.trader
    );

    if (largeOrders.length > 0) {
      return {
        safe: false,
        warning: 'Large pending orders detected - sandwich risk',
        recommendedSlippage: this.maxSlippagePercent * 2
      };
    }

    // Check mempool for suspicious patterns
    const suspicious = this.detectSuspiciousMempool(marketOrders);
    if (suspicious) {
      return {
        safe: false,
        warning: suspicious,
        recommendedSlippage: this.maxSlippagePercent
      };
    }

    return { safe: true };
  }

  analyzeBlock(trades: Trade[], blockNumber: number): SandwichAlert | null {
    this.blockHistory.set(blockNumber, trades);

    // Clean old blocks
    for (const [bn] of this.blockHistory) {
      if (bn < blockNumber - this.blockWindow * 2) {
        this.blockHistory.delete(bn);
      }
    }

    // Look for sandwich patterns
    for (let i = blockNumber - this.blockWindow; i <= blockNumber; i++) {
      const blockTrades = this.blockHistory.get(i) || [];
      
      for (const trade of blockTrades) {
        const sandwich = this.checkSandwichPattern(trade, blockNumber);
        if (sandwich) {
          return sandwich;
        }
      }
    }

    return null;
  }

  private detectSuspiciousMempool(orders: Order[]): string | null {
    // Check for similar sized orders around the same time
    const timeGroups = new Map<number, Order[]>();
    
    for (const order of orders) {
      const timeKey = Math.floor(order.timestamp / 1000);
      const group = timeGroups.get(timeKey) || [];
      group.push(order);
      timeGroups.set(timeKey, group);
    }

    for (const [_, group] of timeGroups) {
      if (group.length >= 3) {
        const sizes = group.map(o => Number(o.amount));
        const avg = sizes.reduce((a, b) => a + b, 0) / sizes.length;
        const variance = sizes.reduce((acc, s) => acc + Math.pow(s - avg, 2), 0) / sizes.length;
        
        // Low variance in sizes suggests coordinated activity
        if (variance < avg * 0.1) {
          return 'Coordinated order pattern detected';
        }
      }
    }

    return null;
  }

  private checkSandwichPattern(trade: Trade, currentBlock: number): SandwichAlert | null {
    const victim = trade.buyer;
    
    // Look for front-run and back-run by same address
    for (let i = currentBlock - this.blockWindow; i < currentBlock; i++) {
      const priorTrades = this.blockHistory.get(i) || [];
      
      for (const prior of priorTrades) {
        if (prior.buyer === victim) {
          // Check if someone traded before and after
          const frontRunner = prior.seller;
          
          for (let j = currentBlock; j <= currentBlock + this.blockWindow; j++) {
            const laterTrades = this.blockHistory.get(j) || [];
            
            for (const later of laterTrades) {
              if (later.seller === frontRunner && later.buyer === victim) {
                return {
                  type: 'SANDWICH_ATTACK',
                  victim,
                  attacker: frontRunner,
                  marketId: trade.marketId,
                  lossAmount: trade.amount / 100n, // Estimate
                  timestamp: Date.now(),
                  blockNumber: currentBlock
                };
              }
            }
          }
        }
      }
    }

    return null;
  }

  addPendingTx(txHash: string, order: Order): void {
    this.pendingTxs.set(txHash, order);
  }

  removePendingTx(txHash: string): void {
    this.pendingTxs.delete(txHash);
  }
}