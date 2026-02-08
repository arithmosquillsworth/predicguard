/**
 * Example usage of PredicGuard
 */

import { ConservativeBot, BalancedBot, AggressiveBot } from './agents';
import { AuditLogger } from './audit/audit-trail';
import { ReputationClient } from './integrations/reputation';
import { 
  calculateKellyCriterion, 
  StopLossManager,
  DrawdownProtector 
} from './risk/position-sizing';
import { WhaleDetector, OracleMonitor } from './security/anti-manipulation';

async function example() {
  // 1. Initialize audit logger
  const auditLogger = new AuditLogger({ mode: 'local' });

  // 2. Create a conservative bot
  const bot = new ConservativeBot({
    wallet: {
      address: '0x1234567890123456789012345678901234567890',
      balance: BigInt('10000000000000000000') // 10 ETH
    },
    auditLogger
  });

  // 3. Start the bot
  await bot.start();

  // 4. Get status
  console.log('Bot status:', bot.getStatus());

  // 5. Stop the bot
  await bot.stop();

  // 6. Export audit trail
  const auditJson = auditLogger.exportToJson();
  console.log('Audit trail:', auditJson);
}

// Example risk calculations
function riskExamples() {
  // Kelly criterion
  const kellyPosition = calculateKellyCriterion({
    bankroll: 10000n,
    winProbability: 0.6,
    winLossRatio: 1.5,
    kellyFraction: 0.25
  });
  console.log('Kelly position size:', kellyPosition.toString());

  // Stop loss
  const sl = new StopLossManager({
    entryPrice: 1000n,
    stopLossPercent: 0.05,
    takeProfitPercent: 0.15
  });

  const result = sl.updatePrice(940n);
  console.log('Stop loss triggered:', result.shouldExit, result.reason);
}

// Example security checks
function securityExamples() {
  // Whale detection
  const whaleDetector = new WhaleDetector(BigInt('1000000000000000000'));
  
  const alert = whaleDetector.analyzeOrder({
    id: '1',
    marketId: 'ETH-USD',
    trader: '0xabc',
    side: 'BUY',
    amount: BigInt('2000000000000000000'),
    price: 1000n,
    timestamp: Date.now(),
    blockNumber: 1
  }, BigInt('10000000000000000000'));

  console.log('Whale alert:', alert);

  // Oracle monitoring
  const oracleMonitor = new OracleMonitor(['chainlink', 'uniswap']);
  oracleMonitor.updatePrice('chainlink', 2500n, Date.now());
  oracleMonitor.updatePrice('uniswap', 2501n, Date.now());
  
  const consensus = oracleMonitor.getConsensusPrice();
  console.log('Consensus price:', consensus.price?.toString(), 'Confidence:', consensus.confidence);
}

// Example reputation check
async function reputationExample() {
  const client = new ReputationClient({});
  
  const reputation = await client.getReputation('0x1234567890123456789012345678901234567890');
  console.log('Reputation score:', reputation.score);
  
  const flagged = await client.isFlagged('0x1234567890123456789012345678901234567890');
  console.log('Is flagged:', flagged.flagged, flagged.reasons);
}

export { example, riskExamples, securityExamples, reputationExample };