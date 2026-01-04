"""
Pytest configuration and fixtures for WheelSense backend tests.
"""

import pytest
import asyncio
import json
import shutil
import os
from pathlib import Path
from datetime import datetime
from typing import AsyncGenerator, Dict, Any, Optional, List
import logging

# Import backend modules
import sys
import os
# Add parent directory to path so imports work as package (src.core, src.services, etc.)
backend_src = Path(__file__).parent.parent / "src"
backend_parent = backend_src.parent

# Add parent directory first (so src can be imported as a package)
if str(backend_parent) not in sys.path:
    sys.path.insert(0, str(backend_parent))

# Also add src for direct imports (from core import ...)
if str(backend_src) not in sys.path:
    sys.path.insert(0, str(backend_src))

# Ensure __init__.py files exist to make directories packages
# This helps with relative imports
for init_file in [
    backend_src / "__init__.py",
    backend_src / "core" / "__init__.py",
    backend_src / "services" / "__init__.py",
    backend_src / "api" / "__init__.py",
]:
    if not init_file.exists():
        init_file.touch()

from core.database import Database
from core.mqtt_handler import MQTTHandler
from services.schedule_checker import ScheduleCheckerService
from services.house_check_service import HouseCheckService
from services.llm_client import LLMClient
from services.tool_registry import ToolRegistry
from core.config import settings

# Configure logging for tests
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# ==================== Pytest Configuration ====================

@pytest.fixture(scope="session")
def event_loop():
    """Create event loop for async tests."""
    loop = asyncio.get_event_loop()
    yield loop
    loop.close()


# ==================== Database Fixtures ====================

@pytest.fixture
async def test_db() -> AsyncGenerator[Database, None]:
    """
    Create in-memory SQLite database for tests.
    Loads base schema and test fixtures.
    """
    # Use in-memory database for isolation
    db = Database(":memory:")
    await db.connect()
    
    # Load base schema (tables are created on connect)
    # Additional fixtures can be loaded here if needed
    
    yield db
    
    await db.disconnect()


@pytest.fixture
async def test_db_with_fixtures(test_db: Database) -> AsyncGenerator[Database, None]:
    """
    Database with test data fixtures loaded.
    """
    # Load test fixtures
    fixtures_dir = Path(__file__).parent / "fixtures"
    
    # Load user info fixture
    user_info_sql = fixtures_dir / "test_data_user_info.sql"
    if user_info_sql.exists():
        with open(user_info_sql) as f:
            await test_db._db_connection.executescript(f.read())
    
    # Load rooms fixture
    rooms_sql = fixtures_dir / "test_data_rooms.sql"
    if rooms_sql.exists():
        with open(rooms_sql) as f:
            await test_db._db_connection.executescript(f.read())
    
    # Load appliances fixture
    appliances_sql = fixtures_dir / "test_data_appliances.sql"
    if appliances_sql.exists():
        with open(appliances_sql) as f:
            await test_db._db_connection.executescript(f.read())
    
    # Load schedule fixture
    schedule_sql = fixtures_dir / "test_data_schedule.sql"
    if schedule_sql.exists():
        with open(schedule_sql) as f:
            await test_db._db_connection.executescript(f.read())
    
    yield test_db


# ==================== MQTT Fixtures ====================

class MockMQTTClient:
    """Mock MQTT client for testing that captures published messages."""
    
    def __init__(self):
        self.published_messages: list = []
        self.subscribed_topics: list = []
        self.is_connected = True
        self._on_message_callbacks = []
    
    def publish(self, topic: str, payload: str) -> Any:
        """Capture published message."""
        try:
            payload_dict = json.loads(payload) if isinstance(payload, str) else payload
        except json.JSONDecodeError:
            payload_dict = payload
        
        self.published_messages.append({
            "topic": topic,
            "payload": payload_dict,
            "timestamp": datetime.now().isoformat()
        })
        
        # Return mock result object
        class MockResult:
            rc = 0  # Success
        
        return MockResult()
    
    def subscribe(self, topic: str):
        """Track subscribed topics."""
        if topic not in self.subscribed_topics:
            self.subscribed_topics.append(topic)
    
    def simulate_device_status(self, topic: str, payload: dict):
        """Simulate device publishing status (calls on_message callbacks)."""
        for callback in self._on_message_callbacks:
            # Mock message object
            class MockMessage:
                topic = topic
                payload = json.dumps(payload).encode()
            
            callback(None, None, MockMessage())
    
    def get_messages_for_topic(self, topic: str) -> List[Dict[str, Any]]:
        """Get all messages published to a specific topic."""
        return [msg for msg in self.published_messages if msg["topic"] == topic]


@pytest.fixture
def mock_mqtt_client() -> MockMQTTClient:
    """Create mock MQTT client."""
    return MockMQTTClient()


