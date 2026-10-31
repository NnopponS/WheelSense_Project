from unittest.mock import AsyncMock

import pytest

from app.agent_runtime.intent import ConversationContext, IntentClassifier
from app.agent_runtime.llm_tool_router import build_openai_tools_for_role


def test_task_question_is_not_a_patient_name():
    _, immediate = IntentClassifier().classify("what the due date on Hydration round - Samuel?")
    assert immediate is None or immediate[0] != "list_visible_patients"


def test_router_preserves_tool_argument_types():
    tools = {t["function"]["name"]: t["function"] for t in build_openai_tools_for_role("admin")}
    assert tools["get_staff_timeline"]["parameters"]["properties"]["caregiver_id"]["type"] == "integer"
    assert tools["create_task_management_task"]["parameters"]["properties"]["assign_to_self"]["type"] == "boolean"
    assert "Task Management" in tools["list_task_management_tasks"]["description"]


@pytest.mark.asyncio
@pytest.mark.parametrize("kind,name,prompt", [
    ("patient", "Samuel", "show Samuel's timeline and information"),
    ("staff", "Jason", "show staff Jason's timeline and information"),
    ("patient", "Samuel", "ขอไทม์ไลน์และข้อมูลของ Samuel"),
    ("staff", "Jason", "ขอข้อมูลเจ้าหน้าที่ Jason"),
])
async def test_named_person_reads_fetch_real_details_and_timeline(kind, name, prompt):
    from app.agent_runtime.read_requests import answer_read_request

    calls = []
    async def call(tool, args):
        calls.append((tool, args))
        if tool == "list_visible_patients":
            return [{"id": 7, "first_name": "Samuel", "last_name": "Ortiz"}]
        if tool == "list_staff":
            return [{"id": 12, "first_name": "Jason", "last_name": "Kim", "role": "observer"}]
        if tool.endswith("details"):
            return {"id": 7 if kind == "patient" else 12, "first_name": name, "last_name": "Ortiz" if kind == "patient" else "Kim", "role": "observer" if kind == "staff" else None}
        return {"events": [{"timestamp": "2026-10-19T08:00:00+07:00", "description": "Completed hydration check", "event_type": "task_completed"}]}

    result = await answer_read_request(prompt, ConversationContext(), set(t["function"]["name"] for t in build_openai_tools_for_role("admin")), call)
    assert result is not None
    assert name in result.assistant_reply
    assert f"get_{kind}_details" in result.grounding["tool_names"]
    if "timeline" in prompt or "ไทม์ไลน์" in prompt:
        assert "Completed hydration check" in result.assistant_reply
        assert (f"get_{kind}_timeline", {"patient_id" if kind == "patient" else "caregiver_id": 7 if kind == "patient" else 12}) in calls


@pytest.mark.asyncio
async def test_ambiguous_person_requires_a_choice_before_details():
    from app.agent_runtime.read_requests import answer_read_request

    async def call(tool, args):
        assert tool in {"list_visible_patients", "list_staff"}
        return [{"id": 7, "first_name": "Sam", "last_name": "Ortiz"}, {"id": 8, "first_name": "Sam", "last_name": "Jones"}] if tool == "list_visible_patients" else []

    result = await answer_read_request("show Sam's information", ConversationContext(), {"list_visible_patients", "get_patient_details"}, call)
    assert result.grounding["reason_code"] == "person_ambiguous"
    assert "Ortiz" in result.assistant_reply and "Jones" in result.assistant_reply


@pytest.mark.asyncio
async def test_staff_request_does_not_use_patient_id_or_disallowed_tools():
    from app.agent_runtime.read_requests import answer_read_request

    call = AsyncMock(side_effect=AssertionError("disallowed tool"))
    result = await answer_read_request("show staff Jason's timeline", ConversationContext(last_focused_patient_id=7), {"list_visible_patients", "get_patient_details"}, call)
    assert result.grounding["reason_code"] == "person_not_found"


