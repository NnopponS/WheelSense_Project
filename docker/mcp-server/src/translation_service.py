"""
Translation Service using Transformer Models
Uses Helsinki-NLP/opus-mt-en-th for English to Thai translation
"""

import logging
from typing import Optional, Dict
from functools import lru_cache

logger = logging.getLogger(__name__)

# Global model cache
_translation_model: Optional[object] = None
_translation_tokenizer: Optional[object] = None


def load_translation_model():
    """Load the translation model (lazy loading)."""
    global _translation_model, _translation_tokenizer
    
    if _translation_model is not None:
        return _translation_model, _translation_tokenizer
    
    try:
        from transformers import MarianMTModel, MarianTokenizer
        
        model_name = "Helsinki-NLP/opus-mt-en-th"
        logger.info(f"Loading translation model: {model_name}")
        
        _translation_tokenizer = MarianTokenizer.from_pretrained(model_name)
        _translation_model = MarianMTModel.from_pretrained(model_name)
        
        logger.info("✅ Translation model loaded successfully")
        return _translation_model, _translation_tokenizer
        
    except Exception as e:
        logger.error(f"Failed to load translation model: {e}")
        logger.warning("Translation will fallback to original text")
        return None, None


def translate_text(text: str, source_lang: str = "en", target_lang: str = "th") -> str:
    """
    Translate text using transformer model.
    
    Args:
        text: Text to translate
        source_lang: Source language code (default: "en")
        target_lang: Target language code (default: "th")
    
    Returns:
        Translated text, or original text if translation fails
    """
    # If same language, return as-is
    if source_lang == target_lang:
        return text
    
    # Only support EN->TH for now
    if source_lang != "en" or target_lang != "th":
        logger.warning(f"Unsupported language pair: {source_lang}->{target_lang}")
        return text
    
    # Load model if not already loaded
    model, tokenizer = load_translation_model()
    
    if model is None or tokenizer is None:
        logger.warning("Translation model not available, returning original text")
        return text
    
    try:
        # Tokenize input
        inputs = tokenizer(text, return_tensors="pt", padding=True, truncation=True, max_length=512)
        
        # Translate
        translated = model.generate(**inputs, max_length=512, num_beams=4, early_stopping=True)
        
        # Decode output
        translated_text = tokenizer.decode(translated[0], skip_special_tokens=True)
        
        return translated_text
        
    except Exception as e:
        logger.error(f"Translation error: {e}")
        return text


# Server-side cache for translations
_translation_cache: Dict[str, str] = {}
_cache_max_size = 1000


def get_cached_translation(text: str, source_lang: str, target_lang: str) -> Optional[str]:
    """Get cached translation if available."""
    cache_key = f"{source_lang}::{target_lang}::{text}"
    return _translation_cache.get(cache_key)


def cache_translation(text: str, translated: str, source_lang: str, target_lang: str):
    """Cache a translation result."""
    cache_key = f"{source_lang}::{target_lang}::{text}"
    
    # Simple LRU: if cache is full, remove oldest entry (simple FIFO)
    if len(_translation_cache) >= _cache_max_size:
        # Remove first item (oldest)
        first_key = next(iter(_translation_cache))
        del _translation_cache[first_key]
    
    _translation_cache[cache_key] = translated


def translate_with_cache(text: str, source_lang: str = "en", target_lang: str = "th") -> str:
    """
    Translate text with caching.
    
    Args:
        text: Text to translate
        source_lang: Source language (default: "en")
        target_lang: Target language (default: "th")
    
    Returns:
        Translated text
    """
    # Check cache first
    cached = get_cached_translation(text, source_lang, target_lang)
    if cached is not None:
        return cached
    
    # Translate
    translated = translate_text(text, source_lang, target_lang)
    
    # Cache result
    cache_translation(text, translated, source_lang, target_lang)
    
    return translated

