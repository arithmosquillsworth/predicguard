#!/usr/bin/env ts-node
/**
 * Run Conservative Bot
 * 
 * Usage: ts-node run-conservative.ts
 */

import { ConservativeBot } from './conservative-bot';
import { AuditLogger } from '../audit/audit-trail';
import { MarketData } from './base-agent';

async function main() {
  // Initialize audit logger
  const auditLogger = new AuditLogger({ mode: 'local' });

  // Initialize bot with example wallet
  const bot = new ConservativeBot({
    wallet: {
      address: '0x' + '1'.repeat(40),
      balance: BigInt('10000000000000000000') // 10 ETH
    },
    auditLogger,
    customParams: {
      confidenceThreshold: 0.70,
      maxPositionPercent: 0.01,
      stopLossPercent: 0.02
    }
  });

  console.log('🛡️  PredicGuard Conservative Bot');
  console.log('================================\n');

  // Start the bot
  await bot.start();

  // Log initial status
  console.log('Initial Status:', bot.getStatus());

  // Simulate market data processing
  const mockMarketData: MarketData = {
    marketId: 'ETH-USD-2024',
    currentPrice: BigInt('250000000000'),
    liquidity: BigInt('5000000000000000000'),
    volume24h: BigInt('10000000000000000000'),
    volatility: 0.15,
    timestamp: Date.now()
  };

  console.log('\nProcessing market data:', mockMarketData.marketId);
  
  // Generate prediction
  const prediction = await bot.generatePrediction(mockMarketData);
  console.log('Prediction:', {
    outcome: prediction.outcome,
    confidence: `${(prediction.confidence * 100).toFixed(1)}%`,
    expectedValue: prediction.expectedValue.toFixed(4)
  });

  // Process market data
  const decision = await bot.processMarketData(mockMarketData, prediction);
  
  if (decision) {
    console.log('Trade Decision:', {
      action: decision.action,
      market: decision.marketId,
      reason: decision.reason
    });
  } else {
    console.log('No trade executed');
  }

  // Get final status
  console.log('\nFinal Status:', bot.getStatus());

  // Stop the bot
  await bot.stop();
  
  console.log('\n✅ Conservative Bot session complete');
  console.log('\nAudit Log Summary:');
  const entries = auditLogger.getEntries();
  console.log(`  Total entries: ${entries.length}`);
  
  const types = entries.reduce((acc, e) => {
    acc[e.type] = (acc[e.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  Object.entries(types).forEach(([type, count]) => {
    console.log(`  - ${type}: ${count}`);
  });
}

main().catch(console.error);