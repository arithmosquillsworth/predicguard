/**
 * Aggressive Bot Template
 * 
 * Strategy:
 * - Max 10% per trade
 * - All confidence levels > 30%
 * - No loss limits (high risk)
 * - Rapid position changes
 * - High frequency trading style
 */

import { BaseAgent, AgentConfig, MarketData, Prediction, TradeDecision } from './base-agent';
import { AuditLogger } from '../audit/audit-trail';

export interface AggressiveConfig {
  wallet: { address: string; balance: bigint };
  auditLogger: AuditLogger;
  customParams?: {
    confidenceThreshold?: number;
    maxPositionPercent?: number;
    stopLossPercent?: number;
    maxPositions?: number;
  };
}

export class AggressiveBot extends BaseAgent {
  private maxPositions: number;
  private activeTrades: Map<string, { entryTime: number; entryPrice: bigint }> = new Map();

  constructor(config: AggressiveConfig) {
    const agentConfig: AgentConfig = {
      name: 'AggressiveBot',
      maxPositionPercent: config.customParams?.maxPositionPercent || 0.10, // 10%
      minConfidenceThreshold: config.customParams?.confidenceThreshold || 0.30, // 30%
      kellyFraction: 0.5, // Half Kelly - still aggressive
      stopLossPercent: config.customParams?.stopLossPercent || 0.10, // 10% stop loss
      takeProfitPercent: 0.30, // 30% take profit
      maxDailyDrawdownPercent: 0.15, // 15% daily limit (loose)
      maxTotalDrawdownPercent: 0.50, // 50% total limit (very loose)
      rebalanceThreshold: 0.10,
      whaleThreshold: BigInt('10000000000000000000'), // 10 ETH
      tradingEnabled: true
    };

    super(agentConfig, config.wallet, config.auditLogger);

    // Aggressive allocations - tilted toward speculative
    this.portfolioBalancer = new PortfolioBalancer(
      new Map([
        ['stable', 0.1],
        ['moderate', 0.3],
        ['speculative', 0.6]
      ]),
      0.10
    );

    this.maxPositions = config.customParams?.maxPositions || 10;
  }

  async generatePrediction(marketData: MarketData): Promise<Prediction> {
    // Aggressive prediction using multiple signals
    
    // Trade almost everything with some confidence
    const trendSignal = this.calculateTrend(marketData);
    const volumeSignal = this.calculateVolumeSignal(marketData);
    const volatilitySignal = this.calculateVolatilitySignal(marketData);
    
    // Weight signals aggressively
    const combinedSignal = (
      trendSignal * 0.4 +
      volumeSignal * 0.35 +
      volatilitySignal * 0.25
    );

    const confidence = Math.max(0.30, Math.abs(combinedSignal));

    return {
      marketId: marketData.marketId,
      outcome: combinedSignal > 0,
      confidence,
      expectedValue: combinedSignal * 2, // Aggressive EV
      timestamp: Date.now()
    };
  }

  protected async makeTradingDecision(
    marketData: MarketData,
    prediction: Prediction
  ): Promise<TradeDecision | null> {

    // Aggressive bot trades on lower confidence
    if (prediction.confidence < this.config.minConfidenceThreshold) {
      return null;
    }

    const existingPosition = this.getPositionSize(marketData.marketId);
    const activeTrade = this.activeTrades.get(marketData.marketId);

    // Check if we should exit existing position
    if (existingPosition > 0n && activeTrade) {
      const timeHeld = Date.now() - activeTrade.entryTime;
      const priceChange = Number(marketData.currentPrice - activeTrade.entryPrice) / 
                         Number(activeTrade.entryPrice);

      // Quick exit if prediction flips
      if (!prediction.outcome) {
        return {
          action: 'SELL',
          amount: existingPosition,
          marketId: marketData.marketId,
          reason: `Quick flip exit: ${(prediction.confidence * 100).toFixed(1)}% confidence`,
          confidence: prediction.confidence
        };
      }

      // Time-based exit for scalping
      if (timeHeld > 300000 && priceChange > 0.02) { // 5 min, 2% profit
        return {
          action: 'SELL',
          amount: existingPosition,
          marketId: marketData.marketId,
          reason: `Scalp exit: ${(priceChange * 100).toFixed(2)}% in ${(timeHeld / 1000).toFixed(0)}s`,
          confidence: 1.0
        };
      }
    }

    // Check position limits
    if (this.portfolio.positions.length >= this.maxPositions && existingPosition === 0n) {
      await this.logEvent('MAX_POSITIONS_REACHED', { 
        current: this.portfolio.positions.length 
      });
      return null;
    }

    // Enter new position
    if (prediction.outcome && existingPosition === 0n) {
      return {
        action: 'BUY',
        amount: 0n, // Will be sized by risk management
        marketId: marketData.marketId,
        reason: `Aggressive entry: trend=${this.calculateTrend(marketData).toFixed(2)}, vol=${marketData.volatility.toFixed(2)}`,
        confidence: prediction.confidence
      };
    }

    // Scale into existing position if very confident
    if (prediction.outcome && existingPosition > 0n && prediction.confidence > 0.70) {
      return {
        action: 'BUY',
        amount: 0n,
        marketId: marketData.marketId,
        reason: `Scaling in: high confidence ${(prediction.confidence * 100).toFixed(1)}%`,
        confidence: prediction.confidence
      };
    }

    return null;
  }

