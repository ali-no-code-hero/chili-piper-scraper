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
  private baseUrl = "https://cincpro.chilipiper.com/concierge-router/link/lp-request-a-demo-agent-advice";

  async scrapeSlots(
    firstName: string,
    lastName: string,
    email: string,
    phone: string
  ): Promise<ScrapingResult> {
    try {
      console.log(`🎯 Starting scrape for ${firstName} ${lastName} (${email})`);
      
      const browser = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--disable-extensions',
          '--disable-sync',
          '--disable-default-apps',
          '--hide-scrollbars',
          '--mute-audio',
          '--no-first-run',
          '--no-default-browser-check',
          '--disable-hang-monitor',
          '--disable-prompt-on-repost',
          '--disable-breakpad',
          '--disable-features=site-per-process',
          '--disable-site-isolation-trials',
          '--disable-blink-features=AutomationControlled',
          '--disable-infobars',
          '--window-size=1280,720'
        ]
      });

      const page = await browser.newPage();
      
      // Optimize page settings
      page.setDefaultNavigationTimeout(60000);
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
      await page.goto(this.baseUrl, { waitUntil: 'domcontentloaded' });
      
      // Fill the form
      await page.fill('input[name="FirstName"]', firstName);
      await page.fill('input[name="LastName"]', lastName);
      await page.fill('input[name="Email"]', email);
      await page.fill('input[name="Phone"]', phone);
      
      // Click the submit button
      await page.click('button[type="submit"]');
      console.log("Form submitted successfully");
      
      // Wait for the calendar page to load and adjust
      await page.waitForTimeout(500);
      await page.waitForSelector('[data-id="calendar-day-button"]', { timeout: 1000 });
      console.log("✅ Calendar loaded successfully");

      const slots = await this.getAvailableSlots(page);
      
      await browser.close();
      
      // Flatten the slots into the requested format
      const flattenedSlots: SlotData[] = [];
      for (const [dateKey, dayInfo] of Object.entries(slots)) {
        for (const timeSlot of dayInfo.slots) {
          flattenedSlots.push({
            date: dateKey,
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
      return result;

    } catch (error) {
      console.error('Scraping error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  private async getAvailableSlots(page: any): Promise<Record<string, { slots: string[] }>> {
    const allSlots: Record<string, { slots: string[] }> = {};
    let weekCount = 0;
    const maxWeeks = 4; // Check up to 4 weeks to find maximum available slots

    console.log("🚀 Starting slot collection");
    console.log(`📊 Max weeks to check: ${maxWeeks}`);

    while (weekCount < maxWeeks) {
      weekCount++;
      console.log(`🔍 Week ${weekCount}: Looking for available days...`);
      
      const currentWeekSlots = await this.getCurrentWeekSlots(page);
      
      if (!currentWeekSlots || currentWeekSlots.length === 0) {
        console.log(`⚠️ No slots found in Week ${weekCount}. Attempting to navigate to next week.`);
        if (!await this.navigateToNextWeek(page)) {
          console.log("❌ Next week button is disabled or not found. No more weeks available.");
          break;
        }
        await page.waitForTimeout(200);
        continue;
      }

      for (const dayInfo of currentWeekSlots) {
        const dateKey = dayInfo.date;
        if (!allSlots[dateKey]) {
          allSlots[dateKey] = dayInfo;
          console.log(`✅ Day ${Object.keys(allSlots).length}: ${dateKey} - ${dayInfo.slots.length} slots`);
        } else {
          console.log(`⚠️ Duplicate date found: ${dateKey}, skipping`);
        }
      }

      console.log(`📈 Progress: ${Object.keys(allSlots).length} unique days collected so far`);

      // Always try to move to the next week to find all available slots
      if (!await this.navigateToNextWeek(page)) {
        console.log("❌ Next week button is disabled or not found. No more weeks available.");
        break;
      }

      await page.waitForTimeout(200);
    }
    
    console.log(`🏁 Final result: Successfully collected ${Object.keys(allSlots).length} days of slots`);
    console.log(`📋 Collected dates: ${Object.keys(allSlots)}`);
    
    return allSlots;
  }

  private async getCurrentWeekSlots(page: any): Promise<Array<{ date: string; slots: string[] }>> {
    const weekSlots: Array<{ date: string; slots: string[] }> = [];
    
    // Wait for day buttons to be visible
    await page.waitForSelector('[data-id="calendar-day-button"]', { timeout: 1000 });
    await page.waitForTimeout(100);

    const dayButtons = await page.$$('[data-id="calendar-day-button"]');
    console.log(`🔍 Found ${dayButtons.length} day buttons in current week`);
    
    const enabledButtons = [];
    for (const button of dayButtons) {
      const isEnabled = await button.isEnabled();
      const buttonText = await button.textContent();
      console.log(`📅 Button: '${buttonText?.substring(0, 50)}...' (enabled: ${isEnabled})`);
      if (isEnabled) {
        enabledButtons.push(button);
      }
    }
    
    console.log(`🚀 Processing ${enabledButtons.length} enabled day buttons...`);

    for (const button of enabledButtons) {
      await button.click();
      await page.waitForTimeout(25);
      
      const dateElement = await page.$('[data-id="selected-day-info"]');
      const dateText = await dateElement?.textContent() || "Unknown Date";
      
      const timeSlotElements = await page.$$('[data-id="time-slot-button"]');
      const timeSlots = await Promise.all(
        timeSlotElements.map(async (slot: any) => await slot.textContent())
      );
      
      if (timeSlots.length > 0) {
        weekSlots.push({
          date: dateText.trim(),
          slots: timeSlots.filter(slot => slot).map(slot => slot.trim())
        });
        console.log(`✅ Found ${timeSlots.length} slots for ${dateText.trim()}`);
      }
      
      await page.waitForTimeout(25);
    }

    return weekSlots;
  }

  private async navigateToNextWeek(page: any): Promise<boolean> {
    const nextWeekButton = await page.$('[data-id="next-week-button"]');
    if (nextWeekButton && await nextWeekButton.isEnabled()) {
      console.log("➡️ Clicking next week button...");
      await nextWeekButton.click();
      await page.waitForTimeout(25);
      console.log("✅ Successfully clicked next week button");
      // Wait for calendar to update
      await page.waitForSelector('[data-id="calendar-day-button"]', { timeout: 500 });
      console.log("✅ Successfully moved to next week");
      return true;
    } else {
      console.log("❌ Next week button is disabled");
      return false;
    }
  }
}
