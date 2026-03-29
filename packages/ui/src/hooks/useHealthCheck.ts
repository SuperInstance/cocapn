/**
 * useHealthCheck Hook
 *
 * Polls the /health endpoint and provides system health status.
 */

import { useState, useEffect, useCallback, useRef } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type HealthStatus = 'ok' | 'warn' | 'error';

export interface HealthCheckResult {
  name: string;
  status: HealthStatus;
  message?: string;
  latency?: number;
  timestamp?: string;
}

export interface SystemHealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: HealthCheckResult[];
  timestamp: string;
  uptime: number;
}

export interface UseHealthCheckOptions {
  /** Poll interval in milliseconds (default: 30000) */
  interval?: number;
  /** Whether to automatically start polling (default: true) */
  autoStart?: boolean;
  /** Base URL for health endpoint (default: current origin) */
  baseUrl?: string;
}

export interface HealthCheckHandle {
  /** Current health status */
  health: SystemHealthStatus | null;
  /** Whether health check is loading */
  loading: boolean;
  /** Error from last health check */
  error: Error | null;
  /** Number of pending operations in offline queue */
  pendingOps: number;
  /** Manually trigger a health check */
  refresh: () => Promise<void>;
  /** Start polling */
  start: () => void;
  /** Stop polling */
  stop: () => void;
  /** Whether currently polling */
  isPolling: boolean;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useHealthCheck(options: UseHealthCheckOptions = {}): HealthCheckHandle {
  const {
    interval = 30000,
    autoStart = true,
    baseUrl = '',
  } = options;

  const [health, setHealth] = useState<SystemHealthStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [pendingOps, setPendingOps] = useState(0);

  const pollingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /**
   * Fetch health status from the bridge
   */
  const fetchHealth = useCallback(async (): Promise<SystemHealthStatus | null> => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${baseUrl}/health`, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
        },
      }).finally(() => clearTimeout(timeoutId));

      if (!response.ok) {
        throw new Error(`Health check failed: ${response.status}`);
      }

      const data = (await response.json()) as SystemHealthStatus;
      setPendingOps(data.checks.find(c => c.name === 'offline_queue')?.latency ?? 0);
      return data;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error('Health check timeout');
      }
      throw err;
    }
  }, [baseUrl]);

  /**
   * Refresh health status
   */
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await fetchHealth();
      setHealth(data);
    } catch (err) {
      const healthError = err instanceof Error ? err : new Error(String(err));
      setError(healthError);

      // Set degraded health on error
      setHealth({
        status: 'degraded',
        checks: [{ name: 'health', status: 'error', message: healthError.message }],
        timestamp: new Date().toISOString(),
        uptime: 0,
      });
    } finally {
      setLoading(false);
    }
  }, [fetchHealth]);

  /**
   * Start polling
   */
  const start = useCallback(() => {
    if (pollingRef.current) return;

    pollingRef.current = true;

    // Initial check
    refresh();

    // Set up interval
    timerRef.current = setInterval(() => {
      refresh();
    }, interval);
  }, [interval, refresh]);

  /**
   * Stop polling
   */
  const stop = useCallback(() => {
    pollingRef.current = false;

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Auto-start on mount
  useEffect(() => {
    if (autoStart) {
      start();
    }

    return () => {
      stop();
    };
  }, [autoStart, start, stop]);

  return {
    health,
    loading,
    error,
    pendingOps,
    refresh,
    start,
    stop,
    isPolling: pollingRef.current,
  };
}

// ─── Helper Components ─────────────────────────────────────────────────────────

export interface HealthIndicatorProps {
  /** Health status to display */
  status: 'healthy' | 'degraded' | 'unhealthy';
  /** Whether to show tooltip with details */
  showTooltip?: boolean;
  /** Additional class names */
  className?: string;
}

/**
 * HealthIndicator - Displays a colored dot indicating system health
 */
export function HealthIndicator({ status, showTooltip = true, className = '' }: HealthIndicatorProps) {
  const colors = {
    healthy: 'bg-green-500',
    degraded: 'bg-yellow-500',
    unhealthy: 'bg-red-500',
  };

  const labels = {
    healthy: 'System healthy',
    degraded: 'System degraded',
    unhealthy: 'System unhealthy',
  };

  const indicator = (
    <div
      className={`w-3 h-3 rounded-full ${colors[status]} ${className}`}
      title={showTooltip ? labels[status] : undefined}
    />
  );

  if (showTooltip) {
    return (
      <div className="relative group inline-block">
        {indicator}
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-xs bg-gray-800 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
          {labels[status]}
        </div>
      </div>
    );
  }

  return indicator;
}

/**
 * OfflineIndicator - Shows pending operations count
 */
export interface OfflineIndicatorProps {
  /** Number of pending operations */
  pendingOps: number;
  /** Click handler */
  onClick?: () => void;
}

export function OfflineIndicator({ pendingOps, onClick }: OfflineIndicatorProps) {
  if (pendingOps === 0) return null;

  return (
    <button
      onClick={onClick}
      className="relative inline-flex items-center px-2 py-1 text-xs font-medium text-yellow-700 bg-yellow-100 rounded-full hover:bg-yellow-200 transition-colors"
      title={`${pendingOps} pending operation${pendingOps === 1 ? '' : 's'}`}
    >
      <span className="w-2 h-2 mr-1 bg-yellow-500 rounded-full animate-pulse" />
      {pendingOps} pending
    </button>
  );
}
