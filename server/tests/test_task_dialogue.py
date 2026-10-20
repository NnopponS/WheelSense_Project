from unittest.mock import AsyncMock

import pytest

from app.agent_runtime.intent import ConversationContext


ROSTER = [{"id": 7, "first_name": "Samuel", "last_name": "Ortiz"}]
STAFF = [{"id": 12, "user_id": 22, "first_name": "Jason", "last_name": "Kim"}]


@pytest.mark.asyncio
@pytest.mark.parametrize("reply", ["Clean the patient room, target: patient room, assign to self: false, priority: normal", "reply with 'Clean the patient room' as the title and continue conversation with 'What work?' as a question"])
async def test_suggested_answers_do_not_send_internal_model_fields(reply):
    import json
    from app.agent_runtime.task_dialogue import task_dialogue_turn

    model = AsyncMock(return_value=json.dumps({"draft": {}, "field": "title", "question": "What work?", "choices": [{"label": "Clean the patient room", "reply": reply}]}))
    result = await task_dialogue_turn("create task", ConversationContext(), ROSTER, STAFF, model, user_id=1)
    assert result.grounding["response_cards"][0]["choices"][0]["reply"] == "Clean the patient room"


@pytest.mark.asyncio
async def test_llm_asks_a_question_and_consumes_a_natural_followup():
    from app.agent_runtime.task_dialogue import task_dialogue_turn

    model = AsyncMock(side_effect=[
        '{"draft":{},"field":"title","question":"What would you like staff to do?","choices":[{"label":"Hydration check","reply":"Hydration check"}]}',
        '{"draft":{"title":"Hydration check","patient_id":7},"field":"assignee","question":"Who should handle Samuel’s check?","choices":[{"label":"Jason Kim","reply":"Assign Jason Kim"},{"label":"Me","reply":"Assign to me"}]}',
        '{"draft":{"title":"Hydration check","patient_id":7,"assigned_user_id":22,"due_at":"2026-10-20T16:30:00+07:00"}}',
    ])
    context = ConversationContext()
    first = await task_dialogue_turn("create task", context, ROSTER, STAFF, model, user_id=1)
    assert first.mode == "answer"
    assert first.grounding["response_cards"][0]["question"] == "What would you like staff to do?"
    second = await task_dialogue_turn("Hydration check for Samuel", context, ROSTER, STAFF, model, user_id=1)
    assert second.grounding["response_cards"][0]["active_field"] == "assignee"
    final = await task_dialogue_turn("Jason Kim tomorrow at 4:30 pm", context, ROSTER, STAFF, model, user_id=1)
    assert final.mode == "plan"
    assert final.plan.steps[0].tool_name == "create_task_management_task"
    assert final.plan.steps[0].arguments["assigned_user_id"] == 22
    assert final.plan.steps[0].arguments["patient_id"] == 7
    assert final.action_payload is not None
    assert context.task_dialogue is None


@pytest.mark.asyncio
async def test_model_cannot_use_an_invented_patient_or_assignee():
    from app.agent_runtime.task_dialogue import task_dialogue_turn

    model = AsyncMock(return_value='{"draft":{"title":"Hydration","patient_id":999,"assigned_user_id":999,"no_deadline":true}}')
    result = await task_dialogue_turn("create hydration task", ConversationContext(), ROSTER, STAFF, model, user_id=1)
    assert result.mode == "answer"
    assert result.plan is None
    assert "patient_id" in result.grounding["response_cards"][0]["missing_fields"]


@pytest.mark.asyncio
async def test_missing_deadline_requires_a_question_instead_of_an_invented_date():
    from app.agent_runtime.task_dialogue import task_dialogue_turn

    model = AsyncMock(return_value='{"draft":{"title":"Hydration","patient_id":7,"assign_to_self":true}}')
    result = await task_dialogue_turn("Create hydration for Samuel assign me", ConversationContext(), ROSTER, STAFF, model, user_id=1)
    assert result.mode == "answer"
    assert result.grounding["response_cards"][0]["active_field"] == "due_at"


@pytest.mark.asyncio
async def test_optional_model_defaults_do_not_discard_its_question():
    from app.agent_runtime.task_dialogue import task_dialogue_turn

    model = AsyncMock(return_value='{"draft":{"title":"","assigned_role":"","priority":3},"field":"title","question":"What work do you need done?","choices":[]}')
    result = await task_dialogue_turn("create task", ConversationContext(), ROSTER, STAFF, model, user_id=1)
    assert result.assistant_reply == "What work do you need done?"


