"""Collin & Wade (1988) Barthel ADL Index calculator (0-20).

Gold standard: a rater scores 10 items from what the resident actually did,
then the scores are summed. This module does that sum and maps the total
onto WheelSense tiers:

  Tier 1  12-20  Independent / Mild Dependence   (20 is fully independent)
  Tier 2   5-11  Moderate Dependence
  Tier 3   0-4   Severe / Total Dependence

Location proxy: room-node occupancy cannot see assistance quality. The
estimator maps toilet / shower / dining / hall evidence onto the same
10 items with an explicit confidence. It is decision support, not a
clinical Barthel.

Usage:
  python adl_index.py
  python adl_index.py --patient 69
  python adl_index.py --staff bowels=2,bladder=2,grooming=1,toilet_use=2,feeding=2,transfers=3,mobility=1,dressing=2,stairs=0,bathing=1
"""

from __future__ import annotations

import argparse
import csv
import json
from dataclasses import asdict, dataclass, field
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
TIMELINE_PATH = HERE / "sim_patient_timelines.csv"
PERSONAS_PATH = HERE / "sim_personas.json"

TOILET = "Toilet"
SHOWER = "Shower"
DINING = "Dining Room"
HALL = "Main Hall"
PT = "Physiotherapy Room"
LOUNGE = "Garden Lounge"
NURSES = "Nurses' Station"
BEDROOMS = {f"Room {n}" for n in range(401, 407)}

# Collin & Wade 1988 maxima
ITEM_MAX = {
    "bowels": 2,
    "bladder": 2,
    "grooming": 1,
    "toilet_use": 2,
    "feeding": 2,
    "transfers": 3,
    "mobility": 3,
    "dressing": 2,
    "stairs": 2,
    "bathing": 1,
}
ITEMS = tuple(ITEM_MAX)

TIER_LABEL = {
    1: "Independent / Mild Dependence",
    2: "Moderate Dependence",
    3: "Severe / Total Dependence",
}


@dataclass
class ItemScore:
    score: int
    max: int
    confidence: str  # high | medium | low
    evidence: str
    source: str  # staff | location_proxy


@dataclass
class BarthelResult:
    patient_id: int | None
    name: str
    items: dict[str, ItemScore]
    total: int
    max_total: int
    tier: int
    tier_label: str
    method: str
    notes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        payload = asdict(self)
        payload["items"] = {
            k: asdict(v) for k, v in self.items.items()
        }
        return payload


def classify_tier(total: int) -> tuple[int, str]:
    if total < 0 or total > 20:
        raise ValueError(f"Barthel total must be 0-20, got {total}")
    if total >= 12:
        return 1, TIER_LABEL[1]
    if total >= 5:
        return 2, TIER_LABEL[2]
    return 3, TIER_LABEL[3]


def score_index(
    item_scores: dict[str, int],
    *,
    patient_id: int | None = None,
    name: str = "staff assessment",
    confidences: dict[str, str] | None = None,
    evidence: dict[str, str] | None = None,
    method: str = "staff",
    notes: list[str] | None = None,
) -> BarthelResult:
    """Gold-standard path: 10 integer item scores -> total + tier."""
    missing = [k for k in ITEMS if k not in item_scores]
    extra = [k for k in item_scores if k not in ITEM_MAX]
    if missing:
        raise ValueError(f"Missing Barthel items: {missing}")
    if extra:
        raise ValueError(f"Unknown Barthel items: {extra}")

    items: dict[str, ItemScore] = {}
    for key in ITEMS:
        value = int(item_scores[key])
        cap = ITEM_MAX[key]
        if value < 0 or value > cap:
            raise ValueError(f"{key} must be 0-{cap}, got {value}")
        items[key] = ItemScore(
            score=value,
            max=cap,
            confidence=(confidences or {}).get(key, "high"),
            evidence=(evidence or {}).get(key, "staff / rater"),
            source="staff" if method == "staff" else "location_proxy",
        )

    total = sum(i.score for i in items.values())
    tier, label = classify_tier(total)
    return BarthelResult(
        patient_id=patient_id,
        name=name,
        items=items,
        total=total,
        max_total=20,
        tier=tier,
        tier_label=label,
        method=method,
        notes=notes or [],
    )


def parse_ts(value: str | datetime) -> datetime:
    if isinstance(value, datetime):
        return value
    return datetime.fromisoformat(str(value).replace(" ", "T").replace("+00", "+00:00"))