@pytest.mark.asyncio
async def test_task_due_date_uses_task_rows_without_patient_lookup():
    from app.agent_runtime.read_requests import answer_read_request

    async def call(tool, args):
        assert tool == "list_task_management_tasks"
        return [{"id": 1, "title": "Hydration round - Samuel", "due_at": "2026-10-18T17:00:00+07:00", "status": "pending"}, {"id": 2, "title": "Hydration round - Grace", "due_at": "2026-10-19T17:00:00+07:00"}]

    result = await answer_read_request("what the due date on Hydration round - Samuel?", ConversationContext(), {"list_task_management_tasks"}, call)
    assert "2026-10-18" in result.assistant_reply
    assert "Grace" not in result.assistant_reply


@pytest.mark.asyncio
@pytest.mark.parametrize("prompt,tool,rows,reason", [
    ("When is task #999999 due?", "list_task_management_tasks", [{"id": 1, "title": "Other task"}], "task_not_found"),
    ("Show information for patient Nobody Example", "list_visible_patients", [{"id": 7, "first_name": "Samuel", "last_name": "Ortiz"}], "person_not_found"),
    ("Show information for patient Sam", "list_visible_patients", [{"id": 7, "first_name": "Sam", "last_name": "Ortiz"}, {"id": 8, "first_name": "Sam", "last_name": "Jones"}], "person_ambiguous"),
])
async def test_unresolved_read_does_not_present_lookup_rows_as_the_answer(prompt, tool, rows, reason):
    from app.agent_runtime.read_requests import answer_read_request

    result = await answer_read_request(prompt, ConversationContext(), {tool, "get_patient_details"}, AsyncMock(return_value=rows))
    assert result.grounding["reason_code"] == reason
    assert result.grounding["response_cards"] == []
    assert result.assistant_reply


@pytest.mark.asyncio
@pytest.mark.parametrize("prompt,expected", [("show tasks for patient Samuel Ortiz", [1, 3]), ("show my tasks", [2, 3]), ("show my tasks for patient Samuel Ortiz", [3]), ("show tasks for staff Jason Kim", [1]), ("รายการงานของฉัน", [2, 3])])
async def test_task_lists_respect_requested_patient_and_assignee(prompt, expected):
    from app.agent_runtime.read_requests import answer_read_request

    async def call(tool, args):
        if tool == "list_visible_patients":
            return [{"id": 7, "first_name": "Samuel", "last_name": "Ortiz"}]
        if tool == "list_staff":
            return [{"id": 12, "first_name": "Jason", "last_name": "Kim", "user_id": 22}]
        return [{"id": 1, "title": "Hydration", "patient_id": 7, "assigned_user_id": 22}, {"id": 2, "title": "Mobility", "patient_id": 8, "assigned_user_ids": [1]}, {"id": 3, "title": "Skin check", "patient_id": 7, "assigned_user_ids": [1]}]

    result = await answer_read_request(prompt, ConversationContext(), {"list_task_management_tasks", "list_visible_patients", "list_staff"}, call, actor_user_id=1)
    assert [row["id"] for row in result.grounding["response_cards"][0]["rows"]] == expected


def test_task_due_time_keeps_minutes():
    from app.agent_runtime.task_request import extract_task_due_at

    assert extract_task_due_at("create hydration task due 2026-10-20 16:30") == "2026-10-20T16:30:00+00:00"