@pytest.mark.asyncio
async def test_flat_model_draft_and_nulls_do_not_restart_intake():
    from app.agent_runtime.task_dialogue import task_dialogue_turn

    context = ConversationContext(task_dialogue={"draft": {"title": "Hydration", "patient_id": 7}, "turns": [{"role": "user", "content": "Hydration for Samuel Ortiz"}]})
    model = AsyncMock(return_value='{"title":null,"patient_id":null,"assigned_user_id":22,"no_deadline":true}')
    result = await task_dialogue_turn("Assign Jason Kim, no deadline", context, ROSTER, STAFF, model, user_id=1)
    assert result.mode == "plan"
    assert result.plan.steps[0].arguments["title"] == "Hydration"
    assert result.plan.steps[0].arguments["patient_id"] == 7


@pytest.mark.asyncio
async def test_model_cannot_waive_deadline_without_user_choice():
    from app.agent_runtime.task_dialogue import task_dialogue_turn

    model = AsyncMock(return_value='{"draft":{"title":"Hydration","patient_id":7,"assign_to_self":true,"no_deadline":true}}')
    result = await task_dialogue_turn("Create hydration for Samuel Ortiz and assign me", ConversationContext(), ROSTER, STAFF, model, user_id=1)
    assert result.mode == "answer"
    assert result.grounding["response_cards"][0]["active_field"] == "due_at"


@pytest.mark.asyncio
async def test_no_deadline_choice_reaches_pending_model(db_session, runtime_test_user, monkeypatch):
    from contextlib import asynccontextmanager
    from app.agent_runtime import service
    from app.core.security import create_access_token

    @asynccontextmanager
    async def session():
        yield db_session
    monkeypatch.setattr(service, "AsyncSessionLocal", session)
    monkeypatch.setattr(service, "_call_mcp_tool", AsyncMock(side_effect=lambda _token, name, args: ROSTER if name == "list_visible_patients" else STAFF))
    monkeypatch.setattr(service.ai_chat, "collect_chat_reply_best_effort", AsyncMock(return_value='{"draft":{"title":"Hydration","patient_id":7,"assign_to_self":true,"no_deadline":true}}'))
    service._get_or_create_context(90903).task_dialogue = {"draft": {"title": "Hydration", "patient_id": 7, "assign_to_self": True}, "turns": [{"role": "user", "content": "Hydration for Samuel Ortiz assign me"}]}
    result = await service.propose_turn(actor_access_token=create_access_token(subject=str(runtime_test_user.id), role="admin"), message="No deadline", messages=[], conversation_id=90903)
    assert result.mode == "plan"
    assert result.grounding["classification_method"] == "llm_task_dialogue"


@pytest.mark.asyncio
async def test_intake_schema_is_sent_to_the_real_provider_boundary(monkeypatch):
    from types import SimpleNamespace
    from app.services import ai_chat

    async def chunks():
        yield SimpleNamespace(choices=[SimpleNamespace(delta=SimpleNamespace(content='{"draft":{}}'))])
    create = AsyncMock(return_value=chunks())
    client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)), close=AsyncMock())
    monkeypatch.setattr(ai_chat, "AsyncOpenAI", lambda **kwargs: client)
    parts = [part async for part in ai_chat.stream_ollama(model="test-model", oai_messages=[], response_schema={"type": "object"})]
    assert parts == ['{"draft":{}}']
    assert create.call_args.kwargs["response_format"] == {"type": "json_schema", "json_schema": {"name": "task_intake", "schema": {"type": "object"}}}


@pytest.mark.asyncio
async def test_title_answer_is_preserved_when_model_mislabels_it_as_target():
    from app.agent_runtime.task_dialogue import task_dialogue_turn

    context = ConversationContext(task_dialogue={"draft": {}, "turns": [{"role": "user", "content": "create task"}], "active_field": "title"})
    model = AsyncMock(return_value='{"draft":{"title":null,"target":"Hydration check for Samuel Ortiz"},"field":"title","question":"What task?","choices":[]}')
    result = await task_dialogue_turn("Hydration check for Samuel Ortiz", context, ROSTER, STAFF, model, user_id=1)
    assert result.grounding["response_cards"][0]["active_field"] == "assignee"
    assert context.task_dialogue["draft"]["title"] == "Hydration check for Samuel Ortiz"


@pytest.mark.asyncio
async def test_named_assignee_answer_is_resolved_when_model_omits_user_id():
    from app.agent_runtime.task_dialogue import task_dialogue_turn

    context = ConversationContext(task_dialogue={"draft": {"title": "Hydration", "patient_id": 7}, "turns": [{"role": "user", "content": "Hydration for Samuel Ortiz"}], "active_field": "assignee"})
    model = AsyncMock(return_value='{"draft":{"no_deadline":true},"field":"assignee","question":"Who should handle it?","choices":[]}')
    result = await task_dialogue_turn("Assign Jason Kim, no deadline", context, ROSTER, STAFF, model, user_id=1)
    assert result.mode == "plan"
    assert result.plan.steps[0].arguments["assigned_user_id"] == 22
