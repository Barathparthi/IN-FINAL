import toast from 'react-hot-toast'

/**
 * Wraps an async API call representing a critical submission (like finishing a test).
 * If the call fails due to a network error or a 500 database drop, it will automatically 
 * retry in the background until it succeeds, preventing data loss and candidate frustration.
 */
export async function withOfflineRetry<T>(
  apiCall: () => Promise<T>,
  onRetryStart?: () => void
): Promise<T> {
  let attemptCount = 0;
  
  while (true) {
    try {
      const result = await apiCall();
      if (attemptCount > 0) {
        toast.dismiss('offline_retry');
        toast.success('Connection restored! Progress saved.', { id: 'offline_restored' });
      }
      return result;
    } catch (err: any) {
      attemptCount++;
      if (onRetryStart) onRetryStart();
      
      // If it's a structural 4xx error (like 400 Bad Request), retrying won't help.
      // We only want to infinitely retry on 5xx database connection drops or 0 Network drops.
      const status = err.response?.status;
      if (status >= 400 && status < 500) {
        throw err;
      }
      // Exponential-ish backoff capped at 10 seconds
      const waitMs = Math.min(10000, 2000 + (attemptCount * 1000));
      
      toast.error(`Network or database unstable. Auto-retrying in ${Math.round(waitMs / 1000)}s... Please do not close the app.`, { 
        id: 'offline_retry', 
        duration: waitMs 
      });
      
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }
  }
}
