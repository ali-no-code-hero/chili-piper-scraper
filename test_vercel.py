#!/usr/bin/env python3
"""
Test script for the Vercel-deployed Chili Piper Slot Scraper
"""

import requests
import json
import time

def test_vercel_deployment(base_url):
    """Test the Vercel-deployed API"""
    
    print(f"Testing Vercel deployment at: {base_url}")
    print("=" * 60)
    
    # Test data
    test_data = {
        "first_name": "AliTEST",
        "last_name": "SyedTEST",
        "email": "ali+test@mm.ventures",
        "phone": "5127673628",
        "days": 3
    }
    
    print(f"Test data: {json.dumps(test_data, indent=2)}")
    print()
    
    try:
        # Test health endpoint
        print("1. Testing health endpoint...")
        health_url = f"{base_url}/api/health"
        health_response = requests.get(health_url, timeout=10)
        
        if health_response.status_code == 200:
            print("✓ Health check passed")
            print(f"  Response: {health_response.json()}")
        else:
            print(f"✗ Health check failed: {health_response.status_code}")
            return
        
        # Test slots endpoint
        print("\n2. Testing slots endpoint...")
        print("This may take up to 60 seconds (Vercel timeout limit)...")
        
        slots_url = f"{base_url}/api/get-slots"
        start_time = time.time()
        
        slots_response = requests.post(
            slots_url,
            json=test_data,
            timeout=70  # Slightly longer than Vercel timeout
        )
        
        end_time = time.time()
        print(f"Request completed in {end_time - start_time:.2f} seconds")
        
        if slots_response.status_code == 200:
            data = slots_response.json()
            if data.get('success'):
                print("✓ Slots retrieved successfully")
                print(f"Total days found: {data['data']['total_days']}")
                print(f"Days requested: {data['data']['days_requested']}")
                
                # Display first few days of slots
                slots = data['data']['slots']
                for i, (date, day_data) in enumerate(slots.items()):
                    if i >= 2:  # Show only first 2 days
                        print(f"... and {len(slots) - 2} more days")
                        break
                    print(f"\n{day_data['day_name']}, {day_data['date']}:")
                    print(f"  {len(day_data['slots'])} slots available")
                    if day_data['slots']:
                        print(f"  Sample slots: {', '.join(day_data['slots'][:5])}")
            else:
                print(f"✗ API returned error: {data.get('error', 'Unknown error')}")
        else:
            print(f"✗ Request failed with status {slots_response.status_code}")
            print(f"Response: {slots_response.text}")
            
    except requests.exceptions.ConnectionError:
        print("✗ Could not connect to the API. Check the URL and ensure the app is deployed.")
    except requests.exceptions.Timeout:
        print("✗ Request timed out. The function may have hit Vercel's 60-second limit.")
    except Exception as e:
        print(f"✗ Unexpected error: {str(e)}")

def test_local_vercel():
    """Test local Vercel development server"""
    print("Testing local Vercel development server...")
    test_vercel_deployment("http://localhost:3000")

def test_production_vercel(production_url):
    """Test production Vercel deployment"""
    print(f"Testing production Vercel deployment...")
    test_vercel_deployment(production_url)

if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1:
        # Test production URL provided as argument
        production_url = sys.argv[1]
        test_production_vercel(production_url)
    else:
        # Test local development
        test_local_vercel()
        print("\n" + "=" * 60)
        print("To test production deployment, run:")
        print("python test_vercel.py https://your-app.vercel.app")
