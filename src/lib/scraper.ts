import { chromium, Browser } from 'playwright';
import { browserPool } from './browser-pool';
import { getCalendarContextPool } from './calendar-context-pool';

export interface SlotData {
  date: string;
  time: string;
  gmt: string;
}

export interface ScrapingResult {
  success: boolean;
  data?: {
    total_slots: number;
    total_days: number;
    note: string;
    slots: SlotData[];
  };
  error?: string;
}

export class ChiliPiperScraper {
  private baseUrl: string;
  private routingId: string | null = null;
  private phoneFieldId: string;
  private static resultCache: Map<string, { timestamp: number; result: ScrapingResult } > = new Map();
  private static readonly CACHE_TTL_MS: number = parseInt(process.env.SCRAPE_CACHE_TTL_MS || '60000', 10);

  constructor(formUrl?: string) {
    this.baseUrl = formUrl || process.env.CHILI_PIPER_FORM_URL || "https://cincpro.chilipiper.com/concierge-router/link/lp-request-a-demo-agent-advice";
    
    // Extract routing ID from environment, URL, or leave null for form-based approach
    this.routingId = process.env.CHILI_PIPER_ROUTING_ID || null;
    
    // If no routing ID in env, try to extract from URL if it's already in routing format
    if (!this.routingId && this.baseUrl.includes('/routing/')) {
      const match = this.baseUrl.match(/\/routing\/([^/?]+)/);
      if (match) {
        this.routingId = match[1];
        // Normalize baseUrl to remove routing part for consistency
        this.baseUrl = this.baseUrl.replace(/\/routing\/[^/?]+/, '/link/');
        console.log(`📋 Extracted routing ID from URL: ${this.routingId}`);
      }
    }
    
    // Phone field ID from HTML (aa1e0f82-816d-478f-bf04-64a447af86b3) - can be overridden via env
    this.phoneFieldId = process.env.CHILI_PIPER_PHONE_FIELD_ID || 'aa1e0f82-816d-478f-bf04-64a447af86b3';
  }

  /**
   * Builds a parameterized URL that skips form filling by passing data as query params
   * Format: base-url?PersonFirstName=...&PersonLastName=...&PersonEmail=...&phoneParam=...
   * Example: https://cincpro.chilipiper.com/concierge-router/link/lp-request-a-demo-agent-advice?PersonFirstName=Ali&PersonLastName=Syed&PersonEmail=ali@example.com
   */
  private buildParameterizedUrl(firstName: string, lastName: string, email: string, phone: string): string {
    // Always use the simple prefill format - just add query params to base URL
    const urlParts = new URL(this.baseUrl);
    
    // Build query parameters (prefill form fields)
    const params = new URLSearchParams({
      PersonFirstName: firstName,
      PersonLastName: lastName,
      PersonEmail: email,
    });

    // Add phone field - use the field ID from HTML as the parameter name
    // Field ID: aa1e0f82-816d-478f-bf04-64a447af86b3 (can be overridden via CHILI_PIPER_PHONE_FIELD_ID)
    // Phone should start with + if not already present
    const phoneValue = phone.startsWith('+') ? phone : `+${phone}`;
    params.append(this.phoneFieldId, phoneValue);

    // Append params to existing URL params (if any)
    const existingParams = new URLSearchParams(urlParts.search);
    for (const [key, value] of Array.from(params.entries())) {
      existingParams.set(key, value);
    }

    const finalUrl = `${urlParts.origin}${urlParts.pathname}?${existingParams.toString()}`;
    console.log(`🔗 Built prefill URL (form filling skipped): ${finalUrl.substring(0, 150)}...`);
    return finalUrl;
  }

  /**
   * Formats a date string from formats like "Thursday 30th October Thu30Oct" 
   * or "Monday 27th October Mon 27 Oct" to "YYYY-MM-DD" format
   */
  private formatDate(dateString: string): string {
    try {
      // Extract day and month from patterns like:
      // - "Thursday 30th October Thu30Oct"
      // - "Monday 27th October Mon 27 Oct"
      // - "Wednesday 29th October Wed29Oct"
      
      const monthMap: Record<string, number> = {
        'january': 1, 'jan': 1,
        'february': 2, 'feb': 2,
        'march': 3, 'mar': 3,
        'april': 4, 'apr': 4,
        'may': 5,
        'june': 6, 'jun': 6,
        'july': 7, 'jul': 7,
        'august': 8, 'aug': 8,
        'september': 9, 'sep': 9, 'sept': 9,
        'october': 10, 'oct': 10,
        'november': 11, 'nov': 11,
        'december': 12, 'dec': 12
      };

      // Remove common suffixes and clean up
      let cleanDate = dateString.replace('Press enter to navigate available slots', '').trim();
      cleanDate = cleanDate.replace('is selected', '').trim();
      
      // Extract day number (supports formats like "30th", "27th", "1st", "2nd", "3rd")
      const dayMatch = cleanDate.match(/(\d{1,2})(?:st|nd|rd|th)/i);
      if (!dayMatch) {
        console.warn(`Could not extract day from date string: ${dateString}`);
        return dateString; // Return original if parsing fails
      }
      
      const day = parseInt(dayMatch[1], 10);
      
      // Extract month name (full or abbreviated)
      let month: number | null = null;
      const lowerDate = cleanDate.toLowerCase();
      
      for (const [monthName, monthNum] of Object.entries(monthMap)) {
        if (lowerDate.includes(monthName)) {
          month = monthNum;
          break;
        }
      }
      
      if (month === null) {
        console.warn(`Could not extract month from date string: ${dateString}`);
        return dateString; // Return original if parsing fails
      }
      
      // Determine year - assume current year, use next year only if date is clearly in the past
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1; // getMonth() returns 0-11
      const currentDay = now.getDate();
      let year = currentYear;
      
      // Compare dates: if the parsed month/day is before today's month/day by more than a month,
      // it's likely next year. Otherwise, assume current year.
      // This handles the case where calendar shows future dates starting from today
      const monthDiff = month - currentMonth;
      const dayDiff = day - currentDay;
      
      // If we're seeing dates that are significantly in the past (more than 30 days),
      // it's likely next year. But be conservative - calendar usually shows future dates.
      // Only use next year if:
      // 1. Month is much earlier (e.g., January when we're in November/December)
      // 2. Or if month is same/earlier AND day is much earlier AND we're past mid-year
      if (monthDiff < -6) {
        // More than 6 months earlier - likely next year (e.g., Jan when we're in Nov/Dec)
        year = currentYear + 1;
      } else if (monthDiff === 0 && dayDiff >= 0) {
        // Same month, same day or future - definitely current year
        year = currentYear;
      } else if (monthDiff > 0) {
        // Future month - current year
        year = currentYear;
      } else if (monthDiff < 0 && monthDiff >= -1 && dayDiff < -30) {
        // Previous month but more than 30 days ago - likely next year
        year = currentYear + 1;
      }
      // Otherwise, default to current year (most common case for calendars showing future dates)
      
      // Format as YYYY-MM-DD
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    } catch (error) {
      console.warn(`Error formatting date "${dateString}":`, error);
      return dateString; // Return original if parsing fails
    }
  }

