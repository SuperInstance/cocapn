/**
 * Tests for BridgeEvents — typed event bus for internal communication.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BridgeEvents, type BridgeEventMap } from '../src/events.js';

describe('BridgeEvents', () => {
  let bus: BridgeEvents;

  beforeEach(() => {
    bus = new BridgeEvents();
  });

  describe('on / emit', () => {
    it('should emit and receive brain:fact-set events', () => {
      const listener = vi.fn();
      bus.on('brain:fact-set', listener);

      bus.emit('brain:fact-set', { key: 'user.name', value: 'Alice' });

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith({ key: 'user.name', value: 'Alice' });
    });

    it('should emit and receive brain:memory-added events', () => {
      const listener = vi.fn();
      bus.on('brain:memory-added', listener);

      bus.emit('brain:memory-added', { id: 'mem-1', type: 'preference', key: 'theme' });

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith({ id: 'mem-1', type: 'preference', key: 'theme' });
    });

    it('should emit and receive brain:updated events', () => {
      const listener = vi.fn();
      bus.on('brain:updated', listener);

      bus.emit('brain:updated', { store: 'facts', key: 'x' });

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith({ store: 'facts', key: 'x' });
    });

    it('should support brain:updated without optional key', () => {
      const listener = vi.fn();
      bus.on('brain:updated', listener);

      bus.emit('brain:updated', { store: 'wiki' });

      expect(listener).toHaveBeenCalledWith({ store: 'wiki' });
    });
  });

  describe('mode:changed', () => {
    it('should emit mode change events', () => {
      const listener = vi.fn();
      bus.on('mode:changed', listener);

      bus.emit('mode:changed', { from: 'private', to: 'public' });

      expect(listener).toHaveBeenCalledWith({ from: 'private', to: 'public' });
    });
  });

  describe('llm events', () => {
    it('should emit llm:request events', () => {
      const listener = vi.fn();
      bus.on('llm:request', listener);

      bus.emit('llm:request', { model: 'deepseek-chat', provider: 'deepseek' });

      expect(listener).toHaveBeenCalledWith({ model: 'deepseek-chat', provider: 'deepseek' });
    });

    it('should emit llm:response events with timing', () => {
      const listener = vi.fn();
      bus.on('llm:response', listener);

      bus.emit('llm:response', {
        model: 'gpt-4o',
        provider: 'openai',
        tokens: 150,
        latencyMs: 230,
      });

      expect(listener).toHaveBeenCalledWith({
        model: 'gpt-4o',
        provider: 'openai',
        tokens: 150,
        latencyMs: 230,
      });
    });
  });

  describe('fleet events', () => {
    it('should emit fleet:peer-connected events', () => {
      const listener = vi.fn();
      bus.on('fleet:peer-connected', listener);

      bus.emit('fleet:peer-connected', { peerId: 'peer-1', url: 'ws://host:8787' });

      expect(listener).toHaveBeenCalledWith({ peerId: 'peer-1', url: 'ws://host:8787' });
    });

    it('should emit fleet:peer-disconnected events with optional reason', () => {
      const listener = vi.fn();
      bus.on('fleet:peer-disconnected', listener);

      bus.emit('fleet:peer-disconnected', { peerId: 'peer-1', reason: 'timeout' });

      expect(listener).toHaveBeenCalledWith({ peerId: 'peer-1', reason: 'timeout' });
    });
  });

  describe('sync:complete', () => {
    it('should emit sync complete events', () => {
      const listener = vi.fn();
      bus.on('sync:complete', listener);

      bus.emit('sync:complete', { pulled: 3, pushed: 1, conflicts: 0 });

      expect(listener).toHaveBeenCalledWith({ pulled: 3, pushed: 1, conflicts: 0 });
    });
  });

  describe('shutdown', () => {
    it('should emit shutdown events', () => {
      const listener = vi.fn();
      bus.on('shutdown', listener);

      bus.emit('shutdown', { reason: 'SIGTERM', graceful: true });

      expect(listener).toHaveBeenCalledWith({ reason: 'SIGTERM', graceful: true });
    });
  });

  describe('once', () => {
    it('should only fire once for once listeners', () => {
      const listener = vi.fn();
      bus.once('brain:fact-set', listener);

      bus.emit('brain:fact-set', { key: 'a', value: '1' });
      bus.emit('brain:fact-set', { key: 'b', value: '2' });

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith({ key: 'a', value: '1' });
    });
  });

  describe('off', () => {
    it('should remove a specific listener', () => {
      const listener = vi.fn();
      bus.on('brain:fact-set', listener);
      bus.off('brain:fact-set', listener);

      bus.emit('brain:fact-set', { key: 'a', value: '1' });

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('removeAllListeners', () => {
    it('should remove all listeners for a specific event', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      bus.on('brain:fact-set', listener1);
      bus.on('brain:fact-set', listener2);
      bus.on('llm:request', vi.fn());

      bus.removeAllListeners('brain:fact-set');

      bus.emit('brain:fact-set', { key: 'a', value: '1' });

      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).not.toHaveBeenCalled();
    });
  });

  describe('multiple event types', () => {
    it('should not cross-contaminate listeners between events', () => {
      const factListener = vi.fn();
      const modeListener = vi.fn();

      bus.on('brain:fact-set', factListener);
      bus.on('mode:changed', modeListener);

      bus.emit('brain:fact-set', { key: 'x', value: 'y' });

      expect(factListener).toHaveBeenCalledTimes(1);
      expect(modeListener).not.toHaveBeenCalled();
    });
  });
});
