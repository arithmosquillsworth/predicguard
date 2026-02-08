/**
 * PredicGuard Utilities
 * 
 * Helper functions and utilities for agents
 */

/**
 * Format large numbers for display
 */
export function formatAmount(amount: bigint, decimals: number = 18, displayDecimals: number = 4): string {
  const divisor = BigInt(10) ** BigInt(decimals);
  const whole = amount / divisor;
  const fraction = amount % divisor;
  
  const fractionStr = fraction.toString().padStart(decimals, '0').slice(0, displayDecimals);
  const trimmedFraction = fractionStr.replace(/0+$/, '');
  
  return trimmedFraction 
    ? `${whole}.${trimmedFraction}` 
    : whole.toString();
}

/**
 * Format percentage
 */
export function formatPercent(value: number, decimals: number = 2): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

/**
 * Calculate exponential moving average
 */
export function calculateEMA(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const ema: number[] = [];
  
  let prevEma = values[0];
  
  for (let i = 0; i < values.length; i++) {
    if (i === 0) {
      ema.push(values[0]);
    } else {
      const currentEma = values[i] * k + prevEma * (1 - k);
      ema.push(currentEma);
      prevEma = currentEma;
    }
  }
  
  return ema;
}

/**
 * Calculate simple moving average
 */
export function calculateSMA(values: number[], period: number): number {
  if (values.length < period) return 0;
  
  const sum = values.slice(-period).reduce((a, b) => a + b, 0);
  return sum / period;
}

/**
 * Calculate volatility (standard deviation)
 */
export function calculateVolatility(values: number[]): number {
  if (values.length < 2) return 0;
  
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
  
  return Math.sqrt(variance);
}

/**
 * Calculate RSI (Relative Strength Index)
 */
export function calculateRSI(prices: number[], period: number = 14): number {
  if (prices.length < period + 1) return 50;
  
  let gains = 0;
  let losses = 0;
  
  for (let i = 1; i <= period; i++) {
    const change = prices[prices.length - i] - prices[prices.length - i - 1];
    if (change > 0) {
      gains += change;
    } else {
      losses += Math.abs(change);
    }
  }
  
  const avgGain = gains / period;
  const avgLoss = losses / period;
  
  if (avgLoss === 0) return 100;
  
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

/**
 * Sleep utility
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<T> {
  let lastError: Error;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      const waitMs = delayMs * Math.pow(2, i);
      console.log(`Retry ${i + 1}/${maxRetries} after ${waitMs}ms`);
      await sleep(waitMs);
    }
  }
  
  throw lastError!;
}

/**
 * Rate limiter
 */
export class RateLimiter {
  private queue: Array<() => void> = [];
  private processing = false;
  private lastRequestTime = 0;
  
  constructor(
    private requestsPerSecond: number = 10
  ) {}
  
  async throttle<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      
      this.processQueue();
    });
  }
  
  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) return;
    
    this.processing = true;
    
    while (this.queue.length > 0) {
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequestTime;
      const minInterval = 1000 / this.requestsPerSecond;
      
      if (timeSinceLastRequest < minInterval) {
        await sleep(minInterval - timeSinceLastRequest);
      }
      
      const fn = this.queue.shift();
      if (fn) {
        this.lastRequestTime = Date.now();
        fn();
      }
    }
    
    this.processing = false;
  }
}

/**
 * Safe JSON stringify (handles BigInt)
 */
export function safeStringify(obj: any): string {
  return JSON.stringify(obj, (key, value) => {
    if (typeof value === 'bigint') {
      return value.toString() + 'n';
    }
    return value;
  }, 2);
}

/**
 * Parse string back to object with BigInt support
 */
export function safeParse(str: string): any {
  return JSON.parse(str, (key, value) => {
    if (typeof value === 'string' && /\d+n$/.test(value)) {
      return BigInt(value.slice(0, -1));
    }
    return value;
  });
}

/**
 * Generate UUID v4
 */
export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Validate Ethereum address
 */
export function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Shorten address for display
 */
export function shortenAddress(address: string, chars: number = 4): string {
  if (!isValidAddress(address)) return address;
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}