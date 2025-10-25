import json
import secrets
import hashlib
from datetime import datetime, timedelta
import os

# Manual API keys - add/remove keys here
MANUAL_API_KEYS = {
    # Format: "key_name": "actual_key_value"
    "vendor_1": "cp_live_abc123def456ghi789jkl012mno345pqr678stu901vwx234yz567",
    "vendor_2": "cp_live_xyz789uvw456rst123qpo098nml765kji432hgf109edc876bca543",
    "internal_team": "cp_live_internal_team_key_2024_secure_123456789abcdef",
    "demo_client": "cp_live_demo_client_key_2024_secure_987654321fedcba"
}

# Key metadata for tracking
KEY_METADATA = {
    "cp_live_abc123def456ghi789jkl012mno345pqr678stu901vwx234yz567": {
        "name": "vendor_1",
        "created_at": "2024-10-25T00:00:00Z",
        "expires_at": "2025-10-25T00:00:00Z",
        "description": "Primary vendor API key",
        "permissions": ["get-slots"],
        "is_active": True,
        "last_used": None
    },
    "cp_live_xyz789uvw456rst123qpo098nml765kji432hgf109edc876bca543": {
        "name": "vendor_2", 
        "created_at": "2024-10-25T00:00:00Z",
        "expires_at": "2025-10-25T00:00:00Z",
        "description": "Secondary vendor API key",
        "permissions": ["get-slots"],
        "is_active": True,
        "last_used": None
    },
    "cp_live_internal_team_key_2024_secure_123456789abcdef": {
        "name": "internal_team",
        "created_at": "2024-10-25T00:00:00Z", 
        "expires_at": "2025-10-25T00:00:00Z",
        "description": "Internal team API key",
        "permissions": ["get-slots"],
        "is_active": True,
        "last_used": None
    },
    "cp_live_demo_client_key_2024_secure_987654321fedcba": {
        "name": "demo_client",
        "created_at": "2024-10-25T00:00:00Z",
        "expires_at": "2025-01-25T00:00:00Z",  # Shorter expiry for demo
        "description": "Demo client API key",
        "permissions": ["get-slots"],
        "is_active": True,
        "last_used": None
    }
}

def generate_manual_key(name, description, expires_days=365):
    """Generate a new manual API key"""
    # Generate secure random key with prefix
    random_part = secrets.token_urlsafe(32)
    key = f"cp_live_{random_part}"
    
    # Add to manual keys
    MANUAL_API_KEYS[name] = key
    
    # Add metadata
    KEY_METADATA[key] = {
        "name": name,
        "created_at": datetime.utcnow().isoformat(),
        "expires_at": (datetime.utcnow() + timedelta(days=expires_days)).isoformat(),
        "description": description,
        "permissions": ["get-slots"],
        "is_active": True,
        "last_used": None
    }
    
    return key

def validate_manual_key(key):
    """Validate a manual API key"""
    if not key:
        return False, "No API key provided"
    
    # Remove 'Bearer ' prefix if present
    if key.startswith('Bearer '):
        key = key[7:]
    
    # Check if key exists
    if key not in KEY_METADATA:
        return False, "Invalid API key"
    
    metadata = KEY_METADATA[key]
    
    # Check if key is active
    if not metadata.get('is_active', True):
        return False, "API key has been deactivated"
    
    # Update last used
    metadata['last_used'] = datetime.utcnow().isoformat()
    
    return True, "Valid API key"

def deactivate_key(key):
    """Deactivate a manual API key"""
    if key in KEY_METADATA:
        KEY_METADATA[key]['is_active'] = False
        return True, "Key deactivated successfully"
    return False, "Key not found"

def list_active_keys():
    """List all active API keys (for admin use)"""
    active_keys = []
    for key, metadata in KEY_METADATA.items():
        if metadata.get('is_active', True):
            active_keys.append({
                "name": metadata['name'],
                "key_preview": key[:20] + "..." + key[-10:],  # Show partial key
                "description": metadata['description'],
                "created_at": metadata['created_at'],
                "expires_at": metadata['expires_at'],
                "last_used": metadata['last_used']
            })
    return active_keys

def get_auth_error_response():
    """Return standardized authentication error response"""
    return {
        'success': False,
        'error': 'Authentication required',
        'message': 'Please provide a valid API key in the Authorization header',
        'usage': {
            'header': 'Authorization: Bearer <your-api-key>',
            'contact': 'Contact administrator for API key'
        }
    }
