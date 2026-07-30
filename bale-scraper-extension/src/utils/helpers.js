/**
 * Bale Channel Scraper - Utility Functions
 */

/**
 * Sleep for a specified number of milliseconds
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Convert Persian/Arabic numbers to English digits
 */
export function toEnglishDigits(str) {
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
 * Simple hash function for strings
 */
export function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

/**
 * Parse view count text (handles K, M suffixes and Persian digits)
 */
export function parseViewCount(text) {
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
 * Format date for display
 */
export function formatDate(dateString) {
  if (!dateString) return 'Unknown';
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (e) {
    return dateString;
  }
}

/**
 * Generate a unique ID
 */
export function generateId(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Debounce function
 */
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Throttle function
 */
export function throttle(func, limit) {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * Check if URL is valid
 */
export function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Extract domain from URL
 */
export function extractDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch (e) {
    return null;
  }
}

/**
 * Sanitize filename
 */
export function sanitizeFilename(filename) {
  return filename
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .substring(0, 100);
}

/**
 * Format bytes to human readable
 */
export function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Calculate estimated time remaining
 */
export function calculateETA(completed, total, startTime) {
  if (completed === 0) return null;
  const elapsed = (Date.now() - startTime) / 1000;
  const rate = completed / elapsed;
  const remaining = total - completed;
  const etaSeconds = remaining / rate;
  return Math.round(etaSeconds);
}

/**
 * Format seconds to human readable duration
 */
export function formatDuration(seconds) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}
