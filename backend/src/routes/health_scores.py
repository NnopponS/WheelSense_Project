"""
WheelSense v2.0 - Health Scores Routes
Patient health score retrieval and AI-driven calculation
"""

import logging
import json
from fastapi import APIRouter
from typing import Optional

from ..core.database import db

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/{patient_id}")
async def get_health_scores(patient_id: str, limit: int = 10):
    """Get health score history for a patient."""
    try:
        patient = await db.fetch_one(
            "SELECT id, name FROM patients WHERE id = $1", (patient_id,)
        )
        if not patient:
            return {"error": "Patient not found"}

        scores = await db.fetch_all(
            """SELECT id, score, analysis, recommendations, components, calculated_at
               FROM health_scores
               WHERE patient_id = $1
               ORDER BY calculated_at DESC
               LIMIT $2""",
            (patient_id, limit)
        )

        for s in scores:
            for field in ("recommendations", "components"):
                val = s.get(field)
                if isinstance(val, str):
                    try:
                        s[field] = json.loads(val)
                    except Exception:
                        pass

        return {"patient": patient, "scores": scores}

    except Exception as e:
        logger.error(f"Error getting health scores: {e}", exc_info=True)
        return {"error": str(e)}


@router.get("/{patient_id}/latest")
async def get_latest_health_score(patient_id: str):
    """Get the most recent health score for a patient."""
    try:
        score = await db.fetch_one(
            """SELECT id, score, analysis, recommendations, components, calculated_at
               FROM health_scores
               WHERE patient_id = $1
               ORDER BY calculated_at DESC LIMIT 1""",
            (patient_id,)
        )

        if score:
            for field in ("recommendations", "components"):
                val = score.get(field)
                if isinstance(val, str):
                    try:
                        score[field] = json.loads(val)
                    except Exception:
                        pass

        return {"score": score}

    except Exception as e:
        logger.error(f"Error getting latest score: {e}", exc_info=True)
        return {"error": str(e)}


