"""
WheelSense Backend - AI Service
Gemini AI integration for behavior analysis
"""

import json
import logging
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger(__name__)


class AIService:
    """AI service for behavior analysis using Gemini."""
    
    def __init__(self, gemini_api_key: Optional[str] = None):
        self.gemini_api_key = gemini_api_key
        self.gemini_url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent"
        
        if gemini_api_key:
            logger.info("Gemini AI service initialized")
        else:
            logger.warning("Gemini API key not provided, AI features limited")
    
    async def analyze_behavior(self, activities: List[Dict]) -> Dict:
        """Analyze user behavior patterns."""
        # Extract patterns from activities
        patterns = self._extract_patterns(activities)
        
        # Detect anomalies
        anomalies = self._detect_anomalies(patterns, activities)
        
        # Get Gemini analysis if API key available
        gemini_response = ""
        if self.gemini_api_key and activities:
            gemini_response = await self._get_gemini_analysis(patterns, anomalies, activities)
        
        return {
            "patterns": patterns,
            "anomalies": anomalies,
            "gemini_response": gemini_response,
            "analyzed_at": datetime.now().isoformat()
        }
    
    def _extract_patterns(self, activities: List[Dict]) -> Dict:
        """Extract behavior patterns from activities."""
        patterns = {
            "room_time": {},  # Time spent in each room
            "room_visits": {},  # Number of visits to each room
            "peak_hours": {},  # Activity by hour
            "appliance_usage": {},  # Appliance usage frequency
            "transitions": []  # Room transitions
        }
        
        rooms = ["bedroom", "bathroom", "kitchen", "livingroom"]
        for room in rooms:
            patterns["room_time"][room] = 0
            patterns["room_visits"][room] = 0
        
        for i in range(24):
            patterns["peak_hours"][i] = 0
        
        last_room = None
        last_time = None
        
        for activity in sorted(activities, key=lambda x: x.get("timestamp", "")):
            event_type = activity.get("eventType")
            room_id = activity.get("roomId")
            timestamp = activity.get("timestamp")
            
            if isinstance(timestamp, str):
                timestamp = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
            
            # Track room visits
            if event_type == "enter" and room_id:
                patterns["room_visits"][room_id] = patterns["room_visits"].get(room_id, 0) + 1
                
                # Track peak hours
                if timestamp:
                    hour = timestamp.hour
                    patterns["peak_hours"][hour] = patterns["peak_hours"].get(hour, 0) + 1
                
                # Track transitions
                if last_room and last_room != room_id:
                    patterns["transitions"].append({
                        "from": last_room,
                        "to": room_id,
                        "time": timestamp.isoformat() if timestamp else None
                    })
                
                last_room = room_id
                last_time = timestamp
            
            elif event_type == "exit" and room_id and last_time:
                # Calculate time spent
                if timestamp and last_time:
                    duration = (timestamp - last_time).total_seconds() / 60  # minutes
                    patterns["room_time"][room_id] = patterns["room_time"].get(room_id, 0) + duration
                last_time = None
            
            # Track appliance usage
            elif event_type in ["appliance_on", "appliance_off"]:
                details = activity.get("details", {})
                appliance = details.get("appliance")
                if appliance:
                    patterns["appliance_usage"][appliance] = patterns["appliance_usage"].get(appliance, 0) + 1
        
        return patterns
    
    def _detect_anomalies(self, patterns: Dict, activities: List[Dict]) -> List[Dict]:
        """Detect anomalies in behavior patterns."""
        anomalies = []
        
        # Check for prolonged bathroom stay (> 30 minutes)
        bathroom_time = patterns["room_time"].get("bathroom", 0)
        if bathroom_time > 30:
            anomalies.append({
                "type": "prolonged_stay",
                "room": "bathroom",
                "duration_minutes": bathroom_time,
                "severity": "medium" if bathroom_time < 60 else "high",
                "message": f"User has been in bathroom unusually long ({bathroom_time:.0f} minutes)"
            })
        
        # Check for prolonged bedroom stay during day (> 4 hours between 8am-6pm)
        bedroom_time = patterns["room_time"].get("bedroom", 0)
        # Simplified check - would need more context in production
        if bedroom_time > 240:  # 4 hours
            anomalies.append({
                "type": "prolonged_stay",
                "room": "bedroom",
                "duration_minutes": bedroom_time,
                "severity": "low",
                "message": f"User has been in bedroom for extended period ({bedroom_time:.0f} minutes)"
            })
        
        # Check for no activity (might indicate a problem)
        total_visits = sum(patterns["room_visits"].values())
        if total_visits == 0:
            anomalies.append({
                "type": "no_activity",
                "severity": "high",
                "message": "No user movement detected"
            })
        
        # Check for unusual peak hours (activity at unusual times)
        night_activity = sum(
            patterns["peak_hours"].get(h, 0) for h in [0, 1, 2, 3, 4, 5]
        )
        if night_activity > 5:
            anomalies.append({
                "type": "unusual_hours",
                "severity": "low",
                "message": f"Frequent movement detected during night hours ({night_activity} times)"
            })
        
        return anomalies
    
    async def _get_gemini_analysis(
        self,
        patterns: Dict,
        anomalies: List[Dict],
        activities: List[Dict]
    ) -> str:
        """Get AI analysis from Gemini."""
        if not self.gemini_api_key:
            return ""
        
        # Prepare prompt
        prompt = f"""You are an expert in elderly care and wheelchair user assistance. Please analyze the following behavior:

Usage patterns:
- Time in each room: {json.dumps(patterns['room_time'], ensure_ascii=False)}
- Number of room visits: {json.dumps(patterns['room_visits'], ensure_ascii=False)}
- Appliance usage: {json.dumps(patterns['appliance_usage'], ensure_ascii=False)}

Detected anomalies:
{json.dumps(anomalies, ensure_ascii=False, indent=2)}

Please:
1. Analyze overall behavior patterns
2. Assess health or safety risks
3. Provide recommendations for caregivers
4. Suggest quality of life improvements

Respond in English, concisely and clearly."""

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.gemini_url}?key={self.gemini_api_key}",
                    json={
                        "contents": [{
                            "parts": [{"text": prompt}]
                        }]
                    },
                    timeout=30.0
                )
                
                if response.status_code == 200:
                    result = response.json()
                    candidates = result.get("candidates", [])
                    if candidates:
                        content = candidates[0].get("content", {})
                        parts = content.get("parts", [])
                        if parts:
                            return parts[0].get("text", "")
                
                logger.error(f"Gemini API error: {response.status_code}")
                return ""
                
        except Exception as e:
            logger.error(f"Gemini API call failed: {e}")
            return ""
    
    async def generate_recommendations(self, analysis: Dict) -> List[Dict]:
        """Generate recommendations based on behavior analysis."""
        recommendations = []
        
        patterns = analysis.get("patterns", {})
        anomalies = analysis.get("anomalies", [])
        
        # Generate recommendations based on patterns
        room_time = patterns.get("room_time", {})
        
        # Encourage more living room time for social interaction
        livingroom_time = room_time.get("livingroom", 0)
        if livingroom_time < 60:  # Less than 1 hour
            recommendations.append({
                "type": "activity",
                "priority": "medium",
                "title": "Recommend spending more time in living room",
                "description": "Spending time in common areas promotes social interaction"
            })
        
        # Based on anomalies
        for anomaly in anomalies:
            if anomaly.get("type") == "prolonged_stay" and anomaly.get("room") == "bathroom":
                recommendations.append({
                    "type": "health",
                    "priority": "high",
                    "title": "Check digestive system health",
                    "description": "Extended bathroom time may indicate health issues"
                })
            
            elif anomaly.get("type") == "unusual_hours":
                recommendations.append({
                    "type": "wellness",
                    "priority": "medium",
                    "title": "Improve sleep quality",
                    "description": "Frequent night movement detected, may need medical consultation"
                })
        
        return recommendations
