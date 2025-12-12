#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Test Chat API endpoint
"""
import requests
import json
import sys
import io

# Fix encoding for Windows
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

def test_chat():
    """Test chat endpoint"""
    url = "http://localhost/mcp/chat"
    data = {
        "messages": [{"role": "user", "content": "hello"}],
        "tools": [],
        "stream": False
    }
    
    print("Testing Chat API...")
    print(f"URL: {url}")
    print(f"Request: {json.dumps(data, indent=2, ensure_ascii=False)}")
    print()
    
    try:
        response = requests.post(url, json=data, timeout=30)
        print(f"Status Code: {response.status_code}")
        print(f"Response Headers: {dict(response.headers)}")
        print()
        
        if response.status_code == 200:
            result = response.json()
            print("Response:")
            print(json.dumps(result, indent=2, ensure_ascii=False))
            print()
            
            if "response" in result:
                print(f"AI Response: {result['response']}")
                if "Error:" in result['response']:
                    print("\n⚠️ Warning: Response contains error message!")
                    print("This means Ollama model is not available.")
        else:
            print(f"Error Response: {response.text}")
            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_chat()

