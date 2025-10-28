/**
 * Task 2.3: Print Queue Manager
 *
 * Handles:
 * 1. Multiple print destinations (receipt, kitchen, bar)
 * 2. Retry logic for failed prints
 * 3. Print job prioritization
 * 4. Format templates for different receipt types
 */

import { offlineStore } from './OfflineDataStore';

// Types
export type PrintDestination = 'receipt' | 'kitchen' | 'bar';
export type PrintStatus = 'pending' | 'printing' | 'completed' | 'failed';

export interface PrintJob {
  id: string;
  destination: PrintDestination;
  type: 'order' | 'receipt' | 'report';
  priority: number; // 1-10, higher = more urgent
  printerAddress: string;
  data: any;
  template: string;
  status: PrintStatus;
  retryCount: number;
  maxRetries: number;
  createdAt: number;
  completedAt?: number;
  error?: string;
}

export interface PrinterConfig {
  id: string;
  name: string;
  address: string; // IP:port or bluetooth MAC
  destination: PrintDestination;
  protocol: 'escpos' | 'raw' | 'pdf';
  paperWidth: number; // mm
  enabled: boolean;
}

export interface ReceiptData {
  orderId: string;
  items: Array<{
    name: string;
    quantity: number;
    price: number;
    notes?: string;
  }>;
  subtotal: number;
  tax: number;
  total: number;
  paymentMethod: string;
  timestamp: string;
  cashier?: string;
}

// Priority Queue Implementation
class PriorityQueue<T extends { priority: number }> {
  private items: T[] = [];

  insert(item: T): void {
    if (this.items.length === 0) {
      this.items.push(item);
      return;
    }

    // Insert in priority order (higher priority first)
    let inserted = false;
    for (let i = 0; i < this.items.length; i++) {
      if (item.priority > this.items[i].priority) {
        this.items.splice(i, 0, item);
        inserted = true;
        break;
      }
    }

    if (!inserted) {
      this.items.push(item);
    }
  }

  extract(): T | undefined {
    return this.items.shift();
  }

  peek(): T | undefined {
    return this.items[0];
  }

  isEmpty(): boolean {
    return this.items.length === 0;
  }

  size(): number {
    return this.items.length;
  }

  clear(): void {
    this.items = [];
  }

  getAll(): T[] {
    return [...this.items];
  }
}

// ESC/POS Commands
const ESC = '\x1B';
const GS = '\x1D';

const ESCPOS = {
  INIT: `${ESC}@`,
  BOLD_ON: `${ESC}E1`,
  BOLD_OFF: `${ESC}E0`,
  ALIGN_LEFT: `${ESC}a0`,
  ALIGN_CENTER: `${ESC}a1`,
  ALIGN_RIGHT: `${ESC}a2`,
  SIZE_NORMAL: `${GS}!0`,
  SIZE_DOUBLE: `${GS}!17`,
  SIZE_LARGE: `${GS}!34`,
  CUT: `${GS}V66\x00`,
  FEED: '\n',
  SEPARATOR: '-'.repeat(48),
};

export class PrintJobManager {
  private queues: Map<string, PriorityQueue<PrintJob>> = new Map();
  private activePrinters: Set<string> = new Set();
  private printers: Map<string, PrinterConfig> = new Map();
  private listeners: Set<(job: PrintJob) => void> = new Set();
  private initialized = false;

  constructor() {
    this.loadPrinters();
  }

  async init(): Promise<void> {
    if (this.initialized) return;

    // Load persisted print jobs
    await offlineStore.init();
    await this.loadPersistedJobs();

    // Start background processor
    this.startBackgroundProcessor();

    this.initialized = true;
  }

  // ==================== Printer Management ====================

  async registerPrinter(config: PrinterConfig): Promise<void> {
    this.printers.set(config.id, config);
    await this.savePrinters();
  }

  async unregisterPrinter(printerId: string): Promise<void> {
    this.printers.delete(printerId);
    await this.savePrinters();
  }

  getPrinters(): PrinterConfig[] {
    return Array.from(this.printers.values());
  }

  getPrintersByDestination(destination: PrintDestination): PrinterConfig[] {
    return Array.from(this.printers.values()).filter(
      (p) => p.destination === destination && p.enabled
    );
  }

