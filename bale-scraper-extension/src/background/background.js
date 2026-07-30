/**
 * Bale Channel Scraper - Background Service Worker
 * 
 * Handles:
 * - Download queue management
 * - Rate limiting and backoff
 * - Communication between content script and popup
 */

// ============================================
// DOWNLOAD QUEUE STATE
// ============================================

let downloadQueue = {
  items: [],
  isProcessing: false,
  isPaused: false,
  concurrency: 2,
  delayMs: 1000,
  retryCount: 3,
  activeDownloads: 0,
  completedCount: 0,
  failedCount: 0,
};

// ============================================
// UTILITY FUNCTIONS
// ============================================

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function generateFilename(url, index) {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const filename = pathname.substring(pathname.lastIndexOf('/') + 1);
    
    // Decode URL encoding and clean filename
    const decoded = decodeURIComponent(filename);
    const cleaned = decoded.replace(/[^a-zA-Z0-9._-]/g, '_');
    
    if (cleaned.length > 50) {
      const ext = cleaned.substring(cleaned.lastIndexOf('.'));
      return `bale_${index}${ext || '.dat'}`;
    }
    return cleaned || `bale_file_${index}`;
  } catch (e) {
    return `bale_download_${index}`;
  }
}

// ============================================
// DOWNLOAD MANAGEMENT
// ============================================

/**
 * Add items to download queue
 */
function addToQueue(items) {
  const newItems = items.map((item, idx) => ({
    id: `${Date.now()}_${idx}`,
    url: item.url,
    filename: item.filename || generateFilename(item.url, downloadQueue.items.length + idx),
    status: 'pending',
    retries: 0,
    ...item,
  }));
  
  downloadQueue.items.push(...newItems);
  
  chrome.runtime.sendMessage({
    type: 'QUEUE_UPDATED',
    queueLength: downloadQueue.items.length,
    pendingCount: downloadQueue.items.filter(i => i.status === 'pending').length,
  }).catch(() => {});
  
  // Start processing if not already running
  if (!downloadQueue.isProcessing && !downloadQueue.isPaused) {
    processQueue();
  }
}

/**
 * Process download queue with concurrency control
 */
async function processQueue() {
  if (downloadQueue.isProcessing && !downloadQueue.isPaused) {
    return;
  }
  
  downloadQueue.isProcessing = true;
  
  while (downloadQueue.items.some(item => item.status === 'pending') && !downloadQueue.isPaused) {
    // Check concurrency limit
    if (downloadQueue.activeDownloads >= downloadQueue.concurrency) {
      await sleep(200);
      continue;
    }
    
    // Get next pending item
    const pendingItem = downloadQueue.items.find(item => item.status === 'pending');
    if (!pendingItem) break;
    
    // Mark as downloading
    pendingItem.status = 'downloading';
    downloadQueue.activeDownloads++;
    
    // Start download (fire and forget, but track completion)
    startDownload(pendingItem);
    
    // Wait for delay between downloads
    await sleep(downloadQueue.delayMs);
  }
  
  downloadQueue.isProcessing = false;
}

/**
 * Start a single download
 */
function startDownload(item) {
  chrome.downloads.download({
    url: item.url,
    filename: `bale_downloads/${item.filename}`,
    saveAs: false,
    conflictAction: 'uniquify',
  }, (downloadId) => {
    if (chrome.runtime.lastError) {
      handleDownloadError(item, chrome.runtime.lastError);
      return;
    }
    
    // Track download completion
    chrome.downloads.onChanged.addListener(function onDownloadChanged(delta) {
      if (delta.id === downloadId) {
        if (delta.state && delta.state.current === 'complete') {
          item.status = 'completed';
          downloadQueue.completedCount++;
          downloadQueue.activeDownloads--;
          chrome.runtime.lastError = null;
          
          chrome.runtime.sendMessage({
            type: 'DOWNLOAD_PROGRESS',
            itemId: item.id,
            status: 'completed',
            completed: downloadQueue.completedCount,
            failed: downloadQueue.failedCount,
            total: downloadQueue.items.length,
          }).catch(() => {});
          
          // Remove listener
          chrome.downloads.onChanged.removeListener(onDownloadChanged);
          
          // Continue processing
          processQueue();
        } else if (delta.error && delta.error.current) {
          handleDownloadError(item, new Error(delta.error.current));
          chrome.downloads.onChanged.removeListener(onDownloadChanged);
        }
      }
    });
  });
}

