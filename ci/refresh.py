#!/usr/bin/env python3
"""Cloud refresh for the Talk Realty scoreboard (runs in GitHub Actions, no box needed).
GET-only calls to Follow Up Boss with the key from env FUB_API_KEY (an Actions secret, never printed or written).
Writes data/leaderboard.json and data/activity.json. Output: agent names, counts and points only, no lead data.
Card state (hands, plays, point moves) comes from ci/engine_state.json, which the office box pushes when it changes;
if that file is missing the board still works with zero cards.
If any Follow Up Boss call fails, the script exits non-zero BEFORE writing, so the last good data stays live."""
import base64, json, os, sys, tempfile, time, urllib.parse, urllib.request
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UTC = timezone.utc
cfg = json.load(open(os.path.join(ROOT, "ci", "config.json")))
try:
    ST = json.load(open(os.path.join(ROOT, "ci", "engine_state.json")))
except FileNotFoundError:
    ST = {}
TZ = ZoneInfo(cfg["timezone"]); P = cfg["points"]; MIN_CONV = cfg["conversation_min_seconds"]
iso = lambda d: d.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
parse = lambda s: datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=UTC)
KEY = os.environ.get("FUB_API_KEY") or sys.exit("FUB_API_KEY missing")
AUTH = "Basic " + base64.b64encode((KEY + ":").encode()).decode()