  async executeTrade(decision: TradeDecision): Promise<boolean> {
    try {
      await this.logEvent('EXECUTING_TRADE', { decision });

      const price = BigInt(1000); // Mock price
      const isBuy = decision.action === 'BUY';
      
      await this.updatePosition(
        decision.marketId,
        decision.amount,
        price,
        isBuy
      );

      // Track active trades
      if (isBuy) {
        this.activeTrades.set(decision.marketId, {
          entryTime: Date.now(),
          entryPrice: price
        });
      } else {
        this.activeTrades.delete(decision.marketId);
      }

      await this.logEvent('TRADE_EXECUTED', { 
        decision,
        price,
        activeTrades: this.activeTrades.size 
      });

      return true;
    } catch (error) {
      await this.logEvent('TRADE_FAILED', { 
        decision,
        error: (error as Error).message 
      });
      return false;
    }
  }

  private calculateTrend(marketData: MarketData): number {
    // Simple trend strength
    const volumeBoost = Math.min(Number(marketData.volume24h) / 1e18, 2);
    return Math.tanh(volumeBoost - 0.5);
  }

  private calculateVolumeSignal(marketData: MarketData): number {
    // Volume-based signal
    const normalizedVol = Number(marketData.volume24h) / Number(marketData.liquidity);
    return normalizedVol > 1 ? 0.5 : -0.3;
  }

  private calculateVolatilitySignal(marketData: MarketData): number {
    // Trade volatility breaks
    if (marketData.volatility > 0.4) {
      return 0.4; // Breakout signal
    }
    return 0;
  }

  /**
   * Close all positions - emergency exit
   */
  async closeAllPositions(): Promise<void> {
    await this.logEvent('CLOSING_ALL_POSITIONS', { 
      count: this.portfolio.positions.length 
    });

    for (const position of [...this.portfolio.positions]) {
      const decision: TradeDecision = {
        action: 'SELL',
        amount: position.position,
        marketId: position.marketId,
        reason: 'Emergency close all',
        confidence: 1.0
      };

      await this.executeTrade(decision);
    }

    this.activeTrades.clear();

    await this.logEvent('ALL_POSITIONS_CLOSED', { 
      finalCash: this.portfolio.cash 
    });
  }

  /**
   * Get active trade statistics
   */
  getActiveTradeStats(): {
    count: number;
    avgHoldTime: number;
    unrealizedPnl: number;
  } {
    const now = Date.now();
    let totalHoldTime = 0;
    let unrealizedPnl = 0;

    for (const [marketId, trade] of this.activeTrades) {
      totalHoldTime += now - trade.entryTime;
      
      const position = this.portfolio.positions.find(p => p.marketId === marketId);
      if (position) {
        const pnl = Number(position.currentPrice - trade.entryPrice) / Number(trade.entryPrice);
        unrealizedPnl += pnl;
      }
    }

    const count = this.activeTrades.size;
    return {
      count,
      avgHoldTime: count > 0 ? totalHoldTime / count : 0,
      unrealizedPnl
    };
  }
}