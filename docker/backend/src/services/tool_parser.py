"""
Tool Parser for extracting tool calls from LLM responses.
Handles JSON parsing, markdown code blocks, and validation.
"""

import json
import re
import logging
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)


class ToolParser:
    """
    Parser for extracting tool calls from LLM responses.
    """
    
    def __init__(self, tool_registry):
        """
        Initialize tool parser.
        
        Args:
            tool_registry: ToolRegistry instance for validation
        """
        self.tool_registry = tool_registry
        
        # Pre-compile regex patterns for performance
        self._patterns = {
            # Markdown code blocks (most common format)
            'markdown_array': re.compile(r'```(?:json)?\s*(\[.*?\])\s*```', re.DOTALL),
            'markdown_object': re.compile(r'```(?:json)?\s*(\{.*?\})\s*```', re.DOTALL),
            # Direct JSON patterns (without markdown)
            'json_array': re.compile(r'\[[\s\S]*?\{[\s\S]*?"tool"[\s\S]*?\}[\s\S]*?\]', re.DOTALL),
            'json_object': re.compile(r'\{[\s\S]*?"tool"[\s\S]*?\}', re.DOTALL),
        }
    
    def parse(self, response_text: str) -> Optional[List[Dict[str, Any]]]:
        """
        Parse tool calls from LLM response text.
        
        Args:
            response_text: Raw response text from LLM
            
        Returns:
            List of tool calls with format [{"tool": str, "arguments": dict}, ...]
            Returns None if no tool calls detected (regular chat response)
        """
        if not response_text or not isinstance(response_text, str):
            return None
        
        # Preprocess: Remove reasoning markers and extract JSON
        preprocessed = self._preprocess_response(response_text)
        
        if not preprocessed:
            return None
        
        # Try to parse JSON
        parsed = self._parse_json(preprocessed)
        
        if not parsed:
            return None
        
        # Validate tool calls
        validated = self._validate_tool_calls(parsed)
        
        return validated if validated else None
    
    def _preprocess_response(self, response_text: str) -> Optional[str]:
        """
        Preprocess response to extract JSON.
        
        Args:
            response_text: Raw response text
            
        Returns:
            Extracted JSON string or None
        """
        # Strategy 1: Try markdown code blocks (most common)
        match = self._patterns['markdown_array'].search(response_text)
        if match:
            return match.group(1).strip()
        
        match = self._patterns['markdown_object'].search(response_text)
        if match:
            # Single tool call - wrap in array for consistency
            return f"[{match.group(1).strip()}]"
        
        # Strategy 2: Try direct JSON array
        match = self._patterns['json_array'].search(response_text)
        if match:
            return match.group(0).strip()
        
        # Strategy 3: Try direct JSON object
        match = self._patterns['json_object'].search(response_text)
        if match:
            # Single tool call - wrap in array
            return f"[{match.group(0).strip()}]"
        
        # Strategy 4: Try parsing entire response as JSON
        try:
            json.loads(response_text)
            return response_text
        except (json.JSONDecodeError, TypeError):
            pass
        
        return None
    
    def _parse_json(self, json_str: str) -> Optional[List[Dict[str, Any]]]:
        """
        Parse JSON string into tool calls.
        
        Args:
            json_str: JSON string to parse
            
        Returns:
            List of tool call dicts or None if parsing fails
        """
        try:
            parsed = json.loads(json_str)
            
            # Handle single tool call (backward compatibility)
            if isinstance(parsed, dict):
                if "tool" in parsed:
                    return [parsed]
                return None
            
            # Handle array of tool calls
            if isinstance(parsed, list):
                # Filter out non-dict items
                tool_calls = [item for item in parsed if isinstance(item, dict)]
                return tool_calls if tool_calls else None
            
            return None
            
        except (json.JSONDecodeError, TypeError) as e:
            logger.debug(f"JSON parsing failed: {e}")
            return None
    
    def _validate_tool_calls(self, tool_calls: List[Dict[str, Any]]) -> Optional[List[Dict[str, Any]]]:
        """
        Validate tool calls structure and tool names.
        
        Args:
            tool_calls: List of parsed tool call dicts
            
        Returns:
            List of validated tool calls or None if validation fails
        """
        validated = []
        
        for tool_call in tool_calls:
            # Check required fields
            if not isinstance(tool_call, dict):
                logger.warning(f"Invalid tool call: not a dict - {tool_call}")
                continue
            
            tool_name = tool_call.get("tool")
            arguments = tool_call.get("arguments")
            
            if not tool_name:
                logger.warning(f"Invalid tool call: missing 'tool' field - {tool_call}")
                continue
            
            if not isinstance(arguments, dict):
                logger.warning(f"Invalid tool call: 'arguments' must be a dict - {tool_call}")
                continue
            
            # Check tool exists in registry
            if not self.tool_registry.get_tool(tool_name):
                logger.warning(f"Unknown tool in tool call: {tool_name}")
                continue
            
            validated.append({
                "tool": tool_name,
                "arguments": arguments
            })
        
        return validated if validated else None
    
    def looks_like_tool_call(self, response_text: str) -> bool:
        """
        Check if response text looks like it contains a tool call.
        Used to detect malformed tool calls that failed to parse.
        
        Args:
            response_text: Response text to check
            
        Returns:
            True if text looks like a tool call attempt
        """
        if not response_text:
            return False
        
        text_lower = response_text.lower()
        
        # Check for tool call indicators
        has_tool_keyword = '"tool"' in response_text or "'tool'" in response_text
        has_arguments_keyword = '"arguments"' in response_text or "'arguments'" in response_text
        has_json_structure = "{" in response_text and "}" in response_text
        
        return has_tool_keyword and has_arguments_keyword and has_json_structure

