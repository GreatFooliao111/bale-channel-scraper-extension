/**
 * Bale Channel Scraper - Popup Script
 */

// ============================================
// STATE
// ============================================

let currentData = null;
let isScraping = false;
let isPaused = false;

// ============================================
// DOM ELEMENTS
// ============================================

const elements = {
  statusIndicator: document.getElementById('statusIndicator'),
  statusText: document.getElementById('statusText'),
  channelInfo: document.getElementById('channelInfo'),
  channelAvatar: document.getElementById('channelAvatar'),
  channelName: document.getElementById('channelName'),
  channelMembers: document.getElementById('channelMembers'),
  
  // Controls
  contentTypeFilter: document.getElementById('contentTypeFilter'),
  startDate: document.getElementById('startDate'),
  endDate: document.getElementById('endDate'),
  
  // Buttons
  btnStartScrape: document.getElementById('btnStartScrape'),
  btnPauseResume: document.getElementById('btnPauseResume'),
  btnStop: document.getElementById('btnStop'),
  btnExportJSON: document.getElementById('btnExportJSON'),
  btnExportCSV: document.getElementById('btnExportCSV'),
  btnExportMarkdown: document.getElementById('btnExportMarkdown'),
  btnQueueDownloads: document.getElementById('btnQueueDownloads'),
  btnPauseQueue: document.getElementById('btnPauseQueue'),
  btnResumeQueue: document.getElementById('btnResumeQueue'),
  btnClearQueue: document.getElementById('btnClearQueue'),
  
  // Sections
  progressSection: document.getElementById('progressSection'),
  exportSection: document.getElementById('exportSection'),
  downloadSection: document.getElementById('downloadSection'),
  
  // Progress
  progressBar: document.getElementById('progressBar'),
  postCount: document.getElementById('postCount'),
  scrapeProgress: document.getElementById('scrapeProgress'),
  
  // Download counts
  imageCount: document.getElementById('imageCount'),
  videoCount: document.getElementById('videoCount'),
  
  // Queue settings
  concurrency: document.getElementById('concurrency'),
  downloadDelay: document.getElementById('downloadDelay'),
  
  // Queue status
  queueStatus: document.getElementById('queueStatus'),
  pendingCount: document.getElementById('pendingCount'),
  completedCount: document.getElementById('completedCount'),
  failedCount: document.getElementById('failedCount'),
  
  // Message area
  messageArea: document.getElementById('messageArea'),
};

// ============================================
// UTILITY FUNCTIONS
// ============================================

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function showMessage(text, type = 'info') {
  elements.messageArea.textContent = text;
  elements.messageArea.className = `message-area ${type}`;
  elements.messageArea.classList.remove('hidden');
  
  // Auto-hide after 5 seconds
  setTimeout(() => {
    elements.messageArea.classList.add('hidden');
  }, 5000);
}

function updateStatus(status, text) {
  elements.statusIndicator.className = `status-indicator ${status}`;
  elements.statusText.textContent = text;
}

function getCurrentTab() {
  return chrome.tabs.query({ active: true, currentWindow: true })
    .then(tabs => tabs[0]);
}

function sendMessageToContent(message) {
  return getCurrentTab()
    .then(tab => chrome.tabs.sendMessage(tab.id, message))
    .catch(err => {
      console.error('Failed to send message:', err);
      throw new Error('Could not connect to page. Make sure you are on a Bale channel page.');
    });
}

// ============================================
// SCRAPING CONTROLS
// ============================================

async function startScraping() {
  try {
    const options = {
      contentTypeFilter: elements.contentTypeFilter.value,
      startDate: elements.startDate.value || null,
      endDate: elements.endDate.value || null,
    };
    
    const response = await sendMessageToContent({
      type: 'START_SCRAPE',
      options,
    });
    
    if (response.success) {
      isScraping = true;
      isPaused = false;
      updateUIForScraping();
      showMessage('Scraping started...', 'info');
    } else {
      showMessage(response.error || 'Failed to start scraping', 'error');
    }
  } catch (error) {
    showMessage(error.message, 'error');
    updateStatus('error', 'Error');
  }
}

function pauseScraping() {
  sendMessageToContent({ type: 'PAUSE_SCRAPE' });
  isPaused = true;
  updateUIForPaused();
}