@router.post("/{patient_id}/calculate")
async def calculate_health_score(patient_id: str):
    """
    Calculate a health score based on available data.
    Uses wheelchair connectivity, activity level, routine adherence,
    active alerts, and room visit diversity.
    Optionally enriches with AI analysis via Ollama.
    """
    try:
        patient = await db.fetch_one(
            """SELECT p.id, p.name, p.age, p.condition, p.wheelchair_id,
                      w.status as wheelchair_status
               FROM patients p
               LEFT JOIN wheelchairs w ON p.wheelchair_id = w.id
               WHERE p.id = $1""",
            (patient_id,)
        )
        if not patient:
            return {"error": "Patient not found"}

        # ─── Score Components ──────────────────────────
        components = {}
        analysis_parts = []
        recommendations = []

        # 1. Wheelchair connectivity (0-20)
        wc_status = patient.get("wheelchair_status", "offline")
        if wc_status in ("active", "online"):
            conn_score = 20
            analysis_parts.append("Wheelchair is online and tracking.")
        elif wc_status == "stale":
            conn_score = 10
            analysis_parts.append("Wheelchair signal is weak/stale.")
            recommendations.append("Check wheelchair sensor connectivity.")
        else:
            conn_score = 0
            analysis_parts.append("Wheelchair is offline — no positioning data.")
            recommendations.append("Ensure wheelchair is powered on and within node range.")
        components["connectivity"] = {"score": conn_score, "max": 20, "label": "Connectivity"}

        # 2. Activity level in last 24h (0-25)
        activity = await db.fetch_one(
            """SELECT COUNT(*) as count FROM timeline_events
               WHERE (patient_id = $1 OR wheelchair_id = $2)
               AND timestamp > NOW() - INTERVAL '24 hours'""",
            (patient_id, patient.get("wheelchair_id"))
        )
        event_count = activity["count"] if activity else 0
        if event_count >= 10:
            act_score = 25
            analysis_parts.append(f"Excellent activity: {event_count} events in 24h.")
        elif event_count >= 5:
            act_score = 20
            analysis_parts.append(f"Good activity: {event_count} events in 24h.")
        elif event_count >= 2:
            act_score = 12
            analysis_parts.append(f"Moderate activity: {event_count} events in 24h.")
        elif event_count >= 1:
            act_score = 6
            analysis_parts.append(f"Low activity: {event_count} event(s) in 24h.")
            recommendations.append("Encourage more movement throughout the day.")
        else:
            act_score = 0
            analysis_parts.append("No activity detected in last 24 hours.")
            recommendations.append("Urgent: patient shows no movement — check wellbeing.")
        components["activity"] = {"score": act_score, "max": 25, "label": "Activity"}

        # 3. Routine adherence (0-20)
        routines = await db.fetch_one(
            "SELECT COUNT(*) as count FROM routines WHERE patient_id = $1 AND enabled = 1",
            (patient_id,)
        )
        triggered = await db.fetch_one(
            """SELECT COUNT(*) as count FROM routines
               WHERE patient_id = $1 AND enabled = 1
               AND last_triggered > NOW() - INTERVAL '24 hours'""",
            (patient_id,)
        )
        routine_count = routines["count"] if routines else 0
        triggered_count = triggered["count"] if triggered else 0
        if routine_count == 0:
            rtn_score = 5
            analysis_parts.append("No active routines configured.")
            recommendations.append("Set up daily routines for better health tracking.")
        elif routine_count > 0 and triggered_count > 0:
            adherence = min(triggered_count / routine_count, 1.0)
            rtn_score = int(20 * adherence)
            pct = int(adherence * 100)
            analysis_parts.append(f"Routine adherence: {pct}% ({triggered_count}/{routine_count}).")
        else:
            rtn_score = 5
            analysis_parts.append(f"Has {routine_count} routines but none triggered today.")
            recommendations.append("Follow scheduled routines for better health outcomes.")
        components["routines"] = {"score": rtn_score, "max": 20, "label": "Routines"}

        # 4. Alert penalty (0-20, inverted: fewer alerts = higher)
        alerts = await db.fetch_one(
            "SELECT COUNT(*) as count FROM alerts WHERE patient_id = $1 AND resolved = FALSE",
            (patient_id,)
        )
        alert_count = alerts["count"] if alerts else 0
        alert_score = max(0, 20 - alert_count * 5)
        if alert_count > 0:
            analysis_parts.append(f"{alert_count} unresolved alert(s).")
            recommendations.append("Resolve active alerts to improve health score.")
        else:
            analysis_parts.append("No active alerts — good.")
        components["alerts"] = {"score": alert_score, "max": 20, "label": "Alerts"}

        # 5. Room visit diversity in 24h (0-15)
        diversity = await db.fetch_one(
            """SELECT COUNT(DISTINCT to_room_id) as unique_rooms
               FROM timeline_events
               WHERE (patient_id = $1 OR wheelchair_id = $2)
               AND to_room_id IS NOT NULL
               AND timestamp > NOW() - INTERVAL '24 hours'""",
            (patient_id, patient.get("wheelchair_id"))
        )
        unique_rooms = diversity["unique_rooms"] if diversity else 0
        if unique_rooms >= 4:
            div_score = 15
            analysis_parts.append(f"Visited {unique_rooms} different rooms in 24h — great mobility diversity.")
        elif unique_rooms >= 2:
            div_score = 10
            analysis_parts.append(f"Visited {unique_rooms} rooms in 24h.")
        elif unique_rooms == 1:
            div_score = 5
            analysis_parts.append("Only visited 1 room in 24h.")
            recommendations.append("Encourage exploring different areas of the home.")
        else:
            div_score = 0
            analysis_parts.append("No room visits recorded in 24h.")
        components["diversity"] = {"score": div_score, "max": 15, "label": "Mobility Diversity"}

        # ─── Total Score ──────────────────────────
        total_score = conn_score + act_score + rtn_score + alert_score + div_score
        total_score = max(0, min(100, total_score))

        # ─── AI Analysis via Ollama ──────────────────
        ai_analysis = None
        try:
            from ..routes.chat import llm_client
            if llm_client:
                data_summary = (
                    f"Patient: {patient.get('name')}, Age: {patient.get('age', 'unknown')}, "
                    f"Condition: {patient.get('condition', 'N/A')}\n"
                    f"Health Score: {total_score}/100\n"
                    f"Components: {json.dumps(components)}\n"
                    f"Rule-based Analysis: {' '.join(analysis_parts)}\n"
                    f"Recommendations so far: {', '.join(recommendations)}"
                )
                prompt = (
                    "You are a healthcare AI assistant for wheelchair-bound patients. "
                    "Given the following patient health data, provide a brief (2-3 sentence) "
                    "overall assessment and one actionable recommendation. "
                    "Be warm, concise, and professional. Do NOT repeat the raw numbers.\n\n"
                    f"{data_summary}"
                )
                ai_result = await llm_client.generate(prompt, max_tokens=200)
                if ai_result and ai_result.get("response"):
                    ai_analysis = ai_result["response"].strip()
        except Exception as ai_err:
            logger.warning(f"AI analysis skipped: {ai_err}")

        # If AI gave us an analysis, prepend it
        analysis = ai_analysis or " ".join(analysis_parts)

        recs_json = json.dumps(recommendations)
        comp_json = json.dumps(components)

        # Store score
        await db.execute(
            """INSERT INTO health_scores (patient_id, score, analysis, recommendations, components)
               VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)""",
            (patient_id, total_score, analysis, recs_json, comp_json)
        )

        return {
            "success": True,
            "score": total_score,
            "analysis": analysis,
            "recommendations": recommendations,
            "components": components,
        }

    except Exception as e:
        logger.error(f"Error calculating health score: {e}", exc_info=True)
        return {"success": False, "error": str(e)}
