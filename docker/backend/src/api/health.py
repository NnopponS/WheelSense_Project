"""
Health Check API - Extended health check with service status and metrics.
Phase 4F: Production-ready health monitoring.
"""

from fastapi import APIRouter, Request
from typing import Dict, Any, Optional
from datetime import datetime
import logging

from ..services.llm_client import LLMClient, CircuitState
from ..services.rag_retriever import get_rag_retriever

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["Health"])


@router.get("/health")
async def health_check(request: Request) -> Dict[str, Any]:
    """
    Extended health check endpoint with service status and metrics.
    Phase 4F: Returns detailed health status for all services.
    """
    # Get services from app state
    db = getattr(request.app.state, 'db', None)
    mqtt_handler = getattr(request.app.state, 'mqtt_handler', None)
    llm_client: Optional[LLMClient] = getattr(request.app.state, 'llm_client', None)
    schedule_checker = getattr(request.app.state, 'schedule_checker', None)
    house_check_service = getattr(request.app.state, 'house_check_service', None)
    metrics = getattr(request.app.state, 'metrics', {})
    
    # Check database status
    db_status = "ok"
    if not db:
        db_status = "error"
    elif not db.is_connected:
        db_status = "error"
    else:
        # Quick health check query
        try:
            import asyncio
            await asyncio.wait_for(
                db._db_connection.execute("SELECT 1"),
                timeout=1.0
            )
        except asyncio.TimeoutError:
            db_status = "slow"
        except Exception:
            db_status = "slow"
    
    # Check LLM status
    llm_status = "ok"
    if not llm_client:
        llm_status = "unavailable"
    else:
        # Check circuit breaker state
        if hasattr(llm_client, '_circuit_state'):
            if llm_client._circuit_state == CircuitState.OPEN:
                llm_status = "unavailable"
            elif llm_client._circuit_state == CircuitState.HALF_OPEN:
                llm_status = "degraded"
    
    # Check MQTT status
    mqtt_status = "ok"
    if not mqtt_handler:
        mqtt_status = "error"
    elif not mqtt_handler.is_connected:
        mqtt_status = "disconnected"
    
    # Check schedule checker status
    schedule_status = "running"
    if not schedule_checker:
        schedule_status = "error"
    elif hasattr(schedule_checker, 'get_health_status'):
        try:
            health = schedule_checker.get_health_status()
            if not health.get("healthy", True):
                schedule_status = "error"
        except Exception:
            schedule_status = "error"
    elif not schedule_checker.running:
        schedule_status = "stopped"
    
    # Check house check service status
    house_check_status = "ok"
    if not house_check_service:
        house_check_status = "error"
    elif hasattr(house_check_service, 'get_health_status'):
        try:
            health = house_check_service.get_health_status()
            if not health.get("healthy", True):
                house_check_status = "error"
        except Exception:
            house_check_status = "error"
    
    # Check RAG status
    rag_status = "available"
    try:
        rag_retriever = await get_rag_retriever()
        if not rag_retriever or not rag_retriever._initialized:
            rag_status = "unavailable"
        elif rag_retriever._initialization_error:
            rag_status = "error"
    except Exception:
        rag_status = "error"
    
    # Determine overall status
    overall_status = "healthy"
    if db_status == "error" or llm_status == "unavailable" or mqtt_status == "error":
        overall_status = "unhealthy"
    elif db_status == "slow" or llm_status == "degraded" or mqtt_status == "disconnected":
        overall_status = "degraded"
    
    return {
        "status": overall_status,
        "timestamp": datetime.now().isoformat(),
        "services": {
            "database": db_status,
            "llm": llm_status,
            "mqtt": mqtt_status,
            "schedule_checker": schedule_status,
            "house_check": house_check_status,
            "rag": rag_status
        },
        "metrics": metrics
    }


@router.get("/health/metrics")
async def get_metrics(request: Request) -> Dict[str, Any]:
    """
    Get system metrics.
    Phase 4F: Returns request counts, error counts, and performance metrics.
    """
    metrics = getattr(request.app.state, 'metrics', {})
    return {
        "timestamp": datetime.now().isoformat(),
        "metrics": metrics
    }