  private async loadPrinters(): Promise<void> {
    try {
      const saved = localStorage.getItem('pos-printers');
      if (saved) {
        const configs: PrinterConfig[] = JSON.parse(saved);
        configs.forEach((config) => this.printers.set(config.id, config));
      }
    } catch (error) {
      console.error('Failed to load printers:', error);
    }
  }

  private async savePrinters(): Promise<void> {
    try {
      const configs = Array.from(this.printers.values());
      localStorage.setItem('pos-printers', JSON.stringify(configs));
    } catch (error) {
      console.error('Failed to save printers:', error);
    }
  }

  // ==================== Job Management ====================

  async enqueue(
    destination: PrintDestination,
    type: PrintJob['type'],
    data: any,
    priority: number = 5
  ): Promise<string> {
    const printers = this.getPrintersByDestination(destination);

    if (printers.length === 0) {
      throw new Error(`No printer configured for destination: ${destination}`);
    }

    // Use first available printer (could implement load balancing)
    const printer = printers[0];

    const job: PrintJob = {
      id: crypto.randomUUID(),
      destination,
      type,
      priority,
      printerAddress: printer.address,
      data,
      template: this.getTemplate(destination, type),
      status: 'pending',
      retryCount: 0,
      maxRetries: 3,
      createdAt: Date.now(),
    };

    // Persist job
    await offlineStore.put('printJobs', job.id, job);

    // Add to queue
    const queue = this.getQueue(printer.address);
    queue.insert(job);

    // Process queue (fire-and-forget)
    this.processQueue(printer.address);

    return job.id;
  }

  async getJob(jobId: string): Promise<PrintJob | null> {
    const item = await offlineStore.get<PrintJob>('printJobs', jobId);
    return item?.data || null;
  }

  async cancelJob(jobId: string): Promise<void> {
    const job = await this.getJob(jobId);
    if (!job) return;

    // Remove from queue
    const queue = this.getQueue(job.printerAddress);
    const items = queue.getAll().filter((j) => j.id !== jobId);
    queue.clear();
    items.forEach((j) => queue.insert(j));

    // Update status
    job.status = 'failed';
    job.error = 'Cancelled by user';
    await offlineStore.put('printJobs', job.id, job);
  }

  async retryJob(jobId: string): Promise<void> {
    const job = await this.getJob(jobId);
    if (!job) return;

    job.status = 'pending';
    job.retryCount = 0;
    job.error = undefined;
    await offlineStore.put('printJobs', job.id, job);

    const queue = this.getQueue(job.printerAddress);
    queue.insert(job);
    this.processQueue(job.printerAddress);
  }

  // ==================== Queue Processing ====================

  private getQueue(printerAddress: string): PriorityQueue<PrintJob> {
    if (!this.queues.has(printerAddress)) {
      this.queues.set(printerAddress, new PriorityQueue<PrintJob>());
    }
    return this.queues.get(printerAddress)!;
  }

  private async processQueue(printerAddress: string): Promise<void> {
    if (this.activePrinters.has(printerAddress)) {
      return; // Already processing
    }

    this.activePrinters.add(printerAddress);
    const queue = this.getQueue(printerAddress);

    try {
      while (!queue.isEmpty()) {
        const job = queue.extract()!;

        try {
          job.status = 'printing';
          await offlineStore.put('printJobs', job.id, job);
          this.notifyListeners(job);

          await this.printJob(job);

          job.status = 'completed';
          job.completedAt = Date.now();
          await offlineStore.put('printJobs', job.id, job);
          this.notifyListeners(job);
        } catch (error: any) {
          await this.handlePrintError(job, error, queue);
        }
      }
    } finally {
      this.activePrinters.delete(printerAddress);
    }
  }

  private async handlePrintError(
    job: PrintJob,
    error: any,
    queue: PriorityQueue<PrintJob>
  ): Promise<void> {
    job.retryCount++;

    if (job.retryCount < job.maxRetries) {
      // Retry with lower priority
      job.priority = Math.max(1, job.priority - 1);
      job.status = 'pending';
      await offlineStore.put('printJobs', job.id, job);

      // Re-queue with exponential backoff
      const delay = 1000 * Math.pow(2, job.retryCount);
      setTimeout(() => {
        queue.insert(job);
        this.processQueue(job.printerAddress);
      }, delay);
    } else {
      // Max retries exceeded
      job.status = 'failed';
      job.error = error.message || 'Unknown error';
      await offlineStore.put('printJobs', job.id, job);
      this.notifyListeners(job);

      console.error(`Print job ${job.id} failed after ${job.retryCount} retries:`, error);
    }
  }

