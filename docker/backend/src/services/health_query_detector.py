"""
Health Query Detector for RAG integration.
Determines if a user query should trigger RAG retrieval for health knowledge.
Phase 4D: Health-focused query detection.
"""

import logging
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)


def should_call_rag(
    user_message: str,
    user_condition: str = None,
    chat_history: List[Dict[str, Any]] = None,
    current_activity: Dict[str, Any] = None
) -> bool:
    """
    Determine if RAG should be called based on user message.
    
    Decision rules:
    1. Health-related keywords present (symptom, disease, medication, etc.)
    2. User has condition AND query is general health question
    3. Explicit health questions (what is, how to, tell me about)
    4. Follow-up queries (yes, please) to lifestyle questions when user has condition
    5. "What should I do?" queries with CURRENT ACTIVITY that is lifestyle-related
    
    Args:
        user_message: User's input message
        user_condition: Optional user condition context (e.g., "diabetes")
        chat_history: Optional chat history to check for context (for follow-up detection)
        current_activity: Optional dict with current activity info: {"activity": str, "time": str, ...}
    
    Returns:
        True if RAG should be called, False otherwise
    """
    if not user_message or not isinstance(user_message, str):
        return False
    
    message_lower = user_message.lower().strip()
    
    # Check if user is asking "What should I do?" with a CURRENT ACTIVITY
    if current_activity and current_activity.get("activity"):
        activity_name = current_activity.get("activity", "").lower()
        
        # Check if it's a "What should I do?" query
        what_should_queries = [
            "what should i do", "what should i", "what do i need to do",
            "what do i do", "how should i"
        ]
        is_what_should_query = any(phrase in message_lower for phrase in what_should_queries)
        
        # Check if current activity is lifestyle-related
        lifestyle_activities = [
            "exercise", "workout", "breakfast", "lunch", "dinner", "meal",
            "sleep", "rest", "activity"
        ]
        is_lifestyle_activity = any(keyword in activity_name for keyword in lifestyle_activities)
        
        # If user has condition AND asking about current lifestyle activity, trigger RAG
        if is_what_should_query and is_lifestyle_activity and user_condition and user_condition.strip():
            return True
    
    # Health-related keywords
    health_keywords = [
        "symptom", "symptoms", "disease", "diseases", "condition", "conditions",
        "medication", "medications", "medicine", "treatment", "treatments",
        "diagnosis", "diagnose", "therapy", "therapeutic", "health", "medical",
        "doctor", "physician", "hospital", "clinic", "patient", "illness",
        "disorder", "syndrome", "infection", "chronic", "acute", "pain",
        "blood pressure", "blood sugar", "glucose", "insulin", "heart",
        "lung", "breathing", "respiratory", "cardiac", "diabetes", "hypertension",
        "arthritis", "copd", "dementia", "depression", "stroke", "parkinson",
        "osteoporosis", "neuropathy", "vision loss", "hearing loss"
    ]
    
    # Question patterns that indicate health queries
    health_question_patterns = [
        "what is", "what are", "how to", "how do", "how should", "tell me about", "explain",
        "what causes", "what are the", "how can i", "what should i",
        "is it safe", "can i", "should i", "what happens"
    ]
    
    # Device/schedule control keywords (exclude these)
    control_keywords = [
        "turn on", "turn off", "switch", "control", "device", "light", "ac", "tv",
        "fan", "alarm", "schedule", "add", "delete", "change", "meeting",
        "appointment", "remind", "notification"
    ]
    
    # Check if message contains device/schedule control keywords (exclude)
    if any(keyword in message_lower for keyword in control_keywords):
        return False
    
    # Check for explicit health keywords
    if any(keyword in message_lower for keyword in health_keywords):
        return True
    
    # Check for health question patterns
    if any(pattern in message_lower for pattern in health_question_patterns):
        # Additional check: if user has condition, more likely to be health-related
        if user_condition and user_condition.strip():
            return True
        # If no condition but question pattern matches, still check if it's health-related
        # by looking for context clues
        health_context_words = [
            "eat", "food", "diet", "exercise", "manage", "prevent", "care",
            "meal", "breakfast", "lunch", "dinner", "snack", "sugar", "honey",
            "sweet", "carbohydrate", "protein", "workout", "activity", "activities",
            "sleep", "rest", "routine", "lifestyle", "wellness", "fitness"
        ]
        if any(word in message_lower for word in health_context_words):
            return True
    
    # If user has condition and query is about lifestyle recommendations, trigger RAG
    if user_condition and user_condition.strip():
        # Check if it's a general question (not device/schedule control)
        if not any(keyword in message_lower for keyword in ["device", "schedule", "turn", "switch", "control"]):
            # Lifestyle recommendation keywords - should trigger RAG when user has condition
            lifestyle_keywords = [
                "eat", "food", "meal", "breakfast", "lunch", "dinner", "snack",
                "exercise", "workout", "activity", "activities", "physical",
                "sleep", "rest", "routine", "lifestyle", "wellness", "fitness",
                "suggest", "recommend", "what should", "what can", "should i"
            ]
            if any(keyword in message_lower for keyword in lifestyle_keywords):
                return True
            # If it contains question words, likely health-related
            question_words = ["what", "how", "why", "when", "where", "which", "should", "can", "could"]
            if any(word in message_lower for word in question_words):
                return True
    
    # Check for follow-up responses to lifestyle questions (e.g., "yes, please" after food suggestion)
    # This helps catch cases where user responds to a lifestyle recommendation
    if user_condition and user_condition.strip() and chat_history:
        follow_up_patterns = [
            "yes", "please", "sure", "okay", "that sounds good", "tell me more", "go ahead"
        ]
        if any(pattern in message_lower for pattern in follow_up_patterns):
            # Check if last assistant message was about lifestyle (food, exercise, activities)
            if len(chat_history) >= 1:
                last_assistant_msg = None
                for msg in reversed(chat_history[-5:]):  # Check last 5 messages
                    if msg.get('role') == 'assistant':
                        last_assistant_msg = msg.get('content', '').lower()
                        break
                
                if last_assistant_msg:
                    lifestyle_keywords_in_response = [
                        "eat", "food", "meal", "breakfast", "lunch", "dinner", "snack",
                        "exercise", "workout", "activity", "activities", "physical",
                        "sleep", "rest", "routine", "lifestyle", "wellness", "fitness",
                        "suggest", "recommend", "oatmeal", "nutrition", "diet"
                    ]
                    if any(keyword in last_assistant_msg for keyword in lifestyle_keywords_in_response):
                        return True
    
    return False

