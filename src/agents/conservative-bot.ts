/**
 * Conservative Bot Template
 * 
 * Strategy:
 * - Max 1% per trade
 * - Only high-confidence predictions (>70%)
 * - Daily loss limit: 3%
 * - Tight stop losses
 * - Avoids volatile markets
 */

import { BaseAgent, AgentConfig, MarketData, Prediction, TradeDecision } from './base-agent';
import { AuditLogger } from '../audit/audit-trail';
import { calculateVolatilityAdjusted, PortfolioBalancer } from '../risk/position-sizing';

export interface ConservativeConfig {
  wallet: { address: string; balance: bigint };
  auditLogger: AuditLogger;
  customParams?: {
    confidenceThreshold?: number;
    maxPositionPercent?: number;
    stopLossPercent?: number;
    maxVolatility?: number;
  };
}

export class ConservativeBot extends BaseAgent {
  constructor(config: ConservativeConfig) {
    const agentConfig: AgentConfig = {
      name: 'ConservativeBot',
      maxPositionPercent: config.customParams?.maxPositionPercent || 0.01, // 1%
      minConfidenceThreshold: config.customParams?.confidenceThreshold || 0.70,
      kellyFraction: 0.1, // Very conservative Kelly
      stopLossPercent: config.customParams?.stopLossPercent || 0.02, // 2% stop loss
      takeProfitPercent: 0.05, // 5% take profit
      maxDailyDrawdownPercent: 0.03, // 3% daily limit
      maxTotalDrawdownPercent: 0.10, // 10% total limit
      rebalanceThreshold: 0.02,
      whaleThreshold: BigInt('1000000000000000000'), // 1 ETH
      tradingEnabled: true
    };

    super(agentConfig, config.wallet, config.auditLogger);
    
    // Set conservative allocations
    this.portfolioBalancer = new PortfolioBalancer(
      new Map([
        ['stable', 0.5],
        ['moderate', 0.3],
        ['speculative', 0.2]
      ]),
      0.02
    );

    this.maxVolatility = config.customParams?.maxVolatility || 0.3;
  }

  private maxVolatility: number;

  async generatePrediction(marketData: MarketData): Promise<Prediction> {
    // Conservative prediction logic
    // Only predict on low-volatility, high-liquidity markets
    
    if (marketData.volatility > this.maxVolatility) {
      return {
        marketId: marketData.marketId,
        outcome: false,
        confidence: 0,
        expectedValue: 0,
        timestamp: Date.now()
      };
    }

    // Simple mean-reversion with high threshold
    const priceChange = Number(marketData.currentPrice) / Number(marketData.liquidity);
    const confidence = Math.min(Math.abs(priceChange) * 10, 0.95);
    
    // Only trade if very confident
    if (confidence < this.config.minConfidenceThreshold) {
      return {
        marketId: marketData.marketId,
        outcome: false,
        confidence: 0,
        expectedValue: 0,
        timestamp: Date.now()
      };
    }

    return {
      marketId: marketData.marketId,
      outcome: priceChange < 0, // Buy if price dropped
      confidence,
      expectedValue: confidence * 0.5, // Conservative EV estimate
      timestamp: Date.now()
    };
  }

  protected async makeTradingDecision(
    marketData: MarketData,
    prediction: Prediction
  ): Promise<TradeDecision | null> {
    
    // Additional safety checks for conservative bot
    if (prediction.confidence < this.config.minConfidenceThreshold) {
      return null;
    }

    // Check market liquidity
    if (marketData.liquidity < BigInt('500000000000000000')) { // 0.5 ETH min liquidity
      await this.logEvent('LOW_LIQUIDITY', { marketId: marketData.marketId });
      return null;
    }

    // Check for recent volatility spike
    if (marketData.volatility > this.maxVolatility) {
      await this.logEvent('HIGH_VOLATILITY_SKIP', { 
        volatility: marketData.volatility,
        max: this.maxVolatility 
      });
      return null;
    }

    const existingPosition = this.getPositionSize(marketData.marketId);

    if (prediction.outcome) {
      // Buy signal
      if (existingPosition > 0n) {
        return null; // Already holding
      }

      return {
        action: 'BUY',
        amount: 0n, // Will be set by risk management
        marketId: marketData.marketId,
        reason: `High confidence buy signal: ${(prediction.confidence * 100).toFixed(1)}%`,
        confidence: prediction.confidence
      };
    } else {
      // Sell signal
      if (existingPosition <= 0n) {
        return null;
      }

      return {
        action: 'SELL',
        amount: existingPosition,
        marketId: marketData.marketId,
        reason: `Exit signal: confidence dropped to ${(prediction.confidence * 100).toFixed(1)}%`,
        confidence: prediction.confidence
      };
    }
  }

  async executeTrade(decision: TradeDecision): Promise<boolean> {
    try {
      await this.logEvent('EXECUTING_TRADE', { decision });

      // Simulate trade execution
      // In production, this would call the actual DEX/market contract
      const price = BigInt(1000); // Mock price
      
      await this.updatePosition(
        decision.marketId,
        decision.amount,
        price,
        decision.action === 'BUY'
      );

      await this.logEvent('TRADE_EXECUTED', { 
        decision,
        price,
        newBalance: this.portfolio.cash 
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

  /**
   * Conservative bot specific: Rebalance to cash if market conditions worsen
   */
  async emergencyDeRisk(): Promise<void> {
    await this.logEvent('EMERGENCY_DERISK_START', {});

    for (const position of this.portfolio.positions) {
      const decision: TradeDecision = {
        action: 'SELL',
        amount: position.position,
        marketId: position.marketId,
        reason: 'Emergency de-risking due to market conditions',
        confidence: 1.0
      };

      await this.executeTrade(decision);
    }

    await this.logEvent('EMERGENCY_DERISK_COMPLETE', { 
      finalCash: this.portfolio.cash 
    });
  }
}