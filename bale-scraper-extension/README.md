# Bale Channel Scraper

A production-ready Chrome Extension (Manifest V3) for scraping and archiving public Bale messenger channel preview pages with controlled, user-configurable export and download capabilities.

## Overview

This extension enables researchers, archivists, and analysts to collect and export content from public Bale channel preview pages (e.g., `https://ble.ir/s/channelname`). It handles progressive/lazy loading of older posts through automated upward scrolling and provides flexible filtering and export options.

**Important**: This extension only works with **public** channel preview pages. It does not access private channels or require authentication.

## Features

### Core Functionality
- ✅ Automatic detection of page structure (adaptive parsing)
- ✅ Upward scrolling to load older posts progressively
- ✅ Post deduplication to prevent duplicate collection
- ✅ Channel metadata extraction (name, members, description, avatar)
- ✅ Content type detection (text, image, video, mixed)

### Content Extraction
For each post, extracts:
- Text content
- Images (with URLs)
- Videos (with URLs)
- Links/URLs
- Timestamps (when available)
- View counts
- Reactions (emoji + count)
- Unique post ID

### Filtering Options
- Date range filtering (from/to dates)
- Content type filters:
  - All posts
  - Text only
  - Images only
  - Videos only
  - Text + Images
- Combined filters (date + type)

### Export Formats
- **JSON**: Full structured data with all metadata
- **CSV**: Normalized spreadsheet format
- **Markdown**: Human-readable document with embedded images

### Download Management
- Queued downloads with configurable concurrency (1-5 parallel)
- Configurable delay between downloads (default: 1000ms)
- Retry policy with exponential backoff (3 retries max)
- Pause/resume/clear queue controls
- Progress tracking (pending, completed, failed)
- Separate media download from metadata export

### Rate Limiting & Safety
- Conservative scroll timing (600ms wait between scrolls)
- Limited concurrent downloads (default: 2)
- Configurable download delays
- Exponential backoff on failures
- Stall detection to prevent infinite loops
- Maximum scroll attempt limit (100 by default)

## Installation

### From Source (Development Mode)

1. **Clone or download this repository**
   ```bash
   git clone <repository-url>
   cd bale-scraper-extension
   ```

2. **Load in Chrome**
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top-right)
   - Click "Load unpacked"
   - Select the `bale-scraper-extension` folder

3. **Verify installation**
   - The extension icon should appear in your toolbar
   - Navigate to a Bale channel page (e.g., `https://ble.ir/s/sadbartar`)
   - Click the extension icon to open the popup

### Requirements
- Google Chrome version 88 or higher (for Manifest V3 support)
- Chromium-based browsers (Edge, Brave, etc.) may also work

## Usage

### Basic Workflow

1. **Navigate to a Bale channel preview page**
   - Example: `https://ble.ir/s/sadbartar`
   - Example: `https://ble.ir/s/bnks_ir`

2. **Open the extension popup**
   - Click the extension icon in the Chrome toolbar

3. **Configure filters (optional)**
   - Select content type filter
   - Set date range if needed

4. **Start scraping**
   - Click "Start Scrape"
   - The extension will automatically scroll upward to load older posts
   - Monitor progress in the popup

5. **Pause/Resume/Stop**
   - Use the Pause button to temporarily halt scraping
   - Resume to continue from where you left off
   - Stop to end the scraping session

6. **Export data**
   - After scraping completes, choose export format:
     - JSON for full data
     - CSV for spreadsheet analysis
     - Markdown for readable documents

7. **Download media (optional)**
   - Check "Download Images" and/or "Download Videos"
   - Adjust concurrency and delay settings
   - Click "Queue Downloads"
   - Monitor download progress

### Advanced Settings

#### Download Concurrency
- Default: 2 concurrent downloads
- Range: 1-5
- Lower values are safer but slower
- Higher values may trigger rate limiting

#### Download Delay
- Default: 1000ms (1 second)
- Minimum: 500ms
- Increase delay if you encounter errors or blocking

## Architecture

```
bale-scraper-extension/
├── manifest.json           # Extension manifest (MV3)
├── assets/                 # Icons and static assets
├── src/
│   ├── content/
│   │   └── content.js      # Content script (page interaction)
│   ├── background/
│   │   └── background.js   # Service worker (download queue)
│   ├── popup/
│   │   ├── popup.html      # Popup UI
│   │   ├── popup.css       # Popup styles
│   │   └── popup.js        # Popup logic
│   └── utils/
│       └── helpers.js      # Utility functions
└── README.md               # This file
```

### Component Responsibilities

**Content Script (`content.js`)**
- Runs on Bale channel pages
- Inspects DOM structure
- Handles upward scrolling
- Extracts post data
- Manages scraping state
- Communicates with popup

**Background Service Worker (`background.js`)**
- Manages download queue
- Handles rate limiting
- Implements retry logic
- Tracks download progress

**Popup (`popup.html/js/css`)**
- User interface
- Control buttons
- Progress display
- Export functionality

## Page Structure Analysis

Based on inspection of Bale preview pages, the extension identifies:

