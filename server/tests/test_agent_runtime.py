"""Tests for Agent Runtime intent classification and execution."""

from __future__ import annotations

import pytest

from app.agent_runtime.intent import (
    ConversationContext,
    IntentClassifier,
    IntentExample,
    IntentMatch,
    get_classifier,
    LOW_CONFIDENCE_THRESHOLD,
    MEDIUM_CONFIDENCE_THRESHOLD,
    HIGH_CONFIDENCE_THRESHOLD,
    INTENT_EXAMPLES,
)
from app.agent_runtime.conversation_fastpath import is_general_conversation_only
from app.agent_runtime.service import _plan_for_message, _get_or_create_context


class TestConversationContext:
    """Test conversation context tracking."""

    def test_create_empty_context(self):
        """Test creating empty conversation context."""
        ctx = ConversationContext()
        assert ctx.messages == []
        assert ctx.last_entities == []
        assert ctx.last_focused_patient_id is None
        assert ctx.last_intent is None
        assert ctx.last_playbook is None

    def test_add_message(self):
        """Test adding messages to context."""
        ctx = ConversationContext()
        ctx.add_message("user", "show me patients")
        ctx.add_message("assistant", "Here are the patients")

        assert len(ctx.messages) == 2
        assert ctx.messages[0]["role"] == "user"
        assert ctx.messages[0]["content"] == "show me patients"
        assert ctx.messages[1]["role"] == "assistant"

    def test_context_message_limit(self):
        """Test that context keeps only last 10 messages."""
        ctx = ConversationContext()
        for i in range(15):
            ctx.add_message("user", f"message {i}")

        assert len(ctx.messages) == 10
        assert ctx.messages[0]["content"] == "message 5"
        assert ctx.messages[-1]["content"] == "message 14"

    def test_update_entities(self):
        """Test updating tracked entities."""
        ctx = ConversationContext()
        entities = [{"type": "alert", "id": 123}, {"type": "patient", "id": 456}]
        ctx.update_entities(entities)

        assert ctx.last_entities == entities


