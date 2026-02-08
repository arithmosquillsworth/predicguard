/**
 * Risk Management Module
 * 
 * Core risk management functionality including:
 * - Position sizing (Kelly criterion, fractional Kelly)
 * - Stop losses and take profits
 * - Portfolio balancing
 * - Drawdown protection
 */

export interface PositionSizingParams {
  bankroll: bigint;
  winProbability: number;
  winLossRatio: number;
  kellyFraction?: number;
  maxPositionPercent?: number;
}

export interface StopLossParams {
  entryPrice: bigint;
  stopLossPercent: number;
  takeProfitPercent?: number;
  trailingStopPercent?: number;
}

export interface PortfolioPosition {
  marketId: string;
  position: bigint;
  entryPrice: bigint;
  currentPrice: bigint;
  timestamp: number;
}

export interface PortfolioState {
  totalValue: bigint;
  positions: PortfolioPosition[];
  cash: bigint;
  lastRebalance: number;
}

export interface DrawdownConfig {
  maxDailyDrawdownPercent: number;
  maxTotalDrawdownPercent: number;
  cooldownPeriodMs: number;
  pauseOnTrigger: boolean;
}

export interface DrawdownState {
  peakValue: bigint;
  currentValue: bigint;
  dailyStartValue: bigint;
  lastReset: number;
  inCooldown: boolean;
  cooldownEnd: number;
  triggeredCount: number;
}

/**
 * Calculate Kelly criterion position size
 * f* = (bp - q) / b
 * where b = win/loss ratio, p = win probability, q = loss probability
 */
export function calculateKellyCriterion(params: PositionSizingParams): bigint {
  const { bankroll, winProbability, winLossRatio, kellyFraction = 0.25, maxPositionPercent = 0.1 } = params;
  
  // Validate inputs
  if (winProbability <= 0 || winProbability >= 1) {
    throw new Error('Win probability must be between 0 and 1');
  }
  if (winLossRatio <= 0) {
    throw new Error('Win/loss ratio must be positive');
  }
  
  const lossProbability = 1 - winProbability;
  
  // Full Kelly fraction
  const fullKelly = (winLossRatio * winProbability - lossProbability) / winLossRatio;
  
  // Apply fractional Kelly for safety
  const adjustedKelly = Math.max(0, fullKelly * kellyFraction);
  
  // Cap at max position percent
  const finalFraction = Math.min(adjustedKelly, maxPositionPercent);
  
  return (bankroll * BigInt(Math.floor(finalFraction * 10000))) / 10000n;
}

/**
 * Calculate fixed fractional position size
 * Simple percent of bankroll per trade
 */
export function calculateFixedFractional(
  bankroll: bigint,
  fraction: number,
  maxPosition?: bigint
): bigint {
  const position = (bankroll * BigInt(Math.floor(fraction * 10000))) / 10000n;
  return maxPosition && position > maxPosition ? maxPosition : position;
}

/**
 * Calculate volatility-adjusted position size
 * Reduces size in high volatility environments
 */
export function calculateVolatilityAdjusted(
  basePosition: bigint,
  volatility: number,
  targetVolatility: number = 0.2
): bigint {
  const volRatio = targetVolatility / Math.max(volatility, 0.01);
  const adjustment = Math.min(Math.sqrt(volRatio), 1.0);
  return (basePosition * BigInt(Math.floor(adjustment * 10000))) / 10000n;
}

/**
 * Stop Loss and Take Profit Calculator
 */
export class StopLossManager {
  private params: StopLossParams;
  private highestPrice: bigint;
  private lowestPrice: bigint;
  private isActive: boolean = true;

  constructor(params: StopLossParams) {
    this.params = params;
    this.highestPrice = params.entryPrice;
    this.lowestPrice = params.entryPrice;
  }

