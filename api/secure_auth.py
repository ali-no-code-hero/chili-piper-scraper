import json
import secrets
import time
import hashlib
from datetime import datetime, timedelta
import os

# In-memory storage for demo (use database in production)
TOKEN_STORE = {}
RATE_LIMIT_STORE = {}

def generate_secure_token():
    """Generate a cryptographically secure token"""
    return secrets.token_urlsafe(32)

def hash_token(token):
    """Hash token for secure storage"""
    return hashlib.sha256(token.encode()).hexdigest()

def is_rate_limited(client_ip):
    """Check if client is rate limited (max 5 tokens per hour)"""
    current_time = time.time()
    hour_ago = current_time - 3600
    
    # Clean old entries
    RATE_LIMIT_STORE[client_ip] = [
        timestamp for timestamp in RATE_LIMIT_STORE.get(client_ip, [])
        if timestamp > hour_ago
    ]
    
    # Check if under limit
    return len(RATE_LIMIT_STORE.get(client_ip, [])) >= 5

def add_rate_limit(client_ip):
    """Add rate limit entry for client"""
    if client_ip not in RATE_LIMIT_STORE:
        RATE_LIMIT_STORE[client_ip] = []
    RATE_LIMIT_STORE[client_ip].append(time.time())

def store_token(token, client_ip, description="API Token"):
    """Store token with metadata"""
    token_hash = hash_token(token)
    TOKEN_STORE[token_hash] = {
        'token': token,  # Only store for demo - remove in production
        'created_at': datetime.utcnow().isoformat(),
        'expires_at': (datetime.utcnow() + timedelta(days=30)).isoformat(),
        'client_ip': client_ip,
        'description': description,
        'last_used': None,
        'is_active': True
    }

def validate_token(token):
    """Validate token and update last_used"""
    if not token:
        return False, "No token provided"
    
    # Remove 'Bearer ' prefix if present
    if token.startswith('Bearer '):
        token = token[7:]
    
    token_hash = hash_token(token)
    
    if token_hash not in TOKEN_STORE:
        return False, "Invalid token"
    
    token_data = TOKEN_STORE[token_hash]
    
    # Check if token is active
    if not token_data.get('is_active', True):
        return False, "Token has been revoked"
    
    # Check expiration
    expires_at = datetime.fromisoformat(token_data['expires_at'])
    if datetime.utcnow() > expires_at:
        return False, "Token has expired"
    
    # Update last used
    token_data['last_used'] = datetime.utcnow().isoformat()
    
    return True, "Valid token"

def revoke_token(token):
    """Revoke a token"""
    if not token:
        return False, "No token provided"
    
    if token.startswith('Bearer '):
        token = token[7:]
    
    token_hash = hash_token(token)
    
    if token_hash in TOKEN_STORE:
        TOKEN_STORE[token_hash]['is_active'] = False
        return True, "Token revoked successfully"
    
    return False, "Token not found"

def list_tokens(client_ip=None):
    """List tokens (admin function)"""
    tokens = []
    for token_hash, data in TOKEN_STORE.items():
        if client_ip is None or data.get('client_ip') == client_ip:
            tokens.append({
                'token_hash': token_hash[:8] + '...',  # Partial hash for security
                'created_at': data['created_at'],
                'expires_at': data['expires_at'],
                'client_ip': data['client_ip'],
                'description': data['description'],
                'last_used': data['last_used'],
                'is_active': data['is_active']
            })
    return tokens

def get_auth_error_response():
    """Return standardized authentication error response"""
    return {
        'success': False,
        'error': 'Authentication required',
        'message': 'Please provide a valid API token in the Authorization header',
        'usage': {
            'header': 'Authorization: Bearer <your-token>',
            'get_token': '/api/generate-token'
        }
    }
