/**
 * Balanced Bot Template
 * 
 * Strategy:
 * - Max 5% per trade
 * - Medium confidence (50-70%)
 * - Weekly rebalancing
 * - Dynamic position sizing based on volatility
 * - Moderate risk tolerance
 */

import { BaseAgent, AgentConfig, MarketData, Prediction, TradeDecision } from './base-agent';
import { AuditLogger } from '../audit/audit-trail';
import { calculateVolatilityAdjusted } from '../risk/position-sizing';

export interface BalancedConfig {
  wallet: { address: string; balance: bigint };
  auditLogger: AuditLogger;
  customParams?: {
    confidenceThreshold?: number;
    maxPositionPercent?: number;
    stopLossPercent?: number;
    volatilityTarget?: number;
  };
}

export class BalancedBot extends BaseAgent {
  private lastRebalance: number = 0;
  private rebalanceIntervalMs: number = 604800000; // 7 days
  private volatilityTarget: number;

  constructor(config: BalancedConfig) {
    const agentConfig: AgentConfig = {
      name: 'BalancedBot',
      maxPositionPercent: config.customParams?.maxPositionPercent || 0.05, // 5%
      minConfidenceThreshold: config.customParams?.confidenceThreshold || 0.50,
      kellyFraction: 0.25, // Quarter Kelly
      stopLossPercent: config.customParams?.stopLossPercent || 0.05, // 5% stop loss
      takeProfitPercent: 0.15, // 15% take profit
      maxDailyDrawdownPercent: 0.05, // 5% daily limit
      maxTotalDrawdownPercent: 0.20, // 20% total limit
      rebalanceThreshold: 0.05,
      whaleThreshold: BigInt('5000000000000000000'), // 5 ETH
      tradingEnabled: true
    };

    super(agentConfig, config.wallet, config.auditLogger);

    // Balanced allocations
    this.portfolioBalancer = new PortfolioBalancer(
      new Map([
        ['stable', 0.3],
        ['moderate', 0.4],
        ['speculative', 0.3]
      ]),
      0.05
    );

    this.volatilityTarget = config.customParams?.volatilityTarget || 0.25;
  }

  async generatePrediction(marketData: MarketData): Promise<Prediction> {
    // Balanced prediction using momentum + mean reversion
    
    // Skip extremely volatile markets
    if (marketData.volatility > 0.5) {
      return {
        marketId: marketData.marketId,
        outcome: false,
        confidence: 0,
        expectedValue: 0,
        timestamp: Date.now()
      };
    }

    // Combined signal: momentum with mean reversion dampening
    const momentum = this.calculateMomentum(marketData);
    const meanReversion = this.calculateMeanReversion(marketData);
    
    // Weight: 60% momentum, 40% mean reversion
    const signal = momentum * 0.6 + meanReversion * 0.4;
    const confidence = Math.min(Math.abs(signal), 0.85);

    return {
      marketId: marketData.marketId,
      outcome: signal > 0,
      confidence,
      expectedValue: confidence * signal,
      timestamp: Date.now()
    };
  }

  protected async makeTradingDecision(
    marketData: MarketData,
    prediction: Prediction
  ): Promise<TradeDecision | null> {

    // Check if rebalancing is needed
    await this.checkRebalance();

    // Volatility adjustment
    const volatilityAdjusted = calculateVolatilityAdjusted(
      BigInt('1000000000000000000'), // Placeholder
      marketData.volatility,
      this.volatilityTarget
    );

    // Skip if volatility too high after adjustment
    if (marketData.volatility > this.volatilityTarget * 2) {
      await this.logEvent('VOLATILITY_SKIP', { 
        volatility: marketData.volatility 
      });
      return null;
    }

    const existingPosition = this.getPositionSize(marketData.marketId);

    if (prediction.outcome && prediction.confidence >= this.config.minConfidenceThreshold) {
      // Buy signal
      if (existingPosition > 0n) {
        // Consider adding if high confidence
        if (prediction.confidence > 0.65) {
          return {
            action: 'BUY',
            amount: 0n,
            marketId: marketData.marketId,
            reason: `Adding to position: ${(prediction.confidence * 100).toFixed(1)}% confidence`,
            confidence: prediction.confidence
          };
        }
        return null;
      }

      return {
        action: 'BUY',
        amount: 0n,
        marketId: marketData.marketId,
        reason: `New position: ${(prediction.confidence * 100).toFixed(1)}% confidence, vol-adjusted`,
        confidence: prediction.confidence
      };
    } else if (!prediction.outcome && existingPosition > 0n) {
      // Sell signal
      const shouldExit = prediction.confidence < this.config.minConfidenceThreshold * 0.8;
      
      if (shouldExit) {
        return {
          action: 'SELL',
          amount: existingPosition,
          marketId: marketData.marketId,
          reason: `Exit: confidence below threshold`,
          confidence: 1 - prediction.confidence
        };
      }
    }

    return null;
  }

  async executeTrade(decision: TradeDecision): Promise<boolean> {
    try {
      await this.logEvent('EXECUTING_TRADE', { decision });

      const price = BigInt(1000); // Mock price
      
      await this.updatePosition(
        decision.marketId,
        decision.amount,
        price,
        decision.action === 'BUY'
      );

      await this.logEvent('TRADE_EXECUTED', { 
        decision,
        price 
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

  private calculateMomentum(marketData: MarketData): number {
    // Simplified momentum calculation
    // In production, would use historical price data
    const volumeRatio = Number(marketData.volume24h) / Number(marketData.liquidity);
    return Math.tanh(volumeRatio - 1) * 0.5; // Normalized to ~[-0.5, 0.5]
  }

  private calculateMeanReversion(marketData: MarketData): number {
    // Simplified mean reversion
    const priceRelative = Number(marketData.currentPrice) / 1000;
    return -Math.tanh(priceRelative - 1) * 0.5;
  }

  private async checkRebalance(): Promise<void> {
    const now = Date.now();
    
    if (now - this.lastRebalance < this.rebalanceIntervalMs) {
      return;
    }

    await this.logEvent('SCHEDULED_REBALANCE', { 
      lastRebalance: this.lastRebalance 
    });

    const trades = this.portfolioBalancer.calculateRebalanceTrades(this.portfolio);
    
    for (const trade of trades) {
      const decision: TradeDecision = {
        action: trade.action,
        amount: trade.amount,
        marketId: trade.marketId,
        reason: 'Scheduled rebalancing',
        confidence: 0.9
      };

      await this.executeTrade(decision);
    }

    this.lastRebalance = now;
    this.portfolio.lastRebalance = now;

    await this.logEvent('REBALANCE_COMPLETE', { 
      tradesExecuted: trades.length 
    });
  }
}