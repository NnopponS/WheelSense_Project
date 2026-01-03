"""
Message Summarizer for long message handling.
Phase 4C: Summarizes messages >500 chars for storage efficiency.
"""

import logging
from typing import Dict, Any

logger = logging.getLogger(__name__)

# Maximum message length before summarization
MAX_MESSAGE_LENGTH = 500


def summarize_long_message(message: str) -> str:
    """
    Summarize a long message for storage in chat history.
    Phase 4C: Simple truncation approach.
    
    Args:
        message: Full message text
        
    Returns:
        Summarized message (truncated to MAX_MESSAGE_LENGTH with indicator)
    """
    if not message or len(message) <= MAX_MESSAGE_LENGTH:
        return message
    
    # Simple truncation: take first MAX_MESSAGE_LENGTH - 30 chars, add indicator
    truncated = message[:MAX_MESSAGE_LENGTH - 30]
    # Try to truncate at word boundary if possible
    if truncated and truncated[-1] != ' ':
        last_space = truncated.rfind(' ')
        if last_space > MAX_MESSAGE_LENGTH - 50:  # Only if we don't lose too much
            truncated = truncated[:last_space]
    
    return f"{truncated}... (message continues)"


def should_summarize_message(message: str) -> bool:
    """
    Check if a message should be summarized.
    
    Args:
        message: Message text
        
    Returns:
        True if message length exceeds MAX_MESSAGE_LENGTH
    """
    return message and len(message) > MAX_MESSAGE_LENGTH