class TestIntentClassifierRegex:
    """Test regex-based intent classification."""

    @pytest.fixture
    def classifier(self):
        return IntentClassifier()

    def test_system_health_intent(self, classifier):
        """Test system health query classification."""
        match, immediate = classifier.classify("what's the system health?")
        assert match is not None
        assert match.intent == "system.health"
        assert match.playbook == "system"
        assert match.confidence >= 0.9
        assert immediate == ("get_system_health", {})

    def test_list_patients_intent(self, classifier):
        """Test list patients query classification."""
        match, immediate = classifier.classify("show me all patients")
        assert match is not None
        assert match.intent == "patients.read"
        assert immediate == ("list_visible_patients", {})

    def test_thai_patient_list_intent(self, classifier):
        """Thai ward phrasing should map to list_visible_patients (no English-only fallback)."""
        match, immediate = classifier.classify("ตอนนี้มีผู้ป่วยคือใครบ้าง")
        assert match is not None
        assert match.intent == "patients.read"
        assert immediate == ("list_visible_patients", {})

    def test_patient_location_query_uses_patient_lookup(self, classifier):
        match, immediate = classifier.classify("ตอนนี้วิชัยอยู่ที่ไหน")
        assert match is not None
        assert match.intent == "patients.read"
        assert immediate == ("list_visible_patients", {"query": "วิชัย"})

    def test_thai_timeline_followup_uses_focused_patient(self, classifier):
        ctx = ConversationContext()
        ctx.last_focused_patient_id = 42
        ctx.last_entities = [{"type": "patient", "id": 1}, {"type": "patient", "id": 2}]
        match, immediate = classifier.classify("ประวัติสุขภาพล่าสุด", ctx)
        assert match is not None
        assert match.tool_name == "get_patient_vitals"
        assert immediate == ("get_patient_vitals", {"patient_id": 42})

    def test_thai_vitals_followup_single_entity_roster(self, classifier):
        ctx = ConversationContext()
        ctx.last_entities = [{"type": "patient", "id": 99}]
        match, immediate = classifier.classify("สัญญาณชีพล่าสุด", ctx)
        assert match is not None
        assert match.tool_name == "get_patient_vitals"
        assert immediate == ("get_patient_vitals", {"patient_id": 99})

    def test_thai_timeline_resolves_name_from_cards(self, classifier):
        ctx = ConversationContext()
        ctx.last_entities = [{"type": "patient", "id": 1}, {"type": "patient", "id": 2}]
        ctx.last_patient_cards = [
            {"id": 2, "first_name": "วิชัย", "last_name": "กล้าหาญ", "nickname": "ตาวิชัย"},
        ]
        match, immediate = classifier.classify("ประวัติสุขภาพล่าสุด วิชัย", ctx)
        assert match is not None
        assert match.tool_name == "get_patient_vitals"
        assert immediate == ("get_patient_vitals", {"patient_id": 2})

    def test_thai_health_followup_resolves_patient_from_prior_user_turns(self, classifier):
        """Unsegmented Thai: name only in an earlier user line (e.g. ขอของคุณวิชัย)."""
        ctx = ConversationContext()
        ctx.last_patient_cards = [
            {"id": 1, "first_name": "บุญมี", "last_name": "มีสุข", "nickname": "ตาบุญ"},
            {"id": 5, "first_name": "วิชัย", "last_name": "กล้าหาญ", "nickname": "ตาวิชัย"},
        ]
        ctx.messages = [
            {"role": "user", "content": "ผู้ป่วยมีใครบ้าง"},
            {"role": "user", "content": "ขอของคุณวิชัย"},
        ]
        match, immediate = classifier.classify("ขอประวัติสุขภาพ", ctx)
        assert match is not None
        assert match.tool_name == "get_patient_vitals"
        assert immediate == ("get_patient_vitals", {"patient_id": 5})

    def test_thai_detail_request_of_khon_name_uses_roster(self, classifier):
        ctx = ConversationContext()
        ctx.last_patient_cards = [
            {"id": 5, "first_name": "วิชัย", "last_name": "กล้าหาญ", "nickname": "ตาวิชัย"},
        ]
        match, immediate = classifier.classify("ขอของคุณวิชัย", ctx)
        assert match is not None
        assert match.tool_name == "get_patient_details"
        assert immediate == ("get_patient_details", {"patient_id": 5})

    def test_thai_who_is_in_system_lists_patients(self, classifier):
        match, immediate = classifier.classify("ตอนนี้มีใครในระบบบ้าง")
        assert match is not None
        assert immediate == ("list_visible_patients", {})

    def test_thai_name_line_with_khon_prefix_and_room_suffix(self, classifier):
        match, immediate = classifier.classify("คุณสมปอง ใจดี (ยายปอง) – ห้อง 17")
        assert match is not None
        assert immediate == ("list_visible_patients", {"query": "สมปอง ใจดี"})

    def test_thai_chronic_condition_uses_focused_patient(self, classifier):
        ctx = ConversationContext()
        ctx.last_focused_patient_id = 7
        ctx.last_entities = [{"type": "patient", "id": 1}, {"type": "patient", "id": 2}]
        match, immediate = classifier.classify("คุณยายมีโรคเรื้อรังอะไร", ctx)
        assert match is not None
        assert match.tool_name == "get_patient_details"
        assert immediate == ("get_patient_details", {"patient_id": 7})

    def test_create_patient_query_builds_write_intent(self, classifier):
        match, immediate = classifier.classify("เพิ่มผู้ป่วยใหม่ชื่อ จรี ชาญชัย อายุ 58 เป็นเบาหวาน")
        assert match is not None
        assert immediate is None
        assert match.tool_name == "create_patient_record"
        assert match.arguments["first_name"] == "จรี"
        assert match.arguments["last_name"] == "ชาญชัย"
        assert match.arguments["medical_conditions"] == ["เบาหวาน"]
        assert "58" in match.arguments["notes"]

    def test_acknowledge_alert_with_id(self, classifier):
        """Test acknowledge alert with ID."""
        match, immediate = classifier.classify("acknowledge alert 123")
        assert match is not None
        assert match.intent == "alerts.manage"
        assert match.playbook == "clinical-triage"
        assert immediate is None  # Requires plan execution
        assert match.tool_name == "acknowledge_alert"
        assert match.arguments == {"alert_id": 123}
        assert match.entities == [{"type": "alert", "id": 123}]

    def test_ack_alert_hash_id(self, classifier):
        """Test acknowledge alert with hash prefix."""
        match, immediate = classifier.classify("ack alert #456")
        assert match is not None
        assert match.arguments == {"alert_id": 456}

    def test_resolve_alert(self, classifier):
        """Test resolve alert classification."""
        match, immediate = classifier.classify("resolve alert 789")
        assert match is not None
        assert match.intent == "alerts.manage"
        assert match.tool_name == "resolve_alert"
        assert match.arguments == {"alert_id": 789, "note": ""}

    def test_move_patient(self, classifier):
        """Test move patient to room classification."""
        match, immediate = classifier.classify("move patient 123 to room 5")
        assert match is not None
        assert match.intent == "patients.write"
        assert match.playbook == "facility-ops"
        assert match.tool_name == "update_patient_room"
        assert match.arguments == {"patient_id": 123, "room_id": 5}
        assert match.risk_level == "high"
        assert len(match.entities) == 2

    def test_trigger_camera(self, classifier):
        """Test camera trigger classification."""
        match, immediate = classifier.classify("trigger camera 42")
        assert match is not None
        assert match.intent == "devices.control"
        assert match.tool_name == "trigger_camera_photo"
        assert match.arguments == {"device_pk": 42}

    def test_list_rooms(self, classifier):
        """Test list rooms query."""
        match, immediate = classifier.classify("list all rooms")
        assert match is not None
        assert match.intent == "rooms.read"
        assert immediate == ("list_rooms", {})

    def test_list_devices(self, classifier):
        """Test list devices query."""
        match, immediate = classifier.classify("show devices")
        assert match is not None
        assert match.intent == "devices.read"
        assert immediate == ("list_devices", {})

    def test_list_alerts(self, classifier):
        """Test list alerts query."""
        match, immediate = classifier.classify("show alerts")
        assert match is not None
        assert match.intent == "alerts.read"
        assert immediate == ("list_active_alerts", {})

    def test_list_tasks(self, classifier):
        """Test list workflow tasks query."""
        match, immediate = classifier.classify("my tasks")
        assert match is not None
        assert match.intent == "tasks.read"
        assert immediate == ("list_workflow_tasks", {})

    def test_list_schedules(self, classifier):
        """Test list workflow schedules query."""
        match, immediate = classifier.classify("my schedule")
        assert match is not None
        assert match.intent == "schedules.read"
        assert immediate == ("list_workflow_schedules", {})

    def test_unknown_query_returns_none(self, classifier):
        """Test that unknown queries return None."""
        match, immediate = classifier.classify("xyz123 unknown query")
        assert match is None
        assert immediate is None

    def test_explicit_read_tool_call_routes_immediately(self, classifier):
        match, immediate = classifier.classify('/tool get_patient_vitals {"patient_id": 8}')
        assert match is not None
        assert match.tool_name == "get_patient_vitals"
        assert immediate == ("get_patient_vitals", {"patient_id": 8})

    def test_explicit_write_tool_call_builds_mutation_intent(self, classifier):
        match, immediate = classifier.classify('/tool create_workflow_task {"title":"Check room","patient_id":8}')
        assert match is not None
        assert immediate is None
        assert match.tool_name == "create_workflow_task"
        assert match.permission_basis == ["workflow.write"]


