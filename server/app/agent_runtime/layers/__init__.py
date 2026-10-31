"""Five-layer EaseAI pipeline scaffolding (ADR 0015).

This package houses the per-layer building blocks. Orchestration is added
incrementally in later turns; current scope:
  - contracts: pydantic data contracts shared across layers
  - observability: in-memory ring-buffer emitter for PipelineEvent
  - layer1_intent_router: deterministic pre-LLM reject + intent routing
  - messages: localized en/th failure strings

Later turns will introduce layer2..layer5 modules and wire the orchestrator
into `agent_runtime/service.py` behind a feature flag.
"""
