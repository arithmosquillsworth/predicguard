/**
 * Base Agent Class
 * Abstract base for all prediction market agents
 */

import {
  calculateKellyCriterion,
  calculateFixedFractional,
  StopLossManager,
  PortfolioBalancer,
  DrawdownProtector,
  PositionSizingParams,
  StopLossParams,
  PortfolioState,
  DrawdownConfig
} from '../risk/position-sizing';

import {
  WhaleDetector,
  WashTradingDetector,
  OracleMonitor,
  SandwichProtector,
  Order,
  Trade,
  WhaleAlert,
  WashTradingAlert,
  OracleStatus,
  SandwichAlert
} from '../security/anti-manipulation';

import { AuditLogger, AuditEntry } from '../audit/audit-trail';

export interface AgentConfig {
  name: string;
  maxPositionPercent: number;
  minConfidenceThreshold: number;
  kellyFraction: number;
  stopLossPercent: number;
  takeProfitPercent?: number;
  maxDailyDrawdownPercent: number;
  maxTotalDrawdownPercent: number;
  rebalanceThreshold: number;
  whaleThreshold: bigint;
  tradingEnabled: boolean;
}

export interface MarketData {
  marketId: string;
  currentPrice: bigint;
  liquidity: bigint;
  volume24h: bigint;
  volatility: number;
  timestamp: number;
}

export interface Prediction {
  marketId: string;
  outcome: boolean;
  confidence: number;
  expectedValue: number;
  timestamp: number;
}

export interface TradeDecision {
  action: 'BUY' | 'SELL' | 'HOLD';
  amount: bigint;
  marketId: string;
  reason: string;
  confidence: number;
}

export abstract class BaseAgent {
  protected config: AgentConfig;
  protected wallet: { address: string; balance: bigint };
  protected portfolio: PortfolioState;
  protected drawdownProtector: DrawdownProtector;
  protected stopLossManagers: Map<string, StopLossManager>;
  protected portfolioBalancer: PortfolioBalancer;
  protected whaleDetector: WhaleDetector;
  protected washTradingDetector: WashTradingDetector;
  protected oracleMonitor: OracleMonitor;
  protected sandwichProtector: SandwichProtector;
  protected auditLogger: AuditLogger;
  protected isRunning: boolean = false;
  protected alertHandlers: Array<(alert: any) => void> = [];

  constructor(
    config: AgentConfig,
    wallet: { address: string; balance: bigint },
    auditLogger: AuditLogger
  ) {
    this.config = config;
    this.wallet = wallet;
    this.auditLogger = auditLogger;
    
    // Initialize portfolio
    this.portfolio = {
      totalValue: wallet.balance,
      positions: [],
      cash: wallet.balance,
      lastRebalance: Date.now()
    };

    // Initialize risk management
    const drawdownConfig: DrawdownConfig = {
      maxDailyDrawdownPercent: config.maxDailyDrawdownPercent,
      maxTotalDrawdownPercent: config.maxTotalDrawdownPercent,
      cooldownPeriodMs: 3600000, // 1 hour
      pauseOnTrigger: true
    };
    this.drawdownProtector = new DrawdownProtector(drawdownConfig, wallet.balance);

    // Initialize portfolio balancer
    this.portfolioBalancer = new PortfolioBalancer(
      new Map(), // Allocations set by subclasses
      config.rebalanceThreshold
    );

    // Initialize security systems
    this.whaleDetector = new WhaleDetector(config.whaleThreshold);
    this.washTradingDetector = new WashTradingDetector();
    this.oracleMonitor = new OracleMonitor(['chainlink', 'uniswap', 'binance']);
    this.sandwichProtector = new SandwichProtector();

    this.stopLossManagers = new Map();
  }

  /**
   * Start the agent
   */
  async start(): Promise<void> {
    this.isRunning = true;
    
    await this.auditLogger.log({
      type: 'AGENT_START',
      agent: this.config.name,
      data: { config: this.config },
      timestamp: Date.now()
    });

    console.log(`[${this.config.name}] Agent started`);
  }

