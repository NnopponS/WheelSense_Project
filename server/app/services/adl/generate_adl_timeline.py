"""Generate a 7-day occupancy timeline that matches Barthel ADL room grammar.

Reads sim_personas.json, writes sim_patient_timelines.csv.
One resident is in exactly one room at all times. Paths go
home <-> Main Hall <-> destination. Visits are clock-anchored
to a care-home day (meals, toilet, shower, PT, sleep).
"""

from __future__ import annotations

import csv
import json
import random
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
PERSONAS_PATH = HERE / "sim_personas.json"
OUTPUT_PATH = HERE / "sim_patient_timelines.csv"

START_DATE = date(2026, 6, 7)
N_DAYS = 7
WORKSPACE_ID = 13
HALL_ID = 165
TOILET_ID = 163
SHOWER_ID = 169
DINING_ID = 164
PT_ID = 166
NURSES_ID = 167
LOUNGE_ID = 168
STAFF_CAREGIVER_ID = "201"
SOURCE = "auto"

COLUMNS = [
    "event_id",
    "workspace_id",
    "patient_id",
    "first_name",
    "last_name",
    "nickname",
    "timestamp",
    "event_type",
    "room_id",
    "room_name",
    "description",
    "source",
    "caregiver_id",
    "data",
]


@dataclass
class Visit:
    start: datetime
    end: datetime
    room_id: int
    activity: str
    caregiver_id: str = ""


def load_personas() -> dict:
    return json.loads(PERSONAS_PATH.read_text(encoding="utf-8"))


def room_name(rooms: dict[str, str], room_id: int) -> str:
    return rooms[str(room_id)]


