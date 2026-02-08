#!/usr/bin/env ts-node
/**
 * Run Balanced Bot
 * 
 * Usage: ts-node run-balanced.ts
 */

import { BalancedBot } from './balanced-bot';
import { AuditLogger } from '../audit/audit-trail';
import { MarketData } from './base-agent';

async function main() {
  const auditLogger = new AuditLogger({ mode: 'local' });

  const bot = new BalancedBot({
    wallet: {
      address: '0x' + '2'.repeat(40),
      balance: BigInt('10000000000000000000') // 10 ETH
    },
    auditLogger,
    customParams: {
      confidenceThreshold: 0.50,
      maxPositionPercent: 0.05,
      stopLossPercent: 0.05
    }
  });

  console.log('⚖️  PredicGuard Balanced Bot');
  console.log('=============================\n');

  await bot.start();
  console.log('Initial Status:', bot.getStatus());

  // Test multiple markets
  const markets: MarketData[] = [
    {
      marketId: 'ETH-USD-2024',
      currentPrice: BigInt('250000000000'),
      liquidity: BigInt('5000000000000000000'),
      volume24h: BigInt('10000000000000000000'),
      volatility: 0.20,
      timestamp: Date.now()
    },
    {
      marketId: 'BTC-USD-2024',
      currentPrice: BigInt('4500000000000'),
      liquidity: BigInt('10000000000000000000'),
      volume24h: BigInt('20000000000000000000'),
      volatility: 0.25,
      timestamp: Date.now()
    }
  ];

  for (const market of markets) {
    console.log(`\nProcessing ${market.marketId}...`);
    const prediction = await bot.generatePrediction(market);
    console.log(`  Prediction: ${prediction.outcome ? 'UP' : 'DOWN'} (${(prediction.confidence * 100).toFixed(1)}%)`);
    
    const decision = await bot.processMarketData(market, prediction);
    if (decision) {
      console.log(`  Action: ${decision.action} - ${decision.reason}`);
    }
  }

  console.log('\nFinal Status:', bot.getStatus());
  await bot.stop();
  
  console.log('\n✅ Balanced Bot session complete');
}

main().catch(console.error);