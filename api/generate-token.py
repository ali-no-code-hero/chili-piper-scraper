import json
import secrets
import time
from datetime import datetime, timedelta

def handler(request):
    """Generate a new API token for authentication"""
    
    # Set CORS headers
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
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
        # Generate a secure random token
        token = secrets.token_urlsafe(32)
        
        # Create token metadata
        token_data = {
            'token': token,
            'created_at': datetime.utcnow().isoformat(),
            'expires_at': (datetime.utcnow() + timedelta(days=365)).isoformat(),  # 1 year expiry
            'description': 'API Token for Chili Piper Scraper',
            'permissions': ['get-slots']
        }
        
        # In a production environment, you would store this in a database
        # For now, we'll just return the token
        response = {
            'success': True,
            'data': {
                'token': token,
                'expires_at': token_data['expires_at'],
                'description': token_data['description'],
                'usage': {
                    'endpoint': '/api/get-slots',
                    'method': 'POST',
                    'header': 'Authorization: Bearer <token>'
                }
            },
            'message': 'Token generated successfully. Store this token securely - it will not be shown again.'
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
