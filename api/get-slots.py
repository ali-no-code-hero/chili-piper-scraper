from http.server import BaseHTTPRequestHandler
import json
import asyncio
from playwright.async_api import async_playwright
import logging
from datetime import datetime
import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from auth_utils import validate_token, get_auth_error_response

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class ChiliPiperScraper:
    def __init__(self):
        self.base_url = "https://cincpro.chilipiper.com/concierge-router/link/lp-request-a-demo-agent-advice"
        
    async def fill_form_and_get_slots(self, first_name, last_name, email, phone, days_to_check=5):
        """Fill the form and get available slots using Playwright"""
        try:
            # Set a timeout for the entire operation
            import asyncio
            return await asyncio.wait_for(
                self._scrape_slots(first_name, last_name, email, phone, days_to_check),
                timeout=45  # 45 second timeout
            )
        except asyncio.TimeoutError:
            logger.error("Scraping operation timed out")
            return {}
        except Exception as e:
            logger.error(f"Error in fill_form_and_get_slots: {str(e)}")
            return {}
    
    async def _scrape_slots(self, first_name, last_name, email, phone, days_to_check):
        """Internal method to scrape slots"""
        try:
            logger.info(f"🎯 Starting scrape for {first_name} {last_name} ({email}) - {days_to_check} days")
            async with async_playwright() as p:
                # Launch browser with maximum speed optimizations
                browser = await p.chromium.launch(
                    headless=True,
                    args=[
                        '--no-sandbox',
                        '--disable-dev-shm-usage',
                        '--disable-gpu',
                        '--disable-web-security',
                        '--disable-features=VizDisplayCompositor',
                        '--disable-background-timer-throttling',
                        '--disable-backgrounding-occluded-windows',
                        '--disable-renderer-backgrounding',
                        '--disable-extensions',
                        '--disable-plugins',
                        '--disable-images',
                        '--disable-javascript-harmony-shipping',
                        '--disable-background-networking',
                        '--disable-sync',
                        '--disable-translate',
                        '--disable-ipc-flooding-protection',
                        '--disable-hang-monitor',
                        '--disable-prompt-on-repost',
                        '--disable-domain-reliability',
                        '--disable-client-side-phishing-detection',
                        '--disable-component-extensions-with-background-pages',
                        '--disable-default-apps',
                        '--disable-features=TranslateUI',
                        '--disable-ipc-flooding-protection',
                        '--window-size=1920,1080'
                    ]
                )
                
                context = await browser.new_context(
                    user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                )
                
                page = await context.new_page()
                
                # Navigate to the form
                logger.info(f"Navigating to: {self.base_url}")
                await page.goto(self.base_url, wait_until='networkidle')
                
                # Fill the form
                await self.fill_form(page, first_name, last_name, email, phone)
                
                # Wait for redirect and calendar to load - maximum speed
                await page.wait_for_timeout(500)  # Wait for calendar to load properly
                
                # Wait for calendar to be ready with minimal timeout
                try:
                    await page.wait_for_selector('[data-id="calendar-day-button"]', timeout=1000)
                    logger.info("✅ Calendar loaded successfully")
                    
                    # Wait for slots to load
                    await page.wait_for_timeout(100)
                    
                    # Quick check for enabled buttons
                    enabled_buttons = await page.query_selector_all('[data-id="calendar-day-button"]:not([disabled])')
                    if len(enabled_buttons) == 0:
                        logger.info("⏳ No enabled buttons yet, maximum speed retry...")
                        await page.wait_for_timeout(50)  # Maximum speed retry wait
                        
                except Exception as e:
                    logger.warning(f"⚠️  Calendar selector not found: {e}")
                    await page.wait_for_timeout(50)  # Maximum speed fallback wait
                
                slots = await self.get_available_slots(page, days_to_check)
                
                await browser.close()
                return slots
                
        except Exception as e:
            logger.error(f"Error in scraping: {str(e)}")
            raise e
    
    async def fill_form(self, page, first_name, last_name, email, phone):
        """Fill the Chili Piper form"""
        try:
            # Wait for form to load
            await page.wait_for_selector('[data-test-id="GuestFormField-PersonFirstName"]', timeout=20000)
            
            # Fill first name
            await page.fill('[data-test-id="GuestFormField-PersonFirstName"]', first_name)
            
            # Fill last name
            await page.fill('[data-test-id="GuestFormField-PersonLastName"]', last_name)
            
            # Fill email
            await page.fill('[data-test-id="GuestFormField-PersonEmail"]', email)
            
            # Fill phone
            await page.fill('[data-test-id="PhoneField-input"]', phone)
            
            # Submit form
            await page.click('[data-test-id="GuestForm-submit-button"]')
            
            logger.info("Form submitted successfully")
            
        except Exception as e:
            logger.error(f"Error filling form: {str(e)}")
            raise e
    
    async def get_available_slots(self, page, days_to_check):
        """Get available time slots - optimized for speed with detailed debugging"""
        try:
            logger.info(f"🚀 Starting slot collection for {days_to_check} days")
            # Wait for slots page to load with reduced timeout
            await page.wait_for_selector('[data-id="calendar-day-button"]', timeout=10000)
            
            all_slots = {}
            current_day = 0
            week_count = 0
            max_weeks = 3  # Allow 3 weeks for better coverage
            
            logger.info(f"📊 Target: {days_to_check} days, Max weeks to check: {max_weeks}")
            
            while week_count < max_weeks:  # Always collect all available days
                try:
                    logger.info(f"🔍 Week {week_count + 1}: Looking for available days...")
                    # Get all available days in current week
                    week_slots = await self.get_current_week_slots(page)
                    logger.info(f"📅 Found {len(week_slots)} days with slots in week {week_count + 1}")
                    
                    for i, day_info in enumerate(week_slots):
                        if day_info:
                            # Check if we already have this date (avoid duplicates)
                            if day_info['date'] not in all_slots:
                                all_slots[day_info['date']] = {
                                    'day_name': day_info['day_name'],
                                    'date': day_info['date'],
                                    'slots': day_info['slots']
                                }
                                current_day += 1
                                logger.info(f"✅ Day {current_day}: {day_info['day_name']}, {day_info['date']} - {len(day_info['slots'])} slots")
                            else:
                                logger.warning(f"⚠️  Duplicate date found: {day_info['date']}, skipping")
                    
                    logger.info(f"📈 Progress: {len(all_slots)} unique days collected so far")
                    
                    # Navigate to next week - always try to find more days
                    logger.info(f"➡️  Moving to next week... (collected {len(all_slots)} days so far)")
                    if await self.navigate_to_next_week(page):
                        week_count += 1
                        await page.wait_for_timeout(25)  # Minimal wait for week navigation
                        logger.info(f"✅ Successfully moved to week {week_count + 1}")
                    else:
                        # Try going to previous week if next week doesn't work
                        logger.info("🔄 Next week not available, trying previous week...")
                        prev_week_button = await page.query_selector('[data-id="calendar-arrows-button-prev"]')
                        if prev_week_button and await prev_week_button.is_enabled():
                            await prev_week_button.click()
                            await page.wait_for_timeout(25)
                            week_count += 1
                            logger.info("✅ Successfully moved to previous week")
                        else:
                            logger.info("❌ No more weeks available in either direction")
                            break
                    
                except Exception as e:
                    logger.error(f"❌ Error getting slots for week {week_count}: {str(e)}")
                    break
            
            logger.info(f"🏁 Final result: Successfully collected {len(all_slots)} days of slots")
            logger.info(f"📋 Collected dates: {list(all_slots.keys())}")
            
            # Log if we couldn't get the requested number of days
            if len(all_slots) < days_to_check:
                logger.warning(f"⚠️  Only found {len(all_slots)} days available, requested {days_to_check} days")
                logger.info("💡 This is normal - the calendar only shows available booking days")
            
            return all_slots
            
        except Exception as e:
            logger.error(f"❌ Error getting available slots: {str(e)}")
            return {}
    
    async def get_current_day_info(self, page):
        """Get information about the currently selected day"""
        try:
            logger.debug("🔍 Looking for selected day element...")
            # Get the selected day info
            selected_day = await page.query_selector('[data-id="calendar-day-button-selected"]')
            if not selected_day:
                logger.warning("❌ No selected day element found")
                return None
                
            logger.debug("✅ Found selected day element")
            day_text = await selected_day.query_selector('[data-id="calendar-day-selected"]')
            if not day_text:
                logger.warning("❌ No day text element found")
                return None
            
            # Extract day and date info
            day_number_element = await day_text.query_selector('span')
            day_number = await day_number_element.inner_text() if day_number_element else "Unknown"
            
            month_spans = await day_text.query_selector_all('span')
            month = await month_spans[1].inner_text() if len(month_spans) > 1 else "Unknown"
            
            # Get day name from button text
            button_text = await selected_day.get_attribute('aria-label') or await selected_day.inner_text()
            day_name = button_text.split()[0] if button_text else "Unknown"
            
            logger.debug(f"📅 Day: {day_name}, Number: {day_number}, Month: {month}")
            
            # Construct date (assuming current year)
            current_year = datetime.now().year
            date_str = f"{month} {day_number}, {current_year}"
            
            # Get available time slots
            logger.debug("🔍 Looking for time slot buttons...")
            slot_buttons = await page.query_selector_all('[data-id="calendar-slot"]')
            logger.debug(f"🕐 Found {len(slot_buttons)} slot buttons")
            
            time_slots = []
            
            for i, slot in enumerate(slot_buttons):
                try:
                    time_element = await slot.query_selector('span')
                    if time_element:
                        time_text = await time_element.inner_text()
                        time_slots.append(time_text)
                        logger.debug(f"  Slot {i+1}: {time_text}")
                except Exception as e:
                    logger.debug(f"  Error getting slot {i+1}: {e}")
                    continue
            
            logger.debug(f"📊 Total slots collected: {len(time_slots)}")
            
            return {
                'day_name': day_name,
                'date': date_str,
                'slots': time_slots
            }
            
        except Exception as e:
            logger.error(f"❌ Error getting current day info: {str(e)}")
            return None
    
    async def get_current_week_slots(self, page):
        """Get slots for all available days in the current week"""
        try:
            week_slots = []
            
            # Get all day buttons in current week
            day_buttons = await page.query_selector_all('[data-id="calendar-day-button"]')
            logger.info(f"🔍 Found {len(day_buttons)} day buttons in current week")
            
            # Debug: Check what dates are being shown
            all_day_buttons = await page.query_selector_all('[data-id="calendar-day-button"]')
            logger.info(f"🔍 Total day buttons on page: {len(all_day_buttons)}")
            
            # Show what dates are currently visible
            for i, button in enumerate(all_day_buttons[:6]):  # Show first 6 buttons
                try:
                    button_text = await button.inner_text()
                    is_enabled = await button.is_enabled()
                    logger.info(f"📅 Button {i+1}: '{button_text[:50]}...' (enabled: {is_enabled})")
                except:
                    continue
            
            # Process day buttons more efficiently
            enabled_buttons = []
            for i, button in enumerate(day_buttons):
                try:
                    is_enabled = await button.is_enabled()
                    button_text = await button.inner_text()
                    logger.debug(f"🔍 Button {i+1}: enabled={is_enabled}, text='{button_text[:30]}...'")
                    
                    if is_enabled:
                        enabled_buttons.append((i+1, button, button_text.strip()))
                    else:
                        logger.debug(f"⏭️  Day button {i+1} is disabled, skipping")
                except Exception as e:
                    logger.warning(f"⚠️  Error checking day button {i+1}: {str(e)}")
                    continue
            
            logger.info(f"🚀 Processing {len(enabled_buttons)} enabled day buttons...")
            
            # If no enabled buttons in current week, wait a bit more and retry
            if len(enabled_buttons) == 0:
                logger.info("⚠️  No enabled buttons in current week, ultra-quick retry...")
                await page.wait_for_timeout(25)  # Ultra-reduced wait for slots to load
                
                # Retry getting enabled buttons
                enabled_buttons = []
                for i, button in enumerate(day_buttons):
                    try:
                        is_enabled = await button.is_enabled()
                        if is_enabled:
                            button_text = await button.inner_text()
                            enabled_buttons.append((i+1, button, button_text))
                    except Exception as e:
                        logger.warning(f"⚠️  Error checking day button {i+1}: {str(e)}")
                        continue
                
                if len(enabled_buttons) == 0:
                    logger.info("⚠️  Still no enabled buttons, trying to navigate...")
                    
                    # Try next week first
                    if await self.navigate_to_next_week(page):
                        logger.info("✅ Successfully navigated to next week, retrying...")
                        await page.wait_for_timeout(25)
                        return await self.get_current_week_slots(page)
                    
                    # If next week doesn't work, try previous week
                    logger.info("🔄 Trying to navigate to previous week...")
                    prev_week_button = await page.query_selector('[data-id="calendar-arrows-button-prev"]')
                    if prev_week_button and await prev_week_button.is_enabled():
                        logger.info("⬅️  Clicking previous week button...")
                        await prev_week_button.click()
                        await page.wait_for_timeout(25)
                        logger.info("✅ Successfully navigated to previous week, retrying...")
                        return await self.get_current_week_slots(page)
                
                # Try clicking on month/year to see if there's a month picker
                logger.info("🔄 Trying to access month/year picker...")
                month_year_element = await page.query_selector('[data-id="calendar-month-year"]')
                if month_year_element:
                    logger.info("📅 Found month/year element, trying to click...")
                    await month_year_element.click()
                    await page.wait_for_timeout(50)
                    
                    # Look for next month button
                    next_month_button = await page.query_selector('[data-id="calendar-arrows-button-next"]')
                    if next_month_button and await next_month_button.is_enabled():
                        logger.info("➡️  Found next month button, clicking...")
                        await next_month_button.click()
                        await page.wait_for_timeout(50)
                        logger.info("✅ Successfully navigated to next month, retrying...")
                        return await self.get_current_week_slots(page)
                
                logger.warning("❌ Could not navigate to any week with available slots")
                return []
            
            for i, (button_num, button, button_text) in enumerate(enabled_buttons):
                try:
                    logger.debug(f"🖱️  Clicking day button {button_num}: '{button_text[:30]}...'")
                    
                    # Click the day button
                    await button.click()
                    # Maximum speed wait for slots to load
                    await page.wait_for_timeout(25)
                    
                    # Get slots for this day
                    day_info = await self.get_current_day_info(page)
                    
                    if day_info and day_info['slots']:  # Only add if there are actual slots
                        week_slots.append(day_info)
                        logger.info(f"✅ Found {len(day_info['slots'])} slots for {day_info['day_name']}, {day_info['date']}")
                    else:
                        logger.debug(f"⚠️  No slots found for day button {button_num}")
                    
                except Exception as e:
                    logger.warning(f"⚠️  Error processing day button {button_num}: {str(e)}")
                    continue
            
            logger.info(f"📊 Week collection complete: {len(week_slots)} days with slots")
            return week_slots
            
        except Exception as e:
            logger.error(f"❌ Error getting current week slots: {str(e)}")
            return []
    
    async def navigate_to_next_week(self, page):
        """Navigate to the next week"""
        try:
            logger.debug("🔍 Looking for next week button...")
            # Try to click the next week button
            next_week_button = await page.query_selector('[data-id="calendar-arrows-button-next"]')
            if next_week_button:
                is_enabled = await next_week_button.is_enabled()
                logger.debug(f"📅 Next week button found, enabled: {is_enabled}")
                if is_enabled:
                    logger.info("➡️  Clicking next week button...")
                    await next_week_button.click()
                    await page.wait_for_timeout(200)  # Minimal wait for navigation
                    logger.info("✅ Successfully clicked next week button")
                    return True
                else:
                    logger.info("❌ Next week button is disabled")
            else:
                logger.warning("❌ Next week button not found")
            
            # Try alternative navigation methods
            logger.debug("🔍 Trying alternative navigation methods...")
            
            # Try clicking on month/year to see if there's a month picker
            month_year_element = await page.query_selector('[data-id="calendar-month-year"]')
            if month_year_element:
                logger.info("📅 Found month/year element, trying to click...")
                await month_year_element.click()
                await page.wait_for_timeout(25)
                
                # Look for next month button
                next_month_button = await page.query_selector('[data-id="calendar-arrows-button-next"]')
                if next_month_button and await next_month_button.is_enabled():
                    logger.info("➡️  Found next month button, clicking...")
                    await next_month_button.click()
                    await page.wait_for_timeout(25)
                    return True
            
            return False
            
        except Exception as e:
            logger.error(f"❌ Error navigating to next week: {str(e)}")
            return False
    

