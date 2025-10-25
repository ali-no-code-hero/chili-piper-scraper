import json
import asyncio
from playwright.async_api import async_playwright
import logging
from datetime import datetime
import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from manual_auth import validate_manual_key, get_auth_error_response

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
                        '--disable-field-trial-config',
                        '--disable-ipc-flooding-protection',
                        '--disable-hang-monitor',
                        '--disable-prompt-on-repost',
                        '--disable-sync',
                        '--disable-translate',
                        '--disable-windows10-custom-titlebar',
                        '--disable-client-side-phishing-detection',
                        '--disable-component-extensions-with-background-pages',
                        '--disable-default-apps',
                        '--disable-extensions',
                        '--disable-plugins',
                        '--disable-plugins-discovery',
                        '--disable-preconnect',
                        '--disable-print-preview',
                        '--disable-speech-api',
                        '--disable-web-security',
                        '--disable-xss-auditor',
                        '--disable-images',
                        '--disable-javascript',
                        '--disable-plugins',
                        '--disable-images',
                        '--disable-web-security',
                        '--disable-features=VizDisplayCompositor'
                    ]
                )
                
                page = await browser.new_page()
                
                # Navigate to the form page
                logger.info(f"Navigating to: {self.base_url}")
                await page.goto(self.base_url, wait_until='networkidle')
                
                # Fill the form
                await page.fill('input[name="PersonFirstName"]', first_name)
                await page.fill('input[name="PersonLastName"]', last_name)
                await page.fill('input[name="PersonEmail"]', email)
                await page.fill('input[name="aa1e0f82-816d-478f-bf04-64a447af86b3"]', phone)
                
                # Submit the form
                await page.click('button[type="submit"]')
                logger.info("Form submitted successfully")
                
                # Wait for calendar to load
                await page.wait_for_timeout(500)
                
                # Wait for calendar day buttons to be visible
                try:
                    await page.wait_for_selector('[data-id="calendar-day-button"]', timeout=1000)
                    logger.info("✅ Calendar loaded successfully")
                except:
                    logger.warning("⚠️  Calendar selector not found: Page.wait_for_selector: Timeout 1000ms exceeded.")
                    logger.info("⏳ No enabled buttons yet, maximum speed retry...")
                
                # Get available slots
                slots = await self.get_available_slots(page, days_to_check)
                
                await browser.close()
                return slots
                
        except Exception as e:
            logger.error(f"Error in _scrape_slots: {str(e)}")
            return {}
    
    async def get_available_slots(self, page, days_to_check):
        """Get available slots from the calendar"""
        try:
            logger.info(f"🚀 Starting slot collection for {days_to_check} days")
            
            # Calculate max weeks to check
            max_weeks = 2  # Reduced for speed
            logger.info(f"📊 Target: {days_to_check} days, Max weeks to check: {max_weeks}")
            
            all_slots = {}
            week_count = 0
            
            while week_count < max_weeks:
                week_count += 1
                logger.info(f"🔍 Week {week_count}: Looking for available days...")
                
                # Get slots for current week
                week_slots = await self.get_current_week_slots(page)
                
                if week_slots:
                    logger.info(f"📅 Found {len(week_slots)} days with slots in week {week_count}")
                    
                    # Add unique days to all_slots
                    for day_info in week_slots:
                        if day_info['date'] not in all_slots:
                            all_slots[day_info['date']] = day_info
                            logger.info(f"✅ Day {len(all_slots)}/{days_to_check}: {day_info['date']} - {len(day_info['slots'])} slots")
                        else:
                            logger.warning(f"⚠️  Duplicate date found: {day_info['date']}, skipping")
                    
                    logger.info(f"📈 Progress: {len(all_slots)} unique days collected so far")
                
                # Try to navigate to next week
                if week_count < max_weeks:
                    logger.info(f"➡️  Moving to next week... (need {days_to_check - len(all_slots)} more days)")
                    if not await self.navigate_to_next_week(page):
                        logger.info("❌ No more weeks available")
                        break
                    await page.wait_for_timeout(25)
            
            logger.info(f"🏁 Final result: Successfully collected {len(all_slots)} days of slots")
            logger.info(f"📋 Collected dates: {list(all_slots.keys())}")
            
            if len(all_slots) < days_to_check:
                logger.warning(f"⚠️  Only found {len(all_slots)} days available, requested {days_to_check} days")
                logger.info("💡 This is normal - the calendar only shows available booking days")
            
            return all_slots
            
        except Exception as e:
            logger.error(f"Error in get_available_slots: {str(e)}")
            return {}
    
    async def get_current_week_slots(self, page):
        """Get slots for the current week"""
        try:
            # Find all day buttons
            day_buttons = await page.query_selector_all('[data-id="calendar-day-button"]')
            logger.info(f"🔍 Found {len(day_buttons)} day buttons in current week")
            
            if not day_buttons:
                logger.warning("⚠️  No day buttons found in current week")
                return []
            
            # Filter enabled buttons
            enabled_buttons = []
            for i, button in enumerate(day_buttons):
                try:
                    is_enabled = await button.is_enabled()
                    button_text = await button.inner_text()
                    logger.info(f"📅 Button {i+1}: '{button_text[:50]}...' (enabled: {is_enabled})")
                    
                    if is_enabled:
                        enabled_buttons.append(button)
                except Exception as e:
                    logger.debug(f"Error checking button {i+1}: {e}")
                    continue
            
            logger.info(f"🚀 Processing {len(enabled_buttons)} enabled day buttons...")
            
            if not enabled_buttons:
                logger.warning("⚠️  No enabled buttons in current week, ultra-quick retry...")
                await page.wait_for_timeout(25)
                
                # Retry once
                enabled_buttons = []
                for button in day_buttons:
                    try:
                        if await button.is_enabled():
                            enabled_buttons.append(button)
                    except:
                        continue
                
                if not enabled_buttons:
                    logger.warning("⚠️  Still no enabled buttons, trying to navigate...")
                    # Try to navigate to previous week
                    if await self.navigate_to_previous_week(page):
                        await page.wait_for_timeout(25)
                        return await self.get_current_week_slots(page)
                    else:
                        logger.warning("❌ Could not navigate to any week with available slots")
                        return []
            
            # Process each enabled button
            week_slots = []
            for button in enabled_buttons:
                try:
                    # Click the day button
                    await button.click()
                    await page.wait_for_timeout(25)
                    
                    # Get the selected day info
                    selected_day_element = await page.query_selector('[data-id="selected-day"]')
                    if selected_day_element:
                        selected_day_text = await selected_day_element.inner_text()
                        logger.info(f"📅 Selected day: {selected_day_text}")
                        
                        # Extract date from selected day text
                        date_key = self.extract_date_from_text(selected_day_text)
                        
                        # Get time slots
                        time_slots = await self.get_time_slots(page)
                        
                        if time_slots:
                            week_slots.append({
                                'date': date_key,
                                'slots': time_slots
                            })
                            logger.info(f"✅ Found {len(time_slots)} slots for {date_key}")
                        else:
                            logger.warning(f"⚠️  No time slots found for {date_key}")
                    
                except Exception as e:
                    logger.error(f"Error processing day button: {e}")
                    continue
            
            logger.info(f"📊 Week collection complete: {len(week_slots)} days with slots")
            return week_slots
            
        except Exception as e:
            logger.error(f"Error in get_current_week_slots: {str(e)}")
            return []
    
    async def get_time_slots(self, page):
        """Get available time slots for the selected day"""
        try:
            # Wait for time slots to load
            await page.wait_for_timeout(25)
            
            # Find time slot elements
            time_elements = await page.query_selector_all('[data-id="time-slot"]')
            
            if not time_elements:
                # Try alternative selector
                time_elements = await page.query_selector_all('.time-slot')
            
            time_slots = []
            for element in time_elements:
                try:
                    time_text = await element.inner_text()
                    if time_text.strip():
                        time_slots.append(time_text.strip())
                except:
                    continue
            
            return time_slots
            
        except Exception as e:
            logger.error(f"Error in get_time_slots: {str(e)}")
            return []
    
    def extract_date_from_text(self, text):
        """Extract date from selected day text"""
        try:
            # This is a simplified date extraction
            # In a real implementation, you'd parse the actual date
            import re
            # Look for patterns like "Tuesday, Oct 28, 2025"
            date_match = re.search(r'(\w+),?\s+(\w+)\s+(\d+),?\s+(\d+)', text)
            if date_match:
                day_name, month, day, year = date_match.groups()
                return f"{month} {day}, {year}"
            else:
                # Fallback to current date
                return datetime.now().strftime("%b %d, %Y")
        except:
            return datetime.now().strftime("%b %d, %Y")
    
    async def navigate_to_next_week(self, page):
        """Navigate to the next week"""
        try:
            logger.info("➡️  Clicking next week button...")
            next_button = await page.query_selector('[data-id="next-week-button"]')
            if next_button and await next_button.is_enabled():
                await next_button.click()
                await page.wait_for_timeout(25)
                logger.info("✅ Successfully clicked next week button")
                logger.info("✅ Successfully moved to week 2")
                return True
            else:
                logger.info("❌ Next week button is disabled")
                return False
        except Exception as e:
            logger.error(f"Error navigating to next week: {e}")
            return False
    
    async def navigate_to_previous_week(self, page):
        """Navigate to the previous week"""
        try:
            logger.info("🔄 Trying to navigate to previous week...")
            prev_button = await page.query_selector('[data-id="previous-week-button"]')
            if prev_button and await prev_button.is_enabled():
                await prev_button.click()
                await page.wait_for_timeout(25)
                logger.info("✅ Successfully navigated to previous week")
                return True
            else:
                logger.info("❌ Previous week button is disabled")
                return False
        except Exception as e:
            logger.error(f"Error navigating to previous week: {e}")
            return False