function resumeScraping() {
  sendMessageToContent({ type: 'RESUME_SCRAPE' });
  isPaused = false;
  updateUIForScraping();
}

function stopScraping() {
  sendMessageToContent({ type: 'STOP_SCRAPE' });
  isScraping = false;
  isPaused = false;
  updateUIForIdle();
  showMessage('Scraping stopped', 'info');
}

// ============================================
// EXPORT FUNCTIONS
// ============================================

async function getScrapedData() {
  try {
    const data = await sendMessageToContent({ type: 'GET_SCRAPED_DATA' });
    currentData = data;
    return data;
  } catch (error) {
    showMessage('Failed to get scraped data', 'error');
    return null;
  }
}

function exportToJSON(data) {
  const json = JSON.stringify(data, null, 2);
  downloadFile(json, `bale_channel_${data.channelInfo?.channelId || 'export'}_${Date.now()}.json`, 'application/json');
}

function exportToCSV(data) {
  const posts = data.posts || [];
  if (posts.length === 0) {
    showMessage('No posts to export', 'error');
    return;
  }
  
  // CSV headers
  const headers = [
    'ID',
    'Type',
    'Timestamp',
    'Text',
    'View Count',
    'Image Count',
    'Video Count',
    'Link Count',
    'Reaction Summary',
  ];
  
  // CSV rows
  const rows = posts.map(post => [
    `"${(post.id || '').toString().replace(/"/g, '""')}"`,
    `"${(post.type || '').replace(/"/g, '""')}"`,
    `"${(post.timestamp || '').replace(/"/g, '""')}"`,
    `"${(post.text || '').toString().replace(/"/g, '""').replace(/\n/g, '\\n')}"`,
    post.viewCount || 0,
    (post.images || []).length,
    (post.videos || []).length,
    (post.links || []).length,
    `"${(post.reactions || []).map(r => `${r.emoji}:${r.count}`).join(';')}"`,
  ]);
  
  const csv = [headers.join(','), ...rows].join('\n');
  downloadFile(csv, `bale_channel_${data.channelInfo?.channelId || 'export'}_${Date.now()}.csv`, 'text/csv');
}

function exportToMarkdown(data) {
  const channelInfo = data.channelInfo || {};
  const posts = data.posts || [];
  
  let md = `# ${channelInfo.name || 'Bale Channel Export'}\n\n`;
  
  if (channelInfo.description) {
    md += `**Description:** ${channelInfo.description}\n\n`;
  }
  
  if (channelInfo.memberCount) {
    md += `**Members:** ${channelInfo.memberCount.toLocaleString()}\n\n`;
  }
  
  md += `---\n\n`;
  md += `*Exported on: ${new Date().toLocaleString()}*\n\n`;
  md += `**Total Posts:** ${posts.length}\n\n`;
  md += `---\n\n`;
  
  posts.forEach((post, index) => {
    md += `## Post ${index + 1}\n\n`;
    
    if (post.timestamp) {
      md += `📅 **${new Date(post.timestamp).toLocaleString()}**\n\n`;
    }
    
    if (post.type === 'image' || post.type === 'image+text') {
      md += `🖼️ *[Image Post]*\n\n`;
      (post.images || []).forEach(img => {
        md += `![Image](${img.url})\n\n`;
      });
    }
    
    if (post.type === 'video') {
      md += `🎥 *[Video Post]*\n\n`;
    }
    
    if (post.text) {
      md += `${post.text}\n\n`;
    }
    
    if (post.links && post.links.length > 0) {
      md += `**Links:**\n`;
      post.links.forEach(link => {
        md += `- [${link.text || link.url}](${link.url})\n`;
      });
      md += `\n`;
    }
    
    if (post.viewCount) {
      md += `👁️ Views: ${post.viewCount.toLocaleString()}\n\n`;
    }
    
    if (post.reactions && post.reactions.length > 0) {
      md += `Reactions: ${post.reactions.map(r => `${r.emoji} ${r.count}`).join('  ')}\n\n`;
    }
    
    md += `---\n\n`;
  });
  
  downloadFile(md, `bale_channel_${channelInfo.channelId || 'export'}_${Date.now()}.md`, 'text/markdown');
}

function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ============================================
// DOWNLOAD FUNCTIONS
// ============================================

