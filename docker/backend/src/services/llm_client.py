"""
LLM Client for interacting with language models via Ollama.
Handles basic chat interactions without tool calling (Phase 4A).
"""

import logging
import httpx
from typing import List, Dict, Optional
from datetime import datetime
import time
from enum import Enum
import json
import re

logger = logging.getLogger(__name__)

# Phase 4F: Circuit breaker states
class CircuitState(Enum):
    CLOSED = "closed"  # Normal operation
    OPEN = "open"  # Failing, reject requests immediately
    HALF_OPEN = "half_open"  # Testing if service recovered


class LLMClient:
    """
    Client for interacting with LLM via Ollama.
    Phase 4A: Basic chat only, no tool calling.
    """
    
    def __init__(self, host: str, model: str):
        """
        Initialize LLM client with Ollama.
        
        Args:
            host: Ollama server host URL (e.g., "http://localhost:11434")
            model: Model name (e.g., "qwen2.5:7b")
        """
        self.host = host.rstrip('/')
        self.model = model
        self._connection_error = None
        self._client = httpx.AsyncClient(timeout=30.0)  # 30 second timeout
        
        # Phase 4F: Circuit breaker state
        self._circuit_state = CircuitState.CLOSED
        self._failure_count = 0
        self._last_failure_time = None
        self._circuit_open_time = None
        self._circuit_failure_threshold = 3  # Open after 3 failures
        self._circuit_failure_window = 60.0  # Within 60 seconds
        self._circuit_half_open_delay = 30.0  # Try half-open after 30 seconds
        
        # Pre-compile regex patterns for performance (from mcp_llm-wheelsense)
        self._compiled_patterns = {
            # Strategy 1: Markdown code blocks (most common format)
            'markdown_array': re.compile(r'```(?:json)?\s*(\[.*?\])\s*```', re.DOTALL),
            'markdown_object': re.compile(r'```(?:json)?\s*(\{.*?\})\s*```', re.DOTALL),
            # Strategy 2: Direct JSON patterns (without markdown)
            'json_array_with_tool': re.compile(r'\[[\s\S]*?\{[\s\S]*?"tool"[\s\S]*?\}[\s\S]*?\]', re.DOTALL),
            'json_object_with_tool': re.compile(r'\{[\s\S]*?"tool"[\s\S]*?\}', re.DOTALL),
            # Strategy 3: Fallback lenient patterns (only if above fail)
            'json_array_lenient': re.compile(r'\[[\s\S]*?\{[\s\S]*?\}[\s\S]*?\]', re.DOTALL),
            'json_object_lenient': re.compile(r'\{[\s\S]*?\}', re.DOTALL),
            # Structured text patterns (last resort)
            'tool_name': re.compile(r'tool["\']?\s*[:=]\s*["\']?(\w+)', re.IGNORECASE),
            'tool_arguments': re.compile(r'arguments["\']?\s*[:=]\s*(\{.*?\})', re.DOTALL),
        }
        
        logger.info(f"LLM Client initialized: host={host}, model={model}")
    
    async def validate_connection(self) -> Dict[str, any]:
        """
        Validate Ollama connection and model availability.
        
        Returns:
            dict with keys:
            - valid: bool - True if connection and model are available
            - ollama_accessible: bool - True if Ollama server is reachable
            - model_available: bool - True if model is available
            - message: str - Status message
        """
        try:
            # Check if Ollama server is accessible
            response = await self._client.get(f"{self.host}/api/tags")
            if response.status_code != 200:
                return {
                    "valid": False,
                    "ollama_accessible": False,
                    "model_available": False,
                    "message": f"Ollama server returned status {response.status_code}"
                }
            
            # Check if model is available
            models_data = response.json()
            available_models = [m.get("name", "") for m in models_data.get("models", [])]
            
            # Check if our model (or any tag of it) is available
            model_available = False
            for model_name in available_models:
                if self.model in model_name or model_name.startswith(self.model.split(':')[0]):
                    model_available = True
                    break
            
            if not model_available:
                return {
                    "valid": False,
                    "ollama_accessible": True,
                    "model_available": False,
                    "message": f"Model '{self.model}' not found. Available models: {', '.join(available_models[:5])}"
                }
            
            return {
                "valid": True,
                "ollama_accessible": True,
                "model_available": True,
                "message": f"Ollama connection valid, model '{self.model}' available"
            }
            
        except httpx.ConnectError:
            return {
                "valid": False,
                "ollama_accessible": False,
                "model_available": False,
                "message": f"Cannot connect to Ollama at {self.host}. Please ensure Ollama is running."
            }
        except Exception as e:
            logger.error(f"Error validating Ollama connection: {e}")
            return {
                "valid": False,
                "ollama_accessible": False,
                "model_available": False,
                "message": f"Error validating connection: {str(e)}"
            }
    
    def _check_circuit_breaker(self) -> bool:
        """
        Check circuit breaker state and update if needed.
        Phase 4F: Simple circuit breaker pattern.
        
        Returns:
            True if request should proceed, False if circuit is open
        """
        now = time.time()
        
        # Check if we should transition from OPEN to HALF_OPEN
        if self._circuit_state == CircuitState.OPEN:
            if self._circuit_open_time and (now - self._circuit_open_time) >= self._circuit_half_open_delay:
                self._circuit_state = CircuitState.HALF_OPEN
                self._failure_count = 0
                logger.info("Circuit breaker: Transitioning to HALF_OPEN state")
                return True
            else:
                # Circuit is still open, reject request
                return False
        
        # Reset failure count if outside failure window
        if self._last_failure_time and (now - self._last_failure_time) > self._circuit_failure_window:
            self._failure_count = 0
            if self._circuit_state == CircuitState.HALF_OPEN:
                # Successfully recovered
                self._circuit_state = CircuitState.CLOSED
                logger.info("Circuit breaker: Recovered, transitioning to CLOSED state")
        
        return True
    
    def _record_success(self):
        """Record successful request for circuit breaker."""
        if self._circuit_state == CircuitState.HALF_OPEN:
            # Success in half-open state, close circuit
            self._circuit_state = CircuitState.CLOSED
            self._failure_count = 0
            self._circuit_open_time = None
            logger.info("Circuit breaker: Success in HALF_OPEN, transitioning to CLOSED")
        else:
            # Reset failure count on success
            self._failure_count = 0
    
    def _record_failure(self):
        """Record failed request for circuit breaker."""
        now = time.time()
        self._last_failure_time = now
        
        # Reset failure count if outside failure window
        if self._last_failure_time and (now - self._last_failure_time) > self._circuit_failure_window:
            self._failure_count = 0
        
        self._failure_count += 1
        
        # Check if we should open circuit
        if self._failure_count >= self._circuit_failure_threshold:
            self._circuit_state = CircuitState.OPEN
            self._circuit_open_time = now
            logger.warning(f"Circuit breaker: Opening circuit after {self._failure_count} failures")
    
    async def chat(self, messages: List[Dict[str, str]], stream: bool = False, correlation_id: Optional[str] = None) -> str:
        """
        Call Ollama chat API and return response text.
        
        Args:
            messages: List of message dicts with 'role' and 'content' keys
            stream: Whether to use streaming (Phase 4A: False)
            correlation_id: Optional correlation ID for request tracing (Phase 4F)
            
        Returns:
            Response text from LLM
            
        Raises:
            httpx.HTTPError: If request fails
            ValueError: If response is invalid
        """
        if not messages:
            raise ValueError("Messages list cannot be empty")
        
        corr_id = correlation_id or "unknown"
        
        # Phase 4F: Check circuit breaker
        if not self._check_circuit_breaker():
            logger.warning(f"[{corr_id}] Circuit breaker is OPEN, rejecting request", extra={
                "correlation_id": corr_id,
                "circuit_state": self._circuit_state.value
            })
            raise httpx.HTTPError("LLM service is temporarily unavailable. Please try again in a moment.")
        
        try:
            # Prepare request payload
            payload = {
                "model": self.model,
                "messages": messages,
                "stream": stream,
                "options": {
                    "temperature": 0.7,
                    "num_ctx": 4096,
                    "top_p": 0.9
                }
            }
            
            # Call Ollama API
            response = await self._client.post(
                f"{self.host}/api/chat",
                json=payload
            )
            
            if response.status_code != 200:
                error_text = response.text
                logger.error(f"[{corr_id}] Ollama API error: {response.status_code}", extra={
                    "correlation_id": corr_id,
                    "status_code": response.status_code,
                    "error_text": error_text[:200]  # Truncate long errors
                })
                raise httpx.HTTPError(
                    f"Ollama API returned status {response.status_code}: {error_text}"
                )
            
            # Parse response
            response_data = response.json()
            
            # Extract message content
            if "message" in response_data and "content" in response_data["message"]:
                content = response_data["message"]["content"]
                if not content or not content.strip():
                    logger.warning(f"[{corr_id}] Ollama returned empty response", extra={
                        "correlation_id": corr_id
                    })
                    # Empty response is not a failure for circuit breaker
                    return "I'm sorry, I didn't receive a response. Please try again."
                
                # Phase 4F: Record success for circuit breaker
                self._record_success()
                return content.strip()
            else:
                logger.error(f"[{corr_id}] Unexpected Ollama response format", extra={
                    "correlation_id": corr_id,
                    "response_keys": list(response_data.keys()) if isinstance(response_data, dict) else "not_dict"
                })
                raise ValueError("Invalid response format from Ollama")
                
        except httpx.TimeoutException:
            # Phase 4F: Record failure for circuit breaker
            self._record_failure()
            logger.error(f"[{corr_id}] Ollama request timed out", extra={
                "correlation_id": corr_id
            })
            raise httpx.HTTPError("Request to Ollama timed out. Please try again.")
        except httpx.ConnectError:
            # Phase 4F: Record failure for circuit breaker
            self._record_failure()
            logger.error(f"[{corr_id}] Cannot connect to Ollama at {self.host}", extra={
                "correlation_id": corr_id,
                "host": self.host
            })
            raise httpx.HTTPError(
                f"Cannot connect to Ollama at {self.host}. Please ensure Ollama is running."
            )
        except Exception as e:
            # Phase 4F: Record failure for circuit breaker
            self._record_failure()
            logger.error(f"[{corr_id}] Error calling Ollama", extra={
                "correlation_id": corr_id,
                "error": str(e)
            }, exc_info=True)
            raise
    
    def _preprocess_response(self, response_text: str) -> str:
        """
        Preprocess LLM response to extract tool calls from reasoning text.
        Removes reasoning markers and tries to find JSON tool calls.
        
        Args:
            response_text: Raw response from LLM
            
        Returns:
            Cleaned response text with JSON tool calls
        """
        if not response_text:
            return ""
        
        # Remove common reasoning markers
        # DeepSeek-R1 uses </reasoning> or </think> tags
        # Check for </think> first (more specific)
        if "</think>" in response_text:
            # Extract everything after </think>
            parts = response_text.split("</think>")
            if len(parts) > 1:
                response_text = parts[-1].strip()
                logger.debug(f"[PREPROCESS] Found </think>, extracted: {response_text[:200]}")
        
        if "</reasoning>" in response_text:
            # Extract everything after </reasoning>
            parts = response_text.split("</reasoning>")
            if len(parts) > 1:
                response_text = parts[-1].strip()
                logger.debug(f"[PREPROCESS] Found </reasoning>, extracted: {response_text[:200]}")
        
        # Remove emoji reasoning markers and text before them
        # But be careful - only remove if we can find JSON after
        reasoning_markers = ["🛌", "💭", "🤔", "🔍", "📝"]
        for marker in reasoning_markers:
            if marker in response_text:
                # Try to find JSON after the marker
                marker_pos = response_text.find(marker)
                # Look for JSON array or object after the marker
                remaining = response_text[marker_pos + len(marker):].strip()
                # Only use remaining if we find JSON - otherwise keep original
                if "[" in remaining or "{" in remaining:
                    response_text = remaining
                    logger.debug(f"[PREPROCESS] Found {marker}, extracted JSON: {response_text[:200]}")
        
        # Try to extract JSON from the response
        # More aggressive: Find last JSON array/object in response (likely the actual tool call)
        # This handles cases where LLM repeats user message before JSON
        
        # Strategy 1: Look for JSON array patterns with "tool" keyword (multiple tool calls)
        json_arrays = list(re.finditer(r'\[[\s\S]*?\{[\s\S]*?"tool"[\s\S]*?\}[\s\S]*?\]', response_text))
        if json_arrays:
            # Get the last match (most likely the actual response)
            return json_arrays[-1].group(0).strip()
        
        # Strategy 2: Look for alternative format: ["tool_name", {...}]
        alt_format_arrays = list(re.finditer(r'\[[\s\S]*?"(?:chat_message|e_device_control|schedule_modifier|rag_query)"[\s\S]*?\{[\s\S]*?\}[\s\S]*?\]', response_text))
        if alt_format_arrays:
            # Get the last match
            return alt_format_arrays[-1].group(0).strip()
        
        # Strategy 3: Look for any JSON array that might contain tool calls (more lenient)
        any_json_arrays = list(re.finditer(r'\[[\s\S]*?\{[\s\S]*?\}[\s\S]*?\]', response_text))
        if any_json_arrays:
            # Check each match to see if it looks like a tool call
            for match in reversed(any_json_arrays):  # Start from last
                json_str = match.group(0).strip()
                # Check if it contains tool-related keywords
                if '"tool"' in json_str or '"schedule_modifier"' in json_str or '"chat_message"' in json_str or '"e_device_control"' in json_str:
                    return json_str
        
        # Strategy 4: Look for JSON object patterns with "tool" keyword (single tool call)
        json_objects = list(re.finditer(r'\{[\s\S]*?"tool"[\s\S]*?\}', response_text))
        if json_objects:
            # Get the last match
            return json_objects[-1].group(0).strip()
        
        # Strategy 5: Look for any JSON object that might be a tool call (more lenient)
        any_json_objects = list(re.finditer(r'\{[\s\S]*?\}', response_text))
        if any_json_objects:
            # Check each match to see if it looks like a tool call
            for match in reversed(any_json_objects):  # Start from last
                json_str = match.group(0).strip()
                # Check if it contains tool-related keywords
                if '"tool"' in json_str or '"schedule_modifier"' in json_str or '"chat_message"' in json_str or '"e_device_control"' in json_str:
                    return json_str
        
        # Return original if no JSON found
        return response_text.strip()
    
    def _try_repair_json(self, json_str: str) -> str:
        """
        Try to repair common JSON issues: missing quotes, trailing commas, unbalanced brackets.
        
        Args:
            json_str: Potentially malformed JSON string
            
        Returns:
            Repaired JSON string, or original if repair fails
        """
        if not json_str:
            return json_str
        
        json_str = json_str.strip()
        
        # Fix trailing commas
        json_str = re.sub(r',\s*}', '}', json_str)
        json_str = re.sub(r',\s*]', ']', json_str)
        
        # Fix missing quotes around keys (common LLM mistake)
        # Pattern: {key: value} -> {"key": value}
        json_str = re.sub(r'(\{|,)\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:', r'\1"\2":', json_str)
        
        # Try to balance brackets/braces
        open_braces = json_str.count('{')
        close_braces = json_str.count('}')
        open_brackets = json_str.count('[')
        close_brackets = json_str.count(']')
        
        # If it starts with [ or {, try to close it
        if json_str.startswith('[') and open_brackets > close_brackets:
            missing = open_brackets - close_brackets
            # Close any open objects first
            if open_braces > close_braces:
                json_str += '}' * (open_braces - close_braces)
            json_str += ']' * missing
        elif json_str.startswith('{') and open_braces > close_braces:
            missing = open_braces - close_braces
            json_str += '}' * missing
        
        return json_str
    
    def _parse_json_safely(self, json_str: str) -> Optional[dict]:
        """
        Safely parse JSON string with error handling.
        
        Args:
            json_str: JSON string to parse
            
        Returns:
            Parsed dict if successful, None otherwise
        """
        if not json_str:
            return None
        
        try:
            # Clean up the string
            json_str = json_str.strip()
            
            # Try to parse
            parsed = json.loads(json_str)
            
            # Validate structure
            if isinstance(parsed, dict):
                # Check if it looks like a tool call
                if "tool" in parsed:
                    return parsed
                # Maybe it's just the arguments?
                if "arguments" in parsed:
                    return parsed
            
            return None
        
        except json.JSONDecodeError:
            # Try to fix common JSON issues
            try:
                # Remove trailing commas
                json_str = re.sub(r',\s*}', '}', json_str)
                json_str = re.sub(r',\s*]', ']', json_str)
                
                # Try parsing again
                parsed = json.loads(json_str)
                if isinstance(parsed, dict) and "tool" in parsed:
                    return parsed
            except:
                pass
            
            return None
        except Exception:
            return None
    
    def _parse_json_array_safely(self, json_str: str) -> list:
        """
        Safely parse JSON array string containing multiple tool calls.
        
        Args:
            json_str: JSON array string to parse
            
        Returns:
            List of tool call dicts if successful, empty list otherwise
        """
        if not json_str:
            return []
        
        try:
            json_str = json_str.strip()
            parsed = json.loads(json_str)
            
            if isinstance(parsed, list):
                # Handle case where the entire array IS in format ["tool_name", {...}]
                # This happens when LLM uses simplified format: ["e_device_control", {...}]
                if len(parsed) == 2 and isinstance(parsed[0], str) and isinstance(parsed[1], dict):
                    tool_name = parsed[0]
                    args = parsed[1]
                    # Validate it's a known tool name
                    if tool_name in ["e_device_control", "chat_message", "schedule_modifier", "rag_query"]:
                        return [{"tool": tool_name, "arguments": args}]
                
                # Filter out empty strings, None, and invalid entries
                parsed = [item for item in parsed if item and item != "" and item != [] and item != {}]
                
                tool_calls = []
                for item in parsed:
                    # Skip None or invalid types
                    if not item or not isinstance(item, (dict, list, str)):
                        continue
                    
                    # Handle alternative format: ["tool_name", {...}]
                    if isinstance(item, list) and len(item) == 2:
                        tool_name = item[0]
                        args = item[1]
                        if isinstance(tool_name, str) and isinstance(args, dict):
                            tool_calls.append({"tool": tool_name, "arguments": args})
                            continue
                    
                    # Handle standard format: {"tool": "...", "arguments": {...}}
                    if isinstance(item, dict) and "tool" in item:
                        tool_calls.append(item)
                return tool_calls
            
            return []
        except json.JSONDecodeError:
            # Try to fix common JSON issues
            try:
                json_str = re.sub(r',\s*}', '}', json_str)
                json_str = re.sub(r',\s*]', ']', json_str)
                parsed = json.loads(json_str)
                if isinstance(parsed, list):
                    # Handle case where the entire array IS in format ["tool_name", {...}]
                    if len(parsed) == 2 and isinstance(parsed[0], str) and isinstance(parsed[1], dict):
                        tool_name = parsed[0]
                        args = parsed[1]
                        if tool_name in ["e_device_control", "chat_message", "schedule_modifier", "rag_query"]:
                            return [{"tool": tool_name, "arguments": args}]
                    
                    # Filter out empty strings, None, and invalid entries
                    parsed = [item for item in parsed if item and item != "" and item != [] and item != {}]
                    
                    tool_calls = []
                    for item in parsed:
                        if not item or not isinstance(item, (dict, list, str)):
                            continue
                        
                        if isinstance(item, list) and len(item) == 2:
                            tool_name = item[0]
                            args = item[1]
                            if isinstance(tool_name, str) and isinstance(args, dict):
                                tool_calls.append({"tool": tool_name, "arguments": args})
                                continue
                        
                        if isinstance(item, dict) and "tool" in item:
                            tool_calls.append(item)
                    return tool_calls
            except:
                pass
            
            return []
        except Exception:
            return []
    
    def _parse_tool_calls(self, response_text: str) -> list:
        """
        Safely parse tool call(s) from LLM response.
        Supports both single tool call and multiple tool calls in an array.
        
        Optimized parsing strategy (early exit on success):
        1. Markdown code blocks (most common format)
        2. Direct JSON patterns (without markdown)
        3. Fallback lenient patterns (only if above fail)
        
        Args:
            response_text: Raw response text from LLM
            
        Returns:
            List of dicts with "tool" and "arguments", or empty list if none found
        """
        if not response_text:
            return []
        
        # Strategy 1: Markdown code blocks (most common format) - EARLY EXIT on success
        match = self._compiled_patterns['markdown_array'].search(response_text)
        if match:
            json_str = match.group(1)
            parsed = self._parse_json_array_safely(json_str)
            if parsed:
                return parsed
        
        match = self._compiled_patterns['markdown_object'].search(response_text)
        if match:
            json_str = match.group(1)
            result = self._parse_json_safely(json_str)
            if result and result.get("tool"):
                return [result]
        
        # Strategy 2: Direct JSON patterns (without markdown) - EARLY EXIT on success
        matches = self._compiled_patterns['json_array_with_tool'].finditer(response_text)
        for match in matches:
            json_str = match.group(0)
            parsed = self._parse_json_array_safely(json_str)
            if parsed:
                return parsed
        
        matches = self._compiled_patterns['json_object_with_tool'].finditer(response_text)
        for match in matches:
            json_str = match.group(0)
            result = self._parse_json_safely(json_str)
            if result and result.get("tool"):
                return [result]
        
        # Strategy 3: Fallback lenient patterns (only if above fail) - with repair attempts
        matches = self._compiled_patterns['json_array_lenient'].finditer(response_text)
        for match in matches:
            json_str = match.group(0)
            # Only repair if initial parse fails
            parsed = self._parse_json_array_safely(json_str)
            if parsed:
                return parsed
            # Try repair as fallback
            json_str = self._try_repair_json(json_str)
            parsed = self._parse_json_array_safely(json_str)
            if parsed:
                return parsed
        
        matches = self._compiled_patterns['json_object_lenient'].finditer(response_text)
        for match in matches:
            json_str = match.group(0)
            result = self._parse_json_safely(json_str)
            if result and result.get("tool"):
                return [result]
            # Try repair as fallback
            json_str = self._try_repair_json(json_str)
            result = self._parse_json_safely(json_str)
            if result and result.get("tool"):
                return [result]
        
        # Strategy 4: Structured text patterns (last resort)
        tool_match = self._compiled_patterns['tool_name'].search(response_text)
        if tool_match:
            tool_name = tool_match.group(1)
            args_match = self._compiled_patterns['tool_arguments'].search(response_text)
            if args_match:
                args_json = args_match.group(1)
                args = self._parse_json_safely(args_json)
                if args:
                    return [{
                        "tool": tool_name,
                        "arguments": args
                    }]
        
        return []
    
    def _looks_like_json_tool_call(self, text: str) -> bool:
        """
        Check if text looks like a JSON tool call (even if malformed).
        This prevents showing raw JSON tool calls to users.
        
        Args:
            text: Text to check
            
        Returns:
            True if text appears to be a JSON tool call, False otherwise
        """
        if not text:
            return False
        
        text_lower = text.lower().strip()
        
        # Check for common JSON tool call patterns
        # Pattern 1: Contains "tool" and "arguments" keywords
        if '"tool"' in text_lower or "'tool'" in text_lower:
            if '"arguments"' in text_lower or "'arguments'" in text_lower:
                # Also check for JSON structure markers
                if ('{' in text or '[' in text):
                    return True
        
        # Pattern 2: Looks like JSON array with tool calls
        if text.strip().startswith('[') and '"tool"' in text_lower:
            return True
        
        # Pattern 3: Looks like JSON object with tool call
        if text.strip().startswith('{') and '"tool"' in text_lower:
            return True
        
        return False
    
    async def process(self, messages: List[Dict[str, str]], stream: bool = False, correlation_id: Optional[str] = None) -> Dict[str, any]:
        """
        Process messages with LLM and parse tool calls internally.
        Returns structured dict with tools/content/error fields.
        
        Args:
            messages: List of message dicts with 'role' and 'content' keys
            stream: Whether to use streaming (not currently supported in process method)
            correlation_id: Optional correlation ID for request tracing
            
        Returns:
            Dict with format:
            {
                "tools": list or None,    # List of tool calls if detected: [{"tool": str, "arguments": dict}, ...]
                "tool": str or None,      # Single tool name (for backward compatibility)
                "arguments": dict,        # Single tool arguments (for backward compatibility)
                "content": str,           # Text response (if no tool call)
                "error": str or None      # Error message if parsing failed
            }
        """
        corr_id = correlation_id or "unknown"
        
        try:
            # Call Ollama using existing chat infrastructure
            response_text = await self.chat(messages, stream=stream, correlation_id=correlation_id)
            
            if not response_text:
                return {
                    "tools": None,
                    "tool": None,
                    "arguments": {},
                    "content": "I'm sorry, I didn't receive a response. Please try again.",
                    "error": "Empty response from LLM"
                }
            
            # Preprocess: Remove reasoning markers and extract JSON if present
            original_response = response_text
            response_text = self._preprocess_response(response_text)
            
            if not response_text:
                logger.warning(f"[{corr_id}] Preprocessing removed all content, using original")
                response_text = original_response
            
            # Try to parse tool call(s) from response
            tool_calls = self._parse_tool_calls(response_text)
            
            logger.debug(f"[{corr_id}] Parsed {len(tool_calls)} tool call(s)")
            
            if tool_calls:
                # Tool call(s) detected
                # Support both single and multiple tool calls
                if len(tool_calls) == 1:
                    # Single tool call - maintain backward compatibility
                    tool_call = tool_calls[0]
                    result = {
                        "tools": tool_calls,
                        "tool": tool_call.get("tool"),
                        "arguments": tool_call.get("arguments", {}),
                        "content": None,
                        "error": None
                    }
                    logger.debug(f"[{corr_id}] Returning single tool call: tool={result.get('tool')}")
                    return result
                else:
                    # Multiple tool calls
                    result = {
                        "tools": tool_calls,
                        "tool": None,  # Multiple tools, use "tools" array instead
                        "arguments": {},
                        "content": None,
                        "error": None
                    }
                    logger.debug(f"[{corr_id}] Returning {len(tool_calls)} tool calls")
                    return result
            else:
                # No tool call detected - but check if response looks like JSON tool call
                # CRITICAL: Never show raw JSON tool calls to users
                looks_like_json = self._looks_like_json_tool_call(response_text)
                
                if looks_like_json:
                    logger.warning(f"[{corr_id}] Detected JSON tool call pattern but parsing failed")
                    # This looks like a tool call but parsing failed - return error instead of showing raw JSON
                    return {
                        "tool": "chat_message",
                        "arguments": {"message": "I encountered an issue processing that request. Could you please try again?"},
                        "content": None,
                        "error": "Failed to parse tool call from LLM response"
                    }
                
                # No tool call - regular chat response
                return {
                    "tools": None,
                    "tool": None,
                    "arguments": {},
                    "content": response_text.strip(),
                    "error": None
                }
        
        except Exception as e:
            # Handle errors gracefully
            error_msg = str(e)
            logger.error(f"[{corr_id}] Error in process(): {error_msg}", exc_info=True)
            if "connection" in error_msg.lower() or "failed to connect" in error_msg.lower():
                return {
                    "tool": "chat_message",
                    "arguments": {"message": f"Unable to connect to Ollama at {self.host}. Please ensure Ollama is running."},
                    "content": None,
                    "error": error_msg
                }
            elif "not found" in error_msg.lower() or "404" in error_msg.lower():
                return {
                    "tool": "chat_message",
                    "arguments": {"message": f"Model {self.model} not found. Please install it with: ollama pull {self.model}"},
                    "content": None,
                    "error": error_msg
                }
            else:
                return {
                    "tool": "chat_message",
                    "arguments": {"message": "I encountered an error processing your request. Please try again."},
                    "content": None,
                    "error": error_msg
                }
    
    async def close(self):
        """Close HTTP client connection."""
        await self._client.aclose()

