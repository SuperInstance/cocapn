/**
 * HealthStatus Component
 *
 * Displays system health status in the UI header with:
 * - Health indicator dot (green/yellow/red)
 * - Offline operations counter
 * - Detailed health panel on click
 */

import { useState } from "react";
import { useHealthCheck, HealthIndicator, OfflineIndicator } from "@/hooks/useHealthCheck.js";

export interface HealthStatusProps {
  /** Base URL for health endpoint */
  baseUrl?: string;
  /** Poll interval in milliseconds */
  interval?: number;
}

/**
 * HealthStatus - System health status indicator for header
 */
export function HealthStatus({ baseUrl = '', interval = 30000 }: HealthStatusProps) {
  const { health, loading, pendingOps } = useHealthCheck({ baseUrl, interval });
  const [showPanel, setShowPanel] = useState(false);

  if (!health) {
    return null;
  }

  const statusColor = {
    healthy: 'text-green-600',
    degraded: 'text-yellow-600',
    unhealthy: 'text-red-600',
  };

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowPanel(!showPanel)}
          className="flex items-center gap-1 hover:bg-gray-100 rounded px-2 py-1 transition-colors"
          title="Click to view health details"
        >
          <HealthIndicator status={health.status} showTooltip={false} />
          {loading && (
            <span className="w-3 h-3 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
          )}
        </button>

        <OfflineIndicator
          pendingOps={pendingOps}
          onClick={() => setShowPanel(true)}
        />
      </div>

      {showPanel && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowPanel(false)}
          />
          <HealthPanel
            health={health}
            onClose={() => setShowPanel(false)}
          />
        </>
      )}
    </div>
  );
}

/**
 * HealthPanel - Detailed health status panel
 */
interface HealthPanelProps {
  health: {
    status: 'healthy' | 'degraded' | 'unhealthy';
    checks: Array<{
      name: string;
      status: 'ok' | 'warn' | 'error';
      message?: string;
      latency?: number;
    }>;
    timestamp: string;
    uptime: number;
  };
  onClose: () => void;
}

function HealthPanel({ health, onClose }: HealthPanelProps) {
  const formatUptime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  const statusIcons = {
    ok: '✓',
    warn: '⚠',
    error: '✗',
  };

  const statusColors = {
    ok: 'text-green-600 bg-green-50 border-green-200',
    warn: 'text-yellow-600 bg-yellow-50 border-yellow-200',
    error: 'text-red-600 bg-red-50 border-red-200',
  };

  return (
    <div className="absolute top-full right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border z-50">
      <div className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900">System Health</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <HealthIndicator status={health.status} showTooltip={false} />
            <span className="font-medium capitalize">{health.status}</span>
          </div>

          <div className="text-sm text-gray-600 space-y-1">
            <div>Uptime: {formatUptime(health.uptime)}</div>
            <div>Last check: {new Date(health.timestamp).toLocaleTimeString()}</div>
          </div>
        </div>

        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Checks
          </h4>

          {health.checks.map((check) => (
            <div
              key={check.name}
              className={`p-2 rounded border ${statusColors[check.status]}`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium capitalize">{check.name}</span>
                <span className="text-lg">{statusIcons[check.status]}</span>
              </div>

              {check.message && (
                <div className="text-sm opacity-80">{check.message}</div>
              )}

              {check.latency !== undefined && (
                <div className="text-xs opacity-60">
                  {check.latency}ms
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
