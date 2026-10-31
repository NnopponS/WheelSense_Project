from app.agent_runtime.llm_tool_router import build_openai_tools_for_role
tools = build_openai_tools_for_role('admin')
print(f"Total tools: {len(tools)}")
for t in tools:
    name = t["function"]["name"]
    desc = t["function"]["description"]
    if any(k in name for k in ("patient", "user", "staff", "search", "people", "person", "caregiver")):
        print(f"  - {name}: {desc[:120]}")
