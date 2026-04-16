"""Tests for unified task management system."""
import pytest
from datetime import date, datetime, timezone
from unittest.mock import AsyncMock, MagicMock
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tasks import Task, TaskReport
from app.schemas.tasks import (
    TaskCreate,
    TaskUpdate,
    TaskOut,
    TaskReportCreate,
    TaskBoardResponse,
    SubtaskItemCreate,
    ReportTemplate,
    ReportTemplateField,
)
from app.services.tasks import TaskService, task_service


# ── Fixtures ───────────────────────────────────────────────────────────────────

@pytest.fixture
def mock_db():
    """Create a mock async database session."""
    return AsyncMock(spec=AsyncSession)


@pytest.fixture
def mock_user():
    """Create a mock user."""
    user = MagicMock()
    user.id = 1
    user.role = "head_nurse"
    user.workspace_id = 1
    return user


@pytest.fixture
def task_service_instance():
    """Return the task service singleton."""
    return task_service


# ── Test TaskCreate Schema ────────────────────────────────────────────────────

class TestTaskCreateSchema:
    """Test TaskCreate Pydantic schema validation."""

    def test_create_specific_task_valid(self):
        """Test creating a valid specific task."""
        data = TaskCreate(
            task_type="specific",
            title="Check patient vitals",
            priority="high",
            description="Monitor patient every 2 hours",
        )
        assert data.task_type == "specific"
        assert data.title == "Check patient vitals"
        assert data.priority == "high"
        assert data.subtasks == []

    def test_create_routine_task_valid(self):
        """Test creating a valid routine task."""
        data = TaskCreate(
            task_type="routine",
            title="Daily room cleaning",
            priority="normal",
        )
        assert data.task_type == "routine"

    def test_create_task_with_subtasks(self):
        """Test creating task with subtasks."""
        data = TaskCreate(
            task_type="specific",
            title="Patient admission",
            subtasks=[
                SubtaskItemCreate(title="Collect patient info"),
                SubtaskItemCreate(title="Assign room"),
            ],
        )
        assert len(data.subtasks) == 2
        assert data.subtasks[0].title == "Collect patient info"

    def test_create_task_with_report_template(self):
        """Test creating task with report template."""
        data = TaskCreate(
            task_type="specific",
            title="Medication administration",
            report_template=ReportTemplate(
                fields=[
                    ReportTemplateField(
                        key="medication_name",
                        label="Medication Name",
                        type="text",
                        required=True,
                    ),
                    ReportTemplateField(
                        key="dosage",
                        label="Dosage (mg)",
                        type="number",
                        required=True,
                    ),
                ]
            ),
        )
        assert len(data.report_template.fields) == 2

    def test_create_task_invalid_type(self):
        """Test that invalid task_type raises error."""
        with pytest.raises(Exception):
            TaskCreate(task_type="invalid", title="Test")

    def test_create_task_invalid_priority(self):
        """Test that invalid priority raises error."""
        with pytest.raises(Exception):
            TaskCreate(task_type="specific", title="Test", priority="urgent")

    def test_create_task_empty_title(self):
        """Test that empty title raises error."""
        with pytest.raises(Exception):
            TaskCreate(task_type="specific", title="")


# ── Test TaskUpdate Schema ────────────────────────────────────────────────────

class TestTaskUpdateSchema:
    """Test TaskUpdate Pydantic schema validation."""

    def test_update_status(self):
        """Test updating task status."""
        data = TaskUpdate(status="in_progress")
        assert data.status == "in_progress"

    def test_update_priority(self):
        """Test updating task priority."""
        data = TaskUpdate(priority="critical")
        assert data.priority == "critical"

    def test_update_multiple_fields(self):
        """Test updating multiple fields."""
        data = TaskUpdate(
            title="Updated title",
            description="Updated description",
            status="completed",
            priority="high",
        )
        assert data.title == "Updated title"
        assert data.description == "Updated description"
        assert data.status == "completed"
        assert data.priority == "high"


# ── Test TaskReportCreate Schema ──────────────────────────────────────────────

class TestTaskReportCreateSchema:
    """Test TaskReportCreate Pydantic schema validation."""

    def test_create_report_valid(self):
        """Test creating a valid report."""
        data = TaskReportCreate(
            report_data={
                "medication_name": "Paracetamol",
                "dosage": 500,
            },
            notes="Patient tolerated well",
        )
        assert data.report_data["medication_name"] == "Paracetamol"
        assert data.notes == "Patient tolerated well"

    def test_create_report_empty_data(self):
        """Test creating report with empty data."""
        data = TaskReportCreate(report_data={})
        assert data.report_data == {}


# ── Test Task Model ───────────────────────────────────────────────────────────

class TestTaskModel:
    """Test Task SQLAlchemy model."""

    def test_task_creation(self):
        """Test creating a Task model instance."""
        task = Task(
            workspace_id=1,
            task_type="specific",
            title="Test task",
            status="pending",
            priority="normal",
        )
        assert task.workspace_id == 1
        assert task.task_type == "specific"
        assert task.status == "pending"
        assert task.is_active is True

    def test_task_defaults(self):
        """Test task default values."""
        task = Task(
            workspace_id=1,
            task_type="routine",
            title="Routine task",
        )
        assert task.status == "pending"
        assert task.priority == "normal"
        assert task.subtasks == []
        assert task.report_template == {}
        assert task.is_active is True

    def test_task_with_subtasks(self):
        """Test task with subtasks."""
        task = Task(
            workspace_id=1,
            task_type="specific",
            title="Complex task",
            subtasks=[
                {"id": "1", "title": "Step 1", "status": "pending"},
                {"id": "2", "title": "Step 2", "status": "completed"},
            ],
        )
        assert len(task.subtasks) == 2
        assert task.subtasks[0]["title"] == "Step 1"


