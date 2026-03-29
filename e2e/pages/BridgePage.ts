/**
 * BridgePage — Page Object for bridge connection management
 *
 * Handles WebSocket connection/disconnection for E2E tests.
 */

import { Page, Locator } from '@playwright/test';

export class BridgePage {
  readonly page: Page;
  readonly statusIndicator: Locator;
  readonly connectionStatus: Locator;

  constructor(page: Page) {
    this.page = page;
    this.statusIndicator = page.locator('.status');
    this.connectionStatus = page.locator('.message.system');
  }

  /**
   * Navigate to the chat page
   */
  async goto() {
    await this.page.goto('/');
  }

  /**
   * Wait for WebSocket connection to be established
   */
  async waitForConnection(): Promise<void> {
    await this.statusIndicator.waitFor({ state: 'visible' });
    const handle = await this.statusIndicator.elementHandle();
    if (!handle) throw new Error('Status indicator not found');
    await this.page.waitForFunction(
      (el) => el.classList.contains('connected'),
      handle
    );
  }

  /**
   * Check if the bridge is connected
   */
  async isConnected(): Promise<boolean> {
    const classes = await this.statusIndicator.getAttribute('class');
    return classes?.includes('connected') ?? false;
  }

  /**
   * Wait for connection message to appear
   */
  async waitForConnectionMessage(): Promise<void> {
    await this.connectionStatus.filter({ hasText: 'Connected to bridge' }).waitFor();
  }

  /**
   * Wait for disconnection message
   */
  async waitForDisconnection(): Promise<void> {
    await this.connectionStatus.filter({ hasText: 'Disconnected' }).waitFor();
  }

  /**
   * Simulate WebSocket disconnection
   */
  async disconnect(): Promise<void> {
    await this.page.evaluate(() => {
      if ((window as any).ws) {
        (window as any).ws.close();
      }
    });
  }
}
