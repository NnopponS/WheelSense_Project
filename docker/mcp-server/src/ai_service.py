"""
WheelSense Backend - AI Service
Gemini AI integration for behavior analysis, chat, and routine suggestions
Uses Gemini Flash for fast, intelligent responses
"""

import json
import logging
import re
import asyncio
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

import httpx

logger = logging.getLogger(__name__)

# Gemini Flash API configuration
GEMINI_FLASH_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent"


class AIService:
    """AI service for behavior analysis using Gemini."""
    
    def __init__(self, gemini_api_key: Optional[str] = None):
        self.gemini_api_key = gemini_api_key
        self.gemini_url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent"
        
        if gemini_api_key:
            logger.info("Gemini AI service initialized")
        else:
            logger.warning("Gemini API key not provided, AI features limited")
    
    def _parse_retry_after(self, error_text: str) -> Optional[float]:
        """
        Parse retry-after time from Gemini API error message.
        Returns seconds to wait, or None if limit is 0 (quota exhausted).
        """
        try:
            # Check if limit is 0 (quota completely exhausted)
            if re.search(r'limit:\s*0', error_text, re.IGNORECASE):
                return None  # Don't retry if limit is 0
            
            # Look for "Please retry in X.XXXXXXs" pattern (seconds)
            match = re.search(r'Please retry in ([\d.]+)s', error_text, re.IGNORECASE)
            if match:
                retry_seconds = float(match.group(1))
                # Minimum 1 second wait time
                return max(1.0, retry_seconds * 1.1)
            
            # Look for "Please retry in X.XXXXXXms" pattern (milliseconds)
            match = re.search(r'Please retry in ([\d.]+)ms', error_text, re.IGNORECASE)
            if match:
                retry_ms = float(match.group(1))
                retry_seconds = retry_ms / 1000.0
                # Minimum 1 second wait time (if less than 1s, use default)
                return max(1.0, retry_seconds * 1.1)
        except Exception as e:
            logger.warning(f"Could not parse retry-after time: {e}")
        
        # Default retry delay
        return 30.0
    
    def _is_quota_error(self, response: httpx.Response) -> Tuple[bool, Optional[str], bool]:
        """
        Check if response indicates a quota/rate limit error.
        Returns (is_quota_error, error_message, is_limit_zero)
        """
        if response.status_code in [429, 503]:
            try:
                error_data = response.json()
                error_obj = error_data.get("error", {})
                message = error_obj.get("message", "")
                
                # Check for quota-related keywords
                quota_keywords = [
                    "quota",
                    "rate limit",
                    "limit exceeded",
                    "free tier",
                    "Please retry"
                ]
                
                if any(keyword.lower() in message.lower() for keyword in quota_keywords):
                    # Check if limit is 0 (quota completely exhausted)
                    is_limit_zero = bool(re.search(r'limit:\s*0', message, re.IGNORECASE))
                    return True, message, is_limit_zero
            except Exception:
                pass
        
        return False, None, False
    
    async def _call_gemini_api(
        self,
        url: str,
        payload: Dict,
        max_retries: int = 3,
        timeout: float = 60.0
    ) -> Tuple[int, Optional[Dict], Optional[str]]:
        """
        Call Gemini API with retry logic for quota/rate limit errors.
        Returns (status_code, response_json, error_message)
        """
        if not self.gemini_api_key:
            return 503, None, "Gemini API key not configured"
        
        for attempt in range(max_retries):
            try:
                async with httpx.AsyncClient() as client:
                    response = await client.post(
                        f"{url}?key={self.gemini_api_key}",
                        json=payload,
                        timeout=timeout
                    )
                    
                    if response.status_code == 200:
                        try:
                            return 200, response.json(), None
                        except Exception as e:
                            logger.error(f"Failed to parse Gemini response: {e}")
                            return 500, None, f"Invalid response format: {str(e)}"
                    
                    # Check for quota/rate limit errors
                    is_quota, error_msg, is_limit_zero = self._is_quota_error(response)
                    
                    if is_quota:
                        # If limit is 0, quota is completely exhausted - don't retry
                        if is_limit_zero:
                            return response.status_code, None, (
                                f"Free tier quota exhausted (limit: 0). "
                                f"Your Gemini API free tier quota has been completely used. "
                                f"Please upgrade your plan at https://ai.google.dev/pricing or "
                                f"check your usage at https://ai.dev/usage?tab=rate-limit. "
                                f"Error details: {error_msg}"
                            )
                        
                        retry_after = self._parse_retry_after(error_msg or "")
                        
                        # Only retry if we have a valid retry time
                        if retry_after and attempt < max_retries - 1:
                            logger.warning(
                                f"Gemini API quota exceeded (attempt {attempt + 1}/{max_retries}). "
                                f"Retrying in {retry_after:.1f} seconds..."
                            )
                            await asyncio.sleep(retry_after)
                            continue
                        else:
                            # Last attempt failed or no retry time available
                            if retry_after:
                                retry_msg = f"Retry after {retry_after:.0f} seconds."
                            else:
                                retry_msg = "Please check your quota and billing."
                            
                            return response.status_code, None, (
                                f"Quota exceeded: {error_msg}. "
                                f"{retry_msg} "
                                f"For more information, visit https://ai.google.dev/gemini-api/docs/rate-limits "
                                f"or check usage at https://ai.dev/usage?tab=rate-limit"
                            )
                    
                    # Other errors
                    try:
                        error_data = response.json()
                        error_obj = error_data.get("error", {})
                        error_message = error_obj.get("message", f"HTTP {response.status_code}")
                    except Exception:
                        error_message = f"HTTP {response.status_code}: {response.text[:200]}"
                    
                    return response.status_code, None, error_message
                    
            except httpx.TimeoutException:
                if attempt < max_retries - 1:
                    logger.warning(f"Gemini API timeout (attempt {attempt + 1}/{max_retries}), retrying...")
                    await asyncio.sleep(5.0)
                    continue
                return 504, None, "Request timeout - Gemini API took too long to respond"
            
            except Exception as e:
                if attempt < max_retries - 1:
                    logger.warning(f"Gemini API error (attempt {attempt + 1}/{max_retries}): {e}, retrying...")
                    await asyncio.sleep(2.0 * (attempt + 1))  # Exponential backoff
                    continue
                return 500, None, f"Failed to connect to Gemini: {str(e)}"
        
        return 500, None, "Max retries exceeded"
    
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

        status_code, result, error_msg = await self._call_gemini_api(
            self.gemini_url,
            {
                "contents": [{
                    "parts": [{"text": prompt}]
                }]
            },
            timeout=30.0
        )
        
        if status_code == 200 and result:
            candidates = result.get("candidates", [])
            if candidates:
                content = candidates[0].get("content", {})
                parts = content.get("parts", [])
                if parts:
                    return parts[0].get("text", "")
        
        if error_msg:
            logger.error(f"Gemini API error: {error_msg}")
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

    async def chat_with_gemini(
        self,
        messages: List[Dict],
        system_prompt: Optional[str] = None,
        context: Optional[Dict] = None
    ) -> str:
        """
        Chat with Gemini Flash API for intelligent responses.
        Used for Analytics insights and Routine suggestions.
        """
        if not self.gemini_api_key:
            return "Gemini API key not configured. Please set GEMINI_API_KEY environment variable."
        
        # Build prompt with context if provided
        full_prompt = ""
        
        if system_prompt:
            full_prompt += f"System: {system_prompt}\n\n"
        
        if context:
            full_prompt += f"Context Information:\n{json.dumps(context, ensure_ascii=False, indent=2)}\n\n"
        
        # Build conversation history
        for msg in messages:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            full_prompt += f"{role.capitalize()}: {content}\n"
        
        status_code, result, error_msg = await self._call_gemini_api(
            GEMINI_FLASH_URL,
            {
                "contents": [{
                    "parts": [{"text": full_prompt}]
                }],
                "generationConfig": {
                    "temperature": 0.7,
                    "topK": 40,
                    "topP": 0.95,
                    "maxOutputTokens": 2048,
                },
                "safetySettings": [
                    {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE"},
                    {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE"},
                    {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE"},
                    {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE"}
                ]
            },
            timeout=60.0
        )
        
        if status_code == 200 and result:
            candidates = result.get("candidates", [])
            if candidates:
                content = candidates[0].get("content", {})
                parts = content.get("parts", [])
                if parts:
                    return parts[0].get("text", "No response generated")
        
        error_message = error_msg or f"Gemini API error: {status_code}"
        logger.error(f"Gemini Flash API error: {error_message}")
        return error_message

    async def suggest_routines(
        self,
        user_patterns: Dict,
        existing_routines: List[Dict],
        user_preferences: Optional[Dict] = None
    ) -> List[Dict]:
        """
        Use Gemini Flash to suggest new routines based on user patterns.
        For the Routines page.
        """
        if not self.gemini_api_key:
            return []
        
        prompt = f"""You are a smart home assistant for wheelchair users. Based on the user's behavior patterns, suggest personalized routines.

User Behavior Patterns:
- Room usage times: {json.dumps(user_patterns.get('room_time', {}), ensure_ascii=False)}
- Peak activity hours: {json.dumps(user_patterns.get('peak_hours', {}), ensure_ascii=False)}
- Appliance usage: {json.dumps(user_patterns.get('appliance_usage', {}), ensure_ascii=False)}

Existing Routines:
{json.dumps(existing_routines, ensure_ascii=False, indent=2)}

User Preferences:
{json.dumps(user_preferences or {}, ensure_ascii=False, indent=2)}

Suggest 3-5 new routines that would improve the user's quality of life. For each routine, provide:
1. name: Short descriptive name
2. description: What the routine does
3. trigger: When it should activate (time, condition, or event)
4. actions: List of actions (room, appliance, state)
5. priority: high, medium, or low

Respond in JSON format only, as an array of routine objects."""

        status_code, result, error_msg = await self._call_gemini_api(
            GEMINI_FLASH_URL,
            {
                "contents": [{
                    "parts": [{"text": prompt}]
                }],
                "generationConfig": {
                    "temperature": 0.8,
                    "maxOutputTokens": 2048,
                }
            },
            timeout=60.0
        )
        
        if status_code == 200 and result:
            candidates = result.get("candidates", [])
            if candidates:
                content = candidates[0].get("content", {})
                parts = content.get("parts", [])
                if parts:
                    text = parts[0].get("text", "")
                    # Try to parse JSON from response
                    try:
                        # Clean up response if it has markdown code blocks
                        if "```json" in text:
                            text = text.split("```json")[1].split("```")[0]
                        elif "```" in text:
                            text = text.split("```")[1].split("```")[0]
                        return json.loads(text.strip())
                    except json.JSONDecodeError:
                        logger.warning(f"Could not parse routine suggestions: {text}")
                        return []
        
        if error_msg:
            logger.error(f"Routine suggestion failed: {error_msg}")
        return []

    async def analyze_analytics_data(
        self,
        timeline_data: List[Dict],
        patient_data: Dict,
        question: Optional[str] = None
    ) -> Dict:
        """
        Use Gemini Flash to provide analytics insights.
        For the Analytics page.
        """
        if not self.gemini_api_key:
            return {"error": "Gemini API key not configured"}
        
        context = f"""You are analyzing data for a wheelchair user monitoring system.

Patient Information:
- Name: {patient_data.get('name', 'Unknown')}
- Age: {patient_data.get('age', 'Unknown')}
- Wheelchair ID: {patient_data.get('wheelchairId', 'Unknown')}

Recent Timeline Events (last 50):
{json.dumps(timeline_data[:50] if timeline_data else [], ensure_ascii=False, indent=2)}

"""
        
        if question:
            prompt = context + f"User Question: {question}\n\nProvide a helpful, concise answer."
        else:
            prompt = context + """Provide a comprehensive analysis including:
1. Daily activity summary
2. Movement patterns
3. Potential health concerns
4. Recommendations for caregivers

Respond in a clear, structured format."""

        status_code, result, error_msg = await self._call_gemini_api(
            GEMINI_FLASH_URL,
            {
                "contents": [{
                    "parts": [{"text": prompt}]
                }],
                "generationConfig": {
                    "temperature": 0.5,
                    "maxOutputTokens": 2048,
                }
            },
            timeout=60.0
        )
        
        if status_code == 200 and result:
            candidates = result.get("candidates", [])
            if candidates:
                content = candidates[0].get("content", {})
                parts = content.get("parts", [])
                if parts:
                    return {
                        "analysis": parts[0].get("text", ""),
                        "generated_at": datetime.now().isoformat(),
                        "model": "gemini-2.0-flash-exp"
                    }
        
        error_message = error_msg or f"Gemini API error: {status_code}"
        logger.error(f"Analytics analysis failed: {error_message}")
        return {"error": error_message}