  /**
   * Stop the agent
   */
  async stop(): Promise<void> {
    this.isRunning = false;
    
    await this.auditLogger.log({
      type: 'AGENT_STOP',
      agent: this.config.name,
      data: { finalPortfolio: this.portfolio },
      timestamp: Date.now()
    });

    console.log(`[${this.config.name}] Agent stopped`);
  }

  /**
   * Main decision loop - called for each market update
   */
  async processMarketData(marketData: MarketData, prediction: Prediction): Promise<TradeDecision | null> {
    if (!this.isRunning || !this.config.tradingEnabled) {
      return null;
    }

    try {
      // 1. Check drawdown protection
      const drawdownStatus = this.drawdownProtector.updateValue(this.portfolio.totalValue);
      if (!drawdownStatus.canTrade) {
        await this.logEvent('DRAWDOWN_HALT', { status: drawdownStatus });
        return null;
      }

      // 2. Check oracle health
      const oracleHealth = this.oracleMonitor.checkHealth();
      if (!oracleHealth.healthy) {
        await this.logEvent('ORACLE_UNHEALTHY', { issues: oracleHealth.issues });
        return null;
      }

      // 3. Check for manipulation
      const manipulationCheck = await this.checkForManipulation(marketData);
      if (manipulationCheck.alert) {
        await this.handleAlert(manipulationCheck.alert);
        if (manipulationCheck.blockTrade) {
          return null;
        }
      }

      // 4. Make trading decision
      const decision = await this.makeTradingDecision(marketData, prediction);
      if (!decision || decision.action === 'HOLD') {
        return null;
      }

      // 5. Validate with risk management
      const validatedDecision = await this.validateWithRiskManagement(decision, marketData);
      if (!validatedDecision) {
        return null;
      }

      // 6. Log and return
      await this.logEvent('TRADE_DECISION', { decision: validatedDecision });
      return validatedDecision;

    } catch (error) {
      await this.logEvent('ERROR', { error: (error as Error).message });
      return null;
    }
  }

  /**
   * Execute a trade (to be implemented by subclasses)
   */
  abstract executeTrade(decision: TradeDecision): Promise<boolean>;

  /**
   * Generate prediction for a market (to be implemented by subclasses)
   */
  abstract generatePrediction(marketData: MarketData): Promise<Prediction>;

  /**
   * Make trading decision based on prediction
   */
  protected abstract makeTradingDecision(
    marketData: MarketData,
    prediction: Prediction
  ): Promise<TradeDecision | null>;

  /**
   * Check for market manipulation
   */
  private async checkForManipulation(marketData: MarketData): Promise<{
    alert: WhaleAlert | WashTradingAlert | SandwichAlert | null;
    blockTrade: boolean;
  }> {
    // Create dummy order for whale detection
    const dummyOrder: Order = {
      id: 'check',
      marketId: marketData.marketId,
      trader: this.wallet.address,
      side: 'BUY',
      amount: marketData.liquidity / 100n,
      price: marketData.currentPrice,
      timestamp: Date.now(),
      blockNumber: 0
    };

    const whaleAlert = this.whaleDetector.analyzeOrder(dummyOrder, marketData.liquidity);
    if (whaleAlert && whaleAlert.severity === 'CRITICAL') {
      return { alert: whaleAlert, blockTrade: true };
    }

    return { alert: null, blockTrade: false };
  }

  /**
   * Validate trade with risk management rules
   */
  private async validateWithRiskManagement(
    decision: TradeDecision,
    marketData: MarketData
  ): Promise<TradeDecision | null> {
    
    // Check confidence threshold
    if (decision.confidence < this.config.minConfidenceThreshold) {
      await this.logEvent('LOW_CONFIDENCE', { 
        confidence: decision.confidence,
        threshold: this.config.minConfidenceThreshold 
      });
      return null;
    }

    // Calculate position size using Kelly criterion
    const kellyParams: PositionSizingParams = {
      bankroll: this.portfolio.totalValue,
      winProbability: decision.confidence,
      winLossRatio: 1.5, // Assumed
      kellyFraction: this.config.kellyFraction,
      maxPositionPercent: this.config.maxPositionPercent
    };

    const kellySize = calculateKellyCriterion(kellyParams);
    const maxPosition = (this.portfolio.totalValue * 
      BigInt(Math.floor(this.config.maxPositionPercent * 10000))) / 10000n;
    
    const positionSize = kellySize < maxPosition ? kellySize : maxPosition;

    if (positionSize <= 0n) {
      return null;
    }

    // Check existing stop losses
    const existingSL = this.stopLossManagers.get(decision.marketId);
    if (existingSL) {
      const slCheck = existingSL.updatePrice(marketData.currentPrice);
      if (slCheck.shouldExit) {
        await this.logEvent('STOP_LOSS_TRIGGERED', { 
          marketId: decision.marketId,
          reason: slCheck.reason 
        });
        // Override decision to sell
        return {
          action: 'SELL',
          amount: this.getPositionSize(decision.marketId),
          marketId: decision.marketId,
          reason: `Stop loss: ${slCheck.reason}`,
          confidence: 1.0
        };
      }
    }

    return {
      ...decision,
      amount: positionSize
    };
  }