@pytest.mark.asyncio
async def test_create_task_plan_and_execution_with_named_patient_and_staff(db_session, runtime_test_user, runtime_test_workspace, monkeypatch):
    import json
    from contextlib import asynccontextmanager
    from sqlalchemy import select
    from app.agent_runtime import service, llm_tool_router
    from app.core.security import create_access_token, get_password_hash
    from app.models.patients import Patient
    from app.models.caregivers import CareGiver
    from app.models.users import User
    from app.models.tasks import Task
    from app.mcp.server import execute_workspace_tool
    from app.config import settings
    from app.schemas.chat import ChatMessagePart

    patient = Patient(workspace_id=runtime_test_workspace.id, first_name="Samuel", last_name="Ortiz")
    staff = CareGiver(workspace_id=runtime_test_workspace.id, first_name="Jason", last_name="Kim", role="observer")
    db_session.add_all([patient, staff])
    await db_session.flush()
    assignee = User(workspace_id=runtime_test_workspace.id, username="jason.k", hashed_password=get_password_hash("test-only"), role="observer", caregiver_id=staff.id, is_active=True)
    db_session.add(assignee)
    runtime_test_user.caregiver_id = staff.id
    runtime_test_user.username = "admin"
    other_staff = CareGiver(workspace_id=runtime_test_workspace.id, first_name="Jason", last_name="Lee", role="observer")
    db_session.add(other_staff)
    await db_session.flush()
    db_session.add(User(workspace_id=runtime_test_workspace.id, username="jason.l", hashed_password=get_password_hash("test-only"), role="observer", caregiver_id=other_staff.id, is_active=True))
    await db_session.commit()

    @asynccontextmanager
    async def session():
        yield db_session

    for target in ("app.agent_runtime.service.AsyncSessionLocal", "app.agent_runtime.llm_tool_router.AsyncSessionLocal", "app.mcp.server.AsyncSessionLocal", "app.db.session.AsyncSessionLocal"):
        monkeypatch.setattr(target, session)
    async def call(_token, name, args):
        return await execute_workspace_tool(tool_name=name, workspace_id=runtime_test_workspace.id, actor_context={"user_id": runtime_test_user.id, "role": "admin"}, arguments=args)
    monkeypatch.setattr(service, "_call_mcp_tool", call)
    monkeypatch.setattr(service, "_collect_plan_confirmation_reply_or_fallback", AsyncMock(side_effect=AssertionError("task confirmation must not need a provider")))
    monkeypatch.setattr(service.ai_chat, "collect_chat_reply_best_effort", AsyncMock(return_value=json.dumps({"draft": {"title": "Hydration round - Samuel", "patient_id": patient.id, "assigned_user_id": assignee.id, "due_at": "2026-10-20T16:30:00+00:00"}})))
    monkeypatch.setattr(settings, "easeai_pipeline_v2", True)
    monkeypatch.setattr(settings, "easeai_deterministic_answer_lock_enabled", False)
    token = create_access_token(subject=str(runtime_test_user.id), role="admin")
    message = 'Create task titled "Hydration round - Samuel" for patient Samuel Ortiz, assigned to Jason Kim, due 2026-10-20 16:30'
    response = await service.propose_turn(actor_access_token=token, message=message, messages=[ChatMessagePart(role="user", content=message)], conversation_id=713)
    assert response.mode == "plan"
    assert response.grounding["classification_method"] == "llm_task_dialogue"
    assert (await db_session.execute(select(Task))).scalars().all() == []
    step = response.plan.steps[0]
    assert step.tool_name == "create_task_management_task"
    assert step.arguments["patient_id"] == patient.id
    assert step.arguments["assigned_user_id"] == assignee.id
    assert step.arguments["due_at"] == "2026-10-20T16:30:00+00:00"
    executed = await service.execute_plan(actor_access_token=token, execution_plan=response.plan)
    saved = await db_session.get(Task, executed.execution_result["steps"][0]["result"]["id"])
    assert saved.patient_id == patient.id and saved.assigned_user_id == assignee.id
    assert saved.title == "Hydration round - Samuel"


