"""Check if get_patient_adl_analysis is in the tool allowlists."""
from app.mcp.server import _WORKSPACE_TOOL_REGISTRY
from app.services.ai_chat import get_role_mcp_tool_allowlist, easeai_forbidden_tools, patient_exclusive_tools

all_tools = set(_WORKSPACE_TOOL_REGISTRY.keys())
print(f"Total tools in registry: {len(all_tools)}")
print(f"get_patient_adl_analysis in registry: {'get_patient_adl_analysis' in all_tools}")

forbidden = easeai_forbidden_tools(all_tools)
print(f"get_patient_adl_analysis in forbidden: {'get_patient_adl_analysis' in forbidden}")

patient_excl = patient_exclusive_tools(all_tools)
print(f"get_patient_adl_analysis in patient_exclusive: {'get_patient_adl_analysis' in patient_excl}")

allowed = get_role_mcp_tool_allowlist()
admin_tools = allowed.get("admin", set())
print(f"get_patient_adl_analysis in admin: {'get_patient_adl_analysis' in admin_tools}")
print(f"Admin tool count: {len(admin_tools)}")

# Check what tools contain 'adl'
adl_in_registry = [t for t in all_tools if "adl" in t.lower()]
print(f"ADL tools in registry: {adl_in_registry}")
adl_in_admin = [t for t in admin_tools if "adl" in t.lower()]
print(f"ADL tools in admin: {adl_in_admin}")

# Check head_caregiver
hc_tools = allowed.get("head_caregiver", set())
print(f"get_patient_adl_analysis in head_caregiver: {'get_patient_adl_analysis' in hc_tools}")
