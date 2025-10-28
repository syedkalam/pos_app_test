/**
 * React Hook for Print Job Manager
 * Provides reactive access to print job management
 */

import { useEffect, useState, useCallback } from 'react';
import {
  printManager,
  type PrintJob,
  type PrintDestination,
  type PrinterConfig,
} from '../lib/PrintJobManager';

export function usePrintManager() {
  const [jobs, setJobs] = useState<PrintJob[]>([]);
  const [printers, setPrinters] = useState<PrinterConfig[]>([]);
  const [queueStatus, setQueueStatus] = useState<Record<string, { pending: number; active: boolean }>>({});

  useEffect(() => {
    // Load initial data
    const loadData = async () => {
      const history = await printManager.getJobHistory(50);
      setJobs(history);

      const printerList = printManager.getPrinters();
      setPrinters(printerList);

      const status = await printManager.getQueueStatus();
      setQueueStatus(status);
    };

    loadData();

    // Subscribe to job updates
    const unsubscribe = printManager.subscribe((job) => {
      setJobs((prev) => {
        const index = prev.findIndex((j) => j.id === job.id);
        if (index >= 0) {
          const updated = [...prev];
          updated[index] = job;
          return updated;
        }
        return [job, ...prev];
      });

      // Update queue status
      printManager.getQueueStatus().then(setQueueStatus);
    });

    return unsubscribe;
  }, []);

  const print = useCallback(
    async (destination: PrintDestination, type: PrintJob['type'], data: any, priority = 5) => {
      const jobId = await printManager.enqueue(destination, type, data, priority);
      return jobId;
    },
    []
  );

  const cancelJob = useCallback(async (jobId: string) => {
    await printManager.cancelJob(jobId);
    const history = await printManager.getJobHistory(50);
    setJobs(history);
  }, []);

  const retryJob = useCallback(async (jobId: string) => {
    await printManager.retryJob(jobId);
  }, []);

  const registerPrinter = useCallback(async (config: PrinterConfig) => {
    await printManager.registerPrinter(config);
    const printerList = printManager.getPrinters();
    setPrinters(printerList);
  }, []);

  return {
    jobs,
    printers,
    queueStatus,
    print,
    cancelJob,
    retryJob,
    registerPrinter,
  };
}
