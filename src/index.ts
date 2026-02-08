/**
 * PredicGuard - Security-First Prediction Market Agents
 * 
 * Main entry point for the PredicGuard system.
 */

export { BaseAgent, AgentConfig, MarketData, Prediction, TradeDecision } from './agents/base-agent';
export { ConservativeBot, ConservativeConfig } from './agents/conservative-bot';
export { BalancedBot, BalancedConfig } from './agents/balanced-bot';
export { AggressiveBot, AggressiveConfig } from './agents/aggressive-bot';

export {
  calculateKellyCriterion,
  calculateFixedFractional,
  calculateVolatilityAdjusted,
  StopLossManager,
  PortfolioBalancer,
  DrawdownProtector,
  PositionSizingParams,
  StopLossParams,
  PortfolioState,
  DrawdownConfig
} from './risk/position-sizing';

export {
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
} from './security/anti-manipulation';

export { AuditLogger, AuditEntry, AuditConfig, AuditVerifier } from './audit/audit-trail';

// Version
export const VERSION = '0.1.0';

// Factory function for creating agents
export function createAgent(
  type: 'conservative' | 'balanced' | 'aggressive',
  config: {
    wallet: { address: string; balance: bigint };
    auditLogger: import('./audit/audit-trail').AuditLogger;
    customParams?: any;
  }
) {
  switch (type) {
    case 'conservative':
      return new ConservativeBot(config);
    case 'balanced':
      return new BalancedBot(config);
    case 'aggressive':
      return new AggressiveBot(config);
    default:
      throw new Error(`Unknown agent type: ${type}`);
  }
}