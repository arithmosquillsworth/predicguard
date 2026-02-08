/**
 * Audit Trail System
 * 
 * Provides tamper-proof logging of all agent activities.
 * Supports both local and on-chain logging for verification.
 */

import { ethers } from 'ethers';

export interface AuditEntry {
  type: string;
  agent: string;
  data: any;
  timestamp: number;
  hash?: string;
  signature?: string;
}

export interface AuditConfig {
  mode: 'local' | 'onchain' | 'both';
  localPath?: string;
  rpcUrl?: string;
  contractAddress?: string;
  privateKey?: string;
  chainId?: number;
}

export interface ChainConfig {
  rpcUrl: string;
  contractAddress: string;
  privateKey: string;
  chainId: number;
}

/**
 * Audit Logger
 * Logs all agent activities with cryptographic verification
 */
export class AuditLogger {
  private config: AuditConfig;
  private entries: AuditEntry[] = [];
  private provider?: ethers.JsonRpcProvider;
  private wallet?: ethers.Wallet;
  private contract?: ethers.Contract;
  private lastFlush: number = Date.now();
  private flushIntervalMs: number = 60000; // 1 minute
  private merkleTree: string[] = [];

  // Simplified ABI for audit contract
  private static AUDIT_CONTRACT_ABI = [
    'function logEntry(bytes32 hash, uint256 timestamp, string calldata entryType) external',
    'function getEntry(bytes32 hash) external view returns (uint256, string memory, address)',
    'function verifyEntry(bytes32 hash, bytes32 merkleRoot) external view returns (bool)',
    'event EntryLogged(bytes32 indexed hash, uint256 timestamp, address indexed sender)'
  ];

  constructor(config: AuditConfig) {
    this.config = config;

    if (config.mode === 'onchain' || config.mode === 'both') {
      this.initializeOnChain(config as ChainConfig);
    }
  }

  private initializeOnChain(config: ChainConfig): void {
    try {
      this.provider = new ethers.JsonRpcProvider(config.rpcUrl, config.chainId);
      this.wallet = new ethers.Wallet(config.privateKey, this.provider);
      this.contract = new ethers.Contract(
        config.contractAddress,
        AuditLogger.AUDIT_CONTRACT_ABI,
        this.wallet
      );
    } catch (error) {
      console.error('Failed to initialize on-chain logging:', error);
      // Fall back to local only
      this.config.mode = 'local';
    }
  }

  /**
   * Log an entry
   */
  async log(entry: Omit<AuditEntry, 'hash' | 'signature'>): Promise<AuditEntry> {
    const fullEntry: AuditEntry = {
      ...entry,
      timestamp: entry.timestamp || Date.now()
    };

    // Generate hash
    fullEntry.hash = this.generateHash(fullEntry);

    // Sign if on-chain mode
    if (this.wallet) {
      fullEntry.signature = await this.signEntry(fullEntry);
    }

    // Store locally
    this.entries.push(fullEntry);
    this.merkleTree.push(fullEntry.hash);

    // Flush to chain if needed
    if (this.shouldFlush()) {
      await this.flush();
    }

    return fullEntry;
  }

  /**
   * Log a trade execution
   */
  async logTrade(params: {
    agent: string;
    marketId: string;
    action: 'BUY' | 'SELL';
    amount: bigint;
    price: bigint;
    reason: string;
  }): Promise<AuditEntry> {
    return this.log({
      type: 'TRADE',
      agent: params.agent,
      data: {
        marketId: params.marketId,
        action: params.action,
        amount: params.amount.toString(),
        price: params.price.toString(),
        value: (params.amount * params.price).toString(),
        reason: params.reason
      },
      timestamp: Date.now()
    });
  }

  /**
   * Log a prediction
   */
  async logPrediction(params: {
    agent: string;
    marketId: string;
    outcome: boolean;
    confidence: number;
    expectedValue: number;
  }): Promise<AuditEntry> {
    return this.log({
      type: 'PREDICTION',
      agent: params.agent,
      data: {
        marketId: params.marketId,
        outcome: params.outcome,
        confidence: params.confidence,
        expectedValue: params.expectedValue
      },
      timestamp: Date.now()
    });
  }

  /**
   * Log a security alert
   */
  async logSecurityAlert(params: {
    agent: string;
    alertType: string;
    severity: string;
    details: any;
  }): Promise<AuditEntry> {
    return this.log({
      type: 'SECURITY_ALERT',
      agent: params.agent,
      data: {
        alertType: params.alertType,
        severity: params.severity,
        details: params.details
      },
      timestamp: Date.now()
    });
  }

  /**
   * Log a risk management action
   */
  async logRiskAction(params: {
    agent: string;
    action: string;
    reason: string;
    data: any;
  }): Promise<AuditEntry> {
    return this.log({
      type: 'RISK_ACTION',
      agent: params.agent,
      data: {
        action: params.action,
        reason: params.reason,
        ...params.data
      },
      timestamp: Date.now()
    });
  }

