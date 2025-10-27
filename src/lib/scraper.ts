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
          '--disable-dev-shm-usage'
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
          console.log("⏳ Waiting 5 seconds for calendar to fully load...");
          await page.waitForTimeout(5000);
          console.log("✅ Calendar should be fully loaded now");
      
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
    
    console.log("🚀 Starting comprehensive slot collection");
    console.log("🎯 Goal: Collect ALL available booking days (9+ days)");
    console.log("📋 Strategy: Emulate manual browser process - collect all days from current view, then navigate");

    // Simple approach: collect from Week 1, navigate to Week 2, collect from Week 2
    const maxAttempts = 3;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      console.log(`\n=====================================`);
      console.log(`=== COLLECTION ATTEMPT ${attempt}/${maxAttempts} ===`);
      console.log(`📊 Current total: ${Object.keys(allSlots).length} days`);
      
      // Stop if we have enough
      if (Object.keys(allSlots).length >= 9) {
        console.log(`🎯 Target reached! Stopping collection.`);
        break;
      }
      
      console.log(`⏳ Waiting for calendar to be ready...`);
      await page.waitForTimeout(1000); // Give calendar time to stabilize
      
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
          await page.waitForTimeout(1000);
          
          // Get time slots for this day
          const slots = await this.getTimeSlotsForCurrentDay(page);
          console.log(`📊 Got ${slots.length} slots for ${dateKey}`);
          
          if (slots.length > 0) {
            allSlots[dateKey] = { slots };
            newDaysAdded++;
            console.log(`✅ Added ${dateKey}: ${slots.length} slots (total days: ${Object.keys(allSlots).length})`);
          }
          
          // Stop if we have enough days
          if (Object.keys(allSlots).length >= 9) {
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
      if (Object.keys(allSlots).length >= 9 || newDaysAdded === 0) {
        console.log(`✅ Collection complete. Total days: ${Object.keys(allSlots).length}`);
        break;
      }
      
      // If we still don't have enough days, navigate to next week
      if (Object.keys(allSlots).length < 9) {
        console.log(`🔄 Only have ${Object.keys(allSlots).length} days (target: 9). Navigating to next week...`);
        
        const navSuccess = await this.navigateToNextWeek(page);
        console.log(`🧭 Navigation result: ${navSuccess}`);
        
        if (navSuccess) {
          console.log(`⏳ Waiting 5 seconds for calendar to update...`);
          await page.waitForTimeout(5000);
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
    
    // Wait a moment for calendar to stabilize
    await page.waitForTimeout(500);
    
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
          
          enabledButtons.push({ button, dateKey: cleanDateKey });
          console.log(`✅ Added enabled button ${i + 1}: ${cleanDateKey}`);
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
    
    return timeSlots.filter(slot => slot).map(slot => slot.trim());
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
        await page.waitForTimeout(1000); // Wait for slots to load
        
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
        
        await page.waitForTimeout(500); // Wait between button clicks
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
        
        // Wait longer for calendar to fully update with new dates
        await page.waitForTimeout(3000); // Increased to 3 seconds
        console.log("⏳ Completed 3-second wait");
        
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
          await page.waitForTimeout(1000); // Additional wait for calendar to stabilize
          return true;
        } else {
          console.log("⚠️ Calendar update verification failed - but continuing anyway");
          await page.waitForTimeout(1000);
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