class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()
        return
    
    def do_POST(self):
        try:
            # Check authentication
            auth_header = self.headers.get('Authorization', '')
            is_valid, message = validate_token(auth_header)
            
            if not is_valid:
                self.send_response(401)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                
                error_response = get_auth_error_response()
                self.wfile.write(json.dumps(error_response).encode())
                return
            # Parse request body
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode('utf-8'))
            
            # Validate required fields (days parameter removed - always collects maximum)
            required_fields = ['first_name', 'last_name', 'email', 'phone']
            for field in required_fields:
                if field not in data:
                    self.send_error_response(400, f'Missing required field: {field}')
                    return
            
            # Always collect maximum available days (9 days)
            days_to_check = 9  # Hardcoded to always get maximum available slots
            
            # Run the scraping
            scraper = ChiliPiperScraper()
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            
            try:
                slots = loop.run_until_complete(
                    scraper.fill_form_and_get_slots(
                        data['first_name'],
                        data['last_name'], 
                        data['email'],
                        data['phone'],
                        days_to_check
                    )
                )
                
                # Prepare response - always show maximum available days
                if len(slots) == 0:
                    note = "No available booking slots found in the calendar"
                else:
                    note = f"Found {len(slots)} available days (maximum available in the system)"
                    
                # Flatten the slots into the requested format
                flattened_slots = []
                for date_key, day_info in slots.items():
                    for time_slot in day_info['slots']:
                        flattened_slots.append({
                            'date': date_key,
                            'time': time_slot,
                            'gmt': 'GMT-05:00 America/Chicago (CDT)'
                        })
                
                response = {
                    'success': True,
                    'data': {
                        'total_slots': len(flattened_slots),
                        'total_days': len(slots),
                        'note': f'Found {len(slots)} days with {len(flattened_slots)} total booking slots',
                        'slots': flattened_slots
                    }
                }
                
                self.send_success_response(response)
                
            finally:
                loop.close()
                
        except Exception as e:
            logger.error(f"API error: {str(e)}")
            self.send_error_response(500, str(e))
    
    def send_success_response(self, data):
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())
    
    def send_error_response(self, status_code, message):
        self.send_response(status_code)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
        
        error_response = {
            'success': False,
            'error': message
        }
        self.wfile.write(json.dumps(error_response).encode())
