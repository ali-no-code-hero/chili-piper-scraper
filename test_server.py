#!/usr/bin/env python3
"""
Simple test server to run the Vercel API functions locally
"""

import http.server
import socketserver
import json
import asyncio
import sys
import os

# Add the current directory to Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Import our API modules
import importlib.util
import sys

# Load the get-slots module
spec = importlib.util.spec_from_file_location("get_slots", "api/get-slots.py")
get_slots_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(get_slots_module)
ChiliPiperScraper = get_slots_module.ChiliPiperScraper

from datetime import datetime

class TestHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/api/health':
            # Health check endpoint
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type')
            self.end_headers()
            
            response = {
                'status': 'healthy',
                'timestamp': datetime.now().isoformat(),
                'service': 'Chili Piper Slot Scraper'
            }
            self.wfile.write(json.dumps(response).encode())
        elif self.path == '/api/generate-token':
            # Token generation endpoint
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
            self.end_headers()
            
            # Generate a simple token for testing
            import secrets
            token = secrets.token_urlsafe(32)
            
            response = {
                'success': True,
                'data': {
                    'token': token,
                    'expires_at': '2026-12-31T23:59:59Z',
                    'description': 'API Token for Chili Piper Scraper',
                    'usage': {
                        'endpoint': '/api/get-slots',
                        'method': 'POST',
                        'header': f'Authorization: Bearer {token}'
                    }
                },
                'message': 'Token generated successfully. Store this token securely - it will not be shown again.'
            }
            self.wfile.write(json.dumps(response).encode())
        elif self.path == '/':
            # Serve the HTML page
            self.serve_html()
        else:
            self.send_error(404, "Not Found")
    
    def do_POST(self):
        if self.path == '/api/get-slots':
            self.handle_get_slots()
        else:
            self.send_error(404, "Not Found")
    
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
    
    def serve_html(self):
        try:
            with open('pages/index.html', 'r') as f:
                html_content = f.read()
            
            self.send_response(200)
            self.send_header('Content-type', 'text/html')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(html_content.encode())
        except Exception as e:
            self.send_error(500, f"Error serving HTML: {str(e)}")
    
    def validate_token(self, auth_header):
        """Simple token validation for testing"""
        if not auth_header:
            return False
        
        # Remove 'Bearer ' prefix if present
        if auth_header.startswith('Bearer '):
            token = auth_header[7:]
        else:
            token = auth_header
        
        # For testing, accept any non-empty token
        # In production, you would validate against a database
        return len(token) > 0
    
    def handle_get_slots(self):
        try:
            # Check authentication
            auth_header = self.headers.get('Authorization', '')
            if not self.validate_token(auth_header):
                self.send_error_response(401, 'Authentication required. Please provide a valid API token.')
                return
            
            # Parse request body
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode('utf-8'))
            
            # Validate required fields
            required_fields = ['first_name', 'last_name', 'email', 'phone']
            for field in required_fields:
                if field not in data:
                    self.send_error_response(400, f'Missing required field: {field}')
                    return
            
            # Get days parameter
            days_to_check = data.get('days', 5)
            if days_to_check > 10:
                days_to_check = 10
            
            print(f"Received request: {data}")
            print("Starting scraping process...")
            
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
                
                self.send_success_response(response)
                
            finally:
                loop.close()
                
        except Exception as e:
            print(f"Error in get_slots: {str(e)}")
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

def run_server(port=8000):
    """Run the test server"""
    print(f"Starting test server on port {port}")
    print("=" * 50)
    print("🌐 Web Interface: http://localhost:8000")
    print("🔍 Health Check: http://localhost:8000/api/health")
    print("📡 API Endpoint: http://localhost:8000/api/get-slots")
    print("=" * 50)
    print("Press Ctrl+C to stop the server")
    print()
    
    with socketserver.TCPServer(("", port), TestHandler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n🛑 Server stopped")

if __name__ == "__main__":
    run_server()