### Key Selectors (with fallback strategies)
- **Scroll container**: `.Scrollbar_scroller__f0Kqd`
- **Post wrapper**: `[data-sid]` or `.MessageItem_messageWrapper__E9ZFU`
- **Date divider**: `.DateDivider_DateDividerWrapper__cIjJW`
- **Text content**: `.Text_text__Um9IF`
- **Images**: `.Photo_photo_message__yDO5Q img`
- **Videos**: `.Video_video_message__rQnjc video`
- **View count**: `.Info_ViewWrapper__O75PK .Info_Text__LVysg`
- **Timestamp**: `.Info_date__fCTQ4`
- **Channel name**: `.Profile_name__g61_D`
- **Member count**: `.Profile_memberCount__r0_X_`

### Adaptive Parsing
The extension uses multiple selector strategies and gracefully handles:
- Minified/obfuscated class names
- Dynamic DOM updates
- Missing metadata fields
- Mixed content types

## Assumptions & Limitations

### Confirmed Through Inspection
1. **Progressive loading**: Older posts load when scrolling upward (not downward)
2. **Scroll container**: Uses a custom scrollable div, not window scroll
3. **Post identification**: Each post has a unique `data-sid` attribute
4. **Date format**: ISO 8601 timestamps in `<time>` elements
5. **View counts**: Displayed with Persian digits, may include K/M suffixes

### Current Limitations
1. **File attachments**: Not fully supported (requires additional inspection)
2. **Audio messages**: Not explicitly handled
3. **Polls/quizzes**: Not parsed as structured data
4. **Forwarded messages**: May lose original sender context
5. **Very old posts**: May not load if server stops responding to scroll
6. **Class name stability**: Relies on current class naming; future changes may break parsing

### Known Issues
- Some posts may have incomplete metadata
- Timestamps may be approximate (combined from date divider + post time)
- Image URLs may be proxied/encoded by Bale's CDN

## Privacy & Security

### What This Extension Does NOT Do
- ❌ Does not collect personal data
- ❌ Does not track browsing history
- ❌ Does not send data to external servers
- ❌ Does not modify website behavior beyond scrolling
- ❌ Does not bypass authentication or access private content

### Permissions Explained
- `activeTab`: Access to current tab for scraping
- `storage`: Save settings (future feature)
- `downloads`: Queue and manage media downloads
- `scripting`: Inject content script
- Host permissions: Only for Bale domains

### Data Handling
- All scraped data stays local to your browser
- Exports are downloaded directly to your computer
- No data is transmitted to third parties

## Safe Usage Guidelines

1. **Respect rate limits**
   - Use default concurrency settings
   - Don't scrape hundreds of channels in rapid succession
   - Add delays between large download queues

2. **Be mindful of server load**
   - Scrape during off-peak hours when possible
   - Avoid aggressive scrolling speeds
   - Stop if you encounter errors

3. **Legal considerations**
   - Only scrape public content
   - Respect terms of service
   - Use for research/archival purposes
   - Don't redistribute scraped content without permission

## Troubleshooting

### Extension doesn't work on the page
- Ensure you're on a valid Bale channel page (`ble.ir/s/*`)
- Refresh the page and try again
- Check that the extension is enabled in `chrome://extensions/`

### Scraping stops prematurely
- The page may have reached the oldest available posts
- Network issues may prevent loading
- Try reducing scroll speed in the code (advanced users)

### Downloads fail
- Check Chrome's download settings
- Ensure sufficient disk space
- Reduce concurrency or increase delay
- Some media URLs may expire

### Export is empty
- Ensure scraping completed before exporting
- Check that filters aren't too restrictive
- Try with "All Posts" filter first

## Development

### Building from Source
No build step required - the extension uses vanilla JavaScript.

### Testing
1. Load the extension in development mode
2. Navigate to test channels:
   - `https://ble.ir/s/sadbartar`
   - `https://ble.ir/s/bnks_ir`
3. Test each feature systematically

### Debugging
- Open Chrome DevTools on the target page
- Check Console for content script logs (`[Bale Scraper]`)
- Use `window.baleScraper` API for manual testing:
  ```javascript
  window.baleScraper.inspectChannelInfo()
  window.baleScraper.extractAllPosts()
  ```

## Roadmap / TODO

- [ ] Support for file/attachment downloads
- [ ] Audio message handling
- [ ] Poll/quiz data extraction
- [ ] Persistent settings storage
- [ ] Scheduled/auto scraping
- [ ] Advanced search within scraped data
- [ ] Incremental scraping (resume previous sessions)
- [ ] Export to additional formats (XML, Excel)
- [ ] Statistics and analytics dashboard
- [ ] Multi-channel batch processing

## License

MIT License - See LICENSE file for details.

## Disclaimer

This extension is provided for educational, research, and archival purposes. Users are responsible for complying with applicable laws and terms of service. The developers are not responsible for misuse or any consequences of using this tool.

## Support

For issues, questions, or contributions, please open an issue on the GitHub repository.

---

**Version**: 1.0.0  
**Last Updated**: 2024  
**Compatible With**: Chrome 88+, Manifest V3
