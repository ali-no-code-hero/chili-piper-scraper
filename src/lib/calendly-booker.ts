import { Page } from 'playwright';
import { browserInstanceManager } from './browser-instance-manager';
import { browserPool } from './browser-pool';

const CALENDLY_BASE_URL = 'https://calendly.com/agentfire-demo/30-minute-demo';

/** Label-based keys for answers; maps to question_0 .. question_9 */
export const CALENDLY_QUESTION_LABEL_TO_NAME: Record<string, string> = {
  'Phone Number': 'question_0',
  'To help us prepare for your demo, please share a bit about yourself and what you\'re looking for with an AgentFire website.': 'question_1',
  'Which of the following best describes you:': 'question_2',
  'Which of the following options best describe your goals with an AgentFire website? (Please select all that apply)': 'question_3',
  'Current Website URL:': 'question_4',
  'What best describes the type of website design you\'re looking for?': 'question_5',
  'MLS Board(s) you belong to:': 'question_6',
  'How\'d you hear about AgentFire? (i.e. Received an Email, Google Search, Facebook Ad, Instagram Ad, Partner / Referral, etc.)': 'question_7',
  'If something comes up and you need to reschedule, will you let us know ahead of your demo so that we can free up that time for someone else?': 'question_8',
  'Your Location': 'question_9',
};

/** Resolve answer key (label or question_N) to form field name */
export function resolveAnswerKey(key: string): string {
  if (/^question_\d+$/.test(key)) return key;
  const resolved = CALENDLY_QUESTION_LABEL_TO_NAME[key];
  if (resolved) return resolved;
  return key;
}

/**
 * Default form answers for all non-dynamic fields (same selections every time).
 * Dynamic fields: First Name, Last Name, Email, Phone Number (question_0).
 */
export const DEFAULT_CALENDLY_ANSWERS: Record<string, string | string[]> = {
  question_1: 'AgentAdvice booking',
  question_2: 'Agent',
  question_3: ['Build and strengthen my online brand'],
  question_4: 'www.test.com',
  question_5: "A 'themed' website design that can be launched quickly",
  question_6: 'N/A',
  question_7: 'AGENTADVICE',
  question_8: ['Yes of course! '],
  question_9: 'United States',
};

export interface BookCalendlySlotOptions {
  date: string; // YYYY-MM-DD
  time: string; // e.g. "9:30am" or "9:30 AM"
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  /** Optional. If omitted, defaults are used for all questions; phone from options. */
  answers?: Record<string, string | string[]>;
}

export interface BookCalendlySlotResult {
  success: boolean;
  date?: string;
  time?: string;
  error?: string;
}

/**
 * Normalize time to Calendly format for data-start-time (e.g. "9:30am", "12:00pm").
 */
export function normalizeTimeForCalendly(time: string): string {
  const cleaned = time.trim().replace(/\s+/g, '').toLowerCase();
  const match = cleaned.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/);
  if (match) {
    const [, hour, min, ampm] = match;
    return `${hour}:${min}${ampm}`;
  }
  if (/^\d{1,2}:\d{2}(am|pm)$/.test(cleaned)) return cleaned;
  return time.replace(/\s+/g, '').toLowerCase();
}

const LOG_PREFIX = '[Calendly]';

/**
 * Build query params for Calendly URL prefill: first_name, last_name, email, a1=phone, a2..a10.
 * Note: Calendly does not prefill radio/checkbox/combobox from URL (a3,a4,a6,a9,a10); we always
 * fill question_2, question_3, question_5, question_8, question_9 manually in fillFormAndSubmit.
 */