def load_timeline(path: Path = TIMELINE_PATH) -> list[dict]:
    with path.open(encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def _payload(row: dict) -> dict:
    raw = row.get("data") or "{}"
    if isinstance(raw, dict):
        return raw
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return {}


def reconstruct_stays(rows: list[dict], patient_id: int) -> list[dict]:
    stays: list[dict] = []
    for row in rows:
        if int(row["patient_id"]) != patient_id:
            continue
        ts = parse_ts(row["timestamp"])
        data = _payload(row)
        if row["event_type"] == "room_enter":
            stays.append(
                {
                    "start": ts,
                    "end": None,
                    "room_id": int(row["room_id"]),
                    "room_name": row["room_name"],
                    "activity": data.get("activity") or "",
                    "caregiver_id": (data.get("caregiver_id") or row.get("caregiver_id") or "").strip(),
                    "home_room_id": data.get("home_room_id"),
                }
            )
        elif row["event_type"] == "room_exit" and stays and stays[-1]["end"] is None:
            stays[-1]["end"] = ts
    return stays


def _duration_s(stay: dict) -> float:
    if stay["end"] is None:
        return 0.0
    return (stay["end"] - stay["start"]).total_seconds()


def _days_covered(stays: list[dict]) -> int:
    if not stays:
        return 0
    dates = {s["start"].date() for s in stays}
    if stays[-1]["end"]:
        dates.add(stays[-1]["end"].date())
    return max(1, (max(dates) - min(dates)).days + 1)


def collect_evidence(stays: list[dict]) -> dict:
    toilets = [s for s in stays if s["room_name"] == TOILET]
    showers = [s for s in stays if s["room_name"] == SHOWER]
    dining = [s for s in stays if s["room_name"] == DINING]
    dests = [
        s
        for s in stays
        if s["room_name"] not in BEDROOMS and s["room_name"] != HALL
    ]
    meals = {"breakfast": 0, "lunch": 0, "dinner": 0}
    for s in dining:
        act = s["activity"]
        if act in meals:
            meals[act] += 1
        else:
            hour = s["start"].hour
            if 7 <= hour <= 9:
                meals["breakfast"] += 1
            elif 11 <= hour <= 13:
                meals["lunch"] += 1
            elif 17 <= hour <= 19:
                meals["dinner"] += 1

    def staff(s: dict) -> bool:
        return bool(s["caregiver_id"])

    n_days = _days_covered(stays)
    hall_s = sum(_duration_s(s) for s in stays if s["room_name"] == HALL)
    return {
        "n_days": n_days,
        "toilet_n": len(toilets),
        "toilet_self": sum(1 for s in toilets if not staff(s)),
        "toilet_staff": sum(1 for s in toilets if staff(s)),
        "toilet_night": sum(1 for s in toilets if s["start"].hour < 6 or s["start"].hour >= 22),
        "toilet_long": sum(1 for s in toilets if 12 * 60 <= _duration_s(s) <= 22 * 60),
        "shower_n": len(showers),
        "shower_self": sum(1 for s in showers if not staff(s)),
        "dining_n": len(dining),
        "dining_self": sum(1 for s in dining if not staff(s)),
        "dining_staff": sum(1 for s in dining if staff(s)),
        "meals": meals,
        "dest_self": sum(1 for s in dests if not staff(s)),
        "dest_staff": sum(1 for s in dests if staff(s)),
        "unique_dests": sorted({s["room_name"] for s in dests}),
        "est_distance_m": hall_s / 60.0 * 12.0,  # ~12 m per minute of hall
        "left_home": any(s["room_name"] not in BEDROOMS for s in stays),
    }


def estimate_from_location(stays: list[dict], *, patient_id: int, name: str) -> BarthelResult:
    """Map occupancy evidence onto Collin & Wade items. Proxy, not a rater."""
    ev = collect_evidence(stays)
    days = max(1, ev["n_days"])
    toilet_per_day = ev["toilet_n"] / days
    self_ratio = ev["dest_self"] / max(1, ev["dest_self"] + ev["dest_staff"])
    notes = [
        "Location proxy from room nodes. Transfers, continence accidents, "
        "feeding skill, and dressing quality are inferred, not observed.",
        "This facility has no stairs node; stairs scored 0 (wheelchair users).",
        "Mobility is capped at 1 (wheelchair independent). Scores 2-3 require walking.",
    ]

    def item(key: str, score: int, confidence: str, evidence: str) -> ItemScore:
        return ItemScore(score, ITEM_MAX[key], confidence, evidence, "location_proxy")

    # Toilet use: self trips vs staff vs none.
    # Frequent staff-prompted voids = needs help (1). Rare staff-only trips = dependent (0).
    if ev["toilet_self"] >= 3 * days and ev["toilet_staff"] == 0:
        toilet_use = item("toilet_use", 2, "medium", f"{ev['toilet_self']} self-initiated toilet visits / {days}d")
    elif toilet_per_day >= 2:
        toilet_use = item("toilet_use", 1, "medium", f"{ev['toilet_staff']} staff + {ev['toilet_self']} self toilet visits / {days}d")
    elif ev["toilet_n"] > 0:
        toilet_use = item("toilet_use", 0, "medium", f"rare toilet only ({ev['toilet_n']}/{days}d), staff-taken")
    else:
        toilet_use = item("toilet_use", 0, "medium", "no toilet visits (care likely in bedroom)")

    # Bathing: independent shower only
    if ev["shower_self"] >= 2:
        bathing = item("bathing", 1, "medium", f"{ev['shower_self']} unescorted shower visits")
    else:
        bathing = item("bathing", 0, "medium", f"{ev['shower_n']} shower visits (0 unescorted)" if ev["shower_n"] else "no shower visits")

    # Feeding: dining-hall presence vs tray-in-room
    meal_slots = days * 3
    dining_meals = sum(ev["meals"].values())
    if ev["dining_self"] >= 2 * days and ev["dining_staff"] == 0:
        feeding = item("feeding", 2, "medium", f"{dining_meals} dining meals, unescorted")
    elif ev["dining_n"] > 0:
        feeding = item("feeding", 1, "medium", f"{dining_meals} dining meals, {ev['dining_staff']} escorted; some tray likely")
    else:
        feeding = item("feeding", 1, "low", "no dining-room meals; assume tray (not 'unable to eat')")

    # Mobility: wheelchair independent if they self-navigate destinations
    if ev["dest_self"] >= 8 and self_ratio >= 0.7 and ev["est_distance_m"] / days >= 40:
        mobility = item("mobility", 1, "medium", f"self dest={ev['dest_self']}, ~{ev['est_distance_m']/days:.0f} m/day via hall")
    elif ev["left_home"] and (ev["dest_self"] + ev["dest_staff"]) >= 2:
        # leaves home but mostly escorted — still uses a chair, not walking
        mobility = item("mobility", 1 if self_ratio >= 0.3 else 0, "low", f"dest self/staff={ev['dest_self']}/{ev['dest_staff']}")
    else:
        mobility = item("mobility", 0, "medium", "rarely leaves home bedroom")

    stairs = item("stairs", 0, "high", "no stairs in facility map; wheelchair residents score 0")

    # Continence proxies (accidents are not visible)
    if toilet_per_day >= 4 and ev["toilet_staff"] == 0:
        bladder = item("bladder", 2, "low", f"regular self toilet ({toilet_per_day:.1f}/day); accidents not observable")
        bowels = item("bowels", 2 if ev["toilet_long"] >= days * 0.5 else 1, "low", f"{ev['toilet_long']} long (bowel-like) toilet stays")
    elif toilet_per_day >= 2:
        bladder = item("bladder", 1, "low", "prompted / staff-taken toilet; possible occasional incontinence")
        bowels = item("bowels", 1 if ev["toilet_long"] else 0, "low", f"{ev['toilet_long']} long toilet stays")
    else:
        bladder = item("bladder", 0, "medium", "no or rare toilet use; incontinence care assumed in bedroom")
        bowels = item("bowels", 0, "medium", "no or rare toilet use")

    # Transfers: inferred from how they get on/off toilet, not observed
    if ev["toilet_self"] >= 3 * days and ev["toilet_staff"] == 0:
        transfers = item("transfers", 3, "low", "unescorted toilet trips imply independent bed/chair/toilet transfer")
    elif ev["toilet_self"] > 0:
        transfers = item("transfers", 2, "low", "mix of self and help at toilet")
    elif ev["toilet_staff"] > 0:
        transfers = item("transfers", 1, "low", "staff-taken toilet only")
    else:
        transfers = item("transfers", 0, "low", "no toilet or destination transfers observed")

    # Grooming / dressing: morning independence vs bedbound
    if ev["dining_self"] >= days and ev["toilet_self"] >= 3 * days:
        grooming = item("grooming", 1, "low", "self morning toilet + dining; grooming assumed independent")
        dressing = item("dressing", 2, "low", "self-initiated morning routine then dining")
    elif ev["dining_n"] > 0 or ev["dest_self"] > 0:
        grooming = item("grooming", 0, "low", "needs escort or stays in room; grooming help assumed")
        dressing = item("dressing", 1, "low", "reaches dining or self-destinations; partial dressing")
    else:
        grooming = item("grooming", 0, "medium", "bedbound; no grooming opportunity outside bedroom")
        dressing = item("dressing", 0, "medium", "bedbound; dressing not evidenced")

    items = {
        "bowels": bowels,
        "bladder": bladder,
        "grooming": grooming,
        "toilet_use": toilet_use,
        "feeding": feeding,
        "transfers": transfers,
        "mobility": mobility,
        "dressing": dressing,
        "stairs": stairs,
        "bathing": bathing,
    }
    total = sum(i.score for i in items.values())
    tier, label = classify_tier(total)
    return BarthelResult(
        patient_id=patient_id,
        name=name,
        items=items,
        total=total,
        max_total=20,
        tier=tier,
        tier_label=label,
        method="location_proxy",
        notes=notes,
    )


def load_personas() -> dict:
    if not PERSONAS_PATH.exists():
        return {}
    return json.loads(PERSONAS_PATH.read_text(encoding="utf-8"))


def score_timeline(
    patient_id: int | None = None,
    timeline_path: Path = TIMELINE_PATH,
) -> list[BarthelResult]:
    rows = load_timeline(timeline_path)
    return score_from_rows(rows, patient_id=patient_id)


def score_from_rows(
    rows: list[dict],
    patient_id: int | None = None,
    personas: dict[int, dict] | None = None,
) -> list[BarthelResult]:
    """Score Barthel from a list of timeline dicts (DB or CSV rows)."""
    if personas is None:
        personas = {}
    ids = [patient_id] if patient_id is not None else sorted({int(r["patient_id"]) for r in rows})
    results: list[BarthelResult] = []
    for pid in ids:
        meta = personas.get(pid, {})
        name = (
            f"{meta.get('first_name', '')} {meta.get('last_name', '')}".strip()
            or next((r["first_name"] + " " + r["last_name"] for r in rows if int(r["patient_id"]) == pid), str(pid))
        )
        stays = reconstruct_stays(rows, pid)
        result = estimate_from_location(stays, patient_id=pid, name=name)
        if meta.get("barthel"):
            gold = meta["barthel"]["total"]
            result.notes.append(
                f"Persona gold-standard total={gold} (tier {meta.get('tier')}); "
                f"proxy total={result.total} (tier {result.tier})."
            )
        results.append(result)
    return results


def format_table(result: BarthelResult) -> str:
    lines = [
        f"{result.name}  (patient_id={result.patient_id})  method={result.method}",
        f"  Index  {result.total}/{result.max_total}   Tier {result.tier}  {result.tier_label}",
        "  item            score  conf     evidence",
    ]
    for key, item in result.items.items():
        lines.append(
            f"  {key:<14}  {item.score:>2}/{item.max}  {item.confidence:<7}  {item.evidence}"
        )
    for note in result.notes:
        lines.append(f"  note: {note}")
    return "\n".join(lines)


def _parse_staff_items(spec: str) -> dict[str, int]:
    items: dict[str, int] = {}
    for part in spec.split(","):
        key, _, raw = part.partition("=")
        key = key.strip()
        if not key:
            continue
        items[key] = int(raw.strip())
    return items


def main() -> None:
    parser = argparse.ArgumentParser(description="Barthel ADL Index (Collin & Wade 0-20)")
    parser.add_argument("--patient", type=int, default=None, help="Score one patient_id from the timeline")
    parser.add_argument(
        "--staff",
        default=None,
        help="Gold-standard items, e.g. bowels=2,bladder=2,grooming=1,...",
    )
    parser.add_argument("--json", action="store_true", help="Print JSON instead of a table")
    args = parser.parse_args()

    if args.staff:
        result = score_index(_parse_staff_items(args.staff), method="staff")
        results = [result]
    else:
        results = score_timeline(args.patient)

    if args.json:
        print(json.dumps([r.to_dict() for r in results], indent=2, default=str))
        return
    print("Barthel ADL Index  -  Collin & Wade 1988  (0-20)\n")
    for result in results:
        print(format_table(result))
        print()


if __name__ == "__main__":
    main()