def handler(request):
    """Vercel serverless function handler"""
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Content-Type': 'application/json'
    }
    
    if request.method == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({'message': 'OK'})
        }
    
    if request.method != 'POST':
        return {
            'statusCode': 405,
            'headers': headers,
            'body': json.dumps({'error': 'Method not allowed'})
        }
    
    try:
        # Check authentication
        auth_header = request.headers.get('Authorization', '')
        is_valid, message = validate_manual_key(auth_header)
        
        if not is_valid:
            error_response = get_auth_error_response()
            return {
                'statusCode': 401,
                'headers': headers,
                'body': json.dumps(error_response)
            }
        
        # Parse request body
        data = json.loads(request.body)
        
        # Validate required fields
        required_fields = ['first_name', 'last_name', 'email', 'phone']
        for field in required_fields:
            if field not in data:
                return {
                    'statusCode': 400,
                    'headers': headers,
                    'body': json.dumps({
                        'success': False,
                        'error': 'Missing required fields',
                        'message': f'The following fields are required: {field}'
                    })
                }
        
        # Always collect maximum available days (9 days)
        days_to_check = 9
        
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
            
            return {
                'statusCode': 200,
                'headers': headers,
                'body': json.dumps(response)
            }
            
        finally:
            loop.close()
            
    except json.JSONDecodeError as e:
        return {
            'statusCode': 400,
            'headers': headers,
            'body': json.dumps({
                'success': False,
                'error': 'Invalid JSON',
                'message': str(e)
            })
        }
    except Exception as e:
        logger.error(f"API error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({
                'success': False,
                'error': 'Internal server error',
                'message': str(e)
            })
        }