class TestIntentClassifierSemantic:
    """Test semantic (embedding-based) intent classification."""

    @pytest.fixture
    def classifier(self):
        return IntentClassifier()

    def test_semantic_similarity_fallback(self, classifier):
        """Test semantic fallback for queries not matching regex."""
        # This query is semantically similar but doesn't match regex exactly
        match, immediate = classifier.classify("display all the patients in the system")

        # If sentence-transformers is available, should get a semantic match
        if match is not None:
            assert match.confidence > 0
            assert match.playbook is not None

    def test_semantic_low_confidence(self, classifier):
        """Test that very different queries get low confidence."""
        match, immediate = classifier.classify("completely unrelated gibberish xyz123")

        # Should either be None or have very low confidence
        if match is not None:
            assert match.confidence < MEDIUM_CONFIDENCE_THRESHOLD


class TestIntentClassifierCoreference:
    """Test coreference resolution in context-aware classification."""

    @pytest.fixture
    def classifier(self):
        return IntentClassifier()

    def test_acknowledge_that_alert(self, classifier):
        """Test 'acknowledge that alert' with context."""
        context = ConversationContext()
        context.last_entities = [{"type": "alert", "id": 123}]

        match, immediate = classifier.classify("acknowledge that alert", context)
        assert match is not None
        assert match.arguments.get("alert_id") == 123

    def test_what_about_patient_reference(self, classifier):
        """Test 'what about patient' follow-up with context."""
        context = ConversationContext()
        context.last_entities = [{"type": "patient", "id": 456}]
        context.last_intent = "patients.read"

        match, immediate = classifier.classify("what about patient 789", context)
        assert match is not None
        assert match.arguments.get("patient_id") == 789