async function queueDownloads() {
  if (!currentData || !currentData.posts) {
    showMessage('No data to download. Scrape first.', 'error');
    return;
  }
  
  const items = [];
  const downloadImages = document.getElementById('downloadImages').checked;
  const downloadVideos = document.getElementById('downloadVideos').checked;
  
  currentData.posts.forEach(post => {
    if (downloadImages && post.images) {
      post.images.forEach(img => {
        items.push({
          url: img.url,
          type: 'image',
          postId: post.id,
        });
      });
    }
    
    if (downloadVideos && post.videos) {
      post.videos.forEach(video => {
        items.push({
          url: video.url,
          type: 'video',
          postId: post.id,
        });
      });
    }
  });
  
  if (items.length === 0) {
    showMessage('No media items to download', 'error');
    return;
  }
  
  // Update queue settings
  const concurrency = parseInt(elements.concurrency.value, 10) || 2;
  const delayMs = parseInt(elements.downloadDelay.value, 10) || 1000;
  
  chrome.runtime.sendMessage({
    type: 'UPDATE_QUEUE_SETTINGS',
    settings: { concurrency, delayMs },
  });
  
  // Add to queue
  chrome.runtime.sendMessage({
    type: 'ADD_TO_QUEUE',
    items,
  }, (response) => {
    if (response && response.success) {
      showMessage(`Queued ${items.length} items for download`, 'success');
      elements.queueStatus.classList.remove('hidden');
      updateQueueStatus();
    }
  });
}

function pauseQueue() {
  chrome.runtime.sendMessage({ type: 'PAUSE_QUEUE' });
  elements.btnPauseQueue.classList.add('hidden');
  elements.btnResumeQueue.classList.remove('hidden');
}

function resumeQueue() {
  chrome.runtime.sendMessage({ type: 'RESUME_QUEUE' });
  elements.btnResumeQueue.classList.add('hidden');
  elements.btnPauseQueue.classList.remove('hidden');
}

function clearQueue() {
  chrome.runtime.sendMessage({ type: 'CLEAR_QUEUE' });
  elements.queueStatus.classList.add('hidden');
  showMessage('Queue cleared', 'info');
}

function updateQueueStatus() {
  chrome.runtime.sendMessage({ type: 'GET_QUEUE_STATUS' }, (status) => {
    if (status) {
      elements.pendingCount.textContent = status.pending;
      elements.completedCount.textContent = status.completed;
      elements.failedCount.textContent = status.failed;
    }
  });
}

// ============================================
// UI UPDATES
// ============================================

function updateUIForScraping() {
  elements.btnStartScrape.classList.add('hidden');
  elements.btnPauseResume.classList.remove('hidden');
  elements.btnStop.classList.remove('hidden');
  elements.progressSection.classList.remove('hidden');
  updateStatus('scraping', 'Scraping...');
  
  elements.btnPauseResume.innerHTML = '<span class="btn-icon">⏸️</span> Pause';
}

function updateUIForPaused() {
  updateStatus('paused', 'Paused');
  elements.btnPauseResume.innerHTML = '<span class="btn-icon">▶️</span> Resume';
}

function updateUIForIdle() {
  elements.btnStartScrape.classList.remove('hidden');
  elements.btnPauseResume.classList.add('hidden');
  elements.btnStop.classList.add('hidden');
  updateStatus('idle', 'Ready');
}

function updateChannelInfo(channelInfo) {
  if (!channelInfo) return;
  
  elements.channelName.textContent = channelInfo.name || 'Unknown Channel';
  elements.channelMembers.textContent = channelInfo.memberCount 
    ? `${channelInfo.memberCount.toLocaleString()} members` 
    : '';
  
  if (channelInfo.avatarUrl) {
    elements.channelAvatar.src = channelInfo.avatarUrl;
    elements.channelAvatar.classList.remove('hidden');
  }
  
  elements.channelInfo.classList.remove('hidden');
}

function countMedia(posts) {
  let imageCount = 0;
  let videoCount = 0;
  
  posts.forEach(post => {
    imageCount += (post.images || []).length;
    videoCount += (post.videos || []).length;
  });
  
  elements.imageCount.textContent = imageCount;
  elements.videoCount.textContent = videoCount;
}

// ============================================
// EVENT LISTENERS
// ============================================

