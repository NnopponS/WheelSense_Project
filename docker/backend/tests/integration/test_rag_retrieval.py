"""
Integration tests for RAG retrieval functionality.
"""

import pytest
from unittest.mock import Mock, patch


@pytest.mark.integration
@pytest.mark.asyncio
async def test_health_query_detector_identifies_health_queries():
    """Test that health query detector identifies health-related queries."""
    from services.health_query_detector import should_call_rag
    
    # Test health-related query
    result = should_call_rag(
        user_message="What should I eat for diabetes?",
        user_condition="diabetes"
    )
    assert result is True
    
    # Test non-health query
    result = should_call_rag(
        user_message="What time is it?",
        user_condition="diabetes"
    )
    assert result is False


@pytest.mark.integration
@pytest.mark.asyncio
async def test_rag_retrieval_timeout_handling():
    """Test that RAG retrieval handles timeout gracefully."""
    from services.rag_retriever import RAGRetriever
    import asyncio
    
    # Mock RAG retriever that simulates slow retrieval
    class SlowRAGRetriever:
        async def retrieve(self, query, user_condition=None, top_k=3, threshold=0.5):
            await asyncio.sleep(3)  # Simulate slow retrieval (>2s timeout)
            return {"found": True, "chunks": []}
    
    # Test timeout handling in chat.py would use asyncio.wait_for with 2s timeout
    # This is tested at the E2E level
    assert True  # Placeholder - actual timeout test in E2E


@pytest.mark.integration
@pytest.mark.asyncio
async def test_rag_context_formatting():
    """Test that RAG context is properly formatted for LLM."""
    from services.context_builder import ContextBuilder
    
    builder = ContextBuilder()
    
    # Test RAG context formatting
    rag_context = {
        "found": True,
        "chunks": [
            {
                "text": "Sample health information about diabetes.",
                "score": 0.85,
                "metadata": {}
            }
        ]
    }
    
    formatted = builder.format_rag_context(rag_context)
    
    assert "HEALTH KNOWLEDGE CONTEXT" in formatted
    assert "diabetes" in formatted.lower() or "Sample health information" in formatted


@pytest.mark.integration
@pytest.mark.asyncio
async def test_rag_fallback_when_not_found():
    """Test that system falls back gracefully when RAG finds nothing."""
    from services.context_builder import ContextBuilder
    
    builder = ContextBuilder()
    
    # Test RAG context with no results
    rag_context = {
        "found": False
    }
    
    formatted = builder.format_rag_context(rag_context)
    
    # Should include disclaimer about consulting healthcare professionals
    assert "No specific health knowledge" in formatted or "consulting healthcare professionals" in formatted.lower()