class TestCompoundIntentDetection:
    """Test compound intent detection."""

    @pytest.fixture
    def classifier(self):
        return IntentClassifier()

    def test_and_compound(self, classifier):
        """Test 'and' compound intent detection."""
        intents = classifier.detect_compound_intents(
            "show alerts and acknowledge the fall alert"
        )
        assert len(intents) >= 1  # May detect as single or compound

    def test_then_compound(self, classifier):
        """Test 'then' compound intent detection."""
        intents = classifier.detect_compound_intents(
            "move patient 123 to room 5 then resolve alert 789"
        )
        assert len(intents) >= 1

    def test_comma_separated_compound(self, classifier):
        """Test comma-separated compound intent."""
        intents = classifier.detect_compound_intents(
            "show patients, list devices, and acknowledge alert 123"
        )
        # Should detect multiple intents or at least one
        assert len(intents) >= 1

    def test_single_intent_not_split(self, classifier):
        """Test that single intents are not incorrectly split."""
        intents = classifier.detect_compound_intents("show me all patients")
        assert len(intents) == 1
        assert intents[0].intent == "patients.read"


class TestExecutionPlanBuilding:
    """Test execution plan construction."""

    @pytest.fixture
    def classifier(self):
        return IntentClassifier()

    def test_single_intent_plan(self, classifier):
        """Test building plan from single intent."""
        intents = [IntentMatch(
            intent="alerts.manage",
            playbook="clinical-triage",
            confidence=0.95,
            tool_name="acknowledge_alert",
            arguments={"alert_id": 123},
            entities=[{"type": "alert", "id": 123}],
            permission_basis=["alerts.manage"],
            risk_level="medium",
        )]

        plan = classifier.build_execution_plan(intents, "acknowledge alert 123")
        assert plan is not None
        assert plan.playbook == "clinical-triage"
        assert len(plan.steps) == 1
        assert plan.steps[0].tool_name == "acknowledge_alert"
        assert plan.risk_level == "medium"

    def test_compound_intent_plan(self, classifier):
        """Test building plan from compound intents."""
        intents = [
            IntentMatch(
                intent="patients.write",
                playbook="facility-ops",
                confidence=0.95,
                tool_name="update_patient_room",
                arguments={"patient_id": 123, "room_id": 5},
                entities=[{"type": "patient", "id": 123}, {"type": "room", "id": 5}],
                permission_basis=["patients.write"],
                risk_level="high",
            ),
            IntentMatch(
                intent="alerts.manage",
                playbook="clinical-triage",
                confidence=0.90,
                tool_name="acknowledge_alert",
                arguments={"alert_id": 456},
                entities=[{"type": "alert", "id": 456}],
                permission_basis=["alerts.manage"],
                risk_level="medium",
            ),
        ]

        plan = classifier.build_execution_plan(
            intents, "move patient 123 to room 5 and acknowledge alert 456"
        )
        assert plan is not None
        assert len(plan.steps) == 2
        assert plan.risk_level == "high"  # Takes max risk
        assert len(plan.affected_entities) == 3

    def test_plan_with_no_tool_intents(self, classifier):
        """Test that intents without tools don't create steps."""
        intents = [IntentMatch(
            intent="unknown",
            playbook="default",
            confidence=0.5,
            tool_name=None,
            arguments={},
            entities=[],
        )]

        plan = classifier.build_execution_plan(intents, "some query")
        assert plan is None


