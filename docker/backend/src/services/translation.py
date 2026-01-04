"""
Translation Service - Simple translation wrapper
Provides translation functionality with caching support.
"""

import logging
from typing import Dict, Optional

logger = logging.getLogger(__name__)

# Simple in-memory cache for translations
_translation_cache: Dict[str, str] = {}


def translate_with_cache(
    text: str,
    source_lang: str = "en",
    target_lang: str = "th"
) -> str:
    """
    Translate text from source language to target language with caching.
    
    Args:
        text: Text to translate
        source_lang: Source language code (default: "en")
        target_lang: Target language code (default: "th")
    
    Returns:
        Translated text. If translation fails, returns original text.
    
    Note: This is a stub implementation. For production use, integrate
    with a translation service (e.g., Helsinki-NLP, Google Translate API, etc.)
    """
    # If same language, return as-is
    if source_lang == target_lang:
        return text
    
    # Check cache
    cache_key = f"{source_lang}:{target_lang}:{text}"
    if cache_key in _translation_cache:
        return _translation_cache[cache_key]
    
    # TODO: Implement actual translation using transformer model or API
    # For now, return original text as fallback
    logger.warning(
        f"Translation not implemented: {source_lang} -> {target_lang}. "
        f"Returning original text."
    )
    
    # Cache the result (original text for now)
    _translation_cache[cache_key] = text
    
    return text


def clear_cache():
    """Clear the translation cache."""
    global _translation_cache
    _translation_cache.clear()

