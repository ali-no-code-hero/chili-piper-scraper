import json
import traceback
import sys
from datetime import datetime

def handler(request):
    """Simple test handler for Vercel with comprehensive error handling"""
    try:
        # Debug: Print request details
        print(f"🔍 Test API Debug - Request method: {getattr(request, 'method', 'UNKNOWN')}")
        print(f"🔍 Test API Debug - Request headers: {getattr(request, 'headers', {})}")
        print(f"🔍 Test API Debug - Request path: {getattr(request, 'path', 'UNKNOWN')}")
        
        response = {
            'message': 'Test endpoint working!',
            'timestamp': datetime.now().isoformat(),
            'debug': {
                'python_version': sys.version,
                'request_method': getattr(request, 'method', 'UNKNOWN'),
                'request_path': getattr(request, 'path', 'UNKNOWN')
            }
        }
        
        print("✅ Test API - Creating successful response")
        
        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization'
            },
            'body': json.dumps(response)
        }
        
    except Exception as e:
        # Comprehensive error handling
        error_details = {
            'error': str(e),
            'error_type': type(e).__name__,
            'traceback': traceback.format_exc(),
            'timestamp': datetime.now().isoformat()
        }
        
        print(f"❌ Test API Error: {error_details}")
        
        return {
            'statusCode': 500,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            'body': json.dumps({
                'error': 'Internal Server Error',
                'details': error_details
            })
        }