  updatePrice(currentPrice: bigint): { shouldExit: boolean; reason?: string } {
    if (!this.isActive) {
      return { shouldExit: false };
    }

    // Update trailing stops
    if (currentPrice > this.highestPrice) {
      this.highestPrice = currentPrice;
    }
    if (currentPrice < this.lowestPrice) {
      this.lowestPrice = currentPrice;
    }

    // Check stop loss
    const stopLossPrice = this.calculateStopLossPrice();
    if (currentPrice <= stopLossPrice) {
      return { shouldExit: true, reason: 'STOP_LOSS' };
    }

    // Check take profit
    if (this.params.takeProfitPercent) {
      const takeProfitPrice = this.calculateTakeProfitPrice();
      if (currentPrice >= takeProfitPrice) {
        return { shouldExit: true, reason: 'TAKE_PROFIT' };
      }
    }

    // Check trailing stop
    if (this.params.trailingStopPercent) {
      const trailingStopPrice = this.calculateTrailingStopPrice();
      if (currentPrice <= trailingStopPrice) {
        return { shouldExit: true, reason: 'TRAILING_STOP' };
      }
    }

    return { shouldExit: false };
  }

  private calculateStopLossPrice(): bigint {
    const drop = (this.params.entryPrice * BigInt(Math.floor(this.params.stopLossPercent * 100))) / 10000n;
    return this.params.entryPrice - drop;
  }

  private calculateTakeProfitPrice(): bigint {
    if (!this.params.takeProfitPercent) return 0n;
    const gain = (this.params.entryPrice * BigInt(Math.floor(this.params.takeProfitPercent * 100))) / 10000n;
    return this.params.entryPrice + gain;
  }

  private calculateTrailingStopPrice(): bigint {
    if (!this.params.trailingStopPercent) return 0n;
    const drop = (this.highestPrice * BigInt(Math.floor(this.params.trailingStopPercent * 100))) / 10000n;
    return this.highestPrice - drop;
  }

  deactivate(): void {
    this.isActive = false;
  }

  isPositionActive(): boolean {
    return this.isActive;
  }
}

/**
 * Portfolio Balancer
 * Manages diversification and rebalancing across markets
 */
export class PortfolioBalancer {
  private targetAllocations: Map<string, number>;
  private rebalanceThreshold: number;
  private maxSlippagePercent: number;

  constructor(
    targetAllocations: Map<string, number>,
    rebalanceThreshold: number = 0.05,
    maxSlippagePercent: number = 1.0
  ) {
    this.targetAllocations = targetAllocations;
    this.rebalanceThreshold = rebalanceThreshold;
    this.maxSlippagePercent = maxSlippagePercent;

    // Validate allocations sum to ~1
    const total = Array.from(targetAllocations.values()).reduce((a, b) => a + b, 0);
    if (Math.abs(total - 1.0) > 0.01) {
      throw new Error('Target allocations must sum to 1.0');
    }
  }

  calculateRebalanceTrades(state: PortfolioState): Array<{
    marketId: string;
    action: 'BUY' | 'SELL';
    amount: bigint;
  }> {
    const trades: Array<{ marketId: string; action: 'BUY' | 'SELL'; amount: bigint }> = [];
    const totalValue = state.totalValue;

    // Calculate current allocations
    const currentAllocations = new Map<string, bigint>();
    let allocatedValue = 0n;

    for (const pos of state.positions) {
      const value = pos.position * pos.currentPrice;
      currentAllocations.set(pos.marketId, value);
      allocatedValue += value;
    }

    const cashAllocation = totalValue - allocatedValue;

    // Check each target allocation
    for (const [marketId, targetPct] of this.targetAllocations) {
      const targetValue = (totalValue * BigInt(Math.floor(targetPct * 10000))) / 10000n;
      const currentValue = currentAllocations.get(marketId) || 0n;
      
      const deviation = Number(currentValue - targetValue) / Number(totalValue);

      if (Math.abs(deviation) > this.rebalanceThreshold) {
        const diff = targetValue > currentValue ? targetValue - currentValue : currentValue - targetValue;
        
        if (diff > 0n) {
          trades.push({
            marketId,
            action: targetValue > currentValue ? 'BUY' : 'SELL',
            amount: diff
          });
        }
      }
    }

    return trades;
  }