elements.btnStartScrape.addEventListener('click', startScraping);
elements.btnPauseResume.addEventListener('click', () => {
  if (isPaused) {
    resumeScraping();
  } else {
    pauseScraping();
  }
});
elements.btnStop.addEventListener('click', stopScraping);

elements.btnExportJSON.addEventListener('click', async () => {
  const data = await getScrapedData();
  if (data) exportToJSON(data);
});

elements.btnExportCSV.addEventListener('click', async () => {
  const data = await getScrapedData();
  if (data) exportToCSV(data);
});

elements.btnExportMarkdown.addEventListener('click', async () => {
  const data = await getScrapedData();
  if (data) exportToMarkdown(data);
});

elements.btnQueueDownloads.addEventListener('click', queueDownloads);
elements.btnPauseQueue.addEventListener('click', pauseQueue);
elements.btnResumeQueue.addEventListener('click', resumeQueue);
elements.btnClearQueue.addEventListener('click', clearQueue);

// ============================================
// MESSAGE LISTENERS
// ============================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'SCRAPE_STARTED':
      updateChannelInfo(message.channelInfo);
      break;
      
    case 'PROGRESS_UPDATE':
      elements.postCount.textContent = `${message.postCount} posts collected`;
      elements.scrapeProgress.textContent = `Total detected: ${message.totalDetected}`;
      const progress = message.totalDetected > 0 
        ? Math.min(100, (message.postCount / message.totalDetected) * 100) 
        : 0;
      elements.progressBar.style.width = `${progress}%`;
      break;
      
    case 'SCRAPE_COMPLETE':
      isScraping = false;
      isPaused = false;
      updateUIForIdle();
      showMessage(`Scraping complete: ${message.reason === 'top_reached' ? 'Reached top of channel' : 'Max attempts reached'}`, 'success');
      
      // Show export and download sections
      elements.exportSection.classList.remove('hidden');
      elements.downloadSection.classList.remove('hidden');
      
      // Get final data and count media
      getScrapedData().then(data => {
        if (data && data.posts) {
          countMedia(data.posts);
        }
      });
      break;
      
    case 'SCRAPE_PAUSED':
      updateUIForPaused();
      break;
      
    case 'SCRAPE_RESUMED':
      updateUIForScraping();
      break;
      
    case 'SCRAPE_STOPPED':
      updateUIForIdle();
      break;
      
    case 'QUEUE_UPDATED':
      updateQueueStatus();
      elements.btnPauseQueue.classList.remove('hidden');
      elements.btnPauseQueue.classList.add('hidden');
      break;
      
    case 'DOWNLOAD_PROGRESS':
      updateQueueStatus();
      if (message.status === 'completed') {
        // Could show individual completion notification
      } else if (message.status === 'failed') {
        showMessage(`Download failed: ${message.error}`, 'error');
      }
      break;
      
    case 'QUEUE_PAUSED':
      elements.btnPauseQueue.classList.add('hidden');
      elements.btnResumeQueue.classList.remove('hidden');
      break;
      
    case 'QUEUE_RESUMED':
      elements.btnResumeQueue.classList.add('hidden');
      elements.btnPauseQueue.classList.remove('hidden');
      break;
      
    case 'QUEUE_CLEARED':
      elements.queueStatus.classList.add('hidden');
      break;
  }
});

// ============================================
// INITIALIZATION
// ============================================

async function init() {
  // Check if we're on a valid page
  try {
    const tab = await getCurrentTab();
    const isValidPage = tab.url && (tab.url.includes('ble.ir/s/') || tab.url.includes('web.bale.ai/'));
    
    if (!isValidPage) {
      showMessage('Please navigate to a Bale channel page (e.g., ble.ir/s/channelname)', 'error');
      elements.btnStartScrape.disabled = true;
    }
    
    // Get initial status
    const status = await sendMessageToContent({ type: 'GET_STATUS' }).catch(() => null);
    if (status) {
      if (status.isScraping) {
        isScraping = true;
        isPaused = status.isPaused;
        if (isPaused) {
          updateUIForPaused();
        } else {
          updateUIForScraping();
        }
      }
      if (status.channelInfo) {
        updateChannelInfo(status.channelInfo);
      }
    }
  } catch (error) {
    console.warn('Initialization check failed:', error);
  }
}

init();
