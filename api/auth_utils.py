import os
import json
from datetime import datetime

# In production, you would store tokens in a database
# For this demo, we'll use environment variables or a simple file
VALID_TOKENS = set()

def load_tokens():
    """Load valid tokens from environment or file"""
    global VALID_TOKENS
    
    # Check for tokens in environment variable (comma-separated)
    env_tokens = os.environ.get('API_TOKENS', '')
    if env_tokens:
        VALID_TOKENS.update(env_tokens.split(','))
    
    # In production, you would load from a database
    # For now, we'll add some demo tokens
    demo_tokens = [
        'demo-token-12345',  # Demo token for testing
        'test-token-67890'   # Another demo token
    ]
    VALID_TOKENS.update(demo_tokens)

def validate_token(token):
    """Validate an API token"""
    if not token:
        return False, "No token provided"
    
    # Remove 'Bearer ' prefix if present
    if token.startswith('Bearer '):
        token = token[7:]
    
    # Load tokens if not already loaded
    if not VALID_TOKENS:
        load_tokens()
    
    if token in VALID_TOKENS:
        return True, "Valid token"
    else:
        return False, "Invalid token"

def add_token(token):
    """Add a new token to the valid tokens set"""
    global VALID_TOKENS
    VALID_TOKENS.add(token)
    
    # In production, you would save to database
    # For now, we'll just keep it in memory

def get_auth_error_response():
    """Return a standardized authentication error response"""
    return {
        'success': False,
        'error': 'Authentication required',
        'message': 'Please provide a valid API token in the Authorization header',
        'usage': {
            'header': 'Authorization: Bearer <your-token>',
            'get_token': '/api/generate-token'
        }
    }