  shouldRebalance(state: PortfolioState): boolean {
    const trades = this.calculateRebalanceTrades(state);
    return trades.length > 0;
  }

  calculateConcentrationRisk(state: PortfolioState): number {
    if (state.positions.length === 0) return 0;
    
    let maxPosition = 0n;
    for (const pos of state.positions) {
      const value = pos.position * pos.currentPrice;
      if (value > maxPosition) {
        maxPosition = value;
      }
    }
    
    return Number(maxPosition) / Number(state.totalValue);
  }
}

/**
 * Drawdown Protection System
 * Monitors and enforces drawdown limits
 */
export class DrawdownProtector {
  private config: DrawdownConfig;
  private state: DrawdownState;

  constructor(config: DrawdownConfig, initialValue: bigint) {
    this.config = config;
    this.state = {
      peakValue: initialValue,
      currentValue: initialValue,
      dailyStartValue: initialValue,
      lastReset: Date.now(),
      inCooldown: false,
      cooldownEnd: 0,
      triggeredCount: 0
    };
  }

  updateValue(currentValue: bigint): {
    canTrade: boolean;
    drawdownPercent: number;
    dailyDrawdownPercent: number;
    status: 'NORMAL' | 'WARNING' | 'CRITICAL' | 'COOLDOWN';
  } {
    this.state.currentValue = currentValue;
    const now = Date.now();

    // Update peak
    if (currentValue > this.state.peakValue) {
      this.state.peakValue = currentValue;
    }

    // Reset daily if needed
    if (now - this.state.lastReset > 86400000) {
      this.state.dailyStartValue = currentValue;
      this.state.lastReset = now;
    }

    // Check cooldown
    if (this.state.inCooldown) {
      if (now >= this.state.cooldownEnd) {
        this.state.inCooldown = false;
      } else {
        return {
          canTrade: false,
          drawdownPercent: this.calculateDrawdown(),
          dailyDrawdownPercent: this.calculateDailyDrawdown(),
          status: 'COOLDOWN'
        };
      }
    }

    const drawdownPercent = this.calculateDrawdown();
    const dailyDrawdownPercent = this.calculateDailyDrawdown();

    // Check total drawdown
    if (drawdownPercent >= this.config.maxTotalDrawdownPercent) {
      this.triggerCooldown();
      return {
        canTrade: false,
        drawdownPercent,
        dailyDrawdownPercent,
        status: 'CRITICAL'
      };
    }

    // Check daily drawdown
    if (dailyDrawdownPercent >= this.config.maxDailyDrawdownPercent) {
      this.triggerCooldown();
      return {
        canTrade: false,
        drawdownPercent,
        dailyDrawdownPercent,
        status: 'CRITICAL'
      };
    }

    // Warning at 80% of limit
    const warningThreshold = this.config.maxDailyDrawdownPercent * 0.8;
    const status = dailyDrawdownPercent > warningThreshold ? 'WARNING' : 'NORMAL';

    return {
      canTrade: !this.config.pauseOnTrigger || status !== 'CRITICAL',
      drawdownPercent,
      dailyDrawdownPercent,
      status
    };
  }

  private calculateDrawdown(): number {
    if (this.state.peakValue === 0n) return 0;
    const drop = this.state.peakValue - this.state.currentValue;
    return Number(drop) / Number(this.state.peakValue);
  }

  private calculateDailyDrawdown(): number {
    if (this.state.dailyStartValue === 0n) return 0;
    const drop = this.state.dailyStartValue - this.state.currentValue;
    return Number(drop) / Number(this.state.dailyStartValue);
  }

  private triggerCooldown(): void {
    this.state.inCooldown = true;
    this.state.cooldownEnd = Date.now() + this.config.cooldownPeriodMs;
    this.state.triggeredCount++;
  }

  getState(): DrawdownState {
    return { ...this.state };
  }

  resetPeak(): void {
    this.state.peakValue = this.state.currentValue;
  }
}