@pytest.fixture
async def mqtt_handler(mock_mqtt_client: MockMQTTClient) -> MQTTHandler:
    """
    Create MQTT handler with mock client.
    Note: This doesn't actually connect to MQTT broker.
    """
    handler = MQTTHandler(
        broker="localhost",
        port=1883
    )
    
    # Replace client with mock
    handler.client = mock_mqtt_client
    handler.is_connected = True
    
    yield handler
    
    # Cleanup
    if hasattr(handler, 'websockets'):
        handler.websockets.clear()


# ==================== Service Fixtures ====================

@pytest.fixture
async def schedule_checker(test_db: Database, mqtt_handler: MQTTHandler) -> ScheduleCheckerService:
    """Create schedule checker service."""
    service = ScheduleCheckerService(test_db, mqtt_handler)
    yield service
    # Stop service if running
    if service.running:
        await service.stop()


@pytest.fixture
async def house_check_service(test_db: Database, mqtt_handler: MQTTHandler) -> HouseCheckService:
    """Create house check service."""
    return HouseCheckService(test_db, mqtt_handler)


# ==================== LLM Fixtures ====================

class MockLLMClient:
    """Mock LLM client for testing."""
    
    def __init__(self):
        self.model = "test-model"
        self.host = "http://localhost:11434"
        self.responses = []  # Queue of responses
    
    async def chat(self, messages: list, stream: bool = False, correlation_id: Optional[str] = None) -> str:
        """Return mock response."""
        if self.responses:
            return self.responses.pop(0)
        return '[{"tool": "chat_message", "arguments": {"message": "Test response"}}]'
    
    async def validate_connection(self) -> Dict[str, Any]:
        """Mock connection validation."""
        return {
            "valid": True,
            "message": "Mock LLM client",
            "ollama_accessible": True,
            "model_available": True
        }


@pytest.fixture
def mock_llm_client() -> MockLLMClient:
    """Create mock LLM client."""
    return MockLLMClient()


# ==================== Tool Registry Fixture ====================

@pytest.fixture
async def tool_registry(test_db: Database, mqtt_handler: MQTTHandler) -> ToolRegistry:
    """Create tool registry with test dependencies."""
    from services.tool_handlers import register_all_tools
    
    registry = ToolRegistry(test_db, mqtt_handler)
    register_all_tools(registry)
    
    return registry


# ==================== Artifact Capture ====================

@pytest.hookimpl(tryfirst=True, hookwrapper=True)
def pytest_runtest_makereport(item, call):
    """Capture artifacts on test failure."""
    outcome = yield
    rep = outcome.get_result()
    
    if rep.when == "call" and rep.failed:
        # Create artifacts directory
        artifacts_dir = Path(__file__).parent / "test_artifacts"
        artifacts_dir.mkdir(exist_ok=True)
        
        test_name = item.name.replace("::", "_")
        
        # Capture DB snapshot if available
        if hasattr(item, "funcargs") and "test_db" in item.funcargs:
            db = item.funcargs["test_db"]
            if hasattr(db, "db_path") and db.db_path != ":memory:":
                db_snapshot = artifacts_dir / f"{test_name}_db_snapshot.db"
                try:
                    shutil.copy(db.db_path, db_snapshot)
                    logger.info(f"Captured DB snapshot: {db_snapshot}")
                except Exception as e:
                    logger.warning(f"Failed to capture DB snapshot: {e}")
        
        # Capture MQTT messages if available
        if hasattr(item, "funcargs") and "mock_mqtt_client" in item.funcargs:
            mqtt = item.funcargs["mock_mqtt_client"]
            mqtt_file = artifacts_dir / f"{test_name}_mqtt_messages.json"
            try:
                with open(mqtt_file, "w") as f:
                    json.dump(mqtt.published_messages, f, indent=2)
                logger.info(f"Captured MQTT messages: {mqtt_file}")
            except Exception as e:
                logger.warning(f"Failed to capture MQTT messages: {e}")


# ==================== Test Data Builders ====================

class TestDataBuilder:
    """Helper class to build test data."""
    
    @staticmethod
    def create_user_info(name_english: str = "Test User", condition: str = "", location: str = "bedroom") -> Dict[str, Any]:
        """Create user info dict."""
        return {
            "name_thai": "",
            "name_english": name_english,
            "condition": condition,
            "current_location": location
        }
    
    @staticmethod
    def create_schedule_item(time: str, activity: str, location: Optional[str] = None, action: Optional[Dict] = None) -> Dict[str, Any]:
        """Create schedule item dict."""
        item = {
            "time": time,
            "activity": activity
        }
        if location:
            item["location"] = location
        if action:
            item["action"] = action
        return item
    
    @staticmethod
    def create_appliance(room: str, appliance_type: str, name: str, state: bool = False) -> Dict[str, Any]:
        """Create appliance dict."""
        return {
            "room": room,
            "type": appliance_type,
            "name": name,
            "state": 1 if state else 0,
            "isOn": 1 if state else 0
        }


@pytest.fixture
def test_data_builder() -> TestDataBuilder:
    """Provide test data builder."""
    return TestDataBuilder

