#!/usr/bin/env python3
"""
API Key Management Script
Use this to generate, list, and manage API keys manually
"""

import sys
import os
sys.path.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'api'))
from manual_auth import generate_manual_key, list_active_keys, deactivate_key, KEY_METADATA
from datetime import datetime

def print_header():
    print("=" * 60)
    print("🔐 CHILI PIPER API KEY MANAGEMENT")
    print("=" * 60)

def generate_new_key():
    """Generate a new API key"""
    print("\n📝 Generate New API Key")
    print("-" * 30)
    
    name = input("Key name (e.g., 'vendor_company'): ").strip()
    if not name:
        print("❌ Key name is required")
        return
    
    description = input("Description (e.g., 'Vendor Company API Access'): ").strip()
    if not description:
        description = f"API key for {name}"
    
    try:
        expires_days = int(input("Expires in days (default 365): ").strip() or "365")
    except ValueError:
        expires_days = 365
    
    # Generate the key
    key = generate_manual_key(name, description, expires_days)
    
    print(f"\n✅ API Key Generated Successfully!")
    print(f"📋 Key Name: {name}")
    print(f"📝 Description: {description}")
    print(f"🔑 API Key: {key}")
    print(f"📅 Expires: {expires_days} days from now")
    print(f"\n⚠️  IMPORTANT: Save this key securely - it cannot be recovered!")
    print(f"💡 Usage: Authorization: Bearer {key}")

def list_keys():
    """List all active API keys"""
    print("\n📋 Active API Keys")
    print("-" * 30)
    
    keys = list_active_keys()
    if not keys:
        print("No active API keys found")
        return
    
    for i, key_info in enumerate(keys, 1):
        print(f"\n{i}. {key_info['name']}")
        print(f"   Key: {key_info['key_preview']}")
        print(f"   Description: {key_info['description']}")
        print(f"   Created: {key_info['created_at']}")
        print(f"   Expires: {key_info['expires_at']}")
        print(f"   Last Used: {key_info['last_used'] or 'Never'}")

def deactivate_key_menu():
    """Deactivate an API key"""
    print("\n🚫 Deactivate API Key")
    print("-" * 30)
    
    keys = list_active_keys()
    if not keys:
        print("No active API keys found")
        return
    
    print("Select key to deactivate:")
    for i, key_info in enumerate(keys, 1):
        print(f"{i}. {key_info['name']} - {key_info['key_preview']}")
    
    try:
        choice = int(input("\nEnter number: ").strip())
        if 1 <= choice <= len(keys):
            selected_key = keys[choice - 1]
            # Find the full key
            for full_key, metadata in KEY_METADATA.items():
                if metadata['name'] == selected_key['name']:
                    success, message = deactivate_key(full_key)
                    if success:
                        print(f"✅ {message}")
                    else:
                        print(f"❌ {message}")
                    break
        else:
            print("❌ Invalid selection")
    except ValueError:
        print("❌ Invalid input")

def show_usage_instructions():
    """Show usage instructions"""
    print("\n📖 Usage Instructions")
    print("-" * 30)
    print("""
🔐 API Key Security:
- Store keys securely (environment variables, secret managers)
- Never commit keys to version control
- Rotate keys regularly
- Monitor key usage

📡 API Usage:
- Endpoint: POST /api/get-slots
- Header: Authorization: Bearer <your-api-key>
- Content-Type: application/json

📋 Request Format:
{
  "first_name": "John",
  "last_name": "Doe",
  "email": "john@example.com",
  "phone": "5551234567"
}

🛡️ Security Features:
- Keys expire automatically
- Usage tracking (last_used timestamps)
- Easy key deactivation
- No rate limiting (manual control)
""")

def main():
    print_header()
    
    while True:
        print("\n🔧 Management Options:")
        print("1. Generate new API key")
        print("2. List active keys")
        print("3. Deactivate key")
        print("4. Show usage instructions")
        print("5. Exit")
        
        choice = input("\nSelect option (1-5): ").strip()
        
        if choice == "1":
            generate_new_key()
        elif choice == "2":
            list_keys()
        elif choice == "3":
            deactivate_key_menu()
        elif choice == "4":
            show_usage_instructions()
        elif choice == "5":
            print("\n👋 Goodbye!")
            break
        else:
            print("❌ Invalid option. Please select 1-5.")

if __name__ == "__main__":
    main()