/**
 * Handle download error with retry logic
 */
function handleDownloadError(item, error) {
  console.warn('Download error:', item.url, error);
  
  if (item.retries < downloadQueue.retryCount) {
    item.retries++;
    item.status = 'pending';
    item.error = error.message;
    
    // Exponential backoff
    const backoffMs = Math.min(1000 * Math.pow(2, item.retries), 10000);
    setTimeout(() => {
      processQueue();
    }, backoffMs);
  } else {
    item.status = 'failed';
    item.error = error.message;
    downloadQueue.failedCount++;
    downloadQueue.activeDownloads--;
    
    chrome.runtime.sendMessage({
      type: 'DOWNLOAD_PROGRESS',
      itemId: item.id,
      status: 'failed',
      error: error.message,
      completed: downloadQueue.completedCount,
      failed: downloadQueue.failedCount,
      total: downloadQueue.items.length,
    }).catch(() => {});
    
    processQueue();
  }
}

/**
 * Pause download queue
 */
function pauseQueue() {
  downloadQueue.isPaused = true;
  chrome.runtime.sendMessage({
    type: 'QUEUE_PAUSED',
    pendingCount: downloadQueue.items.filter(i => i.status === 'pending').length,
  }).catch(() => {});
}

/**
 * Resume download queue
 */
function resumeQueue() {
  downloadQueue.isPaused = false;
  processQueue();
  chrome.runtime.sendMessage({
    type: 'QUEUE_RESUMED',
  }).catch(() => {});
}

/**
 * Clear download queue
 */
function clearQueue() {
  downloadQueue.items = [];
  downloadQueue.completedCount = 0;
  downloadQueue.failedCount = 0;
  downloadQueue.activeDownloads = 0;
  downloadQueue.isProcessing = false;
  
  chrome.runtime.sendMessage({
    type: 'QUEUE_CLEARED',
  }).catch(() => {});
}

/**
 * Get queue status
 */
function getQueueStatus() {
  return {
    total: downloadQueue.items.length,
    pending: downloadQueue.items.filter(i => i.status === 'pending').length,
    downloading: downloadQueue.items.filter(i => i.status === 'downloading').length,
    completed: downloadQueue.completedCount,
    failed: downloadQueue.failedCount,
    isProcessing: downloadQueue.isProcessing,
    isPaused: downloadQueue.isPaused,
    concurrency: downloadQueue.concurrency,
    delayMs: downloadQueue.delayMs,
  };
}

/**
 * Update queue settings
 */
function updateQueueSettings(settings) {
  if (settings.concurrency !== undefined) {
    downloadQueue.concurrency = Math.max(1, Math.min(5, settings.concurrency));
  }
  if (settings.delayMs !== undefined) {
    downloadQueue.delayMs = Math.max(500, settings.delayMs);
  }
  if (settings.retryCount !== undefined) {
    downloadQueue.retryCount = Math.max(0, settings.retryCount);
  }
}

// ============================================
// MESSAGE HANDLING
// ============================================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.type) {
    case 'ADD_TO_QUEUE':
      addToQueue(request.items);
      sendResponse({ success: true, queueLength: downloadQueue.items.length });
      break;
      
    case 'PAUSE_QUEUE':
      pauseQueue();
      sendResponse({ success: true });
      break;
      
    case 'RESUME_QUEUE':
      resumeQueue();
      sendResponse({ success: true });
      break;
      
    case 'CLEAR_QUEUE':
      clearQueue();
      sendResponse({ success: true });
      break;
      
    case 'GET_QUEUE_STATUS':
      sendResponse(getQueueStatus());
      break;
      
    case 'UPDATE_QUEUE_SETTINGS':
      updateQueueSettings(request.settings);
      sendResponse({ success: true });
      break;
      
    default:
      sendResponse({ error: 'Unknown message type' });
  }
});

console.log('[Bale Scraper] Background service worker initialized');