function buildCalendlyPrefillParams(
  opts: BookCalendlySlotOptions,
  normalizedAnswers: Record<string, string | string[]>
): string {
  const params = new URLSearchParams();
  params.set('first_name', opts.firstName);
  params.set('last_name', opts.lastName);
  params.set('email', opts.email);
  const a1 = opts.phone ?? (normalizedAnswers['question_0'] as string | undefined);
  if (a1 != null && a1 !== '') {
    params.set('a1', typeof a1 === 'string' ? a1 : (a1 as string[])[0] ?? '');
  }
  const q1 = normalizedAnswers['question_1'];
  if (q1 != null) params.set('a2', Array.isArray(q1) ? q1[0] ?? '' : q1);
  params.set('a3', '1'); // question_2 (radio) – URL not applied by Calendly; filled in form
  params.set('a4', '1'); // question_3 (checkboxes) – URL not applied; filled in form
  const q4 = normalizedAnswers['question_4'];
  if (q4 != null) params.set('a5', Array.isArray(q4) ? q4[0] ?? '' : q4);
  params.set('a6', '1'); // question_5 (radio) – URL not applied; filled in form
  const q6 = normalizedAnswers['question_6'];
  if (q6 != null) params.set('a7', Array.isArray(q6) ? q6[0] ?? '' : q6);
  const q7 = normalizedAnswers['question_7'];
  if (q7 != null) params.set('a8', Array.isArray(q7) ? q7[0] ?? '' : q7);
  params.set('a9', '1'); // question_8 (checkbox) – URL not applied; filled in form
  params.set('a10', '1'); // question_9 (location) – URL not applied; filled in form
  return params.toString();
}

/** Build direct Calendly URL to the booking form for a given date/time (skips calendar and time picker). Includes prefill params. */
function buildDirectCalendlyUrl(
  date: string,
  normalizedTime: string,
  opts: BookCalendlySlotOptions,
  normalizedAnswers: Record<string, string | string[]>
): string {
  const match = normalizedTime.match(/^(\d{1,2}):(\d{2})(am|pm)$/);
  let hour = 0;
  let min = 0;
  if (match) {
    hour = parseInt(match[1], 10);
    const isPm = match[3] === 'pm';
    if (isPm && hour !== 12) hour += 12;
    if (!isPm && hour === 12) hour = 0;
    min = parseInt(match[2], 10);
  }
  const hourStr = String(hour).padStart(2, '0');
  const minStr = String(min).padStart(2, '0');
  const tzOffset = '-06:00'; // America/Chicago (CST)
  const isoDateTime = `${date}T${hourStr}:${minStr}:00${tzOffset}`;
  const month = date.slice(0, 7);
  const baseQuery = `month=${month}&date=${date}`;
  const prefill = buildCalendlyPrefillParams(opts, normalizedAnswers);
  return `${CALENDLY_BASE_URL}/${isoDateTime}?${baseQuery}&${prefill}`;
}