  /**
   * Update position after trade
   */
  protected async updatePosition(
    marketId: string,
    amount: bigint,
    price: bigint,
    isBuy: boolean
  ): Promise<void> {
    const existingPosition = this.portfolio.positions.find(p => p.marketId === marketId);

    if (isBuy) {
      if (existingPosition) {
        // Average down/up
        const totalValue = (existingPosition.position * existingPosition.entryPrice) + (amount * price);
        const totalPosition = existingPosition.position + amount;
        existingPosition.entryPrice = totalValue / totalPosition;
        existingPosition.position = totalPosition;
      } else {
        this.portfolio.positions.push({
          marketId,
          position: amount,
          entryPrice: price,
          currentPrice: price,
          timestamp: Date.now()
        });
      }

      // Set up stop loss
      const slParams: StopLossParams = {
        entryPrice: price,
        stopLossPercent: this.config.stopLossPercent,
        takeProfitPercent: this.config.takeProfitPercent
      };
      this.stopLossManagers.set(marketId, new StopLossManager(slParams));

      this.portfolio.cash -= amount * price;

    } else {
      if (existingPosition) {
        existingPosition.position -= amount;
        if (existingPosition.position <= 0n) {
          this.portfolio.positions = this.portfolio.positions.filter(p => p.marketId !== marketId);
          this.stopLossManagers.delete(marketId);
        }
      }
      this.portfolio.cash += amount * price;
    }

    // Update total value
    this.updateTotalValue();

    await this.logEvent('POSITION_UPDATE', { 
      marketId, 
      amount, 
      price, 
      isBuy,
      portfolio: this.portfolio 
    });
  }

  /**
   * Update total portfolio value
   */
  protected updateTotalValue(): void {
    let positionValue = 0n;
    for (const pos of this.portfolio.positions) {
      positionValue += pos.position * pos.currentPrice;
    }
    this.portfolio.totalValue = this.portfolio.cash + positionValue;
  }

  /**
   * Get current position size in a market
   */
  protected getPositionSize(marketId: string): bigint {
    const pos = this.portfolio.positions.find(p => p.marketId === marketId);
    return pos?.position || 0n;
  }

  /**
   * Log event to audit trail
   */
  protected async logEvent(type: string, data: any): Promise<void> {
    await this.auditLogger.log({
      type,
      agent: this.config.name,
      data,
      timestamp: Date.now()
    });
  }

  /**
   * Register alert handler
   */
  onAlert(handler: (alert: any) => void): void {
    this.alertHandlers.push(handler);
  }

  /**
   * Handle alert
   */
  private async handleAlert(alert: any): Promise<void> {
    for (const handler of this.alertHandlers) {
      handler(alert);
    }
    await this.logEvent('SECURITY_ALERT', alert);
  }

  /**
   * Get agent status
   */
  getStatus(): {
    name: string;
    running: boolean;
    portfolio: PortfolioState;
    drawdown: ReturnType<DrawdownProtector['updateValue']>;
    positions: number;
  } {
    return {
      name: this.config.name,
      running: this.isRunning,
      portfolio: this.portfolio,
      drawdown: this.drawdownProtector.updateValue(this.portfolio.totalValue),
      positions: this.portfolio.positions.length
    };
  }
}