def fmt_ts(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%d %H:%M:%S.%f") + "+00"


def minutes(n: int) -> timedelta:
    return timedelta(minutes=n)


def seconds(n: int) -> timedelta:
    return timedelta(seconds=n)


def clock(day_start: datetime, hour: int, minute: int, rng: random.Random, jitter_min: int = 0) -> datetime:
    t = day_start + timedelta(hours=hour, minutes=minute)
    if jitter_min:
        t += timedelta(minutes=rng.randint(-jitter_min, jitter_min))
    return t


def collect_visits(resident: dict, day_start: datetime, rng: random.Random) -> list[Visit]:
    """Destination visits only (not home, not hall). Clock-anchored."""
    home_unused = resident["home_room_id"]  # noqa: F841 — home is the fill, not a dest
    sched = resident["schedule"]
    tier = resident["tier"]
    day = day_start.date()
    wd = day.weekday()
    day_index = (day - START_DATE).days
    day_end = day_start + timedelta(days=1)

    shower = wd in sched["shower_weekdays"]
    pt = wd in sched["pt_weekdays"]
    night_toilet = wd in sched["night_toilet_weekdays"]
    tray_bf = wd in sched["tray_breakfast_weekdays"]
    tray_lunch = wd in sched["tray_lunch_weekdays"]
    tray_dinner = wd in sched["tray_dinner_weekdays"]
    nurses = wd in sched["nurses_weekdays"]
    lounge = sched["lounge"]
    escorted = sched["escorted_meals"]
    staff_every = sched["staff_toilet_every_n_days"]
    meal_cg = STAFF_CAREGIVER_ID if escorted else ""
    hygiene_cg = STAFF_CAREGIVER_ID if tier >= 2 else ""

    visits: list[Visit] = []

    def add(start: datetime, dur: timedelta, room: int, activity: str, cg: str = "") -> None:
        end = start + dur
        if end <= day_start or start >= day_end:
            return
        start = max(start, day_start)
        end = min(end, day_end)
        if end > start:
            visits.append(Visit(start, end, room, activity, cg))

    if tier == 3:
        if staff_every and day_index % staff_every == 0:
            add(clock(day_start, 7, 35, rng, 8), minutes(rng.randint(8, 12)), TOILET_ID, "toilet_staff", STAFF_CAREGIVER_ID)
        if nurses:
            add(clock(day_start, 10, 15, rng, 10), minutes(rng.randint(8, 14)), NURSES_ID, "meds", STAFF_CAREGIVER_ID)
        return resolve_overlaps(visits)

    if night_toilet:
        add(clock(day_start, 2, 25, rng, 12), minutes(rng.randint(5, 8)), TOILET_ID, "toilet_nocturnal")

    wake_h, wake_m = {1: (6, 12), 2: (6, 50)}[tier]
    t_wake = clock(day_start, wake_h, wake_m, rng, 6)
    add(t_wake, minutes(rng.randint(6, 9) if tier == 1 else rng.randint(8, 14)), TOILET_ID, "toilet", hygiene_cg)

    if shower:
        # after morning void, before breakfast
        add(t_wake + minutes(12), minutes(rng.randint(18, 28)), SHOWER_ID, "shower", hygiene_cg)

    if not tray_bf:
        bf = clock(day_start, 7, 25, rng, 6)
        add(bf, minutes(rng.randint(28, 40)), DINING_ID, "breakfast", meal_cg)
        add(bf + minutes(42), minutes(rng.randint(14, 18) if tier == 1 else rng.randint(12, 18)), TOILET_ID, "toilet", hygiene_cg)

    if pt:
        add(clock(day_start, 9, 35, rng, 8), minutes(rng.randint(32, 45)), PT_ID, "therapy", meal_cg if tier == 2 else "")

    if nurses:
        add(clock(day_start, 10, 50, rng, 8), minutes(rng.randint(6, 12)), NURSES_ID, "meds", STAFF_CAREGIVER_ID)

    if not tray_lunch:
        lunch = clock(day_start, 12, 5, rng, 6)
        add(lunch, minutes(rng.randint(30, 42)), DINING_ID, "lunch", meal_cg)
        add(lunch + minutes(45), minutes(rng.randint(5, 9) if tier == 1 else rng.randint(8, 14)), TOILET_ID, "toilet", hygiene_cg)

    if lounge and (tier == 1 or wd not in (5, 6)):
        lounge_dur = rng.randint(35, 55) if tier == 1 else rng.randint(20, 35)
        add(clock(day_start, 15, 10, rng, 10), minutes(lounge_dur), LOUNGE_ID, "social", meal_cg if tier == 2 else "")

    if not tray_dinner:
        dinner = clock(day_start, 17, 20, rng, 8)
        add(dinner, minutes(rng.randint(28, 40)), DINING_ID, "dinner", meal_cg)
        add(dinner + minutes(42), minutes(rng.randint(5, 8) if tier == 1 else rng.randint(8, 13)), TOILET_ID, "toilet", hygiene_cg)

    if tier == 1:
        add(clock(day_start, 20, 35, rng, 8), minutes(rng.randint(4, 7)), TOILET_ID, "toilet")
    elif tier == 2:
        add(clock(day_start, 20, 15, rng, 8), minutes(rng.randint(8, 12)), TOILET_ID, "toilet", hygiene_cg)

    return resolve_overlaps(visits)


def resolve_overlaps(visits: list[Visit]) -> list[Visit]:
    visits = sorted(visits, key=lambda v: v.start)
    out: list[Visit] = []
    for visit in visits:
        if out and visit.start < out[-1].end + seconds(90):
            start = out[-1].end + seconds(90)
            dur = visit.end - visit.start
            visit = Visit(start, start + dur, visit.room_id, visit.activity, visit.caregiver_id)
        out.append(visit)
    return out


def home_activity(ts: datetime, tray_bf: bool, tray_lunch: bool, tray_dinner: bool) -> str:
    hm = ts.hour * 60 + ts.minute
    if hm < 6 * 60 + 10 or hm >= 21 * 60:
        return "sleep"
    if 6 * 60 + 10 <= hm < 7 * 60 + 20:
        return "morning_care"
    if tray_bf and 7 * 60 <= hm < 9 * 60 + 30:
        return "tray_breakfast"
    if tray_lunch and 11 * 60 + 30 <= hm < 13 * 60 + 30:
        return "tray_lunch"
    if tray_dinner and 17 * 60 <= hm < 19 * 60 + 30:
        return "tray_dinner"
    if 13 * 60 <= hm < 15 * 60:
        return "rest"
    if 20 * 60 <= hm < 21 * 60:
        return "evening_care"
    return "rest"


def weave_occupancy(
    visits: list[Visit],
    resident: dict,
    day_start: datetime,
    rng: random.Random,
) -> list[Visit]:
    home = resident["home_room_id"]
    sched = resident["schedule"]
    wd = day_start.weekday()
    tray_bf = wd in sched["tray_breakfast_weekdays"]
    tray_lunch = wd in sched["tray_lunch_weekdays"]
    tray_dinner = wd in sched["tray_dinner_weekdays"]
    day_end = day_start + timedelta(days=1)

    filled: list[Visit] = []
    t = day_start
    for visit in visits:
        visit = Visit(
            max(visit.start, t),
            min(max(visit.end, visit.start + minutes(3)), day_end),
            visit.room_id,
            visit.activity,
            visit.caregiver_id,
        )
        if visit.end <= t or visit.start >= day_end:
            continue
        if visit.start > t:
            filled.append(
                Visit(t, visit.start, home, home_activity(t, tray_bf, tray_lunch, tray_dinner))
            )
        filled.append(visit)
        t = visit.end
    if t < day_end:
        filled.append(Visit(t, day_end, home, home_activity(t, tray_bf, tray_lunch, tray_dinner)))

    stays: list[Visit] = []
    for stay in filled:
        if not stays:
            stays.append(stay)
            continue
        prev = stays[-1]
        if prev.room_id == stay.room_id:
            stays[-1] = Visit(prev.start, stay.end, stay.room_id, stay.activity, stay.caregiver_id or prev.caregiver_id)
            continue
        trans = seconds(rng.randint(28, 75))
        # steal transit time from the home side so dest dwells stay intact
        if prev.room_id == home and (prev.end - prev.start) > trans + seconds(15):
            hall_start = prev.end - trans
            stays[-1] = Visit(prev.start, hall_start, home, prev.activity, prev.caregiver_id)
            stays.append(Visit(hall_start, stay.start, HALL_ID, "transit", stay.caregiver_id))
            stays.append(stay)
        elif prev.room_id == home:
            stays[-1] = Visit(prev.start, prev.end, HALL_ID, "transit", stay.caregiver_id)
            stays.append(stay)
        elif stay.room_id == home and (stay.end - stay.start) > trans + seconds(15):
            hall_end = stay.start + trans
            stays.append(Visit(prev.end, hall_end, HALL_ID, "transit", prev.caregiver_id))
            stays.append(Visit(hall_end, stay.end, home, stay.activity, stay.caregiver_id))
        elif stay.room_id == home:
            stays.append(Visit(stay.start, stay.end, HALL_ID, "transit", prev.caregiver_id))
        else:
            stays.append(Visit(prev.end, stay.start if stay.start > prev.end else prev.end + trans, HALL_ID, "transit", stay.caregiver_id))
            if stay.start <= prev.end:
                stay = Visit(prev.end + trans, stay.end + trans, stay.room_id, stay.activity, stay.caregiver_id)
            stays.append(stay)

    merged: list[Visit] = []
    for stay in stays:
        start = max(stay.start, day_start)
        end = min(stay.end, day_end)
        if end <= start:
            continue
        stay = Visit(start, end, stay.room_id, stay.activity, stay.caregiver_id)
        if merged and merged[-1].room_id == stay.room_id and merged[-1].end == stay.start:
            prev = merged[-1]
            merged[-1] = Visit(prev.start, stay.end, stay.room_id, stay.activity, stay.caregiver_id or prev.caregiver_id)
        else:
            merged.append(stay)
    return merged


def stays_to_events(
    stays: list[Visit],
    resident: dict,
    rooms: dict[str, str],
    event_id: int,
    emit_initial_enter: bool,
) -> tuple[list[dict], int]:
    rows: list[dict] = []

    def pack(activity: str, extra: dict) -> str:
        payload = {
            "simulated": True,
            "activity": activity,
            "tier": resident["tier"],
            "home_room_id": resident["home_room_id"],
            **extra,
        }
        return json.dumps(payload, separators=(", ", ": "))

    if emit_initial_enter:
        first = stays[0]
        rows.append(
            make_row(
                event_id,
                resident,
                first.start,
                "room_enter",
                first.room_id,
                room_name(rooms, first.room_id),
                f"Entered {room_name(rooms, first.room_id)}",
                first.caregiver_id,
                pack(first.activity, {"source_room": None}),
            )
        )
        event_id += 1

    for cur, nxt in zip(stays, stays[1:]):
        if cur.room_id == nxt.room_id:
            continue
        rows.append(
            make_row(
                event_id,
                resident,
                cur.end,
                "room_exit",
                cur.room_id,
                room_name(rooms, cur.room_id),
                f"Left {room_name(rooms, cur.room_id)}",
                nxt.caregiver_id or cur.caregiver_id,
                pack(cur.activity, {"destination": room_name(rooms, nxt.room_id)}),
            )
        )
        event_id += 1
        rows.append(
            make_row(
                event_id,
                resident,
                nxt.start,
                "room_enter",
                nxt.room_id,
                room_name(rooms, nxt.room_id),
                f"Entered {room_name(rooms, nxt.room_id)}",
                nxt.caregiver_id,
                pack(nxt.activity, {"source_room": room_name(rooms, cur.room_id)}),
            )
        )
        event_id += 1
    return rows, event_id


def make_row(
    event_id: int,
    resident: dict,
    ts: datetime,
    event_type: str,
    room_id: int,
    room: str,
    description: str,
    caregiver_id: str,
    data: str,
) -> dict:
    return {
        "event_id": event_id,
        "workspace_id": WORKSPACE_ID,
        "patient_id": resident["patient_id"],
        "first_name": resident["first_name"],
        "last_name": resident["last_name"],
        "nickname": resident["nickname"],
        "timestamp": fmt_ts(ts),
        "event_type": event_type,
        "room_id": room_id,
        "room_name": room,
        "description": description,
        "source": SOURCE,
        "caregiver_id": caregiver_id,
        "data": data,
    }


def validate(audit: list[tuple[dict, date, list[Visit]]], rooms: dict[str, str]) -> list[str]:
    issues: list[str] = []
    bedroom_ids = {157, 158, 159, 160, 161, 162}
    for resident, day, stays in audit:
        home = resident["home_room_id"]
        if not stays:
            issues.append(f"{resident['patient_id']} {day}: no stays")
            continue
        for a, b in zip(stays, stays[1:]):
            gap = (b.start - a.end).total_seconds()
            if abs(gap) > 1.0:
                issues.append(f"{resident['patient_id']} {day}: gap {gap:.1f}s")
            if a.room_id != b.room_id and a.room_id != HALL_ID and b.room_id != HALL_ID:
                issues.append(
                    f"{resident['patient_id']} {day}: teleport "
                    f"{room_name(rooms, a.room_id)} -> {room_name(rooms, b.room_id)}"
                )
        other = {s.room_id for s in stays if s.room_id in bedroom_ids and s.room_id != home}
        if other:
            issues.append(f"{resident['patient_id']} {day}: other bedrooms {other}")
        for s in stays:
            dur = (s.end - s.start).total_seconds()
            if s.room_id == HALL_ID and dur > 180:
                issues.append(f"{resident['patient_id']} {day}: hall {dur:.0f}s")
            if s.room_id == TOILET_ID and not (3 * 60 <= dur <= 22 * 60):
                issues.append(f"{resident['patient_id']} {day}: toilet {dur/60:.1f} min")
            if s.room_id == SHOWER_ID and not (15 * 60 <= dur <= 35 * 60):
                issues.append(f"{resident['patient_id']} {day}: shower {dur/60:.1f} min")
            if s.activity in {"breakfast", "lunch", "dinner"}:
                if dur < 20 * 60 or not meal_hour_ok(s.activity, s.start):
                    issues.append(
                        f"{resident['patient_id']} {day}: {s.activity} at {s.start.strftime('%H:%M')} {dur/60:.1f} min"
                    )
        if stays[-1].room_id != home:
            issues.append(f"{resident['patient_id']} {day}: ended in {stays[-1].room_id}")
        if stays[0].room_id != home:
            issues.append(f"{resident['patient_id']} {day}: started in {stays[0].room_id}")
    return issues


def meal_hour_ok(activity: str, start: datetime) -> bool:
    windows = {
        "breakfast": (7, 9),
        "lunch": (11, 13),
        "dinner": (17, 19),
    }
    lo, hi = windows[activity]
    return lo <= start.hour <= hi


def main() -> None:
    cfg = load_personas()
    rooms: dict[str, str] = cfg["rooms"]
    rng = random.Random(42)
    all_rows: list[dict] = []
    event_id = 1
    audit: list[tuple[dict, date, list[Visit]]] = []

    for resident in cfg["residents"]:
        emit_initial = True
        for offset in range(N_DAYS):
            day = START_DATE + timedelta(days=offset)
            day_start = datetime(day.year, day.month, day.day, tzinfo=timezone.utc)
            visits = collect_visits(resident, day_start, rng)
            stays = weave_occupancy(visits, resident, day_start, rng)
            audit.append((resident, day, stays))
            rows, event_id = stays_to_events(stays, resident, rooms, event_id, emit_initial)
            all_rows.extend(rows)
            emit_initial = False

    issues = validate(audit, rooms)
    if issues:
        raise SystemExit("Timeline validation failed:\n  " + "\n  ".join(issues[:50]))

    with OUTPUT_PATH.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=COLUMNS)
        writer.writeheader()
        writer.writerows(all_rows)

    print(f"Wrote {len(all_rows)} events -> {OUTPUT_PATH}")
    for resident in cfg["residents"]:
        pid = resident["patient_id"]
        n = sum(1 for r in all_rows if r["patient_id"] == pid)
        used = sorted({r["room_name"] for r in all_rows if r["patient_id"] == pid})
        print(
            f"  {pid} {resident['first_name']} {resident['last_name']}"
            f"  tier={resident['tier']} barthel={resident['barthel']['total']}"
            f"  events={n}  rooms={used}"
        )


if __name__ == "__main__":
    main()
