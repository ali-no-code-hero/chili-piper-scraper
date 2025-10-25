import json
from datetime import datetime

def handler(request):
    """Vercel serverless function handler"""
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Content-Type': 'application/json'
    }
    
    if request.method == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({'message': 'OK'})
        }
    
    response = {
        'status': 'healthy',
        'timestamp': datetime.now().isoformat(),
        'service': 'Chili Piper Slot Scraper'
    }
    
    return {
        'statusCode': 200,
        'headers': headers,
        'body': json.dumps(response)
    }
