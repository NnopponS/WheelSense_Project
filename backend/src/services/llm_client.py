"""
LLM Client for Ollama - WheelSense v2.0
Handles chat interactions and tool call parsing via Ollama HTTP API.
"""

import logging
import httpx
from typing import List, Dict, Optional, Any
from enum import Enum
import json
import re
import time
import asyncio

logger = logging.getLogger(__name__)


class CircuitState(Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


class LLMClient:
    """
    Client for interacting with LLM via Ollama.
    Features: circuit breaker, JSON tool-call parsing, response preprocessing.
    """

    def __init__(
        self,
        host: str,
        model: str,
        timeout_seconds: float = 120.0,
        temperature: float = 0.3,
        top_p: float = 0.9,
        num_ctx: int = 2048,
        num_predict: int = 256,
        keep_alive: str = "30m",
        retry_attempts: int = 2,
        retry_backoff_seconds: float = 1.5,
    ):
        self.host = host.rstrip('/')
        self.model = model
        self._client = httpx.AsyncClient(timeout=timeout_seconds)
        self.temperature = temperature
        self.top_p = top_p
        self.num_ctx = num_ctx
        self.num_predict = num_predict
        self.keep_alive = keep_alive
        self.retry_attempts = max(1, retry_attempts)
        self.retry_backoff_seconds = max(0.5, retry_backoff_seconds)

        # Circuit breaker state
        self._circuit_state = CircuitState.CLOSED
        self._failure_count = 0
        self._last_failure_time = None
        self._circuit_open_time = None
        self._circuit_failure_threshold = 3
        self._circuit_failure_window = 60.0
        self._circuit_half_open_delay = 30.0

        # Pre-compiled regex patterns for tool call parsing
        self._compiled_patterns = {
            'markdown_array': re.compile(r'```(?:json)?\s*(\[.*?\])\s*```', re.DOTALL),
            'markdown_object': re.compile(r'```(?:json)?\s*(\{.*?\})\s*```', re.DOTALL),
            'json_array_with_tool': re.compile(r'\[[\s\S]*?\{[\s\S]*?"tool"[\s\S]*?\}[\s\S]*?\]', re.DOTALL),
            'json_object_with_tool': re.compile(r'\{[\s\S]*?"tool"[\s\S]*?\}', re.DOTALL),
            'json_array_lenient': re.compile(r'\[[\s\S]*?\{[\s\S]*?\}[\s\S]*?\]', re.DOTALL),
            'json_object_lenient': re.compile(r'\{[\s\S]*?\}', re.DOTALL),
            'tool_name': re.compile(r'tool["\']?\s*[:=]\s*["\']?(\w+)', re.IGNORECASE),
            'tool_arguments': re.compile(r'arguments["\']?\s*[:=]\s*(\{.*?\})', re.DOTALL),
        }

        logger.info(f"LLM Client initialized: host={host}, model={model}")

    async def validate_connection(self) -> Dict[str, Any]:
        """Validate Ollama connection and model availability."""
        try:
            response = await self._client.get(f"{self.host}/api/tags")
            if response.status_code != 200:
                return {
                    "valid": False,
                    "ollama_accessible": False,
                    "model_available": False,
                    "message": f"Ollama server returned status {response.status_code}"
                }

            models_data = response.json()
            available_models = [m.get("name", "") for m in models_data.get("models", [])]

            model_available = any(
                self.model in name or name.startswith(self.model.split(':')[0])
                for name in available_models
            )

            if not model_available:
                return {
                    "valid": False,
                    "ollama_accessible": True,
                    "model_available": False,
                    "message": f"Model '{self.model}' not found. Available: {', '.join(available_models[:5])}"
                }

            return {
                "valid": True,
                "ollama_accessible": True,
                "model_available": True,
                "message": f"Ollama OK, model '{self.model}' available"
            }

        except httpx.ConnectError:
            return {
                "valid": False,
                "ollama_accessible": False,
                "model_available": False,
                "message": f"Cannot connect to Ollama at {self.host}"
            }
        except Exception as e:
            logger.error(f"Error validating Ollama: {e}")
            return {
                "valid": False,
                "ollama_accessible": False,
                "model_available": False,
                "message": f"Error: {str(e)}"
            }

    def _check_circuit_breaker(self) -> bool:
        """Check circuit breaker. Returns True if request should proceed."""
        now = time.time()

        if self._circuit_state == CircuitState.OPEN:
            if self._circuit_open_time and (now - self._circuit_open_time) >= self._circuit_half_open_delay:
                self._circuit_state = CircuitState.HALF_OPEN
                self._failure_count = 0
                logger.info("Circuit breaker: HALF_OPEN")
                return True
            return False

        if self._last_failure_time and (now - self._last_failure_time) > self._circuit_failure_window:
            self._failure_count = 0
            if self._circuit_state == CircuitState.HALF_OPEN:
                self._circuit_state = CircuitState.CLOSED
                logger.info("Circuit breaker: CLOSED (recovered)")

        return True

    def _record_success(self):
        if self._circuit_state == CircuitState.HALF_OPEN:
            self._circuit_state = CircuitState.CLOSED
            self._failure_count = 0
            self._circuit_open_time = None
            logger.info("Circuit breaker: CLOSED (success in HALF_OPEN)")
        else:
            self._failure_count = 0

    def _record_failure(self):
        now = time.time()
        self._last_failure_time = now
        self._failure_count += 1

        if self._failure_count >= self._circuit_failure_threshold:
            self._circuit_state = CircuitState.OPEN
            self._circuit_open_time = now
            logger.warning(f"Circuit breaker: OPEN after {self._failure_count} failures")

    async def chat(self, messages: List[Dict[str, str]], correlation_id: Optional[str] = None) -> str:
        """Call Ollama chat API and return response text."""
        if not messages:
            raise ValueError("Messages list cannot be empty")

        corr_id = correlation_id or "unknown"

        if not self._check_circuit_breaker():
            raise httpx.HTTPError("LLM service temporarily unavailable (circuit open)")

        try:
            payload = {
                "model": self.model,
                "messages": messages,
                "stream": False,
                "keep_alive": self.keep_alive,
                "options": {
                    "temperature": self.temperature,
                    "num_ctx": self.num_ctx,
                    "top_p": self.top_p,
                    "num_predict": self.num_predict,
                }
            }

            response = None
            last_error: Optional[Exception] = None
            for attempt in range(1, self.retry_attempts + 1):
                try:
                    response = await self._client.post(
                        f"{self.host}/api/chat",
                        json=payload
                    )
                    if response.status_code < 500:
                        break
                    last_error = httpx.HTTPError(f"Ollama server error {response.status_code}")
                except (httpx.TimeoutException, httpx.ConnectError) as e:
                    last_error = e

                if attempt < self.retry_attempts:
                    await asyncio.sleep(self.retry_backoff_seconds * attempt)

            if response is None:
                if isinstance(last_error, httpx.TimeoutException):
                    self._record_failure()
                    raise httpx.HTTPError("Ollama request timed out")
                if isinstance(last_error, httpx.ConnectError):
                    self._record_failure()
                    raise httpx.HTTPError(f"Cannot connect to Ollama at {self.host}")
                raise httpx.HTTPError("Ollama request failed")

            if response.status_code != 200:
                self._record_failure()
                raise httpx.HTTPError(f"Ollama API returned {response.status_code}: {response.text[:200]}")

            response_data = response.json()

            if "message" in response_data and "content" in response_data["message"]:
                content = response_data["message"]["content"]
                if not content or not content.strip():
                    return "I'm sorry, I didn't receive a response. Please try again."

                self._record_success()
                return content.strip()
            else:
                raise ValueError("Invalid response format from Ollama")

        except httpx.TimeoutException:
            self._record_failure()
            raise httpx.HTTPError("Ollama request timed out")
        except httpx.ConnectError:
            self._record_failure()
            raise httpx.HTTPError(f"Cannot connect to Ollama at {self.host}")
        except Exception as e:
            if not isinstance(e, httpx.HTTPError):
                self._record_failure()
            raise

    def _preprocess_response(self, response_text: str) -> str:
        """Strip reasoning tags and extract JSON tool calls."""
        if not response_text:
            return ""

        # Remove <think> / </think> reasoning blocks
        if "</think>" in response_text:
            parts = response_text.split("</think>")
            if len(parts) > 1:
                response_text = parts[-1].strip()

        if "</reasoning>" in response_text:
            parts = response_text.split("</reasoning>")
            if len(parts) > 1:
                response_text = parts[-1].strip()

        # Try to find JSON tool calls in remaining text
        json_arrays = list(re.finditer(r'\[[\s\S]*?\{[\s\S]*?"tool"[\s\S]*?\}[\s\S]*?\]', response_text))
        if json_arrays:
            return json_arrays[-1].group(0).strip()

        json_objects = list(re.finditer(r'\{[\s\S]*?"tool"[\s\S]*?\}', response_text))
        if json_objects:
            return json_objects[-1].group(0).strip()

        return response_text.strip()

    def _try_repair_json(self, json_str: str) -> str:
        """Repair common JSON issues: trailing commas, unquoted keys, unbalanced brackets."""
        if not json_str:
            return json_str

        json_str = json_str.strip()
        json_str = re.sub(r',\s*}', '}', json_str)
        json_str = re.sub(r',\s*]', ']', json_str)
        json_str = re.sub(r'(\{|,)\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:', r'\1"\2":', json_str)

        # Balance brackets
        open_braces = json_str.count('{')
        close_braces = json_str.count('}')
        open_brackets = json_str.count('[')
        close_brackets = json_str.count(']')

        if json_str.startswith('[') and open_brackets > close_brackets:
            if open_braces > close_braces:
                json_str += '}' * (open_braces - close_braces)
            json_str += ']' * (open_brackets - close_brackets)
        elif json_str.startswith('{') and open_braces > close_braces:
            json_str += '}' * (open_braces - close_braces)

        return json_str

    def _parse_json_safely(self, json_str: str) -> Optional[dict]:
        """Parse a JSON string into a tool call dict, or None."""
        if not json_str:
            return None
        try:
            parsed = json.loads(json_str.strip())
            if isinstance(parsed, dict) and "tool" in parsed:
                return parsed
            return None
        except json.JSONDecodeError:
            try:
                fixed = re.sub(r',\s*}', '}', json_str)
                fixed = re.sub(r',\s*]', ']', fixed)
                parsed = json.loads(fixed)
                if isinstance(parsed, dict) and "tool" in parsed:
                    return parsed
            except Exception:
                pass
            return None

    def _parse_json_array_safely(self, json_str: str) -> list:
        """Parse a JSON array of tool calls."""
        if not json_str:
            return []
        try:
            parsed = json.loads(json_str.strip())
            if isinstance(parsed, list):
                tool_calls = []
                for item in parsed:
                    if isinstance(item, dict) and "tool" in item:
                        tool_calls.append(item)
                return tool_calls
            return []
        except json.JSONDecodeError:
            try:
                fixed = re.sub(r',\s*}', '}', json_str)
                fixed = re.sub(r',\s*]', ']', fixed)
                parsed = json.loads(fixed)
                if isinstance(parsed, list):
                    return [item for item in parsed if isinstance(item, dict) and "tool" in item]
            except Exception:
                pass
            return []

    def _parse_tool_calls(self, response_text: str) -> list:
        """
        Parse tool calls from LLM response using multi-strategy approach.
        Returns list of {tool, arguments} dicts.
        """
        if not response_text:
            return []

        # Strategy 1: Markdown code blocks
        match = self._compiled_patterns['markdown_array'].search(response_text)
        if match:
            parsed = self._parse_json_array_safely(match.group(1))
            if parsed:
                return parsed

        match = self._compiled_patterns['markdown_object'].search(response_text)
        if match:
            result = self._parse_json_safely(match.group(1))
            if result:
                return [result]

        # Strategy 2: Direct JSON patterns
        for match in self._compiled_patterns['json_array_with_tool'].finditer(response_text):
            parsed = self._parse_json_array_safely(match.group(0))
            if parsed:
                return parsed

        for match in self._compiled_patterns['json_object_with_tool'].finditer(response_text):
            result = self._parse_json_safely(match.group(0))
            if result:
                return [result]

        # Strategy 3: Lenient patterns with repair
        for match in self._compiled_patterns['json_array_lenient'].finditer(response_text):
            json_str = match.group(0)
            parsed = self._parse_json_array_safely(json_str)
            if parsed:
                return parsed
            repaired = self._try_repair_json(json_str)
            parsed = self._parse_json_array_safely(repaired)
            if parsed:
                return parsed

        for match in self._compiled_patterns['json_object_lenient'].finditer(response_text):
            json_str = match.group(0)
            result = self._parse_json_safely(json_str)
            if result:
                return [result]
            repaired = self._try_repair_json(json_str)
            result = self._parse_json_safely(repaired)
            if result:
                return [result]

        # Strategy 4: Structured text patterns
        tool_match = self._compiled_patterns['tool_name'].search(response_text)
        if tool_match:
            args_match = self._compiled_patterns['tool_arguments'].search(response_text)
            if args_match:
                args = self._parse_json_safely(args_match.group(1))
                if args:
                    return [{"tool": tool_match.group(1), "arguments": args}]

        return []

    def _looks_like_json_tool_call(self, text: str) -> bool:
        """Check if text looks like a failed JSON tool call."""
        if not text:
            return False
        text_lower = text.lower().strip()
        if ('"tool"' in text_lower or "'tool'" in text_lower):
            if ('"arguments"' in text_lower or "'arguments'" in text_lower):
                if '{' in text or '[' in text:
                    return True
        return False

    async def process(self, messages: List[Dict[str, str]], correlation_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Process messages with LLM and parse tool calls.
        Returns {tools, tool, arguments, content, error}.
        """
        corr_id = correlation_id or "unknown"

        try:
            response_text = await self.chat(messages, correlation_id=correlation_id)

            if not response_text:
                return {
                    "tools": None, "tool": None, "arguments": {},
                    "content": "I'm sorry, I didn't receive a response. Please try again.",
                    "error": "Empty response from LLM"
                }

            # Preprocess: strip reasoning, find JSON
            original = response_text
            response_text = self._preprocess_response(response_text)
            if not response_text:
                response_text = original

            # Parse tool calls
            tool_calls = self._parse_tool_calls(response_text)
            logger.debug(f"[{corr_id}] Parsed {len(tool_calls)} tool call(s)")

            if tool_calls:
                if len(tool_calls) == 1:
                    tc = tool_calls[0]
                    return {
                        "tools": tool_calls,
                        "tool": tc.get("tool"),
                        "arguments": tc.get("arguments", {}),
                        "content": None, "error": None
                    }
                else:
                    return {
                        "tools": tool_calls,
                        "tool": None, "arguments": {},
                        "content": None, "error": None
                    }
            else:
                if self._looks_like_json_tool_call(response_text):
                    return {
                        "tools": None,
                        "tool": "chat_message",
                        "arguments": {"message": "I encountered an issue processing that request. Could you please try again?"},
                        "content": None,
                        "error": "Failed to parse tool call from LLM response"
                    }

                return {
                    "tools": None, "tool": None, "arguments": {},
                    "content": response_text.strip(),
                    "error": None
                }

        except Exception as e:
            logger.error(f"[{corr_id}] Error in process(): {e}", exc_info=True)
            error_msg = str(e)
            if "connection" in error_msg.lower():
                return {
                    "tools": None, "tool": None, "arguments": {},
                    "content": "I can't connect to the AI service right now. Please try again later.",
                    "error": error_msg
                }
                return {
                    "tools": None, "tool": None, "arguments": {},
                    "content": "I encountered an error. Please try again.",
                    "error": error_msg
                }

    async def warmup(self) -> Dict[str, Any]:
        """Run a lightweight warmup call so first user request is faster."""
        try:
            result = await self.chat(
                messages=[
                    {"role": "system", "content": "You are a concise assistant."},
                    {"role": "user", "content": "Reply with exactly: OK"},
                ],
                correlation_id="warmup",
            )
            return {"success": True, "response": result[:20]}
        except Exception as e:
            logger.warning(f"LLM warmup failed: {e}")
            return {"success": False, "error": str(e)}
