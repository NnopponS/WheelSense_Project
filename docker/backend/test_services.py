"""
Test script for House Check and Schedule Checker services
Run this to verify both services work correctly
"""

import asyncio
import httpx
import json
from datetime import datetime, timedelta, timezone

BASE_URL = "http://localhost:8000"

async def test_house_check():
    """Test house check service triggers on location change"""
    print("\n" + "="*60)
    print("TESTING HOUSE CHECK SERVICE")
    print("="*60)
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            # 1. Check initial health
            print("\n1. Checking service health...")
            health = await client.get(f"{BASE_URL}/health")
            health_data = health.json()
            print(f"   House Check Status: {health_data['services'].get('house_check', 'unknown')}")
            
            # 2. Get current location
            print("\n2. Getting current location...")
            user_info = await client.get(f"{BASE_URL}/api/user-info")
            current_location = user_info.json().get("current_location", "Bedroom")
            print(f"   Current Location: {current_location}")
            
            # 3. Turn on a device in a different room
            print("\n3. Turning on device in different room...")
            target_room = "bedroom" if current_location.lower() != "bedroom" else "kitchen"
            device_result = await client.post(
                f"{BASE_URL}/appliances/{target_room}/control",
                json={"type": "Light", "state": True}
            )
            print(f"   Turned on {target_room} Light: {device_result.status_code == 200}")
            
            # 4. Change location to trigger house check
            print(f"\n4. Changing location to trigger house check...")
            new_location = "Kitchen" if current_location != "Kitchen" else "Bedroom"
            location_result = await client.put(
                f"{BASE_URL}/api/user-info",
                json={"current_location": new_location}
            )
            print(f"   Location updated: {location_result.status_code == 200}")
            
            # 5. Check chat history for notification
            print("\n5. Checking for house check notification...")
            await asyncio.sleep(1)  # Wait a moment for notification to be saved
            chat_history = await client.get(f"{BASE_URL}/chat/history?limit=5")
            history = chat_history.json()
            
            notification_found = False
            for msg in history:
                if msg.get("is_notification") and "house_check" in str(msg.get("notification_type", "")).lower():
                    print(f"   ✅ House check notification found: {msg.get('content', '')[:100]}")
                    notification_found = True
                    break
            
            if not notification_found:
                print("   ⚠️  No house check notification found in recent chat history")
                print("   Recent messages:")
                for msg in history[:3]:
                    print(f"      - {msg.get('content', '')[:80]}")
            
            return notification_found
            
        except Exception as e:
            print(f"   ❌ Error testing house check: {e}")
            return False

async def test_schedule_checker():
    """Test schedule checker service triggers at scheduled time"""
    print("\n" + "="*60)
    print("TESTING SCHEDULE CHECKER SERVICE")
    print("="*60)
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            # 1. Check service health
            print("\n1. Checking service health...")
            health = await client.get(f"{BASE_URL}/health")
            health_data = health.json()
            schedule_status = health_data['services'].get('schedule_checker', 'unknown')
            print(f"   Schedule Checker Status: {schedule_status}")
            
            if schedule_status != "ok":
                print(f"   ⚠️  Schedule checker is not running properly!")
                return False
            
            # 2. Get current time and create test schedule
            print("\n2. Creating test schedule item...")
            gmt7 = timezone(timedelta(hours=7))
            now = datetime.now(gmt7)
            # Schedule for 1 minute from now
            test_time = (now + timedelta(minutes=1)).strftime("%H:%M")
            test_date = now.strftime("%Y-%m-%d")
            
            print(f"   Test time: {test_time} on {test_date}")
            
            # 3. Add schedule via chat API
            schedule_message = f"Add test activity at {test_time}"
            chat_result = await client.post(
                f"{BASE_URL}/chat",
                json={"message": schedule_message}
            )
            print(f"   Schedule added: {chat_result.status_code == 200}")
            
            # 4. Set custom time to match schedule time (for testing)
            print(f"\n3. Setting custom time to {test_time} for testing...")
            # Check if custom time endpoint exists
            try:
                custom_time_result = await client.post(
                    f"{BASE_URL}/api/schedule/custom-time",
                    json={"time": test_time, "date": test_date}
                )
                print(f"   Custom time set: {custom_time_result.status_code == 200}")
                if custom_time_result.status_code == 200:
                    print(f"   Response: {custom_time_result.json()}")
            except Exception as e:
                print(f"   ⚠️  Custom time endpoint error: {e}")
            
            # 5. Wait and check for notification
            print(f"\n4. Waiting for schedule check (checking every 60 seconds)...")
            print(f"   (If custom time is set, notification should appear immediately)")
            
            # Check immediately if custom time was set
            await asyncio.sleep(2)
            
            # 6. Check chat history for schedule notification
            print("\n5. Checking for schedule notification...")
            chat_history = await client.get(f"{BASE_URL}/chat/history?limit=10")
            history = chat_history.json()
            
            notification_found = False
            for msg in history:
                content = msg.get("content", "")
                if msg.get("is_notification") and ("test activity" in content.lower() or "It's time to" in content):
                    print(f"   ✅ Schedule notification found: {content[:100]}")
                    notification_found = True
                    break
            
            if not notification_found:
                print("   ⚠️  No schedule notification found yet")
                print("   Note: Schedule checker runs every 60 seconds")
                print("   If custom time was set, try checking again in a few seconds")
                print("   Recent messages:")
                for msg in history[:5]:
                    print(f"      - {msg.get('content', '')[:80]}")
            
            return notification_found
            
        except Exception as e:
            print(f"   ❌ Error testing schedule checker: {e}")
            import traceback
            traceback.print_exc()
            return False

async def main():
    """Run all tests"""
    print("\n" + "="*60)
    print("HOUSE CHECK & SCHEDULE CHECKER TEST SUITE")
    print("="*60)
    print(f"Testing against: {BASE_URL}")
    print(f"Make sure backend is running: docker-compose up -d backend")
    
    # Test house check
    house_check_result = await test_house_check()
    
    # Test schedule checker
    schedule_result = await test_schedule_checker()
    
    # Summary
    print("\n" + "="*60)
    print("TEST SUMMARY")
    print("="*60)
    print(f"House Check Service: {'✅ PASSED' if house_check_result else '❌ FAILED'}")
    print(f"Schedule Checker Service: {'✅ PASSED' if schedule_result else '⚠️  NEEDS VERIFICATION'}")
    print("\nNote: Schedule checker runs every 60 seconds.")
    print("If it didn't trigger, wait up to 60 seconds or use custom time feature.")

if __name__ == "__main__":
    asyncio.run(main())

