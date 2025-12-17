import { NextRequest, NextResponse } from 'next/server';
import { SecurityMiddleware, ValidationSchemas } from '@/lib/security-middleware';
import { concurrencyManager } from '@/lib/concurrency-manager';
import { ErrorHandler, ErrorCode, SuccessCode } from '@/lib/error-handler';
import { browserInstanceManager } from '@/lib/browser-instance-manager';
import { ChiliPiperScraper } from '@/lib/scraper';
import { browserPool } from '@/lib/browser-pool';

const security = new SecurityMiddleware();

/**
 * Parse date/time string like "November 13, 2025 at 1:25 PM CST"
 * Returns { date: "2025-11-13", time: "1:25 PM" }
 */
function parseDateTime(dateTimeString: string): { date: string; time: string } | null {
  try {
    // Remove timezone info (CST, EST, etc.) - we don't need it since browser is in CST
    const cleaned = dateTimeString.replace(/\s+(CST|EST|PST|CDT|EDT|PDT|UTC|GMT)[\s,]*$/i, '').trim();
    
    // Pattern: "November 13, 2025 at 1:25 PM" or "November 13, 2025 at 1:25PM"
    const match = cleaned.match(/^([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})\s+at\s+(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    
    if (!match) {
      // Try alternative format without "at"
      const altMatch = cleaned.match(/^([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
      if (altMatch) {
        const [, monthName, day, year, hour, minute, ampm] = altMatch;
        const monthMap: Record<string, number> = {
          'january': 1, 'jan': 1, 'february': 2, 'feb': 2,
          'march': 3, 'mar': 3, 'april': 4, 'apr': 4,
          'may': 5, 'june': 6, 'jun': 6, 'july': 7, 'jul': 7,
          'august': 8, 'aug': 8, 'september': 9, 'sep': 9, 'sept': 9,
          'october': 10, 'oct': 10, 'november': 11, 'nov': 11,
          'december': 12, 'dec': 12
        };
        
        const month = monthMap[monthName.toLowerCase()];
        if (!month) return null;
        
        const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const time = `${hour}:${minute} ${ampm.toUpperCase()}`;
        return { date, time };
      }
      return null;
    }
    
    const [, monthName, day, year, hour, minute, ampm] = match;
    const monthMap: Record<string, number> = {
      'january': 1, 'jan': 1, 'february': 2, 'feb': 2,
      'march': 3, 'mar': 3, 'april': 4, 'apr': 4,
      'may': 5, 'june': 6, 'jun': 6, 'july': 7, 'jul': 7,
      'august': 8, 'aug': 8, 'september': 9, 'sep': 9, 'sept': 9,
      'october': 10, 'oct': 10, 'november': 11, 'nov': 11,
      'december': 12, 'dec': 12
    };
    
    const month = monthMap[monthName.toLowerCase()];
    if (!month) return null;
    
    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const time = `${hour}:${minute} ${ampm.toUpperCase()}`;
    return { date, time };
  } catch (error) {
    console.error('Error parsing date/time:', error);
    return null;
  }
}

/**
 * Format time for slot button data-test-id
 * "1:25 PM" -> "1:25PM" (no space, uppercase AM/PM)
 */
function formatTimeForSlot(time: string): string {
  return time.replace(/\s+/g, '').toUpperCase();
}

/**
 * Build parameterized URL (helper function)
 */
function buildParameterizedUrl(
  firstName: string,
  lastName: string,
  email: string,
  phone: string,
  baseUrl: string,
  phoneFieldId: string
): string {
  const urlParts = new URL(baseUrl);
  const params = new URLSearchParams({
    PersonFirstName: firstName,
    PersonLastName: lastName,
    PersonEmail: email,
  });

  const phoneValue = phone.startsWith('+') ? phone : `+${phone}`;
  params.append(phoneFieldId, phoneValue);

  const existingParams = new URLSearchParams(urlParts.search);
  for (const [key, value] of Array.from(params.entries())) {
    existingParams.set(key, value);
  }

  return `${urlParts.origin}${urlParts.pathname}?${existingParams.toString()}`;
}

/**
 * Create a new browser instance and navigate to calendar for an email
 */
async function createInstanceForEmail(
  email: string,
  firstName: string,
  lastName: string,
  phone: string
): Promise<{ browser: any; context: any; page: any } | null> {
  try {
    const baseUrl = process.env.CHILI_PIPER_FORM_URL || "https://cincpro.chilipiper.com/concierge-router/link/lp-request-a-demo-agent-advice";
    const phoneFieldId = process.env.CHILI_PIPER_PHONE_FIELD_ID || 'aa1e0f82-816d-478f-bf04-64a447af86b3';
    const targetUrl = buildParameterizedUrl(firstName, lastName, email, phone, baseUrl, phoneFieldId);
    
    const browser = await browserPool.getBrowser();
    const context = await browser.newContext({
      timezoneId: 'America/Chicago',
    });
    const page = await context.newPage();
    
    page.setDefaultNavigationTimeout(10000);
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
    
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
    
    // Click submit button
    const submitSelectors = [
      'button[type="submit"]',
      'input[type="submit"]',
      'button:has-text("Submit")',
      'button:has-text("Continue")',
      '[data-test-id="GuestForm-submit-button"]',
    ];
    
    for (const selector of submitSelectors) {
      try {
        await page.click(selector, { timeout: 2000 });
        break;
      } catch {}
    }
    
    // Click schedule button if present
    const scheduleSelectors = [
      '[data-test-id="ConciergeLiveBox-book"]',
      '[data-id="concierge-live-book"]',
      'button:has-text("Schedule a meeting")',
      'button:has-text("Schedule")',
    ];
    
    for (const selector of scheduleSelectors) {
      try {
        await page.click(selector, { timeout: 2000 });
        break;
      } catch {}
    }
    
    // Wait for calendar
    await page.waitForSelector('[data-id="calendar-day-button"], button[data-test-id^="days:"]', { timeout: 10000 });
    
    return { browser, context, page };
  } catch (error) {
    console.error('Error creating instance:', error);
    return null;
  }
}

export async function POST(request: NextRequest) {
  const requestStartTime = Date.now();
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    // Apply security middleware
    const securityResult = await security.secureRequest(request, {
      requireAuth: true,
      rateLimit: { maxRequests: 100, windowMs: 15 * 60 * 1000 }, // 100 requests per 15 minutes
      inputSchema: {
        type: 'object',
        required: ['email', 'dateTime'],
        properties: {
          email: { type: 'string', format: 'email' },
          dateTime: { type: 'string' },
          firstName: { type: 'string' },
          lastName: { type: 'string' },
          phone: { type: 'string' },
        },
      },
      allowedMethods: ['POST'],
    });

    if (!securityResult.allowed) {
      const responseTime = Date.now() - requestStartTime;
      const errorResponse = ErrorHandler.createError(
        ErrorCode.UNAUTHORIZED,
        'Request blocked by security middleware',
        securityResult.response?.statusText || 'Authentication or validation failed',
        undefined,
        requestId,
        responseTime
      );
      const response = NextResponse.json(
        errorResponse,
        { status: ErrorHandler.getStatusCode(errorResponse.code) }
      );
      return security.addSecurityHeaders(response);
    }

    const body = securityResult.sanitizedData!;
    const { email, dateTime, firstName, lastName, phone } = body;

    // Parse date/time
    const parsed = parseDateTime(dateTime);
    if (!parsed) {
      const responseTime = Date.now() - requestStartTime;
      const errorResponse = ErrorHandler.createError(
        ErrorCode.VALIDATION_ERROR,
        'Invalid date/time format',
        'Date/time must be in format like "November 13, 2025 at 1:25 PM CST"',
        { providedValue: dateTime },
        requestId,
        responseTime
      );
      const response = NextResponse.json(
        errorResponse,
        { status: 400 }
      );
      return security.addSecurityHeaders(response);
    }

    const { date, time } = parsed;
    const formattedTime = formatTimeForSlot(time);

    // Run booking through concurrency manager
    const result = await concurrencyManager.execute(async () => {
      const scraper = new ChiliPiperScraper();
      
      // Try to get existing instance
      let instance = scraper.getExistingInstance(email);
      let browser: any = null;
      let context: any = null;
      let page: any = null;
      
      if (!instance) {
        // Create new instance on-demand
        console.log(`📝 No existing instance for ${email}, creating new one...`);
        if (!firstName || !lastName || !phone) {
          throw new Error('firstName, lastName, and phone are required when creating a new instance');
        }
        const newInstance = await createInstanceForEmail(email, firstName, lastName, phone);
        if (!newInstance) {
          throw new Error('Failed to create browser instance');
        }
        browser = newInstance.browser;
        context = newInstance.context;
        page = newInstance.page;
        
        // Register the instance
        await browserInstanceManager.registerInstance(email, browser, context, page);
      } else {
        browser = instance.browser;
        context = instance.context;
        page = instance.page;
        console.log(`✅ Using existing instance for ${email}`);
      }

      // Verify page is still valid
      if (page.isClosed()) {
        throw new Error('Browser page was closed');
      }

      // Ensure we're on calendar view
      try {
        await page.waitForSelector('[data-id="calendar-day-button"], button[data-test-id^="days:"]', { timeout: 5000 });
      } catch {
        throw new Error('Calendar not found on page');
      }

      // Find and click the day button
      const dayButtons = await page.$$('[data-id="calendar-day-button"], button[data-test-id^="days:"]');
      let dayClicked = false;
      
      for (const button of dayButtons) {
        try {
          const buttonText = await button.textContent();
          if (!buttonText) continue;
          
          // Check if this button matches our target date
          // Button text format: "Monday 13th November Mon13Nov" or similar
          const dateMatch = buttonText.match(/(\d{1,2})(?:st|nd|rd|th)/i);
          if (!dateMatch) continue;
          
          const day = parseInt(dateMatch[1], 10);
          const targetDay = parseInt(date.split('-')[2], 10);
          
          // Also check month
          const monthNames = ['january', 'february', 'march', 'april', 'may', 'june',
                             'july', 'august', 'september', 'october', 'november', 'december'];
          const targetMonth = parseInt(date.split('-')[1], 10);
          const targetMonthName = monthNames[targetMonth - 1];
          
          const buttonTextLower = buttonText.toLowerCase();
          const hasTargetMonth = buttonTextLower.includes(targetMonthName) || 
                                buttonTextLower.includes(targetMonthName.substring(0, 3));
          
          if (day === targetDay && hasTargetMonth) {
            await button.click();
            dayClicked = true;
            console.log(`✅ Clicked day button for ${date}`);
            break;
          }
        } catch (error) {
          continue;
        }
      }

      if (!dayClicked) {
        throw new Error(`Day button not found for date ${date}`);
      }

      // Wait a moment for slots to load
      await page.waitForTimeout(500);

      // Find and click the time slot button
      const slotTimeId = `slot-${formattedTime}`;
      let slotClicked = false;
      
      // Try exact data-test-id match first
      try {
        const slotButton = await page.$(`button[data-test-id="${slotTimeId}"]`);
        if (slotButton) {
          await slotButton.click();
          slotClicked = true;
          console.log(`✅ Clicked time slot button: ${slotTimeId}`);
        }
      } catch {}

      // Fallback: try by text content
      if (!slotClicked) {
        const slotButtons = await page.$$('[data-id="calendar-slot"], button[data-test-id^="slot-"]');
        for (const button of slotButtons) {
          try {
            const buttonText = await button.textContent();
            if (!buttonText) continue;
            
            // Normalize time for comparison
            const normalizedButtonTime = buttonText.trim().replace(/\s+/g, '').toUpperCase();
            const normalizedTargetTime = formattedTime;
            
            if (normalizedButtonTime === normalizedTargetTime || 
                buttonText.trim().toUpperCase() === time.toUpperCase()) {
              await button.click();
              slotClicked = true;
              console.log(`✅ Clicked time slot button by text: ${buttonText}`);
              break;
            }
          } catch (error) {
            continue;
          }
        }
      }

      if (!slotClicked) {
        throw new Error(`Time slot button not found for time ${time} (formatted: ${slotTimeId})`);
      }

      // Wait a moment to ensure booking is processed
      await page.waitForTimeout(1000);

      // Close instance after successful booking
      await browserInstanceManager.cleanupInstance(email);

      return { success: true, date, time };
    }, 30000); // 30 second timeout for booking

    const responseTime = Date.now() - requestStartTime;
    const successResponse = ErrorHandler.createSuccess(
      SuccessCode.OPERATION_SUCCESS,
      {
        message: 'Slot booked successfully',
        date: result.date,
        time: result.time,
      },
      requestId,
      responseTime
    );

    const response = NextResponse.json(
      successResponse,
      { status: ErrorHandler.getSuccessStatusCode() }
    );
    return security.addSecurityHeaders(response);

  } catch (error: any) {
    console.error('❌ Booking API error:', error);

    const responseTime = Date.now() - requestStartTime;

    // Handle queue timeout errors
    if (error.message && error.message.includes('timeout')) {
      const errorResponse = ErrorHandler.createError(
        ErrorCode.REQUEST_TIMEOUT,
        'Booking timed out',
        'Request timed out while waiting in queue or during execution. Please try again.',
        { queueStatus: concurrencyManager.getStatus(), originalError: error.message },
        requestId,
        responseTime
      );
      const response = NextResponse.json(
        errorResponse,
        { status: 504 }
      );
      return security.addSecurityHeaders(response);
    }

    // Handle queue full errors
    if (error.message && error.message.includes('queue is full')) {
      const errorResponse = ErrorHandler.createError(
        ErrorCode.QUEUE_FULL,
        'Request queue is full',
        'The system is currently processing too many requests. Please try again later.',
        { queueStatus: concurrencyManager.getStatus(), originalError: error.message },
        requestId,
        responseTime
      );
      const response = NextResponse.json(
        errorResponse,
        { status: 503 }
      );
      return security.addSecurityHeaders(response);
    }

    // Generic error
    const errorResponse = ErrorHandler.parseError(error, requestId, responseTime);
    const response = NextResponse.json(
      errorResponse,
      { status: ErrorHandler.getStatusCode(errorResponse.code) }
    );

    return security.addSecurityHeaders(response);
  }
}

export async function OPTIONS(request: NextRequest) {
  const response = new NextResponse(null, { status: 200 });
  return security.configureCORS(response);
}

