import json
import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from secure_auth import list_tokens, revoke_token, validate_token

def handler(request):
    """Manage API tokens (admin endpoint)"""
    
    # Set CORS headers
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
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
        # Check authentication for admin access
        auth_header = request.headers.get('Authorization', '')
        is_valid, message = validate_token(auth_header)
        
        if not is_valid:
            return {
                'statusCode': 401,
                'headers': headers,
                'body': json.dumps({
                    'success': False,
                    'error': 'Authentication required',
                    'message': 'Please provide a valid API token'
                })
            }
        
        if request.method == 'GET':
            # List all tokens
            tokens = list_tokens()
            response = {
                'success': True,
                'data': {
                    'tokens': tokens,
                    'total': len(tokens)
                },
                'message': f'Found {len(tokens)} tokens'
            }
            
            return {
                'statusCode': 200,
                'headers': headers,
                'body': json.dumps(response)
            }
        
        elif request.method == 'DELETE':
            # Revoke a token
            content_length = int(request.headers.get('Content-Length', 0))
            if content_length > 0:
                post_data = request.rfile.read(content_length)
                data = json.loads(post_data.decode('utf-8'))
                token_to_revoke = data.get('token')
            else:
                return {
                    'statusCode': 400,
                    'headers': headers,
                    'body': json.dumps({
                        'success': False,
                        'error': 'Token required',
                        'message': 'Please provide token to revoke'
                    })
                }
            
            success, message = revoke_token(token_to_revoke)
            
            if success:
                response = {
                    'success': True,
                    'message': message
                }
                status_code = 200
            else:
                response = {
                    'success': False,
                    'error': message
                }
                status_code = 400
            
            return {
                'statusCode': status_code,
                'headers': headers,
                'body': json.dumps(response)
            }
        
        else:
            return {
                'statusCode': 405,
                'headers': headers,
                'body': json.dumps({
                    'success': False,
                    'error': 'Method not allowed',
                    'message': 'Only GET and DELETE methods are supported'
                })
            }
    
    except Exception as e:
        error_response = {
            'success': False,
            'error': f'Token management error: {str(e)}'
        }
        
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps(error_response)
        }
