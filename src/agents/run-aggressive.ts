#!/usr/bin/env ts-node
/**
 * Run Aggressive Bot
 * 
 * Usage: ts-node run-aggressive.ts
 */

import { AggressiveBot } from './aggressive-bot';
import { AuditLogger } from '../audit/audit-trail';
import { MarketData } from './base-agent';

async function main() {
  const auditLogger = new AuditLogger({ mode: 'local' });

  const bot = new AggressiveBot({
    wallet: {
      address: '0x' + '3'.repeat(40),
      balance: BigInt('10000000000000000000') // 10 ETH
    },
    auditLogger,
    customParams: {
      confidenceThreshold: 0.30,
      maxPositionPercent: 0.10,
      stopLossPercent: 0.10,
      maxPositions: 10
    }
  });

  console.log('🚀 PredicGuard Aggressive Bot');
  console.log('==============================\n');

  await bot.start();
  console.log('Initial Status:', bot.getStatus());

  // Test volatile markets
  const markets: MarketData[] = [
    {
      marketId: 'ETH-USD-2024',
      currentPrice: BigInt('250000000000'),
      liquidity: BigInt('5000000000000000000'),
      volume24h: BigInt('50000000000000000000'), // High volume
      volatility: 0.45, // High volatility
      timestamp: Date.now()
    },
    {
      marketId: 'SOL-USD-2024',
      currentPrice: BigInt('10000000000'),
      liquidity: BigInt('2000000000000000000'),
      volume24h: BigInt('3000000000000000000'),
      volatility: 0.50,
      timestamp: Date.now()
    },
    {
      marketId: 'MEME-USD-2024',
      currentPrice: BigInt('1000000'),
      liquidity: BigInt('1000000000000000000'),
      volume24h: BigInt('5000000000000000000'),
      volatility: 0.60,
      timestamp: Date.now()
    }
  ];

  for (const market of markets) {
    console.log(`\nProcessing ${market.marketId} (vol: ${market.volatility})...`);
    const prediction = await bot.generatePrediction(market);
    console.log(`  Prediction: ${prediction.outcome ? 'UP' : 'DOWN'} (${(prediction.confidence * 100).toFixed(1)}%)`);
    
    const decision = await bot.processMarketData(market, prediction);
    if (decision) {
      console.log(`  Action: ${decision.action} - ${decision.reason}`);
    } else {
      console.log(`  No trade (filtered by risk management)`);
    }
  }

  console.log('\nActive Trade Stats:', bot.getActiveTradeStats());
  console.log('\nFinal Status:', bot.getStatus());
  
  await bot.stop();
  console.log('\n✅ Aggressive Bot session complete');
}

main().catch(console.error);