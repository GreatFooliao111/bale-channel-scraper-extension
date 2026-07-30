/**
 * Bale Channel Scraper - Content Script
 * 
 * This script runs on Bale channel preview pages and handles:
 * - Page structure inspection and adaptive parsing
 * - Automatic upward scrolling for progressive loading
 * - Post extraction with metadata
 * - Communication with popup and background scripts
 */

// ============================================
// CONFIGURATION & CONSTANTS
// ============================================

const CONFIG = {
  // Scroll settings
  SCROLL_STEP: 800,              // Pixels to scroll per step
  SCROLL_DELAY_MS: 400,          // Delay between scroll steps
  MAX_SCROLL_ATTEMPTS: 100,      // Maximum scroll iterations before stopping
  SCROLL_CONTAINER_SELECTOR: '.Scrollbar_scroller__f0Kqd',
  
  // Loading detection
  LOAD_WAIT_MS: 600,             // Wait time after scroll for content to load
  STALL_THRESHOLD: 3,            // Number of consecutive non-loading scrolls to stop
  
  // Post selectors (using multiple strategies for resilience)
  POST_WRAPPER_SELECTOR: '[data-sid]',
  POST_MESSAGE_WRAPPER: '.MessageItem_messageWrapper__E9ZFU',
  DATE_DIVIDER_SELECTOR: '.DateDivider_DateDividerWrapper__cIjJW',
  
  // Content selectors
  BUBBLE_SELECTOR: '.BaseBubble_bubble__4oHot',
  TEXT_CONTENT_SELECTOR: '.Text_text__Um9IF',
  IMAGE_SELECTOR: '.Photo_photo_message__yDO5Q img, .Photo_photo_message__yDO5Q [data-nimg="1"]',
  VIDEO_SELECTOR: '.Video_video_message__rQnjc video, .Video_video_message__rQnjc [data-nimg="1"]',
  LINK_SELECTOR: 'a.link, a[href^="https://"]',
  
  // Metadata selectors
  VIEW_COUNT_SELECTOR: '.Info_ViewWrapper__O75PK .Info_Text__LVysg',
  TIMESTAMP_SELECTOR: '.Info_date__fCTQ4',
  REACTIONS_SELECTOR: '.Reactions_reactions__hDYvr',
  
  // Profile selectors
  PROFILE_NAME_SELECTOR: '.Profile_name__g61_D',
  PROFILE_DESCRIPTION_SELECTOR: '.Profile_description__UMdBM',
  PROFILE_MEMBER_COUNT_SELECTOR: '.Profile_memberCount__r0_X_',
  PROFILE_AVATAR_SELECTOR: '.Avatar_container__LLrtj img, .Avatar_img___rz8f',
  
  // Deduplication
  SEEN_POSTS_KEY: 'bale_scraper_seen_posts',
  
  // Rate limiting for downloads
  DEFAULT_DOWNLOAD_CONCURRENCY: 2,
  DEFAULT_DOWNLOAD_DELAY_MS: 1000,
};

// ============================================
// STATE MANAGEMENT
// ============================================

let scraperState = {
  isScraping: false,
  isPaused: false,
  posts: [],
  seenPostIds: new Set(),
  channelInfo: null,
  scrollAttempts: 0,
  consecutiveStalls: 0,
  lastPostCount: 0,
  startDate: null,
  endDate: null,
  contentTypeFilter: 'all', // 'all', 'text', 'image', 'video', 'file', 'text+image'
};

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Generate a unique ID for a post based on its data-sid attribute
 */
function generatePostId(element) {
  const dataSid = element.getAttribute('data-sid');
  if (dataSid) {
    return dataSid;
  }
  // Fallback: use text content hash
  const text = element.textContent?.slice(0, 100) || '';
  return `post_${Date.now()}_${hashCode(text)}`;
}

/**
 * Simple hash function for strings
 */
function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

/**
 * Convert Persian/Arabic numbers to English
 */
