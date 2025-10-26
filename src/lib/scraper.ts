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
      
      // Wait for page to load completely
      await page.waitForTimeout(2000);
      
      // Try multiple selectors for form fields
      console.log("🔍 Looking for form fields...");
      
      // Try different selectors for First Name (based on actual Chili Piper form)
      const firstNameSelectors = [
        '[data-test-id="GuestFormField-PersonFirstName"]',
        'textbox[aria-label="First Name"]',
        'input[aria-label="First Name"]',
        'textbox:has-text("First Name")',
        'input:has-text("First Name")',
        'input[name="FirstName"]',
        'input[name="first_name"]',
        'input[name="firstName"]',
        'input[placeholder*="First"]',
        'input[placeholder*="first"]',
        'input[id*="first"]',
        'input[id*="First"]'
      ];
      
      const lastNameSelectors = [
        '[data-test-id="GuestFormField-PersonLastName"]',
        'textbox[aria-label="Last Name"]',
        'input[aria-label="Last Name"]',
        'textbox:has-text("Last Name")',
        'input:has-text("Last Name")',
        'input[name="LastName"]',
        'input[name="last_name"]',
        'input[name="lastName"]',
        'input[placeholder*="Last"]',
        'input[placeholder*="last"]',
        'input[id*="last"]',
        'input[id*="Last"]'
      ];
      
      const emailSelectors = [
        '[data-test-id="GuestFormField-PersonEmail"]',
        'textbox[aria-label="Email"]',
        'input[aria-label="Email"]',
        'textbox:has-text("Email")',
        'input:has-text("Email")',
        'input[name="Email"]',
        'input[name="email"]',
        'input[type="email"]',
        'input[placeholder*="email"]',
        'input[placeholder*="Email"]',
        'input[id*="email"]',
        'input[id*="Email"]'
      ];
      
      const phoneSelectors = [
        '[data-test-id="PhoneField-input"]',
        'textbox[aria-label="Phone number"]',
        'input[aria-label="Phone number"]',
        'textbox:has-text("Phone number")',
        'input:has-text("Phone number")',
        'input[name="Phone"]',
        'input[name="phone"]',
        'input[name="PhoneNumber"]',
        'input[name="phone_number"]',
        'input[type="tel"]',
        'input[placeholder*="phone"]',
        'input[placeholder*="Phone"]',
        'input[id*="phone"]',
        'input[id*="Phone"]'
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
        throw new Error('Could not find submit button with any of the provided selectors');
      }
      
      console.log("Form submitted successfully");
      
      // Wait longer for the calendar page to load and adjust
      console.log("⏳ Waiting for page transition to calendar...");
      await page.waitForTimeout(5000); // Increased from 2000ms to 5000ms
      
      // Wait for calendar elements with multiple possible selectors
      const calendarSelectors = [
        'button:has-text("Monday")',
        'button:has-text("Tuesday")',
        'button:has-text("Wednesday")',
        'button:has-text("Thursday")',
        'button:has-text("Friday")',
        '[data-test-id*="calendar"]',
        '[data-test-id*="day"]',
        '[data-id="calendar-day-button"]'
      ];
      
      let calendarFound = false;
      for (const selector of calendarSelectors) {
        try {
          await page.waitForSelector(selector, { timeout: 10000 }); // Increased from 2000ms to 10000ms
          console.log(`✅ Calendar loaded successfully using selector: ${selector}`);
          calendarFound = true;
          break;
        } catch (error) {
          console.log(`❌ Calendar selector failed: ${selector}`);
          continue;
        }
      }
      
      if (!calendarFound) {
        throw new Error('Could not find calendar elements with any of the provided selectors');
      }

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

  private async fillFieldWithFallback(page: any, selectors: string[], value: string, fieldName: string): Promise<void> {
    for (const selector of selectors) {
      try {
        console.log(`🔍 Trying selector for ${fieldName}: ${selector}`);
        await page.waitForSelector(selector, { timeout: 2000 });
        await page.fill(selector, value);
        console.log(`✅ Successfully filled ${fieldName} using selector: ${selector}`);
        return;
      } catch (error) {
        console.log(`❌ Selector failed for ${fieldName}: ${selector}`);
        continue;
      }
    }
    throw new Error(`Could not find ${fieldName} field with any of the provided selectors`);
  }

  private async getAvailableSlots(page: any): Promise<Record<string, { slots: string[] }>> {
    const allSlots: Record<string, { slots: string[] }> = {};
    let weekCount = 0;
    const maxWeeks = 6; // Increased to check more weeks for maximum available slots
    let consecutiveEmptyWeeks = 0; // Track consecutive weeks with no slots

    console.log("🚀 Starting comprehensive slot collection");
    console.log(`📊 Max weeks to check: ${maxWeeks}`);
    console.log("🎯 Goal: Collect ALL available booking days");

    while (weekCount < maxWeeks) {
      weekCount++;
      console.log(`🔍 Week ${weekCount}: Looking for available days...`);
      
      const currentWeekSlots = await this.getCurrentWeekSlots(page);
      
      if (!currentWeekSlots || currentWeekSlots.length === 0) {
        consecutiveEmptyWeeks++;
        console.log(`⚠️ No slots found in Week ${weekCount} (${consecutiveEmptyWeeks} consecutive empty weeks)`);
        
        // If we've had 2 consecutive empty weeks, we might have reached the end
        if (consecutiveEmptyWeeks >= 2) {
          console.log("🛑 Stopping: Found 2 consecutive weeks with no available slots");
          break;
        }
        
        // Still try to navigate to next week
        if (!await this.navigateToNextWeek(page)) {
          console.log("❌ Next week button is disabled. No more weeks available.");
          break;
        }
        await page.waitForTimeout(1000); // Increased wait time
        continue;
      }

      // Reset consecutive empty weeks counter when we find slots
      consecutiveEmptyWeeks = 0;

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

      await page.waitForTimeout(1000); // Increased wait time for better reliability
    }
    
    console.log(`🏁 Final result: Successfully collected ${Object.keys(allSlots).length} days of slots`);
    console.log(`📋 Collected dates: ${Object.keys(allSlots)}`);
    
    if (Object.keys(allSlots).length === 0) {
      console.warn("⚠️ No available booking slots found in any week");
      console.info("💡 This could mean the calendar has no available slots or the page structure changed");
    } else {
      console.info(`✅ Found ${Object.keys(allSlots).length} days with available booking slots`);
    }

    return allSlots;
  }

  private async getCurrentWeekSlots(page: any): Promise<Array<{ date: string; slots: string[] }>> {
    const weekSlots: Array<{ date: string; slots: string[] }> = [];
    
    // Wait for day buttons to be visible with multiple possible selectors
    const dayButtonSelectors = [
      'button:has-text("Monday")',
      'button:has-text("Tuesday")',
      'button:has-text("Wednesday")',
      'button:has-text("Thursday")',
      'button:has-text("Friday")',
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
    
    await page.waitForTimeout(500); // Increased from 100ms to 500ms

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
        continue;
      }
    }
    
    const enabledButtons = [];
    for (let i = 0; i < dayButtons.length; i++) {
      try {
        const button = dayButtons[i];
        const isEnabled = await button.isEnabled();
        const buttonText = await button.textContent();
        const isSelected = buttonText?.includes('is selected') || false;
        console.log(`📅 Button ${i + 1}: '${buttonText?.substring(0, 50)}...' (enabled: ${isEnabled}, selected: ${isSelected})`);
        if (isEnabled) {
          enabledButtons.push({ button, isSelected });
        }
      } catch (error) {
        console.log(`❌ Error checking button ${i + 1}: ${error}`);
        continue;
      }
    }
    
    console.log(`🚀 Processing ${enabledButtons.length} enabled day buttons...`);

    for (let i = 0; i < enabledButtons.length; i++) {
      try {
        const { button, isSelected } = enabledButtons[i];
        
        // Only click if not already selected
        if (!isSelected) {
          console.log(`🖱️ Clicking day button ${i + 1} (not selected)`);
          await button.click();
          await page.waitForTimeout(1000); // Wait for slots to load
        } else {
          console.log(`⏭️ Skipping day button ${i + 1} (already selected)`);
        }
        
        // Get the selected date information
        const dateSelectors = [
          'button:has-text("is selected")',
          '[data-test-id*="selected"]',
          '[data-id="selected-day-info"]'
        ];
        
        let dateText = "Unknown Date";
        for (const selector of dateSelectors) {
          try {
            const dateElement = await page.$(selector);
            if (dateElement) {
              const text = await dateElement.textContent();
              if (text) {
                dateText = text.replace('is selected', '').trim();
                break;
              }
            }
          } catch (error) {
            continue;
          }
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
        }
        
        await page.waitForTimeout(500); // Increased from 100ms to 500ms
      } catch (error) {
        console.log(`❌ Error processing button ${i + 1}: ${error}`);
        continue;
      }
    }

    return weekSlots;
  }

  private async navigateToNextWeek(page: any): Promise<boolean> {
    const nextWeekSelectors = [
      'button:has-text("Next Week")',
      '[data-test-id*="next"]',
      '[data-id="next-week-button"]'
    ];
    
    for (const selector of nextWeekSelectors) {
      try {
        const nextWeekButton = await page.$(selector);
        if (nextWeekButton && await nextWeekButton.isEnabled()) {
          console.log(`➡️ Clicking next week button using selector: ${selector}`);
          await nextWeekButton.click();
          await page.waitForTimeout(500);
          console.log("✅ Successfully clicked next week button");
          
          // Wait for calendar to update with multiple possible selectors
          const calendarSelectors = [
            'button:has-text("Monday")',
            'button:has-text("Tuesday")',
            'button:has-text("Wednesday")',
            '[data-test-id*="day"]',
            '[data-id="calendar-day-button"]'
          ];
          
          let calendarUpdated = false;
          for (const calSelector of calendarSelectors) {
            try {
              await page.waitForSelector(calSelector, { timeout: 500 });
              calendarUpdated = true;
              break;
            } catch (error) {
              continue;
            }
          }
          
          if (calendarUpdated) {
            console.log("✅ Successfully moved to next week");
          }
          return true;
        }
      } catch (error) {
        console.log(`❌ Next week selector failed: ${selector}`);
        continue;
      }
    }
    
    console.log("❌ Next week button is disabled or not found");
    return false;
  }
}
