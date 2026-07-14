# SDR AI Platform Setup & Architecture Guide

This document provides a comprehensive guide to setting up, running, and migrating the **Decoupled Enterprise AI SDR Platform** to another computer.

---

## 🏗️ 1. Platform Architecture

The platform has been completely overhauled into a decoupled, concurrent, production-grade state machine.

```
BrowserManager (Singleton Playwright Session)
   │
   ├───> GoogleSearcher (Layout-Resilient search with exponential backoff retries)
   │
   ├───> WebsiteScraper (Body text extractor with Jina Reader + Playwright fallbacks)
   │
   ├───> MarketplaceResearch (Scrapes Amazon, Flipkart, Zepto, Blinkit, Meesho, Instamart)
   │
   └───> LinkedInDiscovery
           ├── SessionManager (Authentication with redirection bypass)
           ├── SearchManager (Global search without connections restrictions)
           └── ProfileParser (Resilient multi-class selector DOM parsers)
                 │
                 ▼
          AINormalizer (Gemini structured JSON normalization & ranking)
                 │
                 ▼
          ResearchOrchestrator (State machine transitions & Promise.all parallel runs)
                 │
                 ▼
          DbHelper Storage Layer (Prisma PostgreSQL / Local JSON Fallback)
```

---

## 🛡️ 2. Key Bug Fixes Implemented

1. **LinkedIn Login Redirection Bypass**:
   * Resolved the 30-second locator timeout crash when the user session was already active. The script now detects feed redirects instantly and inherits active session cookies.
2. **Removed Connection Filters**:
   * Removed connection degree restrictions (`network=["F","S"]`) to allow searching all public and 3rd+ degree profiles globally.
3. **Resilient Google Indexing**:
   * Intercepted Cloudflare timeouts or Jina Search 401 unauthenticated headers, falling back smoothly to Playwright Google scraping.
4. **Stealth Chromium Options**:
   * Modified the fallback launcher to inject standard Mac Chrome User Agents and anti-automation controls to prevent bot detection blocks.

---

## 💻 3. Setting Up on Another PC

Follow these step-by-step instructions to run the codebase on a new computer:

### Prerequisites
* **Node.js**: Install Node.js (version 18 or above).
* **Package Manager**: NPM (bundled with Node.js).

### Step 1: Install Dependencies
Open a terminal in the project directory on the new PC and install all package dependencies:
```bash
npm install
```

### Step 2: Download Playwright Browser Engines
Install the required headless Chromium and browser binaries:
```bash
npx playwright install
```

### Step 3: Configure Environment Variables
Create a file named `.env` in the root of the project directory and configure the environment variables:
```env
# Database Connection (Optional - Fallback database will be used if offline)
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/sdr_db?schema=public"

# LLM Providers (Required)
GEMINI_API_KEY="your-gemini-api-key-here"

# LinkedIn Auto-Login Credentials
LINKEDIN_EMAIL="your-linkedin-email@gmail.com"
LINKEDIN_PASSWORD="your-linkedin-password"
```

### Step 4: Database Sync (Optional)
If you are running a local PostgreSQL database server, synchronize the Prisma schema:
```bash
npx prisma db push
```
*Note: If PostgreSQL is offline or not configured, the platform automatically saves and syncs lead entries, timeline audits, and logs using `database_fallback.json`.*

### Step 5: Start the Express Server
Launch the development server:
```bash
npm run dev
```

### Step 6: Access the Dashboard
Open your browser and navigate to:
**[http://localhost:3000/demo.html](http://localhost:3000/demo.html)**

---

## 🚀 4. Running a Search / Crawl

1. Click **Auto-Launch Debugger Chrome** on the dashboard.
2. Verify you are logged into your LinkedIn account in the Chrome window that pops up.
3. To execute lead research, use the **Add Custom Brand Lead** panel on the right sidebar. Enter a brand (e.g. `mamaearth`) and click **Add & Analyze Lead**.
4. Track real-time progress and logs directly on the **CRM Event Ledger Timeline**!
