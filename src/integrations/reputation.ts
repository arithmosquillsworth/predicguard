/**
 * 8004scan Reputation Integration
 * 
 * Integrates with 8004scan for agent reputation verification
 * and cross-reference security alerts.
 */

export interface ReputationScore {
  address: string;
  score: number; // 0-100
  trustLevel: 'UNTRUSTED' | 'LOW' | 'MEDIUM' | 'HIGH' | 'VERIFIED';
  flags: string[];
  lastUpdated: number;
}

export interface SecurityAlert {
  id: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  type: string;
  description: string;
  timestamp: number;
  source: string;
}

export interface ContractVerification {
  address: string;
  isVerified: boolean;
  name: string;
  compiler: string;
  hasProxy: boolean;
  implementation?: string;
}

/**
 * 8004scan API Client
 */
export class ReputationClient {
  private baseUrl: string;
  private apiKey?: string;
  private cache: Map<string, { data: any; expires: number }> = new Map();
  private cacheTtlMs: number = 300000; // 5 minutes

  constructor(config: { baseUrl?: string; apiKey?: string; cacheTtlMs?: number }) {
    this.baseUrl = config.baseUrl || 'https://api.8004scan.io/v1';
    this.apiKey = config.apiKey;
    this.cacheTtlMs = config.cacheTtlMs || 300000;
  }

  /**
   * Get reputation score for an address
   */
  async getReputation(address: string): Promise<ReputationScore> {
    const cacheKey = `reputation:${address}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    try {
      const response = await fetch(`${this.baseUrl}/reputation/${address}`, {
        headers: this.apiKey ? { 'X-API-Key': this.apiKey } : {}
      });

      if (!response.ok) {
        // Return default if API fails
        return this.getDefaultReputation(address);
      }

      const data = await response.json();
      const score: ReputationScore = {
        address,
        score: data.score || 50,
        trustLevel: this.mapTrustLevel(data.score),
        flags: data.flags || [],
        lastUpdated: Date.now()
      };

      this.setCache(cacheKey, score);
      return score;
    } catch (error) {
      console.error('Failed to fetch reputation:', error);
      return this.getDefaultReputation(address);
    }
  }

  /**
   * Check if address is flagged for suspicious activity
   */
  async isFlagged(address: string): Promise<{
    flagged: boolean;
    reasons: string[];
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  }> {
    const reputation = await this.getReputation(address);
    
    const criticalFlags = ['EXPLOIT', 'RUGPULL', 'PHISHING', 'SANCTIONED'];
    const highFlags = ['HONEYPOT', 'SCAM', 'COPYCAT'];
    
    const hasCritical = reputation.flags.some(f => 
      criticalFlags.includes(f.toUpperCase())
    );
    const hasHigh = reputation.flags.some(f => 
      highFlags.includes(f.toUpperCase())
    );

    return {
      flagged: reputation.flags.length > 0,
      reasons: reputation.flags,
      severity: hasCritical ? 'CRITICAL' : hasHigh ? 'HIGH' : 'LOW'
    };
  }

  /**
   * Get contract verification status
   */
  async getContractVerification(address: string): Promise<ContractVerification> {
    const cacheKey = `verification:${address}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    try {
      const response = await fetch(`${this.baseUrl}/contract/${address}`, {
        headers: this.apiKey ? { 'X-API-Key': this.apiKey } : {}
      });

      if (!response.ok) {
        return {
          address,
          isVerified: false,
          name: 'Unknown',
          compiler: 'Unknown',
          hasProxy: false
        };
      }

      const data = await response.json();
      const verification: ContractVerification = {
        address,
        isVerified: data.verified || false,
        name: data.name || 'Unknown',
        compiler: data.compiler || 'Unknown',
        hasProxy: data.proxy || false,
        implementation: data.implementation
      };

      this.setCache(cacheKey, verification);
      return verification;
    } catch (error) {
      return {
        address,
        isVerified: false,
        name: 'Unknown',
        compiler: 'Unknown',
        hasProxy: false
      };
    }
  }

  /**
   * Get security alerts for an address
   */
  async getSecurityAlerts(address: string): Promise<SecurityAlert[]> {
    try {
      const response = await fetch(`${this.baseUrl}/alerts/${address}`, {
        headers: this.apiKey ? { 'X-API-Key': this.apiKey } : {}
      });

      if (!response.ok) return [];

      const data = await response.json();
      return data.alerts || [];
    } catch (error) {
      return [];
    }
  }