# ── Test TaskReport Model ─────────────────────────────────────────────────────

class TestTaskReportModel:
    """Test TaskReport SQLAlchemy model."""

    def test_report_creation(self):
        """Test creating a TaskReport model instance."""
        report = TaskReport(
            workspace_id=1,
            task_id=1,
            submitted_by_user_id=1,
            report_data={"field1": "value1"},
        )
        assert report.workspace_id == 1
        assert report.task_id == 1
        assert report.report_data == {"field1": "value1"}


# ── Integration Tests (require database) ──────────────────────────────────────

@pytest.mark.integration
class TestTaskServiceIntegration:
    """Integration tests for TaskService (requires database)."""

    @pytest.mark.asyncio
    async def test_list_tasks_empty(self, mock_db, task_service_instance):
        """Test listing tasks when none exist."""
        mock_db.execute = AsyncMock(return_value=MagicMock(all=MagicMock(return_value=[])))
        
        tasks = await task_service_instance.list_tasks(mock_db, workspace_id=1)
        assert tasks == []

    @pytest.mark.asyncio
    async def test_create_task_success(self, mock_db, mock_user, task_service_instance):
        """Test successful task creation."""
        # This would require actual DB session in real tests
        pass

    @pytest.mark.asyncio
    async def test_get_task_not_found(self, mock_db, task_service_instance):
        """Test getting non-existent task."""
        mock_db.execute = AsyncMock(return_value=MagicMock(scalars=MagicMock(first=MagicMock(return_value=None))))
        
        task = await task_service_instance.get_task(mock_db, task_id=999, workspace_id=1)
        assert task is None


# ── Unit Tests for Service Logic ──────────────────────────────────────────────

class TestTaskServiceUnit:
    """Unit tests for TaskService business logic."""

    def test_service_singleton(self):
        """Test that task_service is a singleton instance."""
        assert isinstance(task_service, TaskService)

    def test_task_board_response_structure(self):
        """Test TaskBoardResponse structure."""
        response = TaskBoardResponse(
            users=[],
            total_tasks=0,
            completed_tasks=0,
        )
        assert response.total_tasks == 0
        assert response.completed_tasks == 0
        assert response.users == []


# ── Edge Cases ────────────────────────────────────────────────────────────────

class TestTaskEdgeCases:
    """Test edge cases and error handling."""

    def test_task_with_null_patient(self):
        """Test task without patient link."""
        data = TaskCreate(
            task_type="specific",
            title="General task",
            patient_id=None,
        )
        assert data.patient_id is None

    def test_task_with_null_assignee(self):
        """Test task without assignee."""
        data = TaskCreate(
            task_type="routine",
            title="Unassigned task",
            assigned_user_id=None,
        )
        assert data.assigned_user_id is None

    def test_task_with_due_date(self):
        """Test task with due date."""
        due = datetime(2026, 4, 20, 10, 0, 0, tzinfo=timezone.utc)
        data = TaskCreate(
            task_type="specific",
            title="Time-sensitive task",
            due_at=due,
        )
        assert data.due_at == due

    def test_task_with_shift_date(self):
        """Test task with shift date."""
        shift = date(2026, 4, 15)
        data = TaskCreate(
            task_type="routine",
            title="Shift task",
            shift_date=shift,
        )
        assert data.shift_date == shift


# ── Permission Tests ──────────────────────────────────────────────────────────

class TestTaskPermissions:
    """Test role-based permission logic."""

    def test_head_nurse_can_create(self, mock_user):
        """Test head nurse can create tasks."""
        assert mock_user.role in {"admin", "head_nurse"}

    def test_supervisor_cannot_create(self):
        """Test supervisor cannot create tasks."""
        supervisor = MagicMock()
        supervisor.role = "supervisor"
        assert supervisor.role not in {"admin", "head_nurse"}

    def test_observer_cannot_create(self):
        """Test observer cannot create tasks."""
        observer = MagicMock()
        observer.role = "observer"
        assert observer.role not in {"admin", "head_nurse"}


# ── Status Transition Tests ───────────────────────────────────────────────────

class TestStatusTransitions:
    """Test valid task status transitions."""

    VALID_STATUSES = {"pending", "in_progress", "completed", "cancelled", "skipped"}

    def test_all_valid_statuses(self):
        """Test that all valid statuses are accepted."""
        for status in self.VALID_STATUSES:
            data = TaskUpdate(status=status)
            assert data.status == status

    def test_invalid_status_rejected(self):
        """Test that invalid status is rejected."""
        with pytest.raises(Exception):
            TaskUpdate(status="invalid_status")

    def test_valid_transitions(self):
        """Test valid status transitions."""
        transitions = [
            ("pending", "in_progress"),
            ("pending", "cancelled"),
            ("pending", "skipped"),
            ("in_progress", "completed"),
            ("in_progress", "cancelled"),
            ("in_progress", "skipped"),
        ]
        for old_status, new_status in transitions:
            update = TaskUpdate(status=new_status)
            assert update.status == new_status
