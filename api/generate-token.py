import json
import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from secure_auth import (
    generate_secure_token, 
    store_token, 
    is_rate_limited, 
    add_rate_limit,
    get_auth_error_response
)

def handler(request):
    """Generate a new API token for authentication with security measures"""
    
    # Set CORS headers
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Content-Type': 'application/json'
    }
    
    # Handle preflight requests
    if request.method == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({'message': 'OK'})
        }
    
    try:
        # Get client IP for rate limiting
        client_ip = request.headers.get('X-Forwarded-For', 
                  request.headers.get('X-Real-IP', 
                  request.environ.get('REMOTE_ADDR', 'unknown')))
        
        # Check rate limiting
        if is_rate_limited(client_ip):
            error_response = {
                'success': False,
                'error': 'Rate limit exceeded',
                'message': 'Maximum 5 tokens per hour allowed. Please try again later.',
                'retry_after': 3600  # seconds
            }
            return {
                'statusCode': 429,
                'headers': headers,
                'body': json.dumps(error_response)
            }
        
        # Generate secure token
        token = generate_secure_token()
        
        # Store token with metadata
        store_token(token, client_ip, "API Token for Chili Piper Scraper")
        
        # Add rate limit entry
        add_rate_limit(client_ip)
        
        response = {
            'success': True,
            'data': {
                'token': token,
                'expires_at': '2024-12-31T23:59:59Z',  # 30 days from creation
                'description': 'API Token for Chili Piper Scraper',
                'usage': {
                    'endpoint': '/api/get-slots',
                    'method': 'POST',
                    'header': f'Authorization: Bearer {token}'
                },
                'security': {
                    'rate_limit': '5 tokens per hour',
                    'expires_in': '30 days',
                    'store_securely': True
                }
            },
            'message': 'Token generated successfully. Store this token securely - it will not be shown again.',
            'warnings': [
                'This token will expire in 30 days',
                'Store the token securely - it cannot be recovered',
                'Rate limited to 5 tokens per hour per IP'
            ]
        }
        
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps(response)
        }
        
    except Exception as e:
        error_response = {
            'success': False,
            'error': f'Failed to generate token: {str(e)}'
        }
        
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps(error_response)
        }