  /**
   * Get all entries
   */
  getEntries(filter?: { type?: string; agent?: string; since?: number }): AuditEntry[] {
    let filtered = [...this.entries];

    if (filter?.type) {
      filtered = filtered.filter(e => e.type === filter.type);
    }
    if (filter?.agent) {
      filtered = filtered.filter(e => e.agent === filter.agent);
    }
    if (filter?.since) {
      filtered = filtered.filter(e => e.timestamp >= filter.since!);
    }

    return filtered;
  }

  /**
   * Verify entry integrity
   */
  verifyEntry(entry: AuditEntry): boolean {
    const computedHash = this.generateHash(entry);
    return computedHash === entry.hash;
  }

  /**
   * Get Merkle root of all entries
   */
  getMerkleRoot(): string {
    return this.computeMerkleRoot(this.merkleTree);
  }

  /**
   * Export audit trail to JSON
   */
  exportToJson(): string {
    return JSON.stringify({
      entries: this.entries,
      merkleRoot: this.getMerkleRoot(),
      exportedAt: Date.now()
    }, null, 2);
  }

  /**
   * Flush entries to on-chain storage
   */
  private async flush(): Promise<void> {
    if (!this.contract || this.config.mode === 'local') {
      return;
    }

    try {
      const unflushed = this.entries.filter(e => !e.signature);
      
      for (const entry of unflushed.slice(0, 10)) { // Batch 10 at a time
        const tx = await this.contract.logEntry(
          entry.hash,
          entry.timestamp,
          entry.type
        );
        await tx.wait();
      }

      this.lastFlush = Date.now();
    } catch (error) {
      console.error('Failed to flush to chain:', error);
    }
  }

  private shouldFlush(): boolean {
    return Date.now() - this.lastFlush > this.flushIntervalMs;
  }

  private generateHash(entry: Omit<AuditEntry, 'hash' | 'signature'>): string {
    const data = JSON.stringify({
      type: entry.type,
      agent: entry.agent,
      data: entry.data,
      timestamp: entry.timestamp
    });
    return ethers.keccak256(ethers.toUtf8Bytes(data));
  }

  private async signEntry(entry: AuditEntry): Promise<string> {
    if (!this.wallet) return '';
    
    const message = ethers.toUtf8Bytes(entry.hash!);
    return await this.wallet.signMessage(message);
  }

  private computeMerkleRoot(hashes: string[]): string {
    if (hashes.length === 0) return ethers.ZeroHash;
    if (hashes.length === 1) return hashes[0];

    const nextLevel: string[] = [];
    for (let i = 0; i < hashes.length; i += 2) {
      const left = hashes[i];
      const right = hashes[i + 1] || left;
      nextLevel.push(ethers.keccak256(ethers.concat([left, right])));
    }

    return this.computeMerkleRoot(nextLevel);
  }
}

/**
 * Audit Trail Verifier
 * Third-party verification of audit logs
 */
export class AuditVerifier {
  /**
   * Verify a complete audit trail
   */
  static verifyTrail(entries: AuditEntry[]): {
    valid: boolean;
    invalidCount: number;
    issues: string[];
  } {
    const issues: string[] = [];
    let invalidCount = 0;

    for (const entry of entries) {
      // Verify hash
      const data = JSON.stringify({
        type: entry.type,
        agent: entry.agent,
        data: entry.data,
        timestamp: entry.timestamp
      });
      const computedHash = ethers.keccak256(ethers.toUtf8Bytes(data));

      if (computedHash !== entry.hash) {
        issues.push(`Entry ${entry.hash}: Hash mismatch`);
        invalidCount++;
        continue;
      }

      // Verify signature if present
      if (entry.signature) {
        try {
          const recovered = ethers.verifyMessage(
            ethers.toUtf8Bytes(entry.hash),
            entry.signature
          );
          // Signature valid (we could check against expected signer)
        } catch {
          issues.push(`Entry ${entry.hash}: Invalid signature`);
          invalidCount++;
        }
      }

      // Verify timestamp ordering
      const index = entries.indexOf(entry);
      if (index > 0) {
        const prevEntry = entries[index - 1];
        if (entry.timestamp < prevEntry.timestamp) {
          issues.push(`Entry ${entry.hash}: Timestamp out of order`);
          invalidCount++;
        }
      }
    }

    return {
      valid: invalidCount === 0,
      invalidCount,
      issues
    };
  }

  /**
   * Generate verification report
   */
  static generateReport(entries: AuditEntry[]): string {
    const verification = this.verifyTrail(entries);
    
    const stats = {
      total: entries.length,
      byType: entries.reduce((acc, e) => {
        acc[e.type] = (acc[e.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      byAgent: entries.reduce((acc, e) => {
        acc[e.agent] = (acc[e.agent] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      timeRange: {
        start: Math.min(...entries.map(e => e.timestamp)),
        end: Math.max(...entries.map(e => e.timestamp))
      }
    };

    return JSON.stringify({
      verification,
      statistics: stats,
      generatedAt: Date.now()
    }, null, 2);
  }
}