@pytest.mark.asyncio
async def test_vague_task_asks_for_details_without_cloud(db_session, runtime_test_user, monkeypatch):
    from contextlib import asynccontextmanager
    from app.agent_runtime import service
    from app.config import settings
    from app.core.security import create_access_token

    @asynccontextmanager
    async def session():
        yield db_session
    monkeypatch.setattr(service, "AsyncSessionLocal", session)
    monkeypatch.setattr(service, "_call_mcp_tool", AsyncMock(return_value=[]))
    monkeypatch.setattr(service, "propose_llm_tool_turn", AsyncMock(side_effect=AssertionError("must clarify locally")))
    monkeypatch.setattr(service.ai_chat, "collect_chat_reply_best_effort", AsyncMock(return_value='{"draft":{},"field":"title","question":"What should staff do?","choices":[]}'))
    monkeypatch.setattr(settings, "easeai_pipeline_v2", True)
    monkeypatch.setattr(settings, "easeai_deterministic_answer_lock_enabled", False)
    result = await service.propose_turn(actor_access_token=create_access_token(subject=str(runtime_test_user.id), role="admin"), message="create task", messages=[], conversation_id=714)
    assert result.mode == "answer"
    assert result.grounding["reason_code"] == "clarification_required"
    assert result.grounding["classification_method"] == "llm_task_dialogue"
    assert result.grounding["response_cards"][0]["active_field"] == "title"


@pytest.mark.asyncio
async def test_full_name_disambiguates_shared_first_name():
    from app.agent_runtime.read_requests import answer_read_request

    async def call(name, args):
        if name == "list_visible_patients":
            return [{"id": 1, "first_name": "Samuel", "last_name": "Ortiz"}, {"id": 2, "first_name": "Samuel", "last_name": "Jones"}]
        assert args == {"patient_id": 1}
        return {"id": 1, "first_name": "Samuel", "last_name": "Ortiz"}

    result = await answer_read_request("show Samuel Ortiz information", ConversationContext(), {"list_visible_patients", "get_patient_details"}, call)
    assert result.grounding.get("reason_code") is None
    assert "Samuel Ortiz" in result.assistant_reply


def test_explicit_due_timezone_is_preserved():
    from app.agent_runtime.task_request import extract_task_due_at

    assert extract_task_due_at("due 2026-10-20T16:30:00+07:00") == "2026-10-20T16:30:00+07:00"


@pytest.mark.asyncio
@pytest.mark.parametrize("prompt", ["When is task #42 due?", "show task #42 details"])
async def test_task_id_lookup_cannot_return_another_task(prompt):
    from app.agent_runtime.read_requests import answer_read_request

    async def call(name, args):
        assert name == "list_task_management_tasks"
        return [{"id": 41, "title": "Other task"}, {"id": 42, "title": "Hydration", "due_at": "2026-10-20"}]

    result = await answer_read_request(prompt, ConversationContext(), {"list_task_management_tasks"}, call)
    assert "2026-10-20" in result.assistant_reply
    assert "Other task" not in result.assistant_reply


def test_staff_timeline_events_accept_naive_database_timestamps():
    from datetime import datetime, timezone, timedelta
    from app.services.staff_timeline import StaffTimelineEvent

    older = StaffTimelineEvent(datetime(2026, 10, 19, 8), "task", "created", "Old task")
    newer = StaffTimelineEvent(datetime(2026, 10, 19, 16, tzinfo=timezone(timedelta(hours=7))), "movement", "entered", "New room")
    assert older.timestamp.tzinfo is not None
    assert sorted([older, newer], key=lambda event: event.timestamp, reverse=True)[0].title == "New room"


@pytest.mark.asyncio
@pytest.mark.parametrize("prompt", ["show his timeline", "ขอไทม์ไลน์ของเขา"])
async def test_staff_followup_does_not_reuse_a_patient_id(prompt):
    from app.agent_runtime.read_requests import answer_read_request

    async def call(name, args):
        if name == "list_visible_patients":
            return [{"id": 7, "first_name": "Samuel", "last_name": "Ortiz"}]
        if name == "list_staff":
            return [{"id": 12, "first_name": "Jason", "last_name": "Kim"}]
        assert args == {"caregiver_id": 12}
        return {"events": []} if name.endswith("timeline") else {"first_name": "Jason", "last_name": "Kim"}

    context = ConversationContext(last_entities=[{"type": "staff", "id": 12}], last_focused_patient_id=None)
    allowed = {"list_visible_patients", "list_staff", "get_patient_details", "get_patient_timeline", "get_staff_details", "get_staff_timeline"}
    result = await answer_read_request(prompt, context, allowed, call)
    assert "get_staff_timeline" in result.grounding["tool_names"]