class TestConversationFastPath:
    """Heuristic skip of intent/MCP for obvious chitchat."""

    def test_greeting_thai_and_english(self):
        assert is_general_conversation_only("สวัสดีครับ") is True
        assert is_general_conversation_only("hello!") is True
        assert is_general_conversation_only("thank you") is True

    def test_rejects_operational_phrases(self):
        assert is_general_conversation_only("list all patients") is False
        assert is_general_conversation_only("acknowledge alert 5") is False
        assert is_general_conversation_only("ขอบคุณ ช่วยแสดงผู้ป่วย") is False


class TestServicePlanForMessage:
    """Test the service-level _plan_for_message function."""

    @pytest.mark.asyncio
    async def test_simple_read_immediate_tool(self):
        """Test simple read query returns immediate tool."""
        mode, plan, immediate_tool, confidence = await _plan_for_message("show patients")
        assert mode == "answer"
        assert plan is None
        assert immediate_tool is not None
        assert immediate_tool[0] == "list_visible_patients"
        assert confidence >= 0.9

    @pytest.mark.asyncio
    async def test_thai_timeline_immediate_despite_entity_hints(self):
        """Patient-scoped reads must auto-run (not plan) even when intent carries patient entities."""
        from app.agent_runtime.intent import ConversationContext
        from app.agent_runtime.service import _conversation_contexts

        cid = 100001
        ctx = ConversationContext()
        ctx.last_focused_patient_id = 7
        _conversation_contexts[cid] = ctx
        try:
            mode, plan, immediate_tool, confidence = await _plan_for_message(
                "ประวัติสุขภาพล่าสุด",
                conversation_id=cid,
            )
            assert mode == "answer"
            assert plan is None
            assert immediate_tool is not None
            assert immediate_tool[0] == "get_patient_vitals"
            assert immediate_tool[1] == {"patient_id": 7}
            assert confidence >= 0.9
        finally:
            _conversation_contexts.pop(cid, None)

    @pytest.mark.asyncio
    async def test_actionable_intent_returns_plan(self):
        """Test actionable intent returns execution plan."""
        mode, plan, immediate_tool, confidence = await _plan_for_message("acknowledge alert 123")
        assert mode == "plan"
        assert plan is not None
        assert immediate_tool is None
        assert plan.playbook == "clinical-triage"
        assert len(plan.steps) == 1
        assert plan.steps[0].tool_name == "acknowledge_alert"

    @pytest.mark.asyncio
    async def test_compound_intent(self):
        """Test compound intent detection in service."""
        mode, plan, immediate_tool, confidence = await _plan_for_message(
            "move patient 123 to room 5 and acknowledge alert 789"
        )
        # Should detect compound or at least one intent
        assert mode in ("plan", "answer")
        if plan is not None:
            assert len(plan.steps) >= 1

    @pytest.mark.asyncio
    async def test_unknown_query_ai_fallback(self):
        """Test unknown query triggers AI fallback."""
        mode, plan, immediate_tool, confidence = await _plan_for_message(
            "what's the weather today"
        )
        assert mode == "answer"
        assert plan is None
        assert immediate_tool is None
        assert confidence == 0.0

    @pytest.mark.asyncio
    async def test_low_confidence_ai_fallback(self):
        """Test low confidence triggers AI fallback."""
        # A query that's semantically distant from all examples
        mode, plan, immediate_tool, confidence = await _plan_for_message(
            "xyz123 completely unrelated nonsense"
        )
        assert mode == "answer"
        assert confidence < LOW_CONFIDENCE_THRESHOLD or confidence == 0.0

    @pytest.mark.asyncio
    async def test_thai_low_resource_no_match_without_bridge(self):
        """Thai-only phrasing with semantic+LLM bridge off stays unmatched (AI fallback path).

        Must not contain ward-operation Thai tokens (e.g. ผู้ป่วย) or those match regex.
        """
        mode, plan, immediate_tool, confidence = await _plan_for_message(
            "วันนี้อากาศเป็นอย่างไรบ้าง",
            actor_access_token=None,
        )
        assert mode == "answer"
        assert plan is None
        assert immediate_tool is None
        assert confidence == 0.0

    @pytest.mark.asyncio
    async def test_llm_normalize_bridge_classifies_english(self, monkeypatch):
        """When classifier misses, patched normalizer supplies English for a second pass."""

        async def fake_norm(*, actor_access_token: str, raw_message: str) -> str | None:
            assert raw_message
            assert actor_access_token == "test-token"
            return "list all patients"

        monkeypatch.setattr(
            "app.agent_runtime.service.normalize_message_for_intent",
            fake_norm,
        )
        mode, plan, immediate_tool, confidence = await _plan_for_message(
            "แสดงรายชื่อผู้ป่วยทั้งหมด",
            actor_access_token="test-token",
        )
        assert mode == "answer"
        assert immediate_tool is not None
        assert immediate_tool[0] == "list_visible_patients"
        assert confidence >= 0.9

    @pytest.mark.asyncio
    async def test_conversation_context_persistence(self):
        """Test that conversation context persists across calls."""
        conversation_id = 99999  # Test ID

        # First message
        await _plan_for_message("acknowledge alert 123", conversation_id=conversation_id)

        # Second message should have context
        mode, plan, immediate_tool, confidence = await _plan_for_message(
            "acknowledge that alert", conversation_id=conversation_id
        )

        context = _get_or_create_context(conversation_id)
        assert len(context.messages) >= 1

        # Cleanup
        from app.agent_runtime.service import _conversation_contexts
        if conversation_id in _conversation_contexts:
            del _conversation_contexts[conversation_id]