  /**
   * Validates that a time slot string is in the correct format and filters out malformed entries
   */
  private isValidTimeSlot(timeSlot: string): boolean {
    const trimmed = timeSlot.trim();
    // Reject empty strings
    if (!trimmed) return false;
    // Reject strings that contain unwanted patterns like timezone info
    // Examples: "coordinated universal time", "Central Daylight Time (02:34 PM)", etc.
    if (/coordinated|universal\s+time|time\s+zone|daylight\s+time|standard\s+time|\(.*\)/i.test(trimmed)) {
      return false;
    }
    // Reject strings longer than reasonable time format (e.g., "9:30 AM" should be max ~12 chars)
    if (trimmed.length > 12) {
      return false;
    }
    // Must match standard time pattern like "9:30 AM" or "09:30 PM" or "2:45 PM"
    return /\d{1,2}:\d{2}\s?(AM|PM)/i.test(trimmed);
  }

  async scrapeSlots(
    firstName: string,
    lastName: string,
    email: string,
    phone: string,
    onDayComplete?: (dayData: { date: string; slots: string[]; totalDays: number; totalSlots: number }) => void,
    maxDays?: number
  ): Promise<ScrapingResult> {
    try {
      // Trim logs in production: only emit debug logs when SCRAPER_DEBUG=true
      const debug = (process.env.SCRAPER_DEBUG || '').toLowerCase() === 'true';
      const originalConsoleLog = console.log;
      if (!debug) {
        // No-op console.log for performance; keep console.error/warn intact
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        console.log = () => {};
      }

      console.log(`🎯 Starting scrape for ${firstName} ${lastName} (${email})`);
      const strictMode = (process.env.STRICT_SELECTORS || '').toLowerCase() === 'true';
      
      // Build parameterized URL to skip form filling (much faster!)
      // Always use prefill URL format - just adds query params to base URL
      const targetUrl = this.buildParameterizedUrl(firstName, lastName, email, phone);
      const useParameterizedUrl = true; // Always use prefill URLs for faster scraping
      
      // Short-lived cache check (use parameterized URL for cache key if available)
      const cacheKey = useParameterizedUrl ? targetUrl : `${this.baseUrl}`;
      const cached = ChiliPiperScraper.resultCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < ChiliPiperScraper.CACHE_TTL_MS) {
        console.log('🗃️ Returning cached result');
        return cached.result;
      }

      // Try warm post-form calendar context first (only if not using parameterized URL)
      const calendarPool = getCalendarContextPool(this.baseUrl);
      let page: any | null = null;
      if (!useParameterizedUrl && calendarPool.isReady()) {
        page = await calendarPool.getCalendarPage();
      }

      // Use browser pool directly if no warm context
      const browser = await browserPool.getBrowser();
      if (!page) {
        page = await browser.newPage();
      }
      page.setDefaultNavigationTimeout(20000);
      // Aggressive resource blocking
      await page.route("**/*", (route: any) => {
        const url = route.request().url();
        const rt = route.request().resourceType();
        if (rt === 'image' || rt === 'stylesheet' || rt === 'font' || rt === 'media' ||
            url.includes('google-analytics') || url.includes('googletagmanager') || url.includes('analytics') ||
            url.includes('facebook.net') || url.includes('doubleclick') || url.includes('ads') || url.includes('tracking') ||
            url.includes('pixel') || url.includes('beacon')) {
          route.abort();
          return;
        }
        route.continue();
      });
      
      // Navigate to parameterized URL or base URL
      if (!useParameterizedUrl && !calendarPool.isReady()) {
        await page.goto(this.baseUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
      } else if (useParameterizedUrl) {
        console.log(`🚀 Navigating directly to parameterized URL (skipping form)`);
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
      }
      
      // Wait for page to be ready - check for any form elements or submit button
      try {
        await page.waitForSelector('input, button[type="submit"], [data-test-id*="Field"], form', { timeout: 3000 });
      } catch {
        // Page may already be on calendar, continue
      }
      
      // Note: We always use prefill URLs now, so warm calendar context is not used

      // Skip form filling entirely - form is pre-filled via URL params
      // Only need to click Submit button
      console.log("⚡ Using prefill URL - form fields are already filled!");
      // Wait for form to be visible (indicates prefill has loaded)
      try {
        await page.waitForSelector('input, form, [data-test-id*="Field"]', { timeout: 2000 });
      } catch {
        // Form might not be visible if page went directly to calendar
      }
      
      // Now just click Submit button (form fields are pre-filled via URL)
      const submitSelectors = [
        'button[type="submit"]',
        'input[type="submit"]',
        'button:has-text("Submit")',
        'button:has-text("Continue")',
        '[data-test-id="GuestForm-submit-button"]',
        'button[data-test-id*="submit"]',
        'button[data-test-id*="continue"]',
        '.submit-button',
        '.continue-button'
      ];
      
      let submitClicked = false;
      for (const selector of submitSelectors) {
        try {
          console.log(`🔍 Looking for submit button: ${selector}`);
          await page.waitForSelector(selector, { timeout: 2000 });
          await page.click(selector);
          console.log(`✅ Successfully clicked submit button using selector: ${selector}`);
          submitClicked = true;
          break;
        } catch (error) {
          console.log(`❌ Submit selector failed: ${selector}`);
          continue;
        }
      }
      
      if (!submitClicked) {
        console.log("⚠️ Submit button not found - page may have auto-submitted or gone directly to calendar");
      } else {
        console.log("✅ Form submitted (fields were pre-filled via URL)");
        // Wait for page to transition after submit
        try {
          await page.waitForSelector('[data-test-id="ConciergeLiveBox-book"], [data-id="concierge-live-book"], button[data-test-id*="schedule"], [data-id="calendar-day-button"]', { timeout: 3000 });
        } catch {
          // Page may have already transitioned
        }
      }
      
      // Wait for the intermediate step (call now vs schedule meeting) - optimized
      // This step happens whether using parameterized URL or form filling
      console.log("⏳ Waiting for call/schedule choice page...");
      // Wait for schedule button or calendar to appear
      try {
        await page.waitForSelector('[data-test-id="ConciergeLiveBox-book"], [data-id="concierge-live-book"], [data-id="calendar-day-button"], button[data-test-id^="days:"]', { timeout: 2000 });
      } catch {
        // Page may have already loaded calendar
      }
      
      // Look for "Schedule a meeting" or similar options (optional - sometimes page goes directly to calendar)
      // Based on HTML: data-test-id="ConciergeLiveBox-book" or data-id="concierge-live-book"
      // This is needed for both parameterized URLs and form-based flows
      const scheduleSelectors = [
        '[data-test-id="ConciergeLiveBox-book"]',
        '[data-id="concierge-live-book"]',
        'button:has-text("Schedule a meeting")',
        'button:has-text("Schedule")',
        'button:has-text("Book a meeting")',
        'button:has-text("Schedule later")',
        '[data-test-id*="schedule"]',
        'button[data-test-id*="schedule"]'
      ];
      
      // Check for schedule button (page might go directly to calendar, or show schedule option)
      let scheduleClicked = false;
      for (const selector of scheduleSelectors) {
        try {
          console.log(`🔍 Looking for schedule button: ${selector}`);
          await page.waitForSelector(selector, { timeout: 1000 });
          await page.click(selector);
          console.log(`✅ Successfully clicked schedule button using selector: ${selector}`);
          scheduleClicked = true;
          break;
        } catch (error) {
          console.log(`❌ Schedule selector failed: ${selector}`);
          continue;
        }
      }
      
      // Wait for calendar page to load (whether we clicked schedule or went directly to calendar)
      if (scheduleClicked) {
        console.log("✅ Proceeding to schedule a meeting");
        // Wait for calendar elements to appear
        try {
          await page.waitForSelector('[data-id="calendar-day-button"], button[data-test-id^="days:"]', { timeout: 3000 });
        } catch {
          // Calendar might already be visible
        }
      } else {
        console.log("ℹ️ No schedule button found - page may have gone directly to calendar");
        // Wait for calendar elements to appear
        try {
          await page.waitForSelector('[data-id="calendar-day-button"], button[data-test-id^="days:"]', { timeout: 3000 });
        } catch {
          // Calendar might already be visible
        }
      }
      
      // Wait for calendar elements - prioritize selectors based on actual HTML structure
      // HTML shows: data-id="calendar-day-button" and data-test-id="days:Oct/Fri Oct 31 2025..."
      const calendarSelectors = strictMode
        ? ['[data-id="calendar-day-button"]', 'button[data-test-id^="days:"]']
        : [
            '[data-id="calendar-day-button"]', // Most reliable based on HTML
            'button[data-test-id^="days:"]', // Exact match from HTML: days:Oct/Fri Oct 31...
            '[data-id="calendar-day-button-selected"]', // Selected day variant
            '[data-test-id*="calendar"]',
            '[data-id="calendar"]',
            'div[aria-label*="Calendar" i]',
            '[role="grid"]',
            '[data-test-id*="day"]',
            'button:has-text("Monday")',
            'button:has-text("Tuesday")',
            'button:has-text("Wednesday")',
            'button:has-text("Thursday")',
            'button:has-text("Friday")'
          ];
      
      let calendarFound = false;
      let calendarContext: any = page;
      for (const selector of calendarSelectors) {
        try {
          await page.waitForSelector(selector, { timeout: 4000 }); // Increased to 4s to tolerate slow renders
          console.log(`✅ Calendar loaded successfully using selector: ${selector}`);
          calendarFound = true;
          break;
        } catch (error) {
          console.log(`❌ Calendar selector failed: ${selector}`);
          continue;
        }
      }
      
      if (!calendarFound) {
        // Retry once - wait for calendar to stabilize
        console.log('🔁 Calendar not found, retrying detection once...');
        try {
          await page.waitForSelector('[data-id="calendar-day-button"], button[data-test-id^="days:"]', { timeout: 2000 });
        } catch {
          // Continue even if not found
        }
        for (const selector of calendarSelectors) {
          try {
            await page.waitForSelector(selector, { timeout: 4000 });
            console.log(`✅ Calendar loaded on retry using selector: ${selector}`);
            calendarFound = true;
            break;
          } catch {}
        }
      }

      if (!calendarFound) {
        try {
          const frames = page.frames();
          for (const frame of frames) {
            for (const selector of calendarSelectors) {
              try {
                await frame.waitForSelector(selector, { timeout: 2000 });
                console.log(`✅ Calendar found inside iframe using selector: ${selector}`);
                calendarFound = true;
                calendarContext = frame;
                break;
              } catch {}
            }
            if (calendarFound) break;
          }
        } catch {}
      }
      
      if (!calendarFound) {
        // Final fallback: wait for day buttons broadly (5s)
        try {
          await page.waitForSelector('button[data-test-id*="days:"], [data-id="calendar-day-button"], [data-test-id*="day"]', { timeout: 5000 });
          console.log('✅ Fallback: detected day buttons without calendar container');
          calendarFound = true;
          calendarContext = page;
        } catch {}
      }

      if (!calendarFound) {
        // Give it one more try with a longer wait - sometimes calendar takes a moment to render
        console.log('⏳ Calendar not found initially, waiting a bit longer and retrying...');
        // Wait for calendar to render
        try {
          await page.waitForSelector('[data-id="calendar-day-button"], button[data-test-id^="days:"]', { timeout: 3000 });
        } catch {
          // Continue even if wait fails
        }
        for (const selector of calendarSelectors) {
          try {
            await page.waitForSelector(selector, { timeout: 3000 });
            console.log(`✅ Calendar found on retry using selector: ${selector}`);
            calendarFound = true;
            calendarContext = page;
            break;
          } catch {}
        }
        
        // Also check for day buttons in iframes
        if (!calendarFound) {
          try {
            const frames = page.frames();
            for (const frame of frames) {
              try {
                await frame.waitForSelector('button[data-test-id*="days:"], [data-id="calendar-day-button"]', { timeout: 2000 });
                console.log(`✅ Calendar found in iframe`);
                calendarFound = true;
                calendarContext = frame;
                break;
              } catch {}
            }
          } catch {}
        }
        
        if (!calendarFound) {
          throw new Error('Could not find calendar elements with any of the provided selectors');
        }
      }

      // Collect slots using sequential collection (fastest and most reliable)
      const collectedSlots = await this.getAvailableSlots(calendarContext, onDayComplete, maxDays);

      const slots = collectedSlots;

      // Close page to free resources
      try {
        await page.close();
      } catch (e) {
        // Ignore if already closed
      }

      // Flatten the slots into the requested format
      const flattenedSlots: SlotData[] = [];
      for (const [dateKey, dayInfo] of Object.entries(slots)) {
        const formattedDate = this.formatDate(dateKey);
        for (const timeSlot of dayInfo.slots) {
          // Filter out malformed time slots (e.g., "coordinated universal time (09:31 PM)")
          if (!this.isValidTimeSlot(timeSlot)) {
            console.log(`⚠️ Filtering out invalid time slot: "${timeSlot}"`);
            continue;
          }
          flattenedSlots.push({
            date: formattedDate,
            time: timeSlot,
            gmt: 'GMT-05:00 America/Chicago (CDT)'
          });
        }
      }

      const result: ScrapingResult = {
        success: true,
        data: {
          total_slots: flattenedSlots.length,
          total_days: Object.keys(slots).length,
          note: `Found ${Object.keys(slots).length} days with ${flattenedSlots.length} total booking slots`,
          slots: flattenedSlots
        }
      };

      // Cache result briefly for repeated identical requests
      try {
        ChiliPiperScraper.resultCache.set(cacheKey, { timestamp: Date.now(), result });
      } catch {}

      console.log(`✅ Scraping completed successfully: ${flattenedSlots.length} slots across ${Object.keys(slots).length} days`);
      // Restore logger before returning
      console.log = originalConsoleLog;
      return result;

    } catch (error) {
      console.error('Scraping error:', error);
      // Ensure logger is restored on error
      try { /* restore if was replaced */ } finally {
        // best-effort restore; if not set, ignore
        // @ts-ignore
        if (console && typeof console.log === 'function') {
          // cannot guarantee presence of original ref here; leave as is if missing
        }
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  private async fillFieldWithFallback(page: any, selectors: string[], value: string, fieldName: string): Promise<void> {
    // First, try all CSS selectors
    for (const selector of selectors) {
      try {
        console.log(`🔍 Trying selector for ${fieldName}: ${selector}`);
        await page.waitForSelector(selector, { timeout: 1000 }); // Reduced from 2000ms for faster execution
        
        // Try multiple methods to fill the field
        try {
          await page.fill(selector, value);
          console.log(`✅ Successfully filled ${fieldName} using selector: ${selector} (method: fill)`);
          return;
        } catch (fillError) {
          try {
            // Try typing instead of filling
            await page.click(selector);
            await page.type(selector, value, { delay: 50 });
            console.log(`✅ Successfully filled ${fieldName} using selector: ${selector} (method: type)`);
            return;
          } catch (typeError) {
            // Try using evaluate to set value directly
            await page.evaluate((sel: string, val: string) => {
              const element = document.querySelector(sel) as HTMLInputElement;
              if (element) {
                element.value = val;
                element.dispatchEvent(new Event('input', { bubbles: true }));
                element.dispatchEvent(new Event('change', { bubbles: true }));
              }
            }, selector, value);
            console.log(`✅ Successfully filled ${fieldName} using selector: ${selector} (method: evaluate)`);
            return;
          }
        }
      } catch (error) {
        console.log(`❌ Selector failed for ${fieldName}: ${selector}`);
        continue;
      }
    }

    // If CSS selectors fail, try finding by label text
    try {
      console.log(`🔍 Trying to find ${fieldName} by label text...`);
      const labelTexts = [
        'First Name', 'first name', 'firstName', 'first_name',
        'Last Name', 'last name', 'lastName', 'last_name',
        'Email', 'email', 'E-mail', 'e-mail',
        'Phone', 'phone', 'Phone Number', 'phone number', 'PhoneNumber'
      ];
      
      for (const labelText of labelTexts) {
        if (fieldName.toLowerCase().includes('first') && !labelText.toLowerCase().includes('first')) continue;
        if (fieldName.toLowerCase().includes('last') && !labelText.toLowerCase().includes('last')) continue;
        if (fieldName.toLowerCase().includes('email') && !labelText.toLowerCase().includes('email') && !labelText.toLowerCase().includes('e-mail')) continue;
        if (fieldName.toLowerCase().includes('phone') && !labelText.toLowerCase().includes('phone')) continue;

        try {
          // Try finding label and then associated input
          const xpath = `//label[contains(text(), '${labelText}')]/following-sibling::input | //label[contains(text(), '${labelText}')]//input | //label[contains(text(), '${labelText}')]/../input`;
          const elements = await page.$x(xpath);
          if (elements.length > 0) {
            await elements[0].click();
            await elements[0].type(value, { delay: 50 });
            console.log(`✅ Successfully filled ${fieldName} using XPath label: ${labelText}`);
            return;
          }
        } catch (xpathError) {
          continue;
        }
      }
    } catch (labelError) {
      console.log(`❌ Label-based search failed for ${fieldName}`);
    }

    // Last resort: try to find all inputs and match by position/type
    try {
      console.log(`🔍 Last resort: trying to find ${fieldName} by input position...`);
      const allInputs = await page.$$('input[type="text"], input[type="email"], input[type="tel"], input:not([type])');
      
      if (fieldName.toLowerCase().includes('first') && allInputs.length > 0) {
        await allInputs[0].click();
        await allInputs[0].type(value, { delay: 50 });
        console.log(`✅ Successfully filled ${fieldName} using first input element`);
        return;
      }
      if (fieldName.toLowerCase().includes('last') && allInputs.length > 1) {
        await allInputs[1].click();
        await allInputs[1].type(value, { delay: 50 });
        console.log(`✅ Successfully filled ${fieldName} using second input element`);
        return;
      }
      if (fieldName.toLowerCase().includes('email')) {
        const emailInput = await page.$('input[type="email"]');
        if (emailInput) {
          await emailInput.click();
          await emailInput.type(value, { delay: 50 });
          console.log(`✅ Successfully filled ${fieldName} using email input type`);
          return;
        }
      }
      if (fieldName.toLowerCase().includes('phone')) {
        const phoneInput = await page.$('input[type="tel"]');
        if (phoneInput) {
          await phoneInput.click();
          await phoneInput.type(value, { delay: 50 });
          console.log(`✅ Successfully filled ${fieldName} using tel input type`);
          return;
        }
      }
    } catch (positionError) {
      console.log(`❌ Position-based search failed for ${fieldName}`);
    }

    // Final error - log available form elements for debugging
    console.log(`❌ All methods failed for ${fieldName}. Debugging page structure...`);
    try {
      const formElements = await page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input, textarea, [role="textbox"]'));
        return inputs.map((el: any) => ({
          tag: el.tagName,
          type: el.type || 'none',
          name: el.name || 'none',
          id: el.id || 'none',
          placeholder: el.placeholder || 'none',
          'aria-label': el.getAttribute('aria-label') || 'none',
          'data-test-id': el.getAttribute('data-test-id') || 'none'
        }));
      });
      console.log(`📋 Available form elements on page:`, JSON.stringify(formElements, null, 2));
    } catch (debugError) {
      console.log(`⚠️ Could not debug page structure: ${debugError}`);
    }

    throw new Error(`Could not find ${fieldName} field with any of the provided selectors`);
  }

  /**
   * Extract slots from all visible days in a single DOM query (MUCH faster than clicking each day!)
   * This method tries to read slot data directly from the DOM without clicking buttons.
   */
  private async extractAllVisibleDaySlots(pageOrFrame: any, dayButtons: Array<{ button: any; dateKey: string }>): Promise<Record<string, { slots: string[] }>> {
    const result: Record<string, { slots: string[] }> = {};
    const contexts: any[] = [pageOrFrame];
    
    // Build contexts (page + iframes)
    try {
      if (pageOrFrame.frames) {
        const frames = pageOrFrame.frames();
        contexts.push(...frames);
      }
    } catch {}
    
    console.log(`⚡ Attempting parallel extraction from ${dayButtons.length} visible days...`);
    
    // Try to extract all slots in a single DOM query using page.evaluate()
    for (const ctx of contexts) {
      try {
        const extracted = await ctx.evaluate((dateKeys: string[]) => {
          const slotsByDate: Record<string, string[]> = {};
          
          // Helper to check if text looks like a time slot
          const isTimeSlot = (text: string): boolean => {
            const trimmed = text.trim();
            return /\d{1,2}:\d{2}\s?(AM|PM)/i.test(trimmed) && trimmed.length < 10;
          };
          
          // Strategy 1: Look for slots grouped by date in data attributes or aria-labels
          const allButtons = Array.from(document.querySelectorAll('button, [role="button"]')) as HTMLElement[];
          const slotButtons: Array<{ text: string; date?: string }> = [];
          
          for (const btn of allButtons) {
            const text = (btn.innerText || btn.textContent || '').trim();
            if (!isTimeSlot(text)) continue;
            
            // Try to find associated date from nearby elements or data attributes
            let associatedDate: string | undefined;
            
            // Check data attributes
            const dateAttr = btn.getAttribute('data-date') || 
                           btn.getAttribute('data-day') ||
                           btn.getAttribute('aria-label')?.match(/(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)[^\s]*\s+\d+/)?.[0];
            
            if (dateAttr) {
              associatedDate = dateAttr;
            } else {
              // Try to find date from parent container
              let parent = btn.parentElement;
              for (let i = 0; i < 5 && parent; i++) {
                const parentText = parent.getAttribute('aria-label') || parent.getAttribute('data-date') || '';
                const dateMatch = parentText.match(/(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)[^\s]*\s+\d+/i);
                if (dateMatch) {
                  associatedDate = dateMatch[0];
                  break;
                }
                parent = parent.parentElement;
              }
            }
            
            slotButtons.push({ text, date: associatedDate });
          }
          
          // Strategy 2: If we found slots but no dates, collect all unique slots
          // (they might all be for the currently selected day)
          if (slotButtons.length > 0) {
            // Group by date if available, otherwise put all in a single array
            for (const slot of slotButtons) {
              const dateKey = slot.date || 'current';
              if (!slotsByDate[dateKey]) {
                slotsByDate[dateKey] = [];
              }
              if (!slotsByDate[dateKey].includes(slot.text)) {
                slotsByDate[dateKey].push(slot.text);
              }
            }
          }
          
          return slotsByDate;
        }, dayButtons.map(db => db.dateKey));
        
        // If we extracted slots, try to match them with day buttons
        if (Object.keys(extracted).length > 0) {
          console.log(`✅ Extracted slots from DOM for ${Object.keys(extracted).length} date groups`);
          
          // If we have a 'current' group, it's likely for the selected day
          // Try to match with the first day button or distribute across visible days
          if (extracted['current'] && extracted['current'].length > 0) {
            // This might be slots for the currently selected day
            // We'll need to click to get slots for other days, but this gives us a head start
            console.log(`📊 Found ${extracted['current'].length} slots for current selection`);
            // Don't add to result yet - we'll handle this in the main loop
          }
          
          // Add any date-matched slots
          for (const [dateKey, slots] of Object.entries(extracted)) {
            if (dateKey !== 'current' && Array.isArray(slots) && slots.length > 0) {
              result[dateKey] = { slots: slots as string[] };
            }
          }
          
          // If we found date-matched slots, return early (success!)
          if (Object.keys(result).length > 0) {
            return result;
          }
        }
      } catch (error) {
        console.log(`⚠️ DOM extraction failed in context: ${error}`);
        continue;
      }
    }
    
    // If DOM extraction didn't work, return empty (fallback to clicking method)
    console.log(`⚠️ Parallel extraction found no slots - will fall back to sequential clicking`);
    return result;
  }

  private async getAvailableSlots(page: any, onDayComplete?: (dayData: { date: string; slots: string[]; totalDays: number; totalSlots: number }) => void, maxDaysParam?: number): Promise<Record<string, { slots: string[] }>> {
    const allSlots: Record<string, { slots: string[] }> = {};

    // Early-exit controls to reduce latency
    // Use maxDaysParam if provided, otherwise check environment variable, otherwise default to 7
    const maxDaysEnv = maxDaysParam || parseInt(process.env.SCRAPE_MAX_DAYS || '', 10);
    const maxSlotsEnv = parseInt(process.env.SCRAPE_MAX_SLOTS || '', 10);
    const MAX_DAYS = Number.isFinite(maxDaysEnv) && maxDaysEnv > 0 ? maxDaysEnv : 7; // default 7 days
    const MAX_SLOTS = Number.isFinite(maxSlotsEnv) && maxSlotsEnv > 0 ? maxSlotsEnv : Number.MAX_SAFE_INTEGER; // default unlimited
    
    console.log("🚀 Starting optimized slot collection (parallel extraction mode)");
    console.log(`🎯 Goal: Collect up to ${MAX_DAYS} days or ${MAX_SLOTS} total slots (early-exit enabled)`);

    // Collect across multiple weeks until targets met - reduced attempts since we only need 7 days
    const maxAttempts = 3; // Reduced from 12 - 7 days usually available in first week or two
    
    let lastDateKeysSig = '';
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      let newDaysAdded = 0; // Track new days added in this attempt
      console.log(`\n=====================================`);
      console.log(`=== COLLECTION ATTEMPT ${attempt}/${maxAttempts} ===`);
      console.log(`📊 Current total: ${Object.keys(allSlots).length} days`);
      
      // Stop if we have enough days
      if (Object.keys(allSlots).length >= MAX_DAYS) {
        console.log(`🎯 Target reached! Stopping collection.`);
        break;
      }
      
      // Wait for day buttons to be rendered before collecting them
      try {
        await page.waitForSelector('[data-id="calendar-day-button"], button[data-test-id^="days:"]', { timeout: 2000 });
      } catch {
        // Continue even if wait fails - buttons might already be present
      }
      
      // Get ALL enabled day buttons from the current calendar view
      const dayButtons = await this.getAllEnabledDayButtons(page);
      console.log(`📅 Found ${dayButtons.length} total enabled day buttons in current view`);
      
      // Log the date keys to see what we're getting
      const dateKeys = dayButtons.map(db => db.dateKey);
      console.log(`📋 Button dates: ${dateKeys.join(', ')}`);
      const dateSig = dateKeys.join('|');
      
      if (dayButtons.length === 0) {
        console.log("❌ No enabled day buttons found. This is unexpected.");
        break;
      }

      // Filter out days that have already been collected
      const remainingDays = dayButtons.filter(db => !allSlots[db.dateKey]);
      
      if (remainingDays.length > 0 && Object.keys(allSlots).length < MAX_DAYS) {
        // Try fast parallel DOM extraction first (MUCH faster than clicking!)
        const parallelExtracted = await this.extractAllVisibleDaySlots(page, remainingDays);
        
        // Add any slots found via parallel extraction
        let parallelDaysAdded = 0;
        for (const [dateKey, dayData] of Object.entries(parallelExtracted)) {
          if (!allSlots[dateKey] && dayData.slots.length > 0) {
            allSlots[dateKey] = dayData;
            parallelDaysAdded++;
            newDaysAdded++;
            console.log(`✅ Parallel extraction: Added ${dateKey} with ${dayData.slots.length} slots`);
            
            if (onDayComplete) {
              const totalSlots = Object.values(allSlots).reduce((sum, day) => sum + day.slots.length, 0);
              const formattedDate = this.formatDate(dateKey);
              onDayComplete({
                date: formattedDate,
                slots: dayData.slots,
                totalDays: Object.keys(allSlots).length,
                totalSlots: totalSlots
              });
            }
          }
        }
        
        // If parallel extraction got us enough days, we're done!
        if (Object.keys(allSlots).length >= MAX_DAYS) {
          console.log(`🎯 Target reached via parallel extraction! Collected ${Object.keys(allSlots).length} days.`);
          break;
        }
        
        // Filter out days we already got from parallel extraction
        const daysStillNeeded = remainingDays.filter(db => !allSlots[db.dateKey]);
        
        // Fall back to sequential clicking only for remaining days
        if (daysStillNeeded.length > 0 && Object.keys(allSlots).length < MAX_DAYS) {
          console.log(`🖱️ Parallel extraction got ${parallelDaysAdded} days, clicking ${daysStillNeeded.length} remaining days...`);
          // Process days one at a time for maximum stability
          for (const buttonInfo of daysStillNeeded) {
            // Check if we've reached our target before processing next day
            if (Object.keys(allSlots).length >= MAX_DAYS) {
              console.log(`🎯 Target reached! Collected ${Object.keys(allSlots).length} days.`);
              break;
            }
            
            try {
              const dateKey = buttonInfo.dateKey;
              
              if (allSlots[dateKey]) {
                continue;
              }
              
              console.log(`🖱️ Clicking day: ${dateKey}`);
              // Click the day button
              await buttonInfo.button.click();
              
              // Wait for slot buttons to appear after clicking day button
              try { 
                await page.waitForSelector('button[data-test-id^="slot-"], [data-id="calendar-slot"]', { timeout: 1000 }); 
              } catch {
                // Slots might already be visible or this day has no slots
              }
              
              // Get time slots for this day
              const slots = await this.getTimeSlotsForCurrentDay(page);
              
              if (slots.length > 0) {
                allSlots[dateKey] = { slots };
                newDaysAdded++;
                console.log(`✅ Added ${dateKey}: ${slots.length} slots (total days: ${Object.keys(allSlots).length})`);
                
                if (onDayComplete) {
                  const totalSlots = Object.values(allSlots).reduce((sum, day) => sum + day.slots.length, 0);
                  const formattedDate = this.formatDate(dateKey);
                  onDayComplete({
                    date: formattedDate,
                    slots: slots,
                    totalDays: Object.keys(allSlots).length,
                    totalSlots: totalSlots
                  });
                }

              // Early-exit if total slots threshold reached
              const grandTotalSlots = Object.values(allSlots).reduce((sum, d) => sum + d.slots.length, 0);
              if (grandTotalSlots >= MAX_SLOTS) {
                console.log(`🎯 Slot target reached! Total slots: ${grandTotalSlots}. Stopping.`);
                break;
              }
            } else {
              console.log(`⚠️ No slots found for ${dateKey}`);
            }
          } catch (error) {
            console.log(`❌ Error processing day button ${buttonInfo.dateKey}: ${error}`);
            continue;
          }
        }
      }
    }
      
    console.log(`📊 Progress: ${Object.keys(allSlots).length} total days collected`);
    
    // If we have enough days, stop
    if (Object.keys(allSlots).length >= MAX_DAYS) {
      console.log(`✅ Collection complete. Total days: ${Object.keys(allSlots).length}`);
      break;
    }
    
    // If we still don't have enough days, navigate to next week
    if (Object.keys(allSlots).length < MAX_DAYS) {
      console.log(`🔄 Only have ${Object.keys(allSlots).length} days (target: ${MAX_DAYS}). Navigating to next week...`);
      
      const navSuccess = await this.navigateToNextWeek(page);
      
      if (navSuccess) {
        // Wait for calendar to update after navigation - look for day buttons
        try { 
          await page.waitForSelector('[data-id="calendar-day-button"], button[data-test-id^="days:"]', { timeout: 2000 }); 
        } catch {}
        // If calendar didn't change, try one more next-week click
        if (lastDateKeysSig === dateSig) {
          await this.navigateToNextWeek(page);
          // Wait for calendar to update
          try {
            await page.waitForSelector('[data-id="calendar-day-button"], button[data-test-id^="days:"]', { timeout: 2000 });
          } catch {}
        }
        lastDateKeysSig = dateSig;
      } else {
        // Only stop if navigation failed AND we didn't find any new days this attempt
        if (newDaysAdded === 0) {
          console.log(`❌ Navigation failed and no new days found. Collected ${Object.keys(allSlots).length} days total.`);
          break;
        } else {
          console.log(`⚠️ Navigation failed but found ${newDaysAdded} new days. Will retry navigation on next attempt.`);
          // Continue to next iteration to retry
        }
      }
    }
    
    console.log(`🏁 Final result: Successfully collected ${Object.keys(allSlots).length} days`);
    console.log(`📋 Collected dates: ${Object.keys(allSlots).join(', ')}`);
    
    if (Object.keys(allSlots).length === 0) {
      console.warn("⚠️ No available booking slots found in any week");
      console.info("💡 This could mean the calendar has no available slots or the page structure changed");
    } else {
      console.info(`✅ Found ${Object.keys(allSlots).length} days with available booking slots`);
    }

    return allSlots;
  }

  private async getAllEnabledDayButtons(pageOrFrame: any): Promise<Array<{ button: any; dateKey: string }>> {
    const enabledButtons: Array<{ button: any; dateKey: string }> = [];
    const strictMode = (process.env.STRICT_SELECTORS || '').toLowerCase() === 'true';
    const seenDateKeys = new Set<string>();

    console.log(`🔍 getAllEnabledDayButtons() starting (page + iframes)...`);

    const buildContexts = (root: any) => {
      const contexts: any[] = [root];
      try {
        const frames = root.frames ? root.frames() : [];
        for (const f of frames) contexts.push(f);
      } catch {}
      return contexts;
    };

    const contexts = buildContexts(pageOrFrame);
    const waitSelectors = strictMode
      ? ['button[data-test-id^="days:"]', '[data-id="calendar-day-button"]']
      : [
          'button[data-test-id*="days:"]',
          '[data-id="calendar-day-button"]',
          '[data-test-id*="day"]'
        ];

      for (const ctx of contexts) {
        // Skip wait - calendar should already be stable

      // Ensure at least one matching selector is present in this context
      let foundAny = false;
      for (const sel of waitSelectors) {
        try { await ctx.waitForSelector(sel, { timeout: 500 }); foundAny = true; break; } catch {}
      }
      if (!foundAny) continue;

      console.log(`🔍 Querying day buttons in a context...`);
      let buttons: any[] = [];
      try {
        if (strictMode) {
          const a = await ctx.$$('button[data-test-id^="days:"]');
          const b = await ctx.$$('[data-id="calendar-day-button"]');
          buttons = a.concat(b);
        } else {
          const a = await ctx.$$('button[data-test-id*="days:"]');
          const b = await ctx.$$('.calendar-day-button, [data-id="calendar-day-button"], [data-test-id*="day"]');
          buttons = a.concat(b);
        }
      } catch {}

      console.log(`📊 Context has ${buttons.length} candidate day buttons`);

      for (let i = 0; i < buttons.length; i++) {
        try {
          const button = buttons[i];
          const buttonText = await button.textContent();
          
          // Check multiple ways a button could be enabled/clickable
          let isEnabled = false;
          try {
            isEnabled = await button.isEnabled();
          } catch {}
          
          // Also check if button is not explicitly disabled via attributes
          let isDisabledAttr = false;
          try {
            const disabled = await button.getAttribute('disabled');
            const ariaDisabled = await button.getAttribute('aria-disabled');
            // Button is disabled if it has disabled="true" or aria-disabled="true"
            isDisabledAttr = disabled === 'true' || disabled === '' || ariaDisabled === 'true';
          } catch {}
          
          // Consider button clickable if:
          // 1. isEnabled is true, OR
          // 2. It doesn't have explicit disabled attributes (might still be clickable even if isEnabled is false)
          // 3. Or if it has "is selected" text (currently selected date)
          const hasSelectedText = buttonText?.includes('is selected') || false;
          const isClickable = isEnabled || (!isDisabledAttr && !hasSelectedText) || hasSelectedText;
          
          console.log(`🔍 Button ${i + 1}: enabled=${isEnabled}, disabledAttr=${isDisabledAttr}, clickable=${isClickable}, text='${buttonText?.substring(0, 60)}...'`);

          // Include button if it's clickable and has text (even if isEnabled is false, it might still be clickable)
          if (isClickable && buttonText) {
            const dateKey = buttonText.replace('Press enter to navigate available slots', '').trim();
            const cleanDateKey = dateKey.replace('is selected', '').trim();
            if (seenDateKeys.has(cleanDateKey)) {
              continue;
            }
            seenDateKeys.add(cleanDateKey);
            enabledButtons.push({ button, dateKey: cleanDateKey });
          }
        } catch (err) {
          console.log(`❌ Error inspecting button in context: ${err}`);
        }
      }
    }

    console.log(`📊 getAllEnabledDayButtons() complete: returning ${enabledButtons.length} enabled buttons`);
    return enabledButtons;
  }

  private async getTimeSlotsForCurrentDay(pageOrFrame: any): Promise<string[]> {
    // Optimized: try to find slots in any context (page or iframe)
    const contexts: any[] = [pageOrFrame];
    try {
      if (pageOrFrame.frames) {
        const frames = pageOrFrame.frames();
        contexts.push(...frames);
      }
    } catch {}
    
    // Fast path: prioritize specific slot selectors first
    for (const ctx of contexts) {
      try {
        const slots: string[] = await ctx.evaluate(() => {
          // Based on HTML: data-test-id="slot-2:45PM" and data-id="calendar-slot"
          const slotSelectors = ['button[data-test-id^="slot-"]', '[data-id="calendar-slot"]'];
          const seen = new Set<string>();
          const results: string[] = [];
          const isTimeLike = (t: string) => {
            const trimmed = t.trim();
            // Reject strings that contain unwanted patterns like timezone info
            // Examples: "coordinated universal time", "Central Daylight Time (02:34 PM)", etc.
            if (/coordinated|universal\s+time|time\s+zone|daylight\s+time|standard\s+time|\(.*\)/i.test(trimmed)) {
              return false;
            }
            // Reject strings longer than reasonable time format (e.g., "9:30 AM" should be max ~12 chars)
            if (trimmed.length > 12) {
              return false;
            }
            // Must match standard time pattern like "9:30 AM" or "09:30 PM" or "2:45 PM"
            return /\d{1,2}:\d{2}\s?(AM|PM)/i.test(trimmed);
          };
          
          // Try specific slot selectors first (faster, more accurate)
          for (const sel of slotSelectors) {
            const nodes = Array.from(document.querySelectorAll(sel)) as HTMLElement[];
            for (const n of nodes) {
              const txt = (n.innerText || n.textContent || '').trim();
              if (!txt || !isTimeLike(txt) || seen.has(txt)) continue;
              seen.add(txt);
              results.push(txt);
            }
          }
          
          // If found, return early (most common case)
          if (results.length > 0) return results;
          
          // Fallback to generic buttons only if needed
          const buttons = Array.from(document.querySelectorAll('button')) as HTMLElement[];
          for (const btn of buttons) {
            const txt = (btn.innerText || btn.textContent || '').trim();
            if (!txt || !isTimeLike(txt) || seen.has(txt)) continue;
            seen.add(txt);
            results.push(txt);
          }
          // Filter out any malformed entries that might have slipped through
          return results.filter(t => isTimeLike(t));
        });
        // Additional filtering in Node.js context (safety net)
        const validSlots = slots.filter(slot => this.isValidTimeSlot(slot));
        if (validSlots.length > 0) {
          console.log(`✅ Returning ${validSlots.length} time slots (optimized, ${slots.length - validSlots.length} filtered)`);
          return validSlots;
        }
      } catch (error) {
        continue;
      }
    }
    
    console.log('⚠️ Fast path failed, trying fallback');

    // Fallback path (rare) - try all contexts
    const fallbackSelectors = [
      'button[data-test-id^="slot-"]',
      '[data-id="calendar-slot"]',
      'button:has-text("AM")',
      'button:has-text("PM")',
      'button:has-text(":")'
    ];
    for (const ctx of contexts) {
      for (const selector of fallbackSelectors) {
        try {
          const elements = await ctx.$$(selector);
        if (elements.length > 0) {
          const texts = await Promise.all(elements.map((el: any) => el.textContent()));
          const filtered = texts
            .filter((t: any) => t && t.trim().length > 0 && this.isValidTimeSlot(t))
            .map((t: any) => t!.trim());
          if (filtered.length > 0) {
            console.log(`✅ Returning ${filtered.length} time slots (fallback via ${selector})`);
            return filtered;
          }
        }
      } catch {}
      }
    }
    return [];
  }

  private async getCurrentWeekSlots(page: any): Promise<Array<{ date: string; slots: string[] }>> {
    const weekSlots: Array<{ date: string; slots: string[] }> = [];
    
    // Wait for day buttons to be visible with multiple possible selectors
    const dayButtonSelectors = [
      'button[data-test-id*="days:"]',
      'button:has-text("Monday")',
      'button:has-text("Tuesday")',
      'button:has-text("Wednesday")',
      'button:has-text("Thursday")',
      'button:has-text("Friday")',
      'button:has-text("Saturday")',
      'button:has-text("Sunday")',
      '[data-test-id*="day"]',
      '[data-id="calendar-day-button"]'
    ];
    
    let dayButtonsFound = false;
    for (const selector of dayButtonSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 5000 }); // Increased from 1000ms to 5000ms
        dayButtonsFound = true;
        break;
      } catch (error) {
        continue;
      }
    }
    
    if (!dayButtonsFound) {
      console.log("❌ No day buttons found");
      return weekSlots;
    }
    
    // Wait for day buttons to be fully rendered
    try {
      await page.waitForSelector('[data-id="calendar-day-button"], button[data-test-id^="days:"]', { timeout: 1000 });
    } catch {
      // Buttons might already be rendered
    }

    // Find all day buttons using multiple selectors
    let dayButtons = [];
    for (const selector of dayButtonSelectors) {
      try {
        const buttons = await page.$$(selector);
        if (buttons.length > 0) {
          dayButtons = buttons;
          console.log(`🔍 Found ${dayButtons.length} day buttons using selector: ${selector}`);
          break;
        }
      } catch (error) {
        console.log(`❌ Selector failed: ${selector} - ${error}`);
        continue;
      }
    }
    
    if (dayButtons.length === 0) {
      console.log("❌ No day buttons found with any selector");
      return weekSlots;
    }
    
    const enabledButtons = [];
    console.log(`🔍 Checking ${dayButtons.length} day buttons for enabled status...`);
    
    for (let i = 0; i < dayButtons.length; i++) {
      try {
        const button = dayButtons[i];
        const isEnabled = await button.isEnabled();
        const buttonText = await button.textContent();
        const isSelected = buttonText?.includes('is selected') || false;
        console.log(`📅 Button ${i + 1}: '${buttonText?.substring(0, 50)}...' (enabled: ${isEnabled}, selected: ${isSelected})`);
        if (isEnabled) {
          enabledButtons.push({ button, isSelected });
          console.log(`✅ Added enabled button ${i + 1} to processing list`);
        } else {
          console.log(`❌ Button ${i + 1} is disabled, skipping`);
        }
      } catch (error) {
        console.log(`❌ Error checking button ${i + 1}: ${error}`);
        continue;
      }
    }
    
    console.log(`📊 Total enabled buttons found: ${enabledButtons.length}`);
    
    console.log(`🚀 Processing ${enabledButtons.length} enabled day buttons...`);

    for (let i = 0; i < enabledButtons.length; i++) {
      try {
        const { button, isSelected } = enabledButtons[i];
        
        // Always click the button to select it and get its slots
        console.log(`🖱️ Clicking day button ${i + 1} (selected: ${isSelected})`);
        await button.click();
        // Wait for slot buttons to appear after clicking day
        try {
          await page.waitForSelector('button[data-test-id^="slot-"], [data-id="calendar-slot"]', { timeout: 500 });
        } catch {
          // Slots might already be visible or this day has no slots
        }
        
        // Get the selected date information from the clicked button
        let dateText = "Unknown Date";
        try {
          const buttonText = await button.textContent();
          if (buttonText) {
            // Extract date from button text like "Monday 27th October Press enter to navigate available slots Mon 27 Oct"
            dateText = buttonText.replace('Press enter to navigate available slots', '').trim();
            dateText = dateText.replace('is selected', '').trim();
          }
        } catch (error) {
          console.log(`❌ Error getting date from button: ${error}`);
        }
        
        // Get time slots with multiple possible selectors
        const timeSlotSelectors = [
          'button:has-text("AM")',
          'button:has-text("PM")',
          '[data-test-id*="time"]',
          '[data-id="time-slot-button"]'
        ];
        
        let timeSlotElements = [];
        for (const selector of timeSlotSelectors) {
          try {
            const elements = await page.$$(selector);
            if (elements.length > 0) {
              timeSlotElements = elements;
              break;
            }
          } catch (error) {
            continue;
          }
        }
        
        const timeSlots = await Promise.all(
          timeSlotElements.map(async (slot: any) => await slot.textContent())
        );
        
        if (timeSlots.length > 0) {
          weekSlots.push({
            date: dateText,
            slots: timeSlots.filter(slot => slot).map(slot => slot.trim())
          });
          console.log(`✅ Found ${timeSlots.length} slots for ${dateText}`);
        } else {
          console.log(`⚠️ No slots found for ${dateText}`);
        }
        
        // No wait needed - next button click will wait for slots to appear
      } catch (error) {
        console.log(`❌ Error processing button ${i + 1}: ${error}`);
        continue;
      }
    }

    return weekSlots;
  }

  private async navigateToNextWeek(pageOrFrame: any): Promise<boolean> {
    console.log("🔍 Looking for Next Week controls (including iframes)...");
    const strictMode = (process.env.STRICT_SELECTORS || '').toLowerCase() === 'true';

    const tryContexts = (rootPage: any) => {
      const contexts: any[] = [rootPage];
      try {
        const frames = rootPage.frames ? rootPage.frames() : [];
        for (const f of frames) contexts.push(f);
      } catch {}
      return contexts;
    };

    // Based on HTML: data-id="calendar-arrows-button-next" with aria-label="Next Week"
    const nextSelectors: Array<{ byRole?: RegExp | string; css?: string }> = strictMode
      ? [
          { css: '[data-id="calendar-arrows-button-next"]' }, // Most reliable from HTML
          { css: 'button[aria-label="Next Week"]' },
          { byRole: /Next Week/i }
        ]
      : [
          { css: '[data-id="calendar-arrows-button-next"]' }, // Most reliable from HTML
          { css: 'button[aria-label="Next Week"]' },
          { byRole: /Next Week/i },
          { byRole: /Next/i },
          { css: 'button[aria-label*="Next" i]' },
          { css: '[data-test-id*="next" i]' },
          { css: 'button:has-text("Next Week")' },
          { css: 'button:has-text("Next")' }
        ];

    const verifySelectors = [
      'button[data-test-id*="days:"]',
      '[data-id="calendar-day-button"]',
      'button:has-text("Monday")',
      'button:has-text("Tuesday")',
      'button:has-text("Wednesday")'
    ];

    // Try clicking next in any relevant context (page or iframe)
    const contexts = tryContexts(pageOrFrame);
    for (const ctx of contexts) {
      try {
        console.log('🔎 Checking context for next controls...');
        // Try role-based first
        for (const sel of nextSelectors) {
          try {
            if (sel.byRole) {
              const roleName = sel.byRole;
              const locator = typeof roleName === 'string'
                ? ctx.getByRole('button', { name: roleName })
                : ctx.getByRole('button', { name: roleName as RegExp });
              const enabled = await locator.isEnabled();
              console.log(`🔹 getByRole match enabled=${enabled}`);
              if (enabled) {
                await locator.click();
                console.log('✅ Clicked next (byRole)');
                // Wait for calendar to update after navigation
                for (const v of verifySelectors) {
                  try { 
                    await ctx.waitForSelector(v, { timeout: 2000 }); 
                    break; 
                  } catch {}
                }
                return true;
              }
            } else if (sel.css) {
              const el = await ctx.$(sel.css);
              if (el && await el.isEnabled()) {
                await el.click();
                console.log(`✅ Clicked next via selector: ${sel.css}`);
                // Wait for calendar to update after navigation
                for (const v of verifySelectors) {
                  try { 
                    await ctx.waitForSelector(v, { timeout: 2000 }); 
                    break; 
                  } catch {}
                }
                return true;
              }
            }
          } catch {}
        }
      } catch {}
    }

    // Fallback: try keyboard navigation on the root page
    try {
      if (pageOrFrame?.keyboard) {
        console.log('⌨️ Fallback: sending ArrowRight key to navigate');
        await pageOrFrame.keyboard.press('ArrowRight');
        // Wait for calendar to update after keyboard navigation
        for (const v of verifySelectors) {
          try { 
            await pageOrFrame.waitForSelector(v, { timeout: 2000 }); 
            console.log('✅ Navigation likely succeeded (keyboard)'); 
            return true; 
          } catch {}
        }
      }
    } catch {}

    console.log('❌ Next week controls not found or disabled in all contexts');
    return false;
  }
}

