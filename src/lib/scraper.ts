import { chromium } from 'playwright';

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

  constructor(formUrl?: string) {
    this.baseUrl = formUrl || process.env.CHILI_PIPER_FORM_URL || "https://cincpro.chilipiper.com/concierge-router/link/lp-request-a-demo-agent-advice";
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
      
      // Determine year - assume current year or next year if date has passed
      const now = new Date();
      const currentYear = now.getFullYear();
      let year = currentYear;
      
      // If the parsed date (with current year) is in the past, use next year
      const testDate = new Date(year, month - 1, day);
      if (testDate < now && testDate.getMonth() === month - 1 && testDate.getDate() === day) {
        year = currentYear + 1;
      }
      
      // Format as YYYY-MM-DD
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    } catch (error) {
      console.warn(`Error formatting date "${dateString}":`, error);
      return dateString; // Return original if parsing fails
    }
  }

  async scrapeSlots(
    firstName: string,
    lastName: string,
    email: string,
    phone: string,
    onDayComplete?: (dayData: { date: string; slots: string[]; totalDays: number; totalSlots: number }) => void
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
      
      const browser = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-dev-shm-usage'
        ]
      });

      const page = await browser.newPage();
      
      // Optimize page settings - reduced timeout for faster failures
      page.setDefaultNavigationTimeout(30000); // Reduced from 60000ms for faster timeouts
      await page.route("**/*", (route) => {
        if (route.request().resourceType() === "image" || 
            route.request().resourceType() === "stylesheet" || 
            route.request().resourceType() === "font") {
          route.abort();
        } else {
          route.continue();
        }
      });

      console.log(`Navigating to: ${this.baseUrl}`);
      // Use 'domcontentloaded' instead of 'networkidle' for faster loading (saves 5-8 seconds)
      await page.goto(this.baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      
      // Wait for page to load completely - optimized for speed
      console.log("⏳ Waiting for form to render...");
      await page.waitForTimeout(800); // Slightly increased to ensure inputs mount
      
      // Wait for any form elements to be present - reduced timeout
      try {
        await page.waitForSelector('input, textbox, [data-test-id*="Field"], form', { timeout: 2000 });
        console.log("✅ Form elements detected on page");
      } catch (error) {
        console.log("⚠️ No form elements found with initial check, proceeding anyway...");
      }
      
      // Try multiple selectors for form fields
      console.log("🔍 Looking for form fields...");
      
      // Try different selectors for First Name (based on actual Chili Piper form)
      // Added more comprehensive selectors including role-based and label-based
      const firstNameSelectors = [
        '[data-test-id="GuestFormField-PersonFirstName"]',
        '[data-test-id*="FirstName"]',
        '[data-test-id*="first-name"]',
        '[data-test-id*="firstname"]',
        '[data-test-id*="First"]',
        'input[data-test-id="GuestFormField-PersonFirstName"]',
        'input[data-test-id*="FirstName"]',
        'input[data-test-id*="first-name"]',
        'input[aria-label*="first name" i]',
        'input[aria-labelledby*="first" i]',
        'label:has-text("First Name") ~ * input',
        'label:has-text("First Name") + div input',
        'textbox[aria-label="First Name"]',
        'input[aria-label="First Name"]',
        'input[aria-label*="First Name" i]',
        'textbox:has-text("First Name")',
        'input:has-text("First Name")',
        'input[name="FirstName"]',
        'input[name="first_name"]',
        'input[name="firstName"]',
        'input[name*="first" i]',
        'input[placeholder*="First" i]',
        'input[placeholder*="first" i]',
        'input[id*="first" i]',
        'input[id*="First"]',
        'input[type="text"]:near(:text("First Name"), 50)',
        '[role="textbox"][aria-label*="First" i]'
      ];
      
      const lastNameSelectors = [
        '[data-test-id="GuestFormField-PersonLastName"]',
        '[data-test-id*="LastName"]',
        '[data-test-id*="last-name"]',
        '[data-test-id*="lastname"]',
        '[data-test-id*="Last"]',
        'input[data-test-id="GuestFormField-PersonLastName"]',
        'input[data-test-id*="LastName"]',
        'input[data-test-id*="last-name"]',
        'textbox[aria-label="Last Name"]',
        'input[aria-label="Last Name"]',
        'input[aria-label*="Last Name" i]',
        'input[aria-label*="last name" i]',
        'textbox:has-text("Last Name")',
        'input:has-text("Last Name")',
        'input[name="LastName"]',
        'input[name="last_name"]',
        'input[name="lastName"]',
        'input[name*="last" i]',
        'input[placeholder*="Last" i]',
        'input[placeholder*="last" i]',
        'input[id*="last" i]',
        'input[id*="Last" i]',
        '[role="textbox"][aria-label*="Last" i]'
      ];
      
      const emailSelectors = [
        '[data-test-id="GuestFormField-PersonEmail"]',
        '[data-test-id*="Email"]',
        '[data-test-id*="email"]',
        'input[data-test-id="GuestFormField-PersonEmail"]',
        'input[data-test-id*="Email"]',
        'textbox[aria-label="Email"]',
        'input[aria-label="Email"]',
        'input[aria-label*="Email" i]',
        'input[aria-label*="email" i]',
        'textbox:has-text("Email")',
        'input:has-text("Email")',
        'input[name="Email"]',
        'input[name="email"]',
        'input[name*="email" i]',
        'input[type="email"]',
        'input[placeholder*="email" i]',
        'input[placeholder*="Email" i]',
        'input[id*="email" i]',
        'input[id*="Email" i]',
        '[role="textbox"][aria-label*="Email" i]'
      ];
      
      const phoneSelectors = [
        '[data-test-id="PhoneField-input"]',
        '[data-test-id*="Phone"]',
        '[data-test-id*="phone"]',
        'input[data-test-id="PhoneField-input"]',
        'input[data-test-id*="Phone"]',
        'textbox[aria-label="Phone number"]',
        'input[aria-label="Phone number"]',
        'input[aria-label*="Phone number" i]',
        'input[aria-label*="phone number" i]',
        'input[aria-label*="Phone" i]',
        'textbox:has-text("Phone number")',
        'input:has-text("Phone number")',
        'input[name="Phone"]',
        'input[name="phone"]',
        'input[name="PhoneNumber"]',
        'input[name="phone_number"]',
        'input[name*="phone" i]',
        'input[type="tel"]',
        'input[placeholder*="phone" i]',
        'input[placeholder*="Phone" i]',
        'input[id*="phone" i]',
        'input[id*="Phone" i]',
        '[role="textbox"][aria-label*="Phone" i]'
      ];
      
      // Fill form fields with fallback selectors
      await this.fillFieldWithFallback(page, firstNameSelectors, firstName, 'First Name');
      await this.fillFieldWithFallback(page, lastNameSelectors, lastName, 'Last Name');
      await this.fillFieldWithFallback(page, emailSelectors, email, 'Email');
      await this.fillFieldWithFallback(page, phoneSelectors, phone, 'Phone');
      
      // Click the submit button with fallback selectors
      const submitSelectors = [
        'button[type="submit"]',
        'input[type="submit"]',
        'button:has-text("Submit")',
        'button:has-text("Continue")',
        'button:has-text("Next")',
        'button:has-text("Book")',
        'button:has-text("Schedule")',
        '[data-testid*="submit"]',
        '[data-testid*="continue"]',
        '.submit-button',
        '.continue-button'
      ];
      
      let submitClicked = false;
      for (const selector of submitSelectors) {
        try {
          console.log(`🔍 Trying submit selector: ${selector}`);
          await page.waitForSelector(selector, { timeout: 1000 }); // Ultra-fast optimization
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
        throw new Error('Could not find submit button with any of the provided selectors');
      }
      
      console.log("Form submitted successfully");
      
      // Wait for the intermediate step (call now vs schedule meeting) - optimized
      console.log("⏳ Waiting for call/schedule choice page...");
      await page.waitForTimeout(25); // Reduced from 50ms
      
      // Look for "Schedule a meeting" or similar options
      const scheduleSelectors = [
        'button:has-text("Schedule a meeting")',
        'button:has-text("Schedule")',
        'button:has-text("Book a meeting")',
        'button:has-text("Schedule later")',
        '[data-test-id*="schedule"]',
        'button[data-test-id*="schedule"]'
      ];
      
      let scheduleClicked = false;
      for (const selector of scheduleSelectors) {
        try {
          console.log(`🔍 Looking for schedule button: ${selector}`);
          await page.waitForSelector(selector, { timeout: 1000 }); // Ultra-fast optimization // Reduced from 3000ms
          await page.click(selector);
          console.log(`✅ Successfully clicked schedule button using selector: ${selector}`);
          scheduleClicked = true;
          break;
        } catch (error) {
          console.log(`❌ Schedule selector failed: ${selector}`);
          continue;
        }
      }
      
      if (scheduleClicked) {
        console.log("✅ Proceeding to schedule a meeting");
        // Wait for the calendar page to load after clicking schedule - optimized
        console.log("⏳ Waiting for calendar to load...");
        await page.waitForTimeout(100); // Reduced from 200ms
        console.log("✅ Calendar should be fully loaded now");
      } else {
        console.log("⚠️ No schedule button found, assuming we're already on calendar page");
        // Wait for the calendar page to load - optimized
        console.log("⏳ Waiting for calendar to load...");
        await page.waitForTimeout(100); // Reduced from 200ms
        console.log("✅ Calendar should be fully loaded now");
      }
      
      // Wait for calendar elements with multiple possible selectors
      const calendarSelectors = [
        '[data-test-id*="calendar"]',
        '[data-id="calendar"]',
        'div[aria-label*="Calendar" i]',
        '[role="grid"]',
        'button[data-test-id*="days:"]',
        '[data-test-id*="day"]',
        '[data-id="calendar-day-button"]',
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
        throw new Error('Could not find calendar elements with any of the provided selectors');
      }

      // Parallel processing toggle via environment flag for safe rollout/rollback
      // Enable by setting SCRAPE_ENABLE_CONCURRENT_DAYS=true
      const parallelEnabled = (process.env.SCRAPE_ENABLE_CONCURRENT_DAYS || '').toLowerCase() === 'true';
      let collectedSlots: Record<string, { slots: string[] }>; 

      if (parallelEnabled) {
        console.log('⚡ Starting parallel collection using two pages...');
        const page2 = await browser.newPage();
        page2.setDefaultNavigationTimeout(30000);
        await page2.route("**/*", (route) => {
          if (route.request().resourceType() === "image" ||
              route.request().resourceType() === "stylesheet" ||
              route.request().resourceType() === "font") {
            route.abort();
          } else {
            route.continue();
          }
        });

        // Navigate page2 to calendar and move to next week
        await page2.goto(this.baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page2.waitForTimeout(1000);
        try {
          await page2.waitForSelector('input, textbox, [data-test-id*="Field"], form', { timeout: 3000 });
        } catch {}

        // Reuse selectors to fill page2
        await this.fillFieldWithFallback(page2, firstNameSelectors, firstName, 'First Name');
        await this.fillFieldWithFallback(page2, lastNameSelectors, lastName, 'Last Name');
        await this.fillFieldWithFallback(page2, emailSelectors, email, 'Email');
        await this.fillFieldWithFallback(page2, phoneSelectors, phone, 'Phone');

        let submit2 = false;
        for (const selector of submitSelectors) {
          try {
            await page2.waitForSelector(selector, { timeout: 1000 });
            await page2.click(selector);
            submit2 = true; break;
          } catch {}
        }
        if (!submit2) {
          throw new Error('Could not find submit button on parallel page');
        }
        await page2.waitForTimeout(50);

        let scheduled2 = false;
        for (const selector of scheduleSelectors) {
          try {
            await page2.waitForSelector(selector, { timeout: 1000 });
            await page2.click(selector);
            scheduled2 = true; break;
          } catch {}
        }
        if (!scheduled2) {
          await page2.waitForTimeout(100);
        }

        // Ensure calendar visible on page2
        for (const selector of calendarSelectors) {
          try { await page2.waitForSelector(selector, { timeout: 1000 }); break; } catch {}
        }

        // Move page2 to next week to diversify days
        await this.navigateToNextWeek(page2);

        // Collect enabled day buttons on both pages in parallel
        const [buttonsWeek1, buttonsWeek2] = await Promise.all([
          this.getAllEnabledDayButtons(page),
          this.getAllEnabledDayButtons(page2)
        ]);

        const allSlots: Record<string, { slots: string[] }> = {};
        const processButtons = async (pg: any, buttons: Array<{ button: any; dateKey: string }>) => {
          for (const buttonInfo of buttons) {
            const dateKey = buttonInfo.dateKey;
            if (allSlots[dateKey]) continue;
            try {
              await buttonInfo.button.click();
              await pg.waitForTimeout(25);
              const slots = await this.getTimeSlotsForCurrentDay(pg);
              if (slots.length > 0) {
                allSlots[dateKey] = { slots };
                if (onDayComplete) {
                  const formattedDate = this.formatDate(dateKey);
                  const totalSlots = Object.values(allSlots).reduce((sum, d) => sum + d.slots.length, 0);
                  onDayComplete({ date: formattedDate, slots, totalDays: Object.keys(allSlots).length, totalSlots });
                }
              }
              if (Object.keys(allSlots).length >= 7) break;
            } catch (e) {
              continue;
            }
          }
        };

        await Promise.all([
          processButtons(page, buttonsWeek1),
          processButtons(page2, buttonsWeek2)
        ]);

        collectedSlots = allSlots;
        await page2.close();
      } else {
        collectedSlots = await this.getAvailableSlots(calendarContext, onDayComplete);
      }

      const slots = collectedSlots;

      await browser.close();
      
      // Flatten the slots into the requested format
      const flattenedSlots: SlotData[] = [];
      for (const [dateKey, dayInfo] of Object.entries(slots)) {
        const formattedDate = this.formatDate(dateKey);
        for (const timeSlot of dayInfo.slots) {
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

  private async getAvailableSlots(page: any, onDayComplete?: (dayData: { date: string; slots: string[]; totalDays: number; totalSlots: number }) => void): Promise<Record<string, { slots: string[] }>> {
    const allSlots: Record<string, { slots: string[] }> = {};

    // Early-exit controls to reduce latency
    const maxDaysEnv = parseInt(process.env.SCRAPE_MAX_DAYS || '', 10);
    const maxSlotsEnv = parseInt(process.env.SCRAPE_MAX_SLOTS || '', 10);
    const MAX_DAYS = Number.isFinite(maxDaysEnv) && maxDaysEnv > 0 ? maxDaysEnv : 7; // default 7 days
    const MAX_SLOTS = Number.isFinite(maxSlotsEnv) && maxSlotsEnv > 0 ? maxSlotsEnv : Number.MAX_SAFE_INTEGER; // default unlimited
    
    console.log("🚀 Starting comprehensive slot collection");
    console.log(`🎯 Goal: Collect up to ${MAX_DAYS} days or ${MAX_SLOTS} total slots (early-exit enabled)`);
    console.log("📋 Strategy: Collect current view, navigate if needed; stop early when thresholds met");

    // Simple approach: collect from Week 1, navigate to Week 2, collect from Week 2
    const maxAttempts = 3;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      console.log(`\n=====================================`);
      console.log(`=== COLLECTION ATTEMPT ${attempt}/${maxAttempts} ===`);
      console.log(`📊 Current total: ${Object.keys(allSlots).length} days`);
      
      // Stop if we have enough days
      if (Object.keys(allSlots).length >= MAX_DAYS) {
        console.log(`🎯 Target reached! Stopping collection.`);
        break;
      }
      
      console.log(`⏳ Waiting for calendar to be ready...`);
      await page.waitForTimeout(50); // Optimized - reduced from 100ms
      
      // Get ALL enabled day buttons from the current calendar view (Week 1 AND Week 2)
      const dayButtons = await this.getAllEnabledDayButtons(page);
      console.log(`📅 Found ${dayButtons.length} total enabled day buttons in current view`);
      
      // Log the date keys to see what we're getting
      const dateKeys = dayButtons.map(db => db.dateKey);
      console.log(`📋 Button dates: ${dateKeys.join(', ')}`);
      
      if (dayButtons.length === 0) {
        console.log("❌ No enabled day buttons found. This is unexpected.");
        break;
      }

      // Process ALL enabled day buttons (this collects both weeks at once!)
      let newDaysAdded = 0;
      for (const buttonInfo of dayButtons) {
        try {
          const dateKey = buttonInfo.dateKey;
          
          // Skip if we already have this date
          if (allSlots[dateKey]) {
            console.log(`⏭️ Skipping ${dateKey} - already collected`);
            continue;
          }
          
          // Click the button to see its slots
          console.log(`🖱️ Clicking ${dateKey}...`);
          await buttonInfo.button.click();
          await page.waitForTimeout(10); // Reduced from 25ms
          
          // Get time slots for this day
          const slots = await this.getTimeSlotsForCurrentDay(page);
          console.log(`📊 Got ${slots.length} slots for ${dateKey}`);
          
          if (slots.length > 0) {
            allSlots[dateKey] = { slots };
            newDaysAdded++;
            console.log(`✅ Added ${dateKey}: ${slots.length} slots (total days: ${Object.keys(allSlots).length})`);
            
            // Call the streaming callback if provided
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
          }
          
          // Stop if we have enough days
          if (Object.keys(allSlots).length >= MAX_DAYS) {
            console.log(`🎯 Target reached! Collected ${Object.keys(allSlots).length} days.`);
            break;
          }
        } catch (error) {
          console.log(`❌ Error processing day button: ${error}`);
          continue;
        }
      }
      
      console.log(`📊 Progress: ${Object.keys(allSlots).length} total days collected (${newDaysAdded} new from this attempt)`);
      
      // If we have enough days or didn't add any new ones, stop
      if (Object.keys(allSlots).length >= MAX_DAYS || newDaysAdded === 0) {
        console.log(`✅ Collection complete. Total days: ${Object.keys(allSlots).length}`);
        break;
      }
      
      // If we still don't have enough days, navigate to next week
      if (Object.keys(allSlots).length < MAX_DAYS) {
        console.log(`🔄 Only have ${Object.keys(allSlots).length} days (target: 7). Navigating to next week...`);
        
        const navSuccess = await this.navigateToNextWeek(page);
        console.log(`🧭 Navigation result: ${navSuccess}`);
        
        if (navSuccess) {
          console.log(`⏳ Waiting for calendar to update...`);
          await page.waitForTimeout(100); // Ultra-fast optimization
          console.log(`✅ Calendar updated, will continue in next iteration`);
        } else {
          console.log(`❌ Navigation failed or button disabled. Collected ${Object.keys(allSlots).length} days total.`);
          break;
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

  private async getAllEnabledDayButtons(page: any): Promise<Array<{ button: any; dateKey: string }>> {
    const enabledButtons: Array<{ button: any; dateKey: string }> = [];
    const seenDateKeys = new Set<string>();
    
    console.log(`🔍 getAllEnabledDayButtons() starting...`);
    
    // Wait for day buttons - use a broader selector
    try {
      console.log(`⏳ Waiting for 'button[data-test-id*="days:Oct"]' selector...`);
      await page.waitForSelector('button[data-test-id*="days:Oct"]', { timeout: 5000 });
      console.log(`✅ Found Oct buttons`);
    } catch (error) {
      console.log(`⚠️ Oct buttons not found, trying any day buttons...`);
      try {
        await page.waitForSelector('button[data-test-id*="days:"]', { timeout: 2000 });
        console.log(`✅ Found any day buttons`);
      } catch (error2) {
        console.log(`❌ No day buttons found with any selector`);
        return enabledButtons;
      }
    }
    
    // Wait a moment for calendar to stabilize - optimized
    await page.waitForTimeout(40); // Reduced from 50ms to 40ms
    
    // Get all day buttons
    console.log(`🔍 Querying all day buttons with selector 'button[data-test-id*="days:"]'...`);
    const dayButtons = await page.$$('button[data-test-id*="days:"]');
    console.log(`📊 Total day buttons found: ${dayButtons.length}`);
    
    for (let i = 0; i < dayButtons.length; i++) {
      try {
        const button = dayButtons[i];
        const isEnabled = await button.isEnabled();
        const buttonText = await button.textContent();
        
        console.log(`🔍 Button ${i + 1}: enabled=${isEnabled}, text='${buttonText?.substring(0, 60)}...'`);
        
        if (isEnabled && buttonText) {
          // Extract date key from button text
          const dateKey = buttonText.replace('Press enter to navigate available slots', '').trim();
          const cleanDateKey = dateKey.replace('is selected', '').trim();
          
          if (seenDateKeys.has(cleanDateKey)) {
            console.log(`⏭️ Skipping duplicate date key: ${cleanDateKey}`);
          } else {
            seenDateKeys.add(cleanDateKey);
            enabledButtons.push({ button, dateKey: cleanDateKey });
            console.log(`✅ Added enabled button ${i + 1}: ${cleanDateKey}`);
          }
        } else {
          console.log(`⏭️ Button ${i + 1} skipped: ${!isEnabled ? 'disabled' : 'no text'}`);
        }
      } catch (error) {
        console.log(`❌ Error checking button ${i + 1}: ${error}`);
      }
    }
    
    console.log(`📊 getAllEnabledDayButtons() complete: returning ${enabledButtons.length} enabled buttons`);
    return enabledButtons;
  }

  private async getTimeSlotsForCurrentDay(page: any): Promise<string[]> {
    // Fast path: single DOM evaluation collecting all likely slot elements
    try {
      const slots: string[] = await page.evaluate(() => {
        const selectors = [
          'button[data-test-id^="slot-"]',
          '[data-id="calendar-slot"]',
          'button'
        ];
        const seen = new Set<string>();
        const results: string[] = [];
        const isTimeLike = (t: string) => /\d{1,2}:\d{2}\s?(AM|PM)/i.test(t.trim());
        for (const sel of selectors) {
          const nodes = Array.from(document.querySelectorAll(sel)) as HTMLElement[];
          for (const n of nodes) {
            const txt = (n.innerText || n.textContent || '').trim();
            if (!txt) continue;
            if (!isTimeLike(txt)) continue;
            if (seen.has(txt)) continue;
            seen.add(txt);
            results.push(txt);
          }
        }
        return results;
      });
      console.log(`✅ Returning ${slots.length} time slots (DOM-eval fast path)`);
      return slots;
    } catch (error) {
      console.log('⚠️ Fast path failed, falling back to element iteration');
    }

    // Fallback path (rare)
    const fallbackSelectors = [
      'button[data-test-id^="slot-"]',
      '[data-id="calendar-slot"]',
      'button:has-text("AM")',
      'button:has-text("PM")',
      'button:has-text(":")'
    ];
    for (const selector of fallbackSelectors) {
      try {
        const elements = await page.$$(selector);
        if (elements.length > 0) {
          const texts = await Promise.all(elements.map((el: any) => el.textContent()));
          const filtered = texts
            .filter(t => t && t.trim().length > 0)
            .map(t => t!.trim());
          if (filtered.length > 0) {
            console.log(`✅ Returning ${filtered.length} time slots (fallback via ${selector})`);
            return filtered;
          }
        }
      } catch {}
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
    
    await page.waitForTimeout(75); // Reduced from 100ms

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
        await page.waitForTimeout(100); // Ultra-fast optimization
        
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
        
        await page.waitForTimeout(50); // Ultra-fast optimization
      } catch (error) {
        console.log(`❌ Error processing button ${i + 1}: ${error}`);
        continue;
      }
    }

    return weekSlots;
  }

  private async navigateToNextWeek(page: any): Promise<boolean> {
    console.log("🔍 Looking for Next Week button...");
    
    try {
      // Use getByRole which is more reliable than $ selector
      console.log(`🔍 Trying getByRole('button', { name: 'Next Week' })...`);
      const nextWeekButton = page.getByRole('button', { name: 'Next Week' });
      const isEnabled = await nextWeekButton.isEnabled();
      console.log(`📅 Next week button found: enabled=${isEnabled}`);
      
      if (isEnabled) {
        console.log(`➡️ Clicking next week button...`);
        await nextWeekButton.click();
        console.log("✅ Successfully clicked next week button");
        
        // Wait longer for calendar to fully update with new dates - ULTRA FAST
        await page.waitForTimeout(100); // Ultra-fast optimization
        console.log("⏳ Completed wait");
        
        // Wait for calendar to update with multiple possible selectors
        const calendarSelectors = [
          'button[data-test-id*="days:"]',
          'button:has-text("Monday")',
          'button:has-text("Tuesday")',
          'button:has-text("Wednesday")'
        ];
        
        let calendarUpdated = false;
        for (const calSelector of calendarSelectors) {
          try {
            await page.waitForSelector(calSelector, { timeout: 3000 });
            calendarUpdated = true;
            console.log(`✅ Calendar updated verified with selector: ${calSelector}`);
            break;
          } catch (error) {
            console.log(`❌ Calendar update verification failed with selector: ${calSelector}`);
            continue;
          }
        }
        
        if (calendarUpdated) {
          console.log("✅ Successfully moved to next week");
          await page.waitForTimeout(100); // Ultra-fast optimization
          return true;
        } else {
          console.log("⚠️ Calendar update verification failed - but continuing anyway");
          await page.waitForTimeout(100); // Ultra-fast optimization
          return true; // Return true anyway to continue the loop
        }
      } else {
        console.log(`❌ Next week button is disabled`);
        return false;
      }
    } catch (error) {
      console.log(`❌ Error finding/clicking Next Week button: ${error}`);
      return false;
    }
  }
}