async function ensurePageForEmail(
  email: string,
  firstName: string,
  lastName: string,
  calendlyUrl: string
): Promise<{ page: Page; owned: boolean }> {
  const instance = browserInstanceManager.getInstance(email);
  if (instance && !instance.page.isClosed()) {
    console.log(`${LOG_PREFIX} Reusing existing browser page for ${email}`);
    return { page: instance.page, owned: false };
  }
  console.log(`${LOG_PREFIX} No valid instance for ${email}; creating new browser page`);

  let browser: any = null;
  let context: any = null;
  let page: any = null;
  let releaseLock: (() => void) | null = null;

  browser = await browserPool.getBrowser();
  releaseLock = await browserPool.acquireContextLock(browser);

  let retries = 3;
  while (retries > 0) {
    try {
      if (!browser.isConnected()) {
        if (releaseLock) releaseLock();
        browserPool.releaseBrowser(browser);
        browser = await browserPool.getBrowser();
        releaseLock = await browserPool.acquireContextLock(browser);
      }
      context = await browser.newContext({ timezoneId: 'America/Chicago' });
      page = await context.newPage();
      break;
    } catch (error: any) {
      retries--;
      if (error.message?.includes('has been closed') && retries > 0) {
        if (releaseLock) releaseLock();
        browserPool.releaseBrowser(browser);
        browser = await browserPool.getBrowser();
        releaseLock = await browserPool.acquireContextLock(browser);
        await new Promise((r) => setTimeout(r, 100));
      } else {
        if (releaseLock) releaseLock();
        browserPool.releaseBrowser(browser);
        throw error;
      }
    }
  }

  if (releaseLock) {
    releaseLock();
  }
  if (!page) {
    if (browser) browserPool.releaseBrowser(browser);
    throw new Error('Failed to create browser context');
  }

  page.setDefaultNavigationTimeout(15000);
  await page.route('**/*', (route: any) => {
    const url = route.request().url();
    const rt = route.request().resourceType();
    if (
      rt === 'image' ||
      rt === 'stylesheet' ||
      rt === 'font' ||
      rt === 'media' ||
      url.includes('google-analytics') ||
      url.includes('googletagmanager') ||
      url.includes('facebook.net') ||
      url.includes('doubleclick') ||
      url.includes('ads') ||
      url.includes('tracking') ||
      url.includes('pixel') ||
      url.includes('beacon')
    ) {
      route.abort();
      return;
    }
    route.continue();
  });

  console.log(`${LOG_PREFIX} Navigating to ${calendlyUrl}`);
  await page.goto(calendlyUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
  const finalUrl = page.url();
  console.log(`${LOG_PREFIX} Page loaded: ${finalUrl}`);
  await browserInstanceManager.registerInstance(email, browser, context, page);
  return { page, owned: true };
}

async function dismissCookieConsent(page: Page): Promise<void> {
  try {
    const acceptBtn = await page.$('#accept-recommended-btn-handler');
    if (acceptBtn) {
      console.log(`${LOG_PREFIX} Dismissing cookie consent (Allow All)`);
      await acceptBtn.click({ timeout: 2000 });
      await page.waitForTimeout(500);
      return;
    }
    // Compact banner may show "I understand" instead of "Allow All"
    try {
      const byText = page.getByRole('button', { name: /I understand/i }).first();
      await byText.click({ timeout: 2000 });
      console.log(`${LOG_PREFIX} Dismissing cookie consent (I understand)`);
      await page.waitForTimeout(500);
    } catch {
      console.log(`${LOG_PREFIX} No cookie consent banner found`);
    }
  } catch {
    console.log(`${LOG_PREFIX} Cookie consent dismiss skipped (no button or error)`);
  }
}

async function selectDay(page: Page, date: string): Promise<void> {
  const [year, monthStr, dayStr] = date.split('-');
  const targetDay = parseInt(dayStr, 10);
  const targetMonth = parseInt(monthStr, 10);
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const targetMonthName = monthNames[targetMonth - 1];

  console.log(`${LOG_PREFIX} Selecting day: ${date} (${targetMonthName} ${targetDay}, ${year})`);
  await page.waitForSelector('[data-testid="calendar"]', { timeout: 10000 });
  console.log(`${LOG_PREFIX} Calendar visible`);
  await page.waitForTimeout(500);

  for (let attempt = 0; attempt < 12; attempt++) {
    const titleEl = await page.$('[data-testid="title"]');
    const currentTitle = titleEl ? (await titleEl.textContent())?.trim() || '' : '';
    if (currentTitle.includes(targetMonthName) && currentTitle.includes(year)) {
      console.log(`${LOG_PREFIX} Calendar month matches: "${currentTitle}"`);
      break;
    }
    const nextBtn = await page.$('button[aria-label="Go to next month"]');
    if (!nextBtn) {
      const prevBtn = await page.$('button[aria-label="Go to previous month"]');
      if (prevBtn && targetMonth < new Date().getMonth() + 1) {
        await prevBtn.click();
        await page.waitForTimeout(300);
        continue;
      }
      throw new Error(`Month ${targetMonthName} ${year} not found on calendar`);
    }
    const disabled = await nextBtn.getAttribute('disabled');
    if (disabled !== null && disabled !== undefined) {
      throw new Error(`Day ${date} not available (month navigation disabled)`);
    }
    await nextBtn.click();
    await page.waitForTimeout(300);
  }

  // In headless/server environments (e.g. Railway), Calendly often shows all days as "No times available"
  // (disabled), so no element has the bookable class. We first try bookable buttons, then fall back to
  // finding the exact day by aria-label ("MonthName Day -") or by button text, and force-click so the
  // time panel may still load. If the time panel stays empty, Calendly may be withholding slots in that context.
  let dayButton: any = null;
  const bookableSelector = 'tbody[data-testid="calendar-table"] button.booking-kit_button-bookable_80ba95eb';
  const dayButtons = await page.$$(bookableSelector);
  console.log(`${LOG_PREFIX} Found ${dayButtons.length} bookable day button(s)`);
  for (const btn of dayButtons) {
    const text = (await btn.textContent())?.trim() || '';
    const dayNum = text.replace(/\D/g, '') || text;
    if (dayNum === String(targetDay)) {
      dayButton = btn;
      break;
    }
  }
  if (!dayButton) {
    // Fallback: in headless/server environments Calendly may show all days as "No times available"
    // (disabled). Find the exact day by aria-label. Use "February 5 -" pattern to avoid matching 15/25.
    console.log(`${LOG_PREFIX} No bookable day match; trying fallback by aria-label (${targetMonthName}, ${targetDay})`);
    const exactAriaPattern = `${targetMonthName} ${targetDay} -`;
    const byAria = await page.$(
      `tbody[data-testid="calendar-table"] button[aria-label*="${targetMonthName} ${targetDay} -"]`
    );
    if (byAria) {
      dayButton = byAria;
      console.log(`${LOG_PREFIX} Using fallback day button (aria-label contains "${exactAriaPattern}")`);
    }
    // Second fallback: match by button text (exact day number) in case aria-label format differs
    if (!dayButton) {
      const allDayButtons = await page.$$('tbody[data-testid="calendar-table"] button[aria-label]');
      for (const btn of allDayButtons) {
        const text = (await btn.textContent())?.trim().replace(/\D/g, '') || '';
        if (text === String(targetDay)) {
          dayButton = btn;
          console.log(`${LOG_PREFIX} Using fallback day button (matched by day number text)`);
          break;
        }
      }
    }
  }
  if (!dayButton) {
    const allDays = await page.$$eval(
      'tbody[data-testid="calendar-table"] button[aria-label]',
      (buttons: Element[]) =>
        (buttons as HTMLButtonElement[]).map((b) => b.getAttribute('aria-label') || b.textContent?.trim())
    );
    throw new Error(
      `Bookable day ${targetDay} not found for ${targetMonthName} ${year}. Available: ${allDays?.slice(0, 5).join(', ') || 'none'}`
    );
  }
  // Click using a locator so the element is re-resolved at click time (avoids "Element is not attached to the DOM"
  // when the calendar re-renders between finding the button and clicking).
  const dayClickSelector = `tbody[data-testid="calendar-table"] button[aria-label*="${targetMonthName} ${targetDay} -"]`;
  console.log(`${LOG_PREFIX} Clicking day ${targetDay}`);
  await page.locator(dayClickSelector).first().click({ force: true });
  // Allow time for slot list to load after day selection
  await page.waitForTimeout(1200);
  console.log(`${LOG_PREFIX} Day clicked; waiting for time panel`);
}

/** Normalize for comparison: "6:00am" and "6:00 am" both become "6:00am" */
function normalizeTimeForMatch(t: string): string {
  return (t || '').trim().toLowerCase().replace(/\s+/g, '');
}

async function selectTimeSlot(page: Page, normalizedTime: string): Promise<void> {
  console.log(`${LOG_PREFIX} Waiting for time panel (spotpicker-times-list)...`);
  // Wait for time panel container (attached is enough; it may be empty if no slots)
  await page.waitForSelector('[data-component="spotpicker-times-list"]', { timeout: 20000, state: 'attached' }).catch(() => {
    throw new Error(
      'Time panel did not load for the selected day. Calendly may show no availability in this context (server/headless). Try a different date or run from a client with a browser.'
    );
  });
  console.log(`${LOG_PREFIX} Time panel attached; waiting for slot buttons...`);
  // Wait until at least one time button is present (slots loaded); allow 10s after panel appears
  const hasSlots = await page.waitForSelector('button[data-container="time-button"]', { timeout: 10000, state: 'visible' }).catch(() => null);
  if (!hasSlots) {
    const count = await page.$$eval('button[data-container="time-button"]', (nodes) => nodes.length).catch(() => 0);
    console.log(`${LOG_PREFIX} Time buttons visible: ${count}`);
    if (count === 0) {
      throw new Error(
        'No time slots available for the selected day. Calendly may show no availability in this context (server/headless or region). Try a different date.'
      );
    }
  } else {
    const count = await page.$$eval('button[data-container="time-button"]', (nodes) => nodes.length).catch(() => 0);
    console.log(`${LOG_PREFIX} Found ${count} time slot(s); looking for "${normalizedTime}"`);
  }
  await page.waitForTimeout(500);

  const targetNorm = normalizeTimeForMatch(normalizedTime);
  const slotButton = await page.$(
    `button[data-container="time-button"][data-start-time="${normalizedTime}"]`
  );
  if (slotButton) {
    console.log(`${LOG_PREFIX} Clicking time slot: ${normalizedTime}`);
    await slotButton.click();
    await page.waitForTimeout(500);
    return;
  }
  const timeButtons = await page.$$('button[data-container="time-button"]');
  const displayTime = normalizedTime.replace(/(\d+):(\d+)(am|pm)/i, '$1:$2 $3');
  for (const btn of timeButtons) {
    const startTime = await btn.getAttribute('data-start-time');
    const text = (await btn.textContent())?.trim() || '';
    const startNorm = normalizeTimeForMatch(startTime || '');
    const textNorm = normalizeTimeForMatch(text || '');
    if (
      startNorm === targetNorm ||
      textNorm === targetNorm ||
      startTime === normalizedTime ||
      text === displayTime
    ) {
      console.log(`${LOG_PREFIX} Clicking time slot (matched): ${startTime || text}`);
      await btn.click();
      await page.waitForTimeout(500);
      return;
    }
  }
  const available = await page.$$eval(
    'button[data-container="time-button"]',
    (nodes: Element[]) =>
      (nodes as HTMLElement[]).map((n) => n.getAttribute('data-start-time') || n.textContent?.trim() || '').filter(Boolean).slice(0, 10)
  );
  const count = await page.$$eval('button[data-container="time-button"]', (nodes) => nodes.length);
  throw new Error(
    `Time slot "${normalizedTime}" not found. Buttons found: ${count}. Available (sample): ${available.join(', ') || 'none'}`
  );
}

async function clickNextButton(page: Page, normalizedTime: string): Promise<void> {
  console.log(`${LOG_PREFIX} Looking for Next button...`);
  const nextBtn = await page.$(`button[aria-label="Next ${normalizedTime}"]`);
  if (nextBtn) {
    console.log(`${LOG_PREFIX} Clicking Next (aria-label match)`);
    await nextBtn.click();
    await page.waitForTimeout(800);
    return;
  }
  const confirmBtn = await page.$('button.booking-kit_confirm-button-selected_87095647');
  if (confirmBtn) {
    console.log(`${LOG_PREFIX} Clicking Next (confirm button)`);
    await confirmBtn.click();
    await page.waitForTimeout(800);
    return;
  }
  const allButtons = await page.$$('button');
  for (const btn of allButtons) {
    const text = (await btn.textContent())?.trim() || '';
    if (text === 'Next') {
      console.log(`${LOG_PREFIX} Clicking Next (text match)`);
      await btn.click();
      await page.waitForTimeout(800);
      return;
    }
  }
  throw new Error('Next button not found after selecting time slot');
}

async function fillFormAndSubmit(
  page: Page,
  opts: BookCalendlySlotOptions,
  normalizedAnswers: Record<string, string | string[]>
): Promise<void> {
  console.log(`${LOG_PREFIX} Waiting for questionnaire form...`);
  await page.waitForSelector('input[name="first_name"]', { timeout: 10000 });
  console.log(`${LOG_PREFIX} Form visible; filling required and optional fields`);
  await page.waitForTimeout(300);

  const logFill = (field: string, value: string | string[], ok: boolean, detail?: string) => {
    const v = Array.isArray(value) ? value.join(', ') : value;
    const status = ok ? 'filled' : 'MISSING';
    console.log(`${LOG_PREFIX} Form field ${field}: ${status} ${detail || ''} value="${(v || '').slice(0, 50)}${(v && v.length > 50 ? '...' : '')}"`);
  };

  await page.fill('input[name="first_name"]', opts.firstName);
  logFill('first_name', opts.firstName, true);
  await page.fill('input[name="last_name"]', opts.lastName);
  logFill('last_name', opts.lastName, true);
  try {
    await page.fill('input[name="email"], #email_input', opts.email);
    logFill('email', opts.email, true);
  } catch {
    logFill('email', opts.email, false, '(selector not found or error)');
  }

  // Calendly does not prefill radio/checkbox/combobox from URL; we always fill them here.
  const scrollIntoView = async (el: import('playwright-core').ElementHandle<SVGElement | HTMLElement> | null) => {
    if (el) await el.evaluate((e: HTMLElement) => e.scrollIntoView({ block: 'nearest', behavior: 'instant' }));
  };

  for (const [fieldName, value] of Object.entries(normalizedAnswers)) {
    const raw = value;
    const isArray = Array.isArray(raw);
    const values = isArray ? (raw as string[]) : [raw as string];

    if (fieldName === 'question_0') {
      const selector = 'input[name="question_0"]';
      const el = await page.$(selector);
      if (el) {
        await el.fill(values[0] || '');
        logFill(fieldName, values[0] || '', true);
      } else {
        logFill(fieldName, values[0] || '', false, '(input not found)');
      }
      continue;
    }
    if (fieldName === 'question_1') {
      const el = await page.$('textarea[name="question_1"]');
      if (el) {
        await el.fill(values[0] || '');
        logFill(fieldName, values[0] || '', true);
      } else {
        logFill(fieldName, values[0] || '', false, '(textarea not found)');
      }
      continue;
    }
    if (fieldName === 'question_2') {
      const radio = await page.$(`input[name="question_2"][type="radio"][value="${values[0]}"]`);
      if (radio) {
        await scrollIntoView(radio);
        await radio.click();
        logFill(fieldName, values[0] || '', true, '(radio clicked)');
      } else {
        const byLabel = await page.$(`[data-testid="${values[0]}"]`);
        if (byLabel) {
          await scrollIntoView(byLabel);
          await byLabel.click();
          logFill(fieldName, values[0] || '', true, '(by testid)');
        } else {
          const firstRadio = await page.$('input[name="question_2"][type="radio"]');
          if (firstRadio) {
            await scrollIntoView(firstRadio);
            await firstRadio.click();
            logFill(fieldName, values[0] || '', true, '(first radio selected)');
          } else {
            logFill(fieldName, values[0] || '', false, '(no radios found)');
          }
        }
      }
      continue;
    }
    if (fieldName === 'question_3') {
      let anyFilled = false;
      for (const v of values) {
        if (!v) continue;
        if (v === 'Other' || v.toLowerCase().includes('other')) {
          const otherInput = await page.$('input[name="question_3"][placeholder="Other"]');
          if (otherInput) await otherInput.fill(values[values.length - 1] || v);
          const otherCheckbox = await page.$('input[name="question_3"][aria-label="Other"]');
          if (otherCheckbox && !(await otherCheckbox.isChecked())) await otherCheckbox.click();
          anyFilled = true;
          continue;
        }
        const divWithValue = await page.$(`div[value="${v}"]`);
        if (divWithValue) {
          await scrollIntoView(divWithValue);
          await divWithValue.click();
          anyFilled = true;
        } else {
          const labels = await page.$$('label');
          for (const label of labels) {
            const text = (await label.textContent())?.trim() || '';
            if (text === v || text.includes(v)) {
              await scrollIntoView(label);
              await label.click();
              anyFilled = true;
              break;
            }
          }
        }
      }
      if (!anyFilled) {
        const firstCheckbox = await page.$('input[name="question_3"][type="checkbox"]');
        if (firstCheckbox && !(await firstCheckbox.isChecked())) {
          await scrollIntoView(firstCheckbox);
          await firstCheckbox.click();
          anyFilled = true;
        } else {
          const firstDiv = await page.$('div[value]');
          if (firstDiv) {
            await scrollIntoView(firstDiv);
            await firstDiv.click();
            anyFilled = true;
          }
        }
      }
      logFill(fieldName, values, anyFilled, anyFilled ? '(checkbox/label or first option)' : '(no match found)');
      continue;
    }
    if (['question_4', 'question_6', 'question_7'].includes(fieldName)) {
      const el = await page.$(`input[name="${fieldName}"]`);
      if (el) {
        await el.fill(values[0] || '');
        logFill(fieldName, values[0] || '', true);
      } else {
        logFill(fieldName, values[0] || '', false, '(input not found)');
      }
      continue;
    }
    if (fieldName === 'question_5') {
      const radio = await page.$(`input[name="question_5"][type="radio"][value="${values[0]}"]`);
      if (radio) {
        await scrollIntoView(radio);
        await radio.click();
        logFill(fieldName, values[0] || '', true, '(radio clicked)');
      } else {
        const byTestId = await page.$(`[data-testid="${values[0]}"]`);
        if (byTestId) {
          await scrollIntoView(byTestId);
          await byTestId.click();
          logFill(fieldName, values[0] || '', true, '(by testid)');
        } else {
          const firstRadio = await page.$('input[name="question_5"][type="radio"]');
          if (firstRadio) {
            await scrollIntoView(firstRadio);
            await firstRadio.click();
            logFill(fieldName, values[0] || '', true, '(first radio selected)');
          } else {
            logFill(fieldName, values[0] || '', false, '(no radios found)');
          }
        }
      }
      continue;
    }
    if (fieldName === 'question_8') {
      const checkbox = await page.$(`input[name="question_8"][type="checkbox"]`);
      if (checkbox) {
        await scrollIntoView(checkbox);
        const checked = await checkbox.isChecked();
        if (!checked) await checkbox.click();
        logFill(fieldName, values, true, '(checkbox)');
      } else {
        logFill(fieldName, values, false, '(checkbox not found)');
      }
      continue;
    }
    if (fieldName === 'question_9') {
      const combobox = await page.$('[name="question_9"][role="combobox"]');
      if (combobox) {
        await scrollIntoView(combobox);
        await combobox.click();
        await page.waitForTimeout(300);
        const option = await page.$(`[role="option"]:has-text("${values[0]}")`);
        if (option) {
          await scrollIntoView(option);
          await option.click();
          logFill(fieldName, values[0] || '', true, '(combobox option)');
        } else {
          const opts = await page.$$('[role="option"]');
          let chosen = false;
          for (const o of opts) {
            const text = await o.textContent();
            if (text && values[0] && text.trim().toLowerCase().includes(values[0].toLowerCase())) {
              await scrollIntoView(o);
              await o.click();
              chosen = true;
              break;
            }
          }
          let usedFirst = false;
          if (!chosen && opts.length > 0) {
            await scrollIntoView(opts[0]);
            await opts[0].click();
            chosen = true;
            usedFirst = true;
          }
          logFill(
            fieldName,
            values[0] || '',
            chosen,
            chosen ? (usedFirst ? '(first option selected)' : '(listbox option)') : '(option not found)'
          );
        }
      } else {
        logFill(fieldName, values[0] || '', false, '(combobox not found)');
      }
      continue;
    }

    const input = await page.$(`input[name="${fieldName}"], textarea[name="${fieldName}"]`);
    if (input) {
      await input.fill(values[0] || '');
      logFill(fieldName, values[0] || '', true);
    } else {
      logFill(fieldName, values[0] || '', false, '(input/textarea not found)');
    }
  }

  console.log(`${LOG_PREFIX} Form fill complete; looking for Schedule Event button`);
  const submitButtons = await page.$$('button[type="submit"]');
  let submitBtn: any = null;
  for (const btn of submitButtons) {
    const text = (await btn.textContent())?.trim() || '';
    if (text.includes('Schedule Event')) {
      submitBtn = btn;
      break;
    }
  }
  if (!submitBtn) {
    throw new Error('Schedule Event button not found');
  }
  console.log(`${LOG_PREFIX} Clicking Schedule Event`);
  await submitBtn.click();

  // After submit, a "Confirmed / You are scheduled with ..." popup appears, then redirect to agentfire.com/thanks-for-booking/
  // Only consider the booking complete when we reach the thank-you page.
  const confirmationTimeout = 20000;
  try {
    await page.waitForURL(/agentfire\.com\/thanks-for-booking/, { timeout: confirmationTimeout });
  } catch {
    const stillOnForm = await page.$('input[name="first_name"]').then((el) => !!el);
    if (stillOnForm) {
      throw new Error(
        'Confirmation page did not load after submitting. The booking may have failed (validation error or slot no longer available).'
      );
    }
    throw new Error(
      'Did not reach the booking confirmation page (agentfire.com/thanks-for-booking). The booking may have failed.'
    );
  }
  console.log(`${LOG_PREFIX} Reached thanks-for-booking page; booking complete`);
}

/**
 * Build merged answers: defaults + optional overrides. Phone (question_0) from opts.phone or answers.
 */
function buildMergedAnswers(opts: BookCalendlySlotOptions): Record<string, string | string[]> {
  const merged: Record<string, string | string[]> = { ...DEFAULT_CALENDLY_ANSWERS };
  if (opts.answers) {
    for (const [key, value] of Object.entries(opts.answers)) {
      const fieldName = resolveAnswerKey(key);
      merged[fieldName] = value;
    }
  }
  const phoneValue = opts.phone ?? (merged['question_0'] as string | undefined);
  if (phoneValue != null && phoneValue !== '') {
    merged['question_0'] = typeof phoneValue === 'string' ? phoneValue : (phoneValue as string[])[0] ?? '';
  }
  return merged;
}

/**
 * Book a Calendly AgentFire demo slot. Uses instance reuse per email.
 * Strategy: navigate directly to the slot URL (e.g. .../2026-02-05T06:00:00-06:00?month=2026-02&date=2026-02-05)
 * to land on the "Enter Details" form, skipping calendar and time picker.
 * Dynamic fields: firstName, lastName, email, phone (question_0). All other answers use defaults unless overridden in options.answers.
 */
export async function bookCalendlySlot(opts: BookCalendlySlotOptions): Promise<BookCalendlySlotResult> {
  const normalizedTime = normalizeTimeForCalendly(opts.time);
  const normalizedAnswers = buildMergedAnswers(opts);
  const directUrl = buildDirectCalendlyUrl(opts.date, normalizedTime, opts, normalizedAnswers);

  console.log(`${LOG_PREFIX} Starting booking: date=${opts.date} time=${opts.time} (normalized: ${normalizedTime}) email=${opts.email}`);
  console.log(`${LOG_PREFIX} Using direct form URL (skip calendar/time picker)`);

  try {
    const { page } = await ensurePageForEmail(
      opts.email,
      opts.firstName,
      opts.lastName,
      directUrl
    );

    await dismissCookieConsent(page);
    await fillFormAndSubmit(page, opts, normalizedAnswers);

    console.log(`${LOG_PREFIX} Booking success: ${opts.date} ${opts.time}`);
    return {
      success: true,
      date: opts.date,
      time: opts.time,
    };
  } catch (error: any) {
    const message = error?.message || String(error);
    console.error('Calendly booking error:', message);
    return {
      success: false,
      error: message,
    };
  }
}