  /**
   * Batch check multiple addresses
   */
  async batchCheck(addresses: string[]): Promise<Map<string, ReputationScore>> {
    const results = new Map<string, ReputationScore>();
    
    // Process in batches of 10
    for (let i = 0; i < addresses.length; i += 10) {
      const batch = addresses.slice(i, i + 10);
      
      try {
        const response = await fetch(`${this.baseUrl}/reputation/batch`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(this.apiKey ? { 'X-API-Key': this.apiKey } : {})
          },
          body: JSON.stringify({ addresses: batch })
        });

        if (response.ok) {
          const data = await response.json();
          for (const score of data.scores || []) {
            results.set(score.address, {
              address: score.address,
              score: score.score,
              trustLevel: this.mapTrustLevel(score.score),
              flags: score.flags || [],
              lastUpdated: Date.now()
            });
          }
        }
      } catch (error) {
        console.error('Batch check failed:', error);
      }
    }

    // Fill in defaults for missing addresses
    for (const addr of addresses) {
      if (!results.has(addr)) {
        results.set(addr, this.getDefaultReputation(addr));
      }
    }

    return results;
  }

  /**
   * Report suspicious activity
   */
  async reportActivity(params: {
    address: string;
    type: string;
    description: string;
    evidence: string;
    reporter: string;
  }): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.apiKey ? { 'X-API-Key': this.apiKey } : {})
        },
        body: JSON.stringify(params)
      });

      return response.ok;
    } catch (error) {
      console.error('Failed to report activity:', error);
      return false;
    }
  }

  /**
   * Pre-trade security check
   */
  async preTradeCheck(params: {
    agentAddress: string;
    marketAddress: string;
    counterparty?: string;
  }): Promise<{
    allowed: boolean;
    warnings: string[];
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  }> {
    const warnings: string[] = [];
    const checks = await Promise.all([
      this.getReputation(params.agentAddress),
      this.getContractVerification(params.marketAddress),
      params.counterparty ? this.getReputation(params.counterparty) : null
    ]);

    const [agentRep, marketVerif, counterpartyRep] = checks;

    // Check agent reputation
    if (agentRep.score < 30) {
      warnings.push(`Agent has low reputation score: ${agentRep.score}`);
    }
    if (agentRep.flags.length > 0) {
      warnings.push(`Agent flags: ${agentRep.flags.join(', ')}`);
    }

    // Check market contract
    if (!marketVerif.isVerified) {
      warnings.push('Market contract is not verified');
    }

    // Check counterparty
    if (counterpartyRep && counterpartyRep.score < 50) {
      warnings.push(`Counterparty has low reputation: ${counterpartyRep.score}`);
    }

    const riskLevel = warnings.length === 0 
      ? 'LOW' 
      : warnings.length < 3 
        ? 'MEDIUM' 
        : 'HIGH';

    return {
      allowed: riskLevel !== 'HIGH',
      warnings,
      riskLevel
    };
  }

  private getDefaultReputation(address: string): ReputationScore {
    return {
      address,
      score: 50,
      trustLevel: 'MEDIUM',
      flags: [],
      lastUpdated: Date.now()
    };
  }

  private mapTrustLevel(score: number): ReputationScore['trustLevel'] {
    if (score >= 90) return 'VERIFIED';
    if (score >= 70) return 'HIGH';
    if (score >= 50) return 'MEDIUM';
    if (score >= 30) return 'LOW';
    return 'UNTRUSTED';
  }

  private getFromCache(key: string): any | null {
    const cached = this.cache.get(key);
    if (cached && cached.expires > Date.now()) {
      return cached.data;
    }
    return null;
  }

  private setCache(key: string, data: any): void {
    this.cache.set(key, {
      data,
      expires: Date.now() + this.cacheTtlMs
    });
  }
}

/**
 * Reputation Guard
 * Higher-level integration for agents
 */
export class ReputationGuard {
  private client: ReputationClient;
  private minReputationScore: number;
  private blockedAddresses: Set<string> = new Set();

  constructor(
    client: ReputationClient,
    minReputationScore: number = 30
  ) {
    this.client = client;
    this.minReputationScore = minReputationScore;
  }

  /**
   * Check if address can interact
   */
  async canInteract(address: string): Promise<{
    allowed: boolean;
    reason?: string;
  }> {
    if (this.blockedAddresses.has(address.toLowerCase())) {
      return { allowed: false, reason: 'Locally blocked' };
    }

    const flagged = await this.client.isFlagged(address);
    if (flagged.flagged && flagged.severity === 'CRITICAL') {
      this.blockedAddresses.add(address.toLowerCase());
      return { allowed: false, reason: `Critical flags: ${flagged.reasons.join(', ')}` };
    }

    const reputation = await this.client.getReputation(address);
    if (reputation.score < this.minReputationScore) {
      return { 
        allowed: false, 
        reason: `Reputation too low: ${reputation.score} < ${this.minReputationScore}` 
      };
    }

    return { allowed: true };
  }

  /**
   * Block an address locally
   */
  blockAddress(address: string, reason?: string): void {
    this.blockedAddresses.add(address.toLowerCase());
    console.log(`Blocked ${address}: ${reason || 'No reason provided'}`);
  }

  /**
   * Unblock an address
   */
  unblockAddress(address: string): void {
    this.blockedAddresses.delete(address.toLowerCase());
  }

  /**
   * Get blocked addresses
   */
  getBlockedAddresses(): string[] {
    return Array.from(this.blockedAddresses);
  }
}