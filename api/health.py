import json
import traceback
import sys
from datetime import datetime

def handler(request):
    """Vercel serverless function handler with comprehensive error handling"""
    try:
        # Debug: Print request details
        print(f"🔍 Health API Debug - Request method: {getattr(request, 'method', 'UNKNOWN')}")
        print(f"🔍 Health API Debug - Request headers: {getattr(request, 'headers', {})}")
        print(f"🔍 Health API Debug - Request path: {getattr(request, 'path', 'UNKNOWN')}")
        
        headers = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Content-Type': 'application/json'
        }
        
        # Handle OPTIONS requests
        if hasattr(request, 'method') and request.method == 'OPTIONS':
            print("✅ Health API - Handling OPTIONS request")
            return {
                'statusCode': 200,
                'headers': headers,
                'body': json.dumps({'message': 'OK'})
            }
        
        # Create response
        response = {
            'status': 'healthy',
            'timestamp': datetime.now().isoformat(),
            'service': 'Chili Piper Slot Scraper',
            'debug': {
                'python_version': sys.version,
                'request_method': getattr(request, 'method', 'UNKNOWN'),
                'request_path': getattr(request, 'path', 'UNKNOWN')
            }
        }
        
        print("✅ Health API - Creating successful response")
        
        return {
            'statusCode': 200,
            'headers': headers,
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
        
        print(f"❌ Health API Error: {error_details}")
        
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