def get(path, **params):
    url = "https://api.followupboss.com/v1/" + path + ("?" + urllib.parse.urlencode(params) if params else "")
    for attempt in range(6):
        req = urllib.request.Request(url, headers={"Authorization": AUTH, "X-System": "TheDraw", "Accept": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=40) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 429 or e.code >= 500:
                time.sleep(3 + attempt * 3); continue
            raise
        except (urllib.error.URLError, TimeoutError):
            time.sleep(3 + attempt * 3)
    raise RuntimeError("FUB unavailable for " + path)

def page_back(path, key, since, max_pages):
    params = dict(limit=100, sort="-created"); out = []; nxt = None
    for _ in range(max_pages):
        if nxt: params["next"] = nxt
        d = get(path, **params); rows = d.get(key, [])
        if not rows: break
        stop = False
        for r in rows:
            if r["created"] < since: stop = True; continue
            out.append(r)
        nxt = d.get("_metadata", {}).get("next")
        if stop or not nxt: break
    return out

def week_start(t):
    c = cfg["weekly_cutoff"]; wd = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"].index(c["weekday"].lower()) if isinstance(c["weekday"], str) else c["weekday"]
    loc = t.astimezone(TZ)
    cand = loc.replace(hour=c["hour"], minute=c["minute"], second=0, microsecond=0) - timedelta(days=(loc.weekday() - wd) % 7)
    if cand > loc: cand -= timedelta(days=7)
    return cand.astimezone(UTC)

DISPLAY_NAME = {"Harold Daniel Perea": "Daniel Perea"}  # public display override (goes by Daniel)
def initials(n):
    p = n.split(); return (p[0][0] + (p[-1][0] if len(p) > 1 else "")).upper()
def next_threshold(pts):
    for t in [cfg["first_blood_points"]] + [cfg["draw_every_points"] * i for i in range(1, 400)]:
        if t > pts: return t

now = datetime.now(UTC); ws = week_start(now); we = ws + timedelta(days=7); local = now.astimezone(TZ)
month_start = datetime(local.year, local.month, 1, tzinfo=TZ).astimezone(UTC)
trial_start = datetime.fromisoformat(cfg["trial_start"]).astimezone(UTC)
since = max(trial_start, min(ws, month_start))

users = get("users", limit=200).get("users", [])
trial_ids = {p["fub_user_id"] for p in cfg["participants"]}
SCOPE_ALL = cfg.get("play_scope", "trial") == "all"
team_ids = set()
if SCOPE_ALL:
    team_ids = set(next(t for t in get("teams")["teams"] if t["name"] == "Support Agent Side")["userIds"])
cand = [u for u in users if u.get("status") == "Active" and (u["id"] in trial_ids or (SCOPE_ALL and u["id"] in team_ids and u.get("role") not in {"Broker","Lender","Admin","Owner"} and not u.get("isOwner")))]
cand_ids = {u["id"] for u in cand}
calls = page_back("calls", "calls", iso(since), 400)
appts = page_back("appointments", "appointments", iso(since), 200)

EFFECTS = ST.get("effects", [])
def mult(uid, kind, ts):
    t = iso(ts); m = 1.0
    for e in EFFECTS:
        if e["user_id"] != uid or not (e["starts_at"] <= t < e["ends_at"]): continue
        if e["kind"] == "power_hour": m *= 2
        elif e["kind"] == "weekend_warrior" and kind == "appt": m *= 3
        elif e["kind"] == "double_down" and kind == "appt": m *= 2
    return m
stats = {u["id"]: dict(dials=0, convs=0, appts=0, wk=0, mo=0, dials_mo=0, convs_mo=0, appts_mo=0, out_mo=0) for u in cand}
def add(uid, kind, ts):
    s = stats[uid]; pts = {"dial": P["dial"], "conv": P["conversation"], "appt": P["appointment"]}[kind] * mult(uid, kind, ts)
    if ts >= month_start:
        s["mo"] += pts; s[{"dial": "dials_mo", "conv": "convs_mo", "appt": "appts_mo"}[kind]] += 1
    if ws <= ts < we:
        s["wk"] += pts; s[{"dial": "dials", "conv": "convs", "appt": "appts"}[kind]] += 1
for c in calls:
    uid = c.get("userId")
    if uid not in cand_ids: continue
    ts = parse(c["created"]); dur = c.get("duration") or 0
    if dur >= MIN_CONV: add(uid, "conv", ts)
    elif not c.get("isIncoming"): add(uid, "dial", ts)
    if not c.get("isIncoming") and ts >= month_start: stats[uid]["out_mo"] += 1
for a in appts:
    uid = a.get("createdById")
    if uid in cand_ids: add(uid, "appt", parse(a["created"]))
for r in ST.get("point_events", []):
    if r["user_id"] not in stats: continue
    ts = parse(r["ts"])
    if r["counts_monthly"] and ts >= month_start: stats[r["user_id"]]["mo"] += r["points"]
    if r["counts_weekly"] and ws <= ts < we: stats[r["user_id"]]["wk"] += r["points"]

# Slack-reported call overrides (max of FUB day vs Slack day). Missing file = no-op.
# Null conversations/appointments in a report leave that metric alone.
_slack_path = os.path.join(ROOT, "ci", "slack_call_reports.json")
try:
    _slack_doc = json.load(open(_slack_path))
except FileNotFoundError:
    _slack_doc = None
if _slack_doc:
    _fub_day = {}
    for c in calls:
        uid = c.get("userId")
        if uid not in cand_ids: continue
        ts = parse(c["created"]); day = ts.astimezone(TZ).strftime("%Y-%m-%d")
        b = _fub_day.setdefault((uid, day), {"dials": 0, "convs": 0, "appts": 0})
        dur = c.get("duration") or 0
        if dur >= MIN_CONV: b["convs"] += 1
        elif not c.get("isIncoming"): b["dials"] += 1
    for a in appts:
        uid = a.get("createdById")
        if uid not in cand_ids: continue
        ts = parse(a["created"]); day = ts.astimezone(TZ).strftime("%Y-%m-%d")
        _fub_day.setdefault((uid, day), {"dials": 0, "convs": 0, "appts": 0})["appts"] += 1
    _kind_map = [
        ("dial", "dials", "dials", P["dial"]),
        ("conv", "conversations", "convs", P["conversation"]),
        ("appt", "appointments", "appts", P["appointment"]),
    ]
    _slack_extra = 0
    for r in _slack_doc.get("reports", []):
        uid = r.get("fub_user_id")
        if uid not in stats: continue
        day = r.get("date")
        if not day: continue
        try:
            day_ts = datetime.strptime(day, "%Y-%m-%d").replace(hour=12, minute=0, second=0, tzinfo=TZ).astimezone(UTC)
        except ValueError:
            continue
        fub = _fub_day.get((uid, day), {"dials": 0, "convs": 0, "appts": 0})
        s = stats[uid]
        for _kind, report_key, metric_key, pts_each in _kind_map:
            reported = r.get(report_key)
            if reported is None: continue
            try:
                reported = int(reported)
            except (TypeError, ValueError):
                continue
            delta = reported - fub[metric_key]
            if delta <= 0: continue
            total_pts = delta * pts_each
            if day_ts >= month_start:
                s["mo"] += total_pts; s[metric_key + "_mo"] += delta
                if metric_key == "dials": s["out_mo"] += delta
            if ws <= day_ts < we:
                s["wk"] += total_pts
                s[metric_key] += delta
            _slack_extra += delta
    if _slack_extra:
        print("slack_call_reports: credited", _slack_extra, "extra events across", len(_slack_doc.get("reports", [])), "reports")

# Month-to-date dial floors read from the FUB UI (dialer sessions never reach the /calls API).
# Credit = reported MTD outbound dials - (API outbound + Slack daily credits), so nothing counts twice.
# Extra dials have no exact timestamps: they count toward month points and month dials only.
if _slack_doc:
    for r in _slack_doc.get("mtd_reports", []):
        uid = r.get("fub_user_id")
        if uid not in stats or r.get("month") != local.strftime("%Y-%m"): continue
        s = stats[uid]; delta = int(r.get("dials") or 0) - s["out_mo"]
        if delta > 0:
            s["mo"] += delta * P["dial"]; s["dials_mo"] += delta; s["out_mo"] += delta
            print("mtd_reports: credited", delta, "dials to", uid)

canon = {p["fub_user_id"]: p["name"] for p in cfg["participants"]}
rows = [(dict(u, name=DISPLAY_NAME.get(canon.get(u["id"], u["name"]), canon.get(u["id"], u["name"]))), stats[u["id"]]) for u in cand]
rows.sort(key=lambda r: (-r[1]["mo"], -r[1]["wk"], -r[1]["appts"], -r[1]["convs"], r[0]["name"]))
cards = ST.get("cards", {})
agents = []
for i, (u, s) in enumerate(rows):
    nt = next_threshold(s["mo"]); ing = SCOPE_ALL or u["id"] in trial_ids; cc = cards.get(str(u["id"]), {})
    agents.append({"rank": i + 1, "user_id": u["id"], "name": u["name"], "initials": initials(u["name"]), "avatar": None,
                   "weekly_points": s["wk"], "month_points": s["mo"], "next_draw_at": nt, "to_next_draw": nt - s["mo"],
                   "dials": s["dials"], "conversations": s["convs"], "appointments": s["appts"],
                   "dials_month": s["out_mo"], "conversations_month": s["convs_mo"], "appointments_month": s["appts_mo"],
                   "cards_in_hand": cc.get("hand", 0) if ing else 0, "cards_pending": cc.get("pending", 0) if ing else 0,
                   "hand_limit": cfg["hand_limit"], "in_game": ing, "example_cards": cc.get("example", 0)})
plays = ST.get("plays", [])
lb = {"example": False, "live": True, "generated_at": iso(now), "title": cfg["game_name"], "subtitle": cfg["game_of_the_month"],
      "week_start": iso(ws), "week_end": iso(we), "month": local.strftime("%Y-%m"), "channel": cfg["channel_name"],
      "next_sync_minutes": 15, "mode": cfg["mode"], "agents": agents, "plays": plays, "draws": [], "source": "cloud",
      "plays_note": ST.get("plays_note", "Fresh start: scoring counts from Oct 1 2026 and nobody holds a card yet. Cards are earned with points. Devin's page shows three EXAMPLE cards.")}

# activity feed (last 36 h): agent first name + last initial, kind, time. No lead data.
def label(n):
    n = DISPLAY_NAME.get(n, n)
    p = [w for w in n.split() if w.lower().strip(".") not in ("jr", "sr", "ii", "iii")]
    return p[0] + (" " + p[-1][0] if len(p) > 1 else "")
names = {a["user_id"]: label(a["name"]) for a in agents}
cut = iso(now - timedelta(hours=36)); ev = []
for c in calls:
    if c["created"] < cut or c.get("userId") not in names: continue
    dur = c.get("duration") or 0
    if dur >= 120: ev.append({"ts": c["created"], "name": names[c["userId"]], "kind": "conversation", "minutes": dur // 60})
    elif not c.get("isIncoming"): ev.append({"ts": c["created"], "name": names[c["userId"]], "kind": "call"})
for a in appts:
    if a["created"] >= cut and a.get("createdById") in names: ev.append({"ts": a["created"], "name": names[a["createdById"]], "kind": "appointment"})
for e in ST.get("activity_extra", []):  # plays / escrow lines pushed by the box (already privacy-safe)
    if e.get("ts", "") >= cut: ev.append(e)
ev.sort(key=lambda e: e["ts"], reverse=True)
act = {"generated_at": iso(now), "events": ev[:60]}

def write_json(path, obj):
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path), suffix=".tmp")
    with os.fdopen(fd, "w") as fh: json.dump(obj, fh, indent=1)
    os.chmod(tmp, 0o644); os.replace(tmp, path)
write_json(os.path.join(ROOT, "data", "leaderboard.json"), lb)
write_json(os.path.join(ROOT, "data", "activity.json"), act)
print(iso(now), "agents:", len(agents), "calls:", len(calls), "appts:", len(appts), "events:", len(ev))
