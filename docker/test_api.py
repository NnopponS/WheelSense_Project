#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Test script for WheelSense API endpoints
"""
import requests
import json
import sys
import io

# Fix encoding for Windows
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

def test_endpoint(name, url, method='GET', data=None):
    """Test an API endpoint"""
    try:
        if method == 'GET':
            response = requests.get(url, timeout=5)
        elif method == 'POST':
            response = requests.post(url, json=data, timeout=10)
        else:
            print(f"❌ {name}: Unsupported method {method}")
            return False
        
        status = "✅" if response.status_code < 400 else "⚠️"
        print(f"{status} {name}: {response.status_code} - {url}")
        
        if response.status_code >= 400:
            try:
                error_data = response.json()
                print(f"   Error: {error_data.get('detail', error_data)}")
            except:
                print(f"   Error: {response.text[:100]}")
        
        return response.status_code < 400
    except requests.exceptions.ConnectionError:
        print(f"❌ {name}: Connection refused - {url}")
        return False
    except requests.exceptions.Timeout:
        print(f"⚠️ {name}: Timeout - {url}")
        return False
    except Exception as e:
        print(f"❌ {name}: {str(e)} - {url}")
        return False

def main():
    print("=" * 60)
    print("WheelSense API Health Check")
    print("=" * 60)
    print()
    
    results = []
    
    # Test MCP Server directly
    print("📡 Testing MCP Server (Direct):")
    results.append(("MCP Health", test_endpoint("MCP Health", "http://localhost:8080/health")))
    print()
    
    # Test MCP Server through nginx
    print("📡 Testing MCP Server (via Nginx):")
    results.append(("MCP Health (Nginx)", test_endpoint("MCP Health", "http://localhost/mcp/health")))
    print()
    
    # Test Backend API
    print("📡 Testing Backend API:")
    results.append(("Backend Health", test_endpoint("Backend Health", "http://localhost:8000/health")))
    results.append(("Backend Health (Nginx)", test_endpoint("Backend Health", "http://localhost/api/health")))
    print()
    
    # Test Chat endpoint
    print("📡 Testing Chat API:")
    chat_data = {
        "messages": [{"role": "user", "content": "hello"}],
        "tools": [],
        "stream": False
    }
    results.append(("Chat (Direct)", test_endpoint("Chat", "http://localhost:8080/chat", "POST", chat_data)))
    results.append(("Chat (Nginx)", test_endpoint("Chat", "http://localhost/mcp/chat", "POST", chat_data)))
    print()
    
    # Test Ollama
    print("📡 Testing Ollama:")
    results.append(("Ollama Tags", test_endpoint("Ollama Tags", "http://localhost:11434/api/tags")))
    print()
    
    # Summary
    print("=" * 60)
    print("Summary:")
    print("=" * 60)
    passed = sum(1 for _, result in results if result)
    total = len(results)
    print(f"✅ Passed: {passed}/{total}")
    print(f"❌ Failed: {total - passed}/{total}")
    print()
    
    if passed == total:
        print("🎉 All tests passed!")
        return 0
    else:
        print("⚠️ Some tests failed. Check the output above for details.")
        return 1

if __name__ == "__main__":
    sys.exit(main())