  // ==================== Printing Logic ====================

  private async printJob(job: PrintJob): Promise<void> {
    const printer = Array.from(this.printers.values()).find(
      (p) => p.address === job.printerAddress
    );

    if (!printer) {
      throw new Error(`Printer not found: ${job.printerAddress}`);
    }

    const content = this.renderTemplate(job);

    switch (printer.protocol) {
      case 'escpos':
        await this.printESCPOS(printer, content);
        break;
      case 'raw':
        await this.printRaw(printer, content);
        break;
      case 'pdf':
        await this.printPDF(printer, content);
        break;
      default:
        throw new Error(`Unsupported protocol: ${printer.protocol}`);
    }
  }

  private async printESCPOS(printer: PrinterConfig, content: string): Promise<void> {
    // Simulate network print request
    // In production, this would send to actual printer via HTTP, WebSocket, or Bluetooth

    console.log(`[PRINT ESC/POS] ${printer.name} (${printer.address})`);
    console.log(content);

    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Simulate 10% failure rate for testing retry logic
    if (Math.random() < 0.1) {
      throw new Error('Printer communication error');
    }
  }

  private async printRaw(printer: PrinterConfig, content: string): Promise<void> {
    console.log(`[PRINT RAW] ${printer.name}`);
    console.log(content);
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  private async printPDF(printer: PrinterConfig, content: string): Promise<void> {
    console.log(`[PRINT PDF] ${printer.name}`);
    // Would generate PDF and send to printer
    await new Promise((resolve) => setTimeout(resolve, 800));
  }

  // ==================== Templates ====================

  private getTemplate(destination: PrintDestination, type: string): string {
    return `${destination}_${type}`;
  }

  private renderTemplate(job: PrintJob): string {
    switch (job.template) {
      case 'receipt_order':
        return this.renderReceiptTemplate(job.data);
      case 'kitchen_order':
        return this.renderKitchenTemplate(job.data);
      case 'bar_order':
        return this.renderBarTemplate(job.data);
      default:
        return JSON.stringify(job.data, null, 2);
    }
  }

  private renderReceiptTemplate(data: ReceiptData): string {
    const lines: string[] = [];

    // Header
    lines.push(ESCPOS.INIT);
    lines.push(ESCPOS.ALIGN_CENTER);
    lines.push(ESCPOS.SIZE_LARGE);
    lines.push(ESCPOS.BOLD_ON);
    lines.push('FOOD TRUCK POS');
    lines.push(ESCPOS.BOLD_OFF);
    lines.push(ESCPOS.SIZE_NORMAL);
    lines.push('123 Main Street');
    lines.push('Phone: (555) 123-4567');
    lines.push(ESCPOS.SEPARATOR);

    // Order details
    lines.push(ESCPOS.ALIGN_LEFT);
    lines.push(`Order #: ${data.orderId}`);
    lines.push(`Date: ${data.timestamp}`);
    if (data.cashier) {
      lines.push(`Cashier: ${data.cashier}`);
    }
    lines.push(ESCPOS.SEPARATOR);

    // Items
    lines.push(ESCPOS.BOLD_ON);
    lines.push('ITEMS');
    lines.push(ESCPOS.BOLD_OFF);

    data.items.forEach((item) => {
      const itemLine = `${item.quantity}x ${item.name}`;
      const price = `$${item.price.toFixed(2)}`;
      const padding = ' '.repeat(Math.max(1, 48 - itemLine.length - price.length));
      lines.push(`${itemLine}${padding}${price}`);

      if (item.notes) {
        lines.push(`  Note: ${item.notes}`);
      }
    });

    lines.push(ESCPOS.SEPARATOR);

    // Totals
    lines.push(ESCPOS.ALIGN_RIGHT);
    lines.push(`Subtotal: $${data.subtotal.toFixed(2)}`);
    lines.push(`Tax: $${data.tax.toFixed(2)}`);
    lines.push(ESCPOS.BOLD_ON);
    lines.push(ESCPOS.SIZE_DOUBLE);
    lines.push(`TOTAL: $${data.total.toFixed(2)}`);
    lines.push(ESCPOS.BOLD_OFF);
    lines.push(ESCPOS.SIZE_NORMAL);
    lines.push(ESCPOS.ALIGN_LEFT);

    // Footer
    lines.push(ESCPOS.SEPARATOR);
    lines.push(ESCPOS.ALIGN_CENTER);
    lines.push('Thank you for your order!');
    lines.push('Please come again');
    lines.push(ESCPOS.FEED);
    lines.push(ESCPOS.FEED);
    lines.push(ESCPOS.CUT);

    return lines.join('\n');
  }

  private renderKitchenTemplate(data: any): string {
    const lines: string[] = [];

    lines.push(ESCPOS.INIT);
    lines.push(ESCPOS.ALIGN_CENTER);
    lines.push(ESCPOS.SIZE_LARGE);
    lines.push(ESCPOS.BOLD_ON);
    lines.push('KITCHEN ORDER');
    lines.push(ESCPOS.BOLD_OFF);
    lines.push(ESCPOS.SIZE_NORMAL);
    lines.push(ESCPOS.SEPARATOR);

    lines.push(ESCPOS.ALIGN_LEFT);
    lines.push(`Order #: ${data.orderId}`);
    lines.push(`Time: ${data.timestamp}`);
    lines.push(ESCPOS.SEPARATOR);

    data.items.forEach((item: any) => {
      lines.push(ESCPOS.SIZE_DOUBLE);
      lines.push(ESCPOS.BOLD_ON);
      lines.push(`${item.quantity}x ${item.name}`);
      lines.push(ESCPOS.BOLD_OFF);
      lines.push(ESCPOS.SIZE_NORMAL);

      if (item.notes) {
        lines.push(`>>> ${item.notes} <<<`);
      }
      lines.push('');
    });

    lines.push(ESCPOS.FEED);
    lines.push(ESCPOS.CUT);

    return lines.join('\n');
  }

  private renderBarTemplate(data: any): string {
    // Similar to kitchen template but for bar items
    return this.renderKitchenTemplate(data);
  }

  // ==================== Persistence ====================

  private async loadPersistedJobs(): Promise<void> {
    try {
      const jobs = await offlineStore.query<PrintJob>('printJobs');

      jobs.forEach((item) => {
        const job = item.data;
        if (job.status === 'pending' || job.status === 'printing') {
          const queue = this.getQueue(job.printerAddress);
          queue.insert(job);
        }
      });
    } catch (error) {
      console.error('Failed to load persisted print jobs:', error);
    }
  }

  // ==================== Background Processing ====================

  private startBackgroundProcessor(): void {
    // Retry failed jobs every 5 minutes
    setInterval(() => {
      this.retryFailedJobs();
    }, 5 * 60 * 1000);

    // Clean up old completed jobs
    setInterval(() => {
      this.cleanupOldJobs();
    }, 60 * 60 * 1000); // 1 hour
  }

  private async retryFailedJobs(): Promise<void> {
    try {
      const jobs = await offlineStore.query<PrintJob>('printJobs');

      jobs.forEach((item) => {
        const job = item.data;
        if (job.status === 'failed' && job.retryCount < job.maxRetries) {
          this.retryJob(job.id);
        }
      });
    } catch (error) {
      console.error('Failed to retry jobs:', error);
    }
  }

  private async cleanupOldJobs(): Promise<void> {
    try {
      const cutoff = Date.now() - 24 * 60 * 60 * 1000; // 24 hours
      const jobs = await offlineStore.query<PrintJob>('printJobs');

      jobs.forEach((item) => {
        const job = item.data;
        if (
          job.status === 'completed' &&
          job.completedAt &&
          job.completedAt < cutoff
        ) {
          offlineStore.delete('printJobs', job.id);
        }
      });
    } catch (error) {
      console.error('Failed to cleanup jobs:', error);
    }
  }

  // ==================== Event Listeners ====================

  subscribe(callback: (job: PrintJob) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private notifyListeners(job: PrintJob): void {
    this.listeners.forEach((callback) => callback(job));
  }

  // ==================== Utility Methods ====================

  async getQueueStatus(): Promise<
    Record<string, { pending: number; active: boolean }>
  > {
    const status: Record<string, { pending: number; active: boolean }> = {};

    this.queues.forEach((queue, address) => {
      status[address] = {
        pending: queue.size(),
        active: this.activePrinters.has(address),
      };
    });

    return status;
  }

  async getJobHistory(limit: number = 50): Promise<PrintJob[]> {
    const jobs = await offlineStore.query<PrintJob>('printJobs');
    return jobs
      .map((item) => item.data)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }
}

// Export singleton
export const printManager = new PrintJobManager();