function toEnglishDigits(str) {
  if (!str) return str;
  const persianNumbers = [/۰/g, /۱/g, /۲/g, /۳/g, /۴/g, /۵/g, /۶/g, /۷/g, /۸/g, /۹/g];
  const arabicNumbers = [/٠/g, /١/g, /٢/g, /٣/g, /٤/g, /٥/g, /٦/g, /٧/g, /٨/g, /٩/g];
  
  let result = str;
  for (let i = 0; i < 10; i++) {
    result = result.replace(persianNumbers[i], i).replace(arabicNumbers[i], i);
  }
  return result;
}

/**
 * Parse view count text to number
 */
function parseViewCount(text) {
  if (!text) return 0;
  const englishText = toEnglishDigits(text);
  // Handle K suffix (e.g., "6.4K")
  const kMatch = englishText.match(/([\d.]+)\s*K/i);
  if (kMatch) {
    return Math.round(parseFloat(kMatch[1]) * 1000);
  }
  // Handle M suffix
  const mMatch = englishText.match(/([\d.]+)\s*M/i);
  if (mMatch) {
    return Math.round(parseFloat(mMatch[1]) * 1000000);
  }
  // Plain number with commas
  const cleaned = englishText.replace(/[,،\s]/g, '');
  return parseInt(cleaned, 10) || 0;
}

/**
 * Parse timestamp from post metadata
 */
function parseTimestamp(dateDividers, postElement) {
  // Find the closest date divider before this post
  let dateStr = null;
  let timeStr = null;
  
  for (const divider of dateDividers) {
    if (divider.compareDocumentPosition(postElement) & Node.DOCUMENT_POSITION_FOLLOWING) {
      const timeEl = divider.querySelector('time');
      if (timeEl) {
        dateStr = timeEl.getAttribute('dateTime');
        break;
      }
    }
  }
  
  // Get time from post's own timestamp
  const timeEl = postElement.querySelector(CONFIG.TIMESTAMP_SELECTOR);
  if (timeEl) {
    timeStr = toEnglishDigits(timeEl.textContent?.trim());
  }
  
  // Combine date and time
  if (dateStr && timeStr) {
    try {
      const date = new Date(dateStr);
      const [hours, minutes] = timeStr.split(':').map(Number);
      if (!isNaN(hours) && !isNaN(minutes)) {
        date.setHours(hours, minutes);
        return date.toISOString();
      }
    } catch (e) {
      console.warn('Failed to parse timestamp:', e);
    }
  }
  
  return dateStr;
}

/**
 * Determine post type based on content
 */
function determinePostType(element) {
  const hasImage = element.querySelector(CONFIG.IMAGE_SELECTOR) !== null;
  const hasVideo = element.querySelector(CONFIG.VIDEO_SELECTOR) !== null;
  const hasText = element.querySelector(CONFIG.TEXT_CONTENT_SELECTOR)?.textContent?.trim().length > 0;
  const hasLink = element.querySelector(CONFIG.LINK_SELECTOR) !== null;
  
  if (hasVideo) return 'video';
  if (hasImage && hasText) return 'image+text';
  if (hasImage) return 'image';
  if (hasText || hasLink) return 'text';
  return 'unknown';
}

/**
 * Check if post matches content type filter
 */
function matchesContentType(postType, filter) {
  if (filter === 'all') return true;
  if (filter === 'text') return postType === 'text';
  if (filter === 'image') return postType === 'image';
  if (filter === 'video') return postType === 'video';
  if (filter === 'file') return postType === 'file';
  if (filter === 'text+image') return postType === 'image+text' || postType === 'image';
  if (filter === 'links') return postType === 'text'; // Text posts may contain links
  return true;
}

// ============================================
// CHANNEL INSPECTION
// ============================================

/**
 * Inspect and extract channel information
 */