class TestIntentConfidenceThresholds:
    """Test confidence thresholds and behavior."""

    def test_high_confidence_threshold(self):
        """Verify high confidence threshold constant."""
        assert HIGH_CONFIDENCE_THRESHOLD == 0.85

    def test_medium_confidence_threshold(self):
        """Verify medium confidence threshold constant."""
        assert MEDIUM_CONFIDENCE_THRESHOLD == 0.60

    def test_low_confidence_threshold(self):
        """Verify low confidence threshold constant."""
        assert LOW_CONFIDENCE_THRESHOLD == 0.40


class TestIntentExamplesDatabase:
    """Test the intent examples database."""

    def test_examples_exist(self):
        """Test that intent examples are defined."""
        assert len(INTENT_EXAMPLES) > 0

    def test_examples_have_required_fields(self):
        """Test that examples have all required fields."""
        for example in INTENT_EXAMPLES:
            assert example.text
            assert example.intent
            assert example.playbook

    def test_patient_examples_exist(self):
        """Test that patient-related examples exist."""
        patient_examples = [e for e in INTENT_EXAMPLES if "patient" in e.intent]
        assert len(patient_examples) > 0

    def test_alert_examples_exist(self):
        """Test that alert-related examples exist."""
        alert_examples = [e for e in INTENT_EXAMPLES if "alert" in e.intent]
        assert len(alert_examples) > 0


class TestGlobalClassifier:
    """Test the global classifier singleton."""

    def test_get_classifier_returns_instance(self):
        """Test that get_classifier returns a classifier instance."""
        classifier = get_classifier()
        assert isinstance(classifier, IntentClassifier)

    def test_get_classifier_singleton(self):
        """Test that get_classifier returns same instance."""
        classifier1 = get_classifier()
        classifier2 = get_classifier()
        assert classifier1 is classifier2