function inspectChannelInfo() {
  const channelInfo = {
    name: null,
    description: null,
    memberCount: null,
    avatarUrl: null,
    channelId: null,
    url: window.location.href,
  };
  
  // Extract channel name
  const nameEl = document.querySelector(CONFIG.PROFILE_NAME_SELECTOR);
  if (nameEl) {
    channelInfo.name = nameEl.textContent?.trim() || null;
  }
  
  // Extract description
  const descEl = document.querySelector(CONFIG.PROFILE_DESCRIPTION_SELECTOR);
  if (descEl) {
    channelInfo.description = descEl.textContent?.trim() || null;
  }
  
  // Extract member count
  const memberEl = document.querySelector(CONFIG.PROFILE_MEMBER_COUNT_SELECTOR);
  if (memberEl) {
    const memberText = memberEl.textContent?.trim();
    const englishMembers = toEnglishDigits(memberText);
    const match = englishMembers.match(/([\d,]+)/);
    if (match) {
      channelInfo.memberCount = parseInt(match[1].replace(/,/g, ''), 10);
    }
  }
  
  // Extract avatar URL
  const avatarEl = document.querySelector(CONFIG.PROFILE_AVATAR_SELECTOR);
  if (avatarEl) {
    channelInfo.avatarUrl = avatarEl.getAttribute('src') || avatarEl.getAttribute('data-src') || null;
  }
  
  // Extract channel ID from URL
  const urlMatch = window.location.href.match(/\/s\/([^/?#]+)/);
  if (urlMatch) {
    channelInfo.channelId = urlMatch[1];
  }
  
  return channelInfo;
}

// ============================================
// POST EXTRACTION
// ============================================

/**
 * Extract a single post's data
 */
function extractPost(element, dateDividers) {
  const postId = generatePostId(element);
  const postType = determinePostType(element);
  
  // Extract text content
  const textEl = element.querySelector(CONFIG.TEXT_CONTENT_SELECTOR);
  let textContent = null;
  let links = [];
  
  if (textEl) {
    textContent = textEl.textContent?.trim() || null;
    
    // Extract links
    const linkElements = textEl.querySelectorAll(CONFIG.LINK_SELECTOR);
    links = Array.from(linkElements).map(link => ({
      text: link.textContent?.trim(),
      url: link.href,
    }));
  }
  
  // Extract images
  const images = [];
  const imageElements = element.querySelectorAll(CONFIG.IMAGE_SELECTOR);
  imageElements.forEach(img => {
    const src = img.getAttribute('src') || img.getAttribute('data-src');
    if (src && !src.startsWith('data:image/gif;base64')) {
      images.push({
        url: src,
        alt: img.getAttribute('alt'),
      });
    }
  });
  
  // Extract videos
  const videos = [];
  const videoElements = element.querySelectorAll(CONFIG.VIDEO_SELECTOR);
  videoElements.forEach(video => {
    const src = video.getAttribute('src') || video.getAttribute('data-src');
    if (src) {
      videos.push({
        url: src,
        thumbnail: video.getAttribute('poster'),
      });
    }
  });
  
  // Extract view count
  const viewEl = element.querySelector(CONFIG.VIEW_COUNT_SELECTOR);
  const viewCount = parseViewCount(viewEl?.textContent);
  
  // Extract timestamp
  const timestamp = parseTimestamp(dateDividers, element);
  
  // Extract reactions
  const reactions = [];
  const reactionElements = element.querySelectorAll('.Reactions_chip__S6GZt');
  reactionElements.forEach(chip => {
    const emojiEl = chip.querySelector('.Reactions_emoji__Y9Bds img');
    const countEl = chip.querySelector('.Reactions_count__jdv4g');
    if (emojiEl && countEl) {
      reactions.push({
        emoji: emojiEl.getAttribute('alt') || '❤',
        count: parseInt(toEnglishDigits(countEl.textContent), 10) || 0,
      });
    }
  });
  
  // Extract quoted message info if present
  let quotedMessage = null;
  const quotedEl = element.querySelector('[data-quoted-message]');
  if (quotedEl) {
    quotedMessage = {
      sender: quotedEl.getAttribute('data-quoted-sender'),
      content: quotedEl.textContent?.trim(),
    };
  }
  
  return {
    id: postId,
    type: postType,
    text: textContent,
    links,
    images,
    videos,
    timestamp,
    viewCount,
    reactions,
    quotedMessage,
    rawHtml: element.outerHTML,
  };
}

/**
 * Extract all visible posts from the page
 */
function extractAllPosts() {
  const posts = [];
  const dateDividers = Array.from(document.querySelectorAll(CONFIG.DATE_DIVIDER_SELECTOR));
  const postElements = document.querySelectorAll(CONFIG.POST_MESSAGE_WRAPPER);
  
  postElements.forEach(element => {
    try {
      const postData = extractPost(element, dateDividers);
      posts.push(postData);
    } catch (error) {
      console.warn('Failed to extract post:', error);
    }
  });
  
  return posts;
}

// ============================================
// SCROLL HANDLING
// ============================================

/**
 * Get the scroll container element
 */
function getScrollContainer() {
  return document.querySelector(CONFIG.SCROLL_CONTAINER_SELECTOR) || window;
}

/**
 * Scroll upward to load older posts
 */
function scrollUpward() {
  const container = getScrollContainer();
  const scrollAmount = CONFIG.SCROLL_STEP;
  
  if (container === window) {
    window.scrollBy(0, -scrollAmount);
  } else {
    container.scrollTop = Math.max(0, container.scrollTop - scrollAmount);
  }
}

/**
 * Check if we've reached the top (no more content to load)
 */
function isAtTop() {
  const container = getScrollContainer();
  if (container === window) {
    return window.scrollY <= 100;
  }
  return container.scrollTop <= 100;
}

/**
 * Get current scroll position
 */
function getScrollPosition() {
  const container = getScrollContainer();
  if (container === window) {
    return window.scrollY;
  }
  return container.scrollTop;
}

// ============================================
// MAIN SCRAPING LOGIC
// ============================================

/**
 * Main scraping loop
 */
async function scrapeLoop() {
  while (scraperState.isScraping && !scraperState.isPaused) {
    // Check if we should stop
    if (scraperState.scrollAttempts >= CONFIG.MAX_SCROLL_ATTEMPTS) {
      sendMessageToPopup({ type: 'SCRAPE_COMPLETE', reason: 'max_attempts_reached' });
      break;
    }
    
    if (isAtTop() && scraperState.consecutiveStalls >= CONFIG.STALL_THRESHOLD) {
      sendMessageToPopup({ type: 'SCRAPE_COMPLETE', reason: 'top_reached' });
      break;
    }
    
    // Get current post count
    const currentPosts = extractAllPosts();
    const newPostCount = currentPosts.length;
    
    // Check for new posts
    if (newPostCount > scraperState.lastPostCount) {
      scraperState.consecutiveStalls = 0;
      
      // Add new posts to our collection
      const newPosts = currentPosts.slice(scraperState.lastPostCount);
      newPosts.forEach(post => {
        if (!scraperState.seenPostIds.has(post.id)) {
          scraperState.seenPostIds.add(post.id);
          scraperState.posts.push(post);
        }
      });
      
      scraperState.lastPostCount = newPostCount;
      
      // Update popup with progress
      sendMessageToPopup({
        type: 'PROGRESS_UPDATE',
        postCount: scraperState.posts.length,
        totalDetected: newPostCount,
      });
    } else {
      scraperState.consecutiveStalls++;
    }
    
    // Scroll upward to load more
    if (!isAtTop()) {
      scrollUpward();
      scraperState.scrollAttempts++;
      
      // Wait for content to load
      await sleep(CONFIG.LOAD_WAIT_MS);
    } else {
      // Additional wait at top to ensure all content loaded
      await sleep(CONFIG.LOAD_WAIT_MS * 2);
    }
  }
  
  scraperState.isScraping = false;
}

/**
 * Start scraping
 */
async function startScraping(options = {}) {
  if (scraperState.isScraping) {
    return { success: false, error: 'Already scraping' };
  }
  
  // Initialize state
  scraperState = {
    ...scraperState,
    isScraping: true,
    isPaused: false,
    posts: [],
    seenPostIds: new Set(),
    scrollAttempts: 0,
    consecutiveStalls: 0,
    lastPostCount: 0,
    startDate: options.startDate || null,
    endDate: options.endDate || null,
    contentTypeFilter: options.contentTypeFilter || 'all',
  };
  
  // Get channel info
  scraperState.channelInfo = inspectChannelInfo();
  
  sendMessageToPopup({
    type: 'SCRAPE_STARTED',
    channelInfo: scraperState.channelInfo,
  });
  
  // Initial extraction
  const initialPosts = extractAllPosts();
  initialPosts.forEach(post => {
    scraperState.seenPostIds.add(post.id);
    scraperState.posts.push(post);
  });
  scraperState.lastPostCount = initialPosts.length;
  
  sendMessageToPopup({
    type: 'PROGRESS_UPDATE',
    postCount: scraperState.posts.length,
    totalDetected: initialPosts.length,
  });
  
  // Start scraping loop
  scrapeLoop();
  
  return { success: true };
}

/**
 * Pause scraping
 */
function pauseScraping() {
  scraperState.isPaused = true;
  sendMessageToPopup({ type: 'SCRAPE_PAUSED' });
}

/**
 * Resume scraping
 */
function resumeScraping() {
  scraperState.isPaused = false;
  sendMessageToPopup({ type: 'SCRAPE_RESUMED' });
  scrapeLoop();
}

/**
 * Stop scraping
 */
function stopScraping() {
  scraperState.isScraping = false;
  scraperState.isPaused = false;
  sendMessageToPopup({ type: 'SCRAPE_STOPPED' });
}

/**
 * Get scraped data
 */
function getScrapedData() {
  // Apply filters
  let filteredPosts = scraperState.posts;
  
  if (scraperState.contentTypeFilter !== 'all') {
    filteredPosts = filteredPosts.filter(post => 
      matchesContentType(post.type, scraperState.contentTypeFilter)
    );
  }
  
  if (scraperState.startDate) {
    const startDate = new Date(scraperState.startDate);
    filteredPosts = filteredPosts.filter(post => 
      !post.timestamp || new Date(post.timestamp) >= startDate
    );
  }
  
  if (scraperState.endDate) {
    const endDate = new Date(scraperState.endDate);
    filteredPosts = filteredPosts.filter(post => 
      !post.timestamp || new Date(post.timestamp) <= endDate
    );
  }
  
  return {
    channelInfo: scraperState.channelInfo,
    posts: filteredPosts,
    metadata: {
      totalPosts: scraperState.posts.length,
      filteredPosts: filteredPosts.length,
      scrapeDate: new Date().toISOString(),
      url: window.location.href,
    },
  };
}

// ============================================
// COMMUNICATION
// ============================================

/**
 * Send message to popup
 */
function sendMessageToPopup(message) {
  chrome.runtime.sendMessage(message).catch(err => {
    console.warn('Failed to send message to popup:', err);
  });
}

/**
 * Handle messages from popup/background
 */
function handleMessages(request, sender, sendResponse) {
  switch (request.type) {
    case 'START_SCRAPE':
      startScraping(request.options).then(result => {
        sendResponse(result);
      });
      return true; // Async response
      
    case 'PAUSE_SCRAPE':
      pauseScraping();
      sendResponse({ success: true });
      break;
      
    case 'RESUME_SCRAPE':
      resumeScraping();
      sendResponse({ success: true });
      break;
      
    case 'STOP_SCRAPE':
      stopScraping();
      sendResponse({ success: true });
      break;
      
    case 'GET_SCRAPED_DATA':
      sendResponse(getScrapedData());
      break;
      
    case 'GET_STATUS':
      sendResponse({
        isScraping: scraperState.isScraping,
        isPaused: scraperState.isPaused,
        postCount: scraperState.posts.length,
        channelInfo: scraperState.channelInfo,
      });
      break;
      
    default:
      sendResponse({ error: 'Unknown message type' });
  }
}

// ============================================
// INITIALIZATION
// ============================================

// Listen for messages
chrome.runtime.onMessage.addListener(handleMessages);

// Log initialization
console.log('[Bale Scraper] Content script initialized');

// Export for testing
if (typeof window !== 'undefined') {
  window.baleScraper = {
    startScraping,
    pauseScraping,
    resumeScraping,
    stopScraping,
    getScrapedData,
    inspectChannelInfo,
    extractAllPosts,
    CONFIG,
  };
}
