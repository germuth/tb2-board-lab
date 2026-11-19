import argparse
import base64
import datetime
import http.server
import json
import os
import re
import shutil
import socketserver
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
import webbrowser

IS_FROZEN = bool(getattr(sys, "frozen", False))
APP_DIR = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
DATA_ROOT = os.path.dirname(os.path.abspath(sys.executable)) if IS_FROZEN else APP_DIR
STATIC_DIR = os.path.join(APP_DIR, "static")
HOLDS_CATALOG_PATH = os.path.join(STATIC_DIR, "data", "holds_all_tb2.json")

if APP_DIR not in sys.path:
    sys.path.insert(0, APP_DIR)

import catalog_engine

DEFAULT_PORT = 8855
DEFAULT_HOST = "127.0.0.1"

TENSION_WEB_HOST = "https://tensionboardapp2.com"
TENSION_USER_AGENT = "Tension Board/202 CFNetwork/1568.100.1 Darwin/24.0.0"

DEFAULT_CONFIG = {
    "layout_id": 11,
    "size_id": 9,
    "angle": 45,
    "is_adjustable": False,
    "setup_complete": False,
}

DEFAULT_LISTS = []
DEFAULT_WATCHLIST = []

DIFFICULTY_TO_GRADE = {
    10: ("V0-", "V0"),
    11: ("V0", "V0"),
    12: ("V0+", "V0"),
    13: ("V1", "V1"),
    14: ("V1+", "V1"),
    15: ("V2", "V2"),
    16: ("V3-", "V3"),
    17: ("V3+", "V3"),
    18: ("V4", "V4"),
    19: ("V4+", "V4"),
    20: ("V5", "V5"),
    21: ("V5+", "V5"),
    22: ("V6", "V6"),
    23: ("V7", "V7"),
    24: ("V8", "V8"),
    25: ("V8+", "V8"),
    26: ("V9", "V9"),
    27: ("V10", "V10"),
    28: ("V11", "V11"),
    29: ("V12", "V12"),
    30: ("V13", "V13"),
    31: ("V14", "V14"),
    32: ("V15", "V15"),
    33: ("V16", "V16"),
}

GRADE_TO_DIFFICULTY = {
    "V0-": 10, "V0": 11, "V0+": 12,
    "V1-": 13, "V1": 13, "V1+": 14,
    "V2-": 15, "V2": 15, "V2+": 15,
    "V3-": 16, "V3": 16, "V3+": 17,
    "V4-": 18, "V4": 18, "V4+": 19,
    "V5-": 20, "V5": 20, "V5+": 21,
    "V6-": 22, "V6": 22, "V6+": 22,
    "V7-": 23, "V7": 23, "V7+": 23,
    "V8-": 24, "V8": 24, "V8+": 25,
    "V9-": 26, "V9": 26, "V9+": 26,
    "V10-": 27, "V10": 27, "V10+": 27,
    "V11-": 28, "V11": 28, "V11+": 28,
    "V12-": 29, "V12": 29, "V12+": 29,
    "V13": 30, "V14": 31, "V15": 32, "V16": 33,
}

USER_DATA_DIR = ""
CONFIG_PATH = ""
STATE_PATH = ""
SESSIONS_PATH = ""
CATALOG_CACHE_DIR = ""
VIDEOS_DIR = ""

_DATA_LOCK = threading.RLock()
_CATALOG_LOCK = threading.RLock()
_CATALOG_MEM_CACHE = {}


def configure_paths(data_dir=None):
    global USER_DATA_DIR, CONFIG_PATH, STATE_PATH, SESSIONS_PATH, CATALOG_CACHE_DIR, VIDEOS_DIR
    raw_dir = data_dir or os.environ.get("TB2_DATA_DIR") or os.path.join(DATA_ROOT, "user_data")
    USER_DATA_DIR = os.path.abspath(os.path.expanduser(raw_dir))
    CONFIG_PATH = os.path.join(USER_DATA_DIR, "config.json")
    STATE_PATH = os.path.join(USER_DATA_DIR, "state.json")
    SESSIONS_PATH = os.path.join(USER_DATA_DIR, "aurora_sessions.json")
    CATALOG_CACHE_DIR = os.path.join(USER_DATA_DIR, "catalog_cache")
    VIDEOS_DIR = os.path.join(USER_DATA_DIR, "videos")
    os.makedirs(USER_DATA_DIR, exist_ok=True)
    os.makedirs(CATALOG_CACHE_DIR, exist_ok=True)
    os.makedirs(VIDEOS_DIR, exist_ok=True)
    with _CATALOG_LOCK:
        _CATALOG_MEM_CACHE.clear()


configure_paths()


def find_ffmpeg():
    return shutil.which("ffmpeg")


def find_ffprobe():
    return shutil.which("ffprobe")


def find_yt_dlp():
    return shutil.which("yt-dlp")


def get_capabilities():
    return {
        "ffmpeg": bool(find_ffmpeg() and find_ffprobe()),
        "yt_dlp": bool(find_yt_dlp()),
    }


def _write_json_atomic(path, obj, indent=2, separators=None, chmod_mode=None):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp_path = f"{path}.{os.getpid()}.{threading.get_ident()}.tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        if separators is not None:
            json.dump(obj, f, separators=separators)
        else:
            json.dump(obj, f, indent=indent)
    if chmod_mode is not None and os.name == "posix":
        try:
            os.chmod(tmp_path, chmod_mode)
        except OSError:
            pass
    os.replace(tmp_path, path)
    if chmod_mode is not None and os.name == "posix":
        try:
            os.chmod(path, chmod_mode)
        except OSError:
            pass


def _clamp_angle(val, default=45):
    try:
        ang = int(round(float(val)))
    except Exception:
        ang = int(default)
    return max(15, min(70, ang))


def _base_v_grade(grade_str):
    s = (grade_str or "V0").strip().upper()
    m = re.match(r"^(V\d+)", s)
    return m.group(1) if m else "V0"


def _grade_to_difficulty(rated_grade="", full_grade="", v_grade="V0", default=11):
    for cand in (rated_grade, full_grade, v_grade):
        c = (cand or "").strip().upper()
        if not c:
            continue
        if c in GRADE_TO_DIFFICULTY:
            return GRADE_TO_DIFFICULTY[c]
        base = _base_v_grade(c)
        if base in GRADE_TO_DIFFICULTY:
            return GRADE_TO_DIFFICULTY[base]
    return default


def load_config():
    with _DATA_LOCK:
        cfg = dict(DEFAULT_CONFIG)
        if os.path.exists(CONFIG_PATH):
            try:
                with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                    loaded = json.load(f)
                if isinstance(loaded, dict):
                    cfg.update(loaded)
            except Exception:
                pass
        try:
            cfg["layout_id"] = int(cfg.get("layout_id", DEFAULT_CONFIG["layout_id"]))
        except Exception:
            cfg["layout_id"] = DEFAULT_CONFIG["layout_id"]
        try:
            cfg["size_id"] = int(cfg.get("size_id", DEFAULT_CONFIG["size_id"]))
        except Exception:
            cfg["size_id"] = DEFAULT_CONFIG["size_id"]
        cfg["angle"] = _clamp_angle(cfg.get("angle", DEFAULT_CONFIG["angle"]), DEFAULT_CONFIG["angle"])
        cfg["is_adjustable"] = bool(cfg.get("is_adjustable", False))
        cfg["setup_complete"] = bool(cfg.get("setup_complete", False))
        return cfg


def save_config(cfg):
    with _DATA_LOCK:
        clean = dict(DEFAULT_CONFIG)
        clean.update(cfg or {})
        clean["layout_id"] = int(clean.get("layout_id", DEFAULT_CONFIG["layout_id"]))
        clean["size_id"] = int(clean.get("size_id", DEFAULT_CONFIG["size_id"]))
        clean["angle"] = _clamp_angle(clean.get("angle", DEFAULT_CONFIG["angle"]), DEFAULT_CONFIG["angle"])
        clean["is_adjustable"] = bool(clean.get("is_adjustable", False))
        clean["setup_complete"] = bool(clean.get("setup_complete", False))
        _write_json_atomic(CONFIG_PATH, clean, indent=2)
        return clean


def load_sessions():
    with _DATA_LOCK:
        if os.path.exists(SESSIONS_PATH):
            try:
                with open(SESSIONS_PATH, "r", encoding="utf-8") as f:
                    data = json.load(f)
                return data if isinstance(data, dict) else {}
            except Exception:
                return {}
        return {}


def save_sessions(sessions):
    with _DATA_LOCK:
        _write_json_atomic(SESSIONS_PATH, sessions, indent=2, chmod_mode=0o600)


def get_primary_user(sessions=None):
    sess = sessions if sessions is not None else load_sessions()
    for uname in sess.keys():
        if uname:
            return uname
    return "me"


def _find_session_for_user(sessions, username):
    if not sessions:
        return None, None
    target = (username or "").strip().lstrip("@").lower()
    if target:
        for uname, info in sessions.items():
            if uname.lower() == target and info.get("token") and info.get("user_id"):
                return uname, info
    if not target or target == "me":
        for uname, info in sessions.items():
            if info.get("token") and info.get("user_id"):
                return uname, info
    return None, None


def load_state():
    with _DATA_LOCK:
        st = {
            "beta_by_climb": {},
            "logbook": [],
            "lists": list(DEFAULT_LISTS),
            "watchlist": list(DEFAULT_WATCHLIST),
            "draft_climbs": [],
            "connected_accounts": [],
        }
        if os.path.exists(STATE_PATH):
            try:
                with open(STATE_PATH, "r", encoding="utf-8") as f:
                    loaded = json.load(f)
                if isinstance(loaded, dict):
                    st.update(loaded)
            except Exception:
                pass

        sessions = load_sessions()
        primary = get_primary_user(sessions)
        changed = False
        if not isinstance(st.get("lists"), list):
            st["lists"] = list(DEFAULT_LISTS)
            changed = True
        if not isinstance(st.get("watchlist"), list):
            st["watchlist"] = list(DEFAULT_WATCHLIST)
            changed = True
        if not isinstance(st.get("draft_climbs"), list):
            st["draft_climbs"] = []
            changed = True
        for entry in st.get("logbook", []):
            if not entry.get("climber"):
                entry["climber"] = primary
                changed = True
            if "on_active_board" not in entry and "on_10x8_spray" in entry:
                entry["on_active_board"] = bool(entry["on_10x8_spray"])
                changed = True

        st["connected_accounts"] = [
            {"username": u, "user_id": info.get("user_id"), "last_sync": info.get("last_sync", "")}
            for u, info in sessions.items()
        ]
        st["primary_user"] = primary
        if changed:
            save_state(st)
        return st


def save_state(st):
    with _DATA_LOCK:
        st_copy = dict(st)
        # Never persist session tokens inside state.json
        st_copy.pop("sessions", None)
        _write_json_atomic(STATE_PATH, st_copy, indent=2)


def _normalize_leaderboard(lb):
    lb = dict(lb) if isinstance(lb, dict) else {}
    top_fa = lb.get("top_fa") if lb.get("top_fa") is not None else lb.get("top_fa_10x8", [])
    top_setters = lb.get("top_setters") if lb.get("top_setters") is not None else lb.get("top_setters_10x8", [])
    top_beta = lb.get("top_beta") if lb.get("top_beta") is not None else lb.get("top_beta_10x8", [])
    lb["top_fa"] = top_fa
    lb["top_setters"] = top_setters
    lb["top_beta"] = top_beta
    lb["top_fa_10x8"] = top_fa
    lb["top_setters_10x8"] = top_setters
    lb["top_beta_10x8"] = top_beta
    return lb


def _board_display_name(board_info, layout_id, size_id):
    if isinstance(board_info, dict):
        for key in ("name", "label", "short_name", "title"):
            val = (board_info.get(key) or "").strip()
            if val:
                return val
    return f"TB2 Layout {layout_id} (Size {size_id})"


def get_board_configs_list():
    try:
        return catalog_engine.get_board_configs_list()
    except Exception:
        return []


def get_or_build_catalog(layout_id=None, size_id=None, angle=None, force_refresh=False):
    cfg = load_config()
    lid = int(layout_id) if layout_id is not None else cfg["layout_id"]
    sid = int(size_id) if size_id is not None else cfg["size_id"]
    ang = _clamp_angle(angle if angle is not None else cfg["angle"], cfg["angle"])
    cache_key = (lid, sid, ang)

    with _CATALOG_LOCK:
        if not force_refresh and cache_key in _CATALOG_MEM_CACHE:
            return _CATALOG_MEM_CACHE[cache_key]

        if force_refresh:
            ensure_fn = getattr(catalog_engine, "ensure_layout_db", None)
            if callable(ensure_fn):
                ensure_fn(lid, CATALOG_CACHE_DIR, force_refresh=True)
            for k in list(_CATALOG_MEM_CACHE.keys()):
                if k[0] == lid:
                    _CATALOG_MEM_CACHE.pop(k, None)

        built = catalog_engine.build_board_catalog(
            layout_id=lid,
            size_id=sid,
            target_angle=ang,
            cache_dir=CATALOG_CACHE_DIR,
            holds_catalog_path=HOLDS_CATALOG_PATH,
            force_rebuild=force_refresh,
        )

        catalog_obj = {
            "ok": True,
            "layout_id": built.get("layout_id", lid),
            "size_id": built.get("size_id", sid),
            "angle": built.get("angle", ang),
            "board": built.get("board") or {},
            "holds": built.get("holds") or [],
            "climbs": built.get("climbs") or [],
            "leaderboard": _normalize_leaderboard(built.get("leaderboard")),
            "meta": dict(built.get("meta") or {}),
        }

        _CATALOG_MEM_CACHE[cache_key] = catalog_obj
        return catalog_obj


def merge_local_drafts_into_catalog(catalog, st=None):
    st_obj = st if st is not None else load_state()
    drafts = st_obj.get("draft_climbs") or []
    if not drafts:
        return catalog

    lid = catalog.get("layout_id")
    sid = catalog.get("size_id")
    base_climbs = catalog.get("climbs") or []
    existing_uuids = {(c.get("u") or "").lower() for c in base_climbs}
    extra = []
    for d in drafts:
        du = (d.get("u") or "").lower()
        if not du or du in existing_uuids:
            continue
        d_lid = d.get("layout_id")
        d_sid = d.get("size_id")
        if d_lid is not None and int(d_lid) != int(lid):
            continue
        if d_sid is not None and int(d_sid) != int(sid):
            continue
        extra.append(d)
        existing_uuids.add(du)
    if not extra:
        return catalog

    merged = dict(catalog)
    merged["climbs"] = extra + list(base_climbs)
    return merged


def get_active_catalog_index(cfg=None, st=None):
    c = cfg if cfg is not None else load_config()
    try:
        catalog = get_or_build_catalog(c["layout_id"], c["size_id"], c["angle"])
        catalog = merge_local_drafts_into_catalog(catalog, st=st)
    except Exception:
        catalog = {
            "ok": False,
            "layout_id": c["layout_id"],
            "size_id": c["size_id"],
            "angle": c["angle"],
            "board": {},
            "holds": [],
            "climbs": [],
            "leaderboard": _normalize_leaderboard({}),
            "meta": {},
        }
    climbs = catalog.get("climbs") or []
    climbs_by_lower = {(x.get("u") or "").lower(): x for x in climbs if x.get("u")}
    holds = catalog.get("holds") or []
    holds_by_pid = {h["placement_id"]: h for h in holds if h.get("placement_id") is not None}
    board_info = catalog.get("board") or {}
    return climbs_by_lower, climbs, holds_by_pid, board_info, catalog


def lookup_external_climbs(uuids):
    clean_uuids = sorted({(u or "").strip() for u in (uuids or []) if (u or "").strip()})
    if not clean_uuids:
        return {}
    try:
        raw = catalog_engine.lookup_climbs_by_uuids(clean_uuids, CATALOG_CACHE_DIR)
        if not isinstance(raw, dict):
            return {}
        return {k.lower(): v for k, v in raw.items() if isinstance(v, dict)}
    except Exception:
        return {}


def extract_ig_shortcode(url):
    m = re.search(r"instagram\.com/(?:reel|p|tv)/([A-Za-z0-9_-]+)", url or "")
    return m.group(1) if m else ""


def aurora_login(username, password):
    body = json.dumps({
        "username": username,
        "password": password,
        "tou": "accepted",
        "pp": "accepted",
        "ua": "app",
    }).encode("utf-8")
    req = urllib.request.Request(
        f"{TENSION_WEB_HOST}/sessions",
        data=body,
        headers={
            "Accept": "application/json",
            "Content-Type": "application/json",
            "User-Agent": TENSION_USER_AGENT,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            sess = data.get("session") or data.get("login") or data
            token = sess.get("token")
            user_id = sess.get("user_id")
            if token and user_id:
                return {"ok": True, "token": token, "user_id": user_id}
            return {"ok": False, "error": "Unexpected login response from Tension Board 2"}
    except urllib.error.HTTPError as e:
        err_txt = e.read().decode("utf-8", "ignore")
        try:
            err_json = json.loads(err_txt)
            return {"ok": False, "error": json.dumps(err_json.get("errors", err_json))}
        except Exception:
            return {"ok": False, "error": f"HTTP {e.code}: {err_txt[:160]}"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def aurora_sync_user_tables(username, token, user_id):
    """Pulls ascents, bids, circuits, draft_climbs, and notifications from tensionboardapp2.com."""
    tables = {
        "ascents": "1970-01-01 00:00:00.000000",
        "bids": "1970-01-01 00:00:00.000000",
        "circuits": "1970-01-01 00:00:00.000000",
        "draft_climbs": "1970-01-01 00:00:00.000000",
    }
    collected = {"ascents": [], "bids": [], "circuits": [], "draft_climbs": [], "notifications": []}
    for _ in range(15):
        payload = urllib.parse.urlencode(tables).encode("utf-8")
        req = urllib.request.Request(
            f"{TENSION_WEB_HOST}/sync",
            data=payload,
            headers={
                "Accept": "application/json",
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent": TENSION_USER_AGENT,
                "Cookie": f"token={token}",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=25) as resp:
            raw = json.loads(resp.read().decode("utf-8"))
        put = raw.get("PUT", raw)
        for k in ("ascents", "bids", "circuits", "draft_climbs"):
            rows = put.get(k, [])
            if rows:
                collected[k].extend(rows)
        if raw.get("_complete") or put.get("_complete"):
            break
        updated_any = False
        for us in put.get("user_syncs", raw.get("user_syncs", [])):
            tname = us.get("table_name")
            lsync = us.get("last_synchronized_at")
            if tname in tables and lsync and lsync != tables[tname]:
                tables[tname] = lsync
                updated_any = True
        if not updated_any:
            break

    # Fetch notifications (sends/climbs/follows from followed climbers)
    try:
        n_req = urllib.request.Request(
            f"{TENSION_WEB_HOST}/notifications?ascents=1&climbs=1&users=1&follows=1",
            headers={
                "Accept": "application/json",
                "User-Agent": TENSION_USER_AGENT,
                "Cookie": f"token={token}",
            },
            method="GET",
        )
        with urllib.request.urlopen(n_req, timeout=10) as n_resp:
            n_data = json.loads(n_resp.read().decode("utf-8"))
            collected["notifications"] = n_data.get("notifications", [])
    except Exception:
        pass

    return collected


def _ensure_watchlist_user(st, username, role="Followed on Tension", is_me=False):
    uname = (username or "").strip().lstrip("@")
    if not uname:
        return
    wl = st.setdefault("watchlist", [])
    for existing in wl:
        if (existing.get("username") or "").lower() == uname.lower():
            if is_me:
                existing["is_me"] = True
            return
    wl.append({
        "username": uname,
        "label": f"You (@{uname})" if is_me else f"@{uname}",
        "role": role,
        "is_me": bool(is_me),
    })


def apply_aurora_sync_to_state(st, username, user_id, collected):
    cfg = load_config()
    active_angle = cfg["angle"]
    is_adjustable = cfg["is_adjustable"]
    active_layout_id = cfg["layout_id"]

    climbs_by_lower, _, _, board_info, _ = get_active_catalog_index(cfg=cfg, st=st)
    active_layout_name = _board_display_name(board_info, active_layout_id, cfg["size_id"])

    # Gather all climb UUIDs not found on the active board so we can resolve them in one batch
    unknown_uuids = set()
    for asc in collected.get("ascents", []):
        cu = (asc.get("climb_uuid") or "").strip()
        if cu and cu.lower() not in climbs_by_lower:
            unknown_uuids.add(cu)
    for bid in collected.get("bids", []):
        cu = (bid.get("climb_uuid") or "").strip()
        if cu and cu.lower() not in climbs_by_lower:
            unknown_uuids.add(cu)
    for n in collected.get("notifications", []):
        cu = ((n.get("climb") or {}).get("uuid") or "").strip()
        if cu and cu.lower() not in climbs_by_lower:
            unknown_uuids.add(cu)
    for dc in collected.get("draft_climbs", []):
        du = (dc.get("uuid") or "").strip()
        if du and du.lower() not in climbs_by_lower:
            unknown_uuids.add(du)
    for cir in collected.get("circuits", []):
        for item in cir.get("climbs", []):
            raw_u = (item.get("climb_uuid") or item.get("uuid") if isinstance(item, dict) else str(item)).strip()
            if raw_u and raw_u.lower() not in climbs_by_lower:
                unknown_uuids.add(raw_u)

    external_lookup = lookup_external_climbs(unknown_uuids)

    logbook = st.setdefault("logbook", [])
    primary_user = get_primary_user()
    existing_ids = {l.get("id") for l in logbook}
    existing_aurora_uuids = {
        (l.get("aurora_uuid") or "").lower()
        for l in logbook
        if l.get("aurora_uuid")
    }
    existing_by_key = {
        (
            (l.get("climber") or primary_user).lower(),
            (l.get("climb_uuid") or "").lower(),
            l.get("date", ""),
            l.get("status", "sent"),
        ): l
        for l in logbook
    }
    added_logs = 0

    def _matches_active_board(is_on_board, climb_angle):
        if not is_on_board:
            return False
        if is_adjustable:
            return True
        return int(climb_angle) == int(active_angle)

    # 1. Process Ascents (Sends)
    for asc in collected.get("ascents", []):
        if asc.get("is_listed") is False:
            continue
        asc_uuid = (asc.get("uuid") or "").strip()
        if asc_uuid and asc_uuid.lower() in existing_aurora_uuids:
            continue
        cu_raw = (asc.get("climb_uuid") or "").strip()
        c = climbs_by_lower.get(cu_raw.lower())
        c_info = external_lookup.get(cu_raw.lower(), {})
        if not c and not c_info:
            continue
        angle = int(asc.get("angle") or active_angle)
        climbed_at = (asc.get("climbed_at") or "")[:10] or time.strftime("%Y-%m-%d")
        is_on_board = c is not None
        on_active_board = _matches_active_board(is_on_board, angle)
        c_uuid = c["u"] if c else c_info.get("uuid", cu_raw)
        c_name = c["n"] if c else c_info.get("name", "Tension Climb")
        c_setter = c["s"] if c else c_info.get("setter", "tension")
        layout_name = active_layout_name if is_on_board else c_info.get("layout_name", "Other TB2 Layout")

        entry_id = f"aurora_asc_{asc_uuid or cu_raw}"
        if entry_id in existing_ids:
            continue
        dedup_key = (username.lower(), c_uuid.lower(), climbed_at, "sent")
        if dedup_key in existing_by_key:
            existing_entry = existing_by_key[dedup_key]
            existing_entry["aurora_uuid"] = asc_uuid
            existing_entry["synced_to_tension"] = True
            existing_entry["on_active_board"] = on_active_board
            existing_entry["on_10x8_spray"] = on_active_board
            existing_entry["layout_name"] = layout_name
            if asc_uuid:
                existing_aurora_uuids.add(asc_uuid.lower())
            continue

        diff = int(round(asc.get("difficulty") or (c.get("d") if c else 15) or 11))
        fallback_g = c.get("g", "V0") if c else c_info.get("g", "V2")
        fallback_v = c.get("v", "V0") if c else c_info.get("v", "V2")
        rated_g, rated_v = DIFFICULTY_TO_GRADE.get(diff, (fallback_g, fallback_v))
        tries = int(asc.get("bid_count") or asc.get("attempt_id") or 1)
        quality = max(1, min(3, int(asc.get("quality") or 2)))
        new_entry = {
            "id": entry_id,
            "aurora_uuid": asc_uuid,
            "climber": username,
            "climb_uuid": c_uuid,
            "climb_name": c_name,
            "setter": c_setter,
            "angle": angle,
            "v_grade": rated_v,
            "full_grade": rated_g,
            "rated_grade": rated_g,
            "status": "sent",
            "attempts": max(1, tries),
            "quality": quality,
            "date": climbed_at,
            "ig_url": "",
            "notes": asc.get("comment") or f"Synced from Tension App ({angle}° on {layout_name})",
            "on_active_board": on_active_board,
            "on_10x8_spray": on_active_board,
            "layout_name": layout_name,
            "synced_to_tension": True,
        }
        logbook.append(new_entry)
        existing_ids.add(entry_id)
        if asc_uuid:
            existing_aurora_uuids.add(asc_uuid.lower())
        existing_by_key[dedup_key] = new_entry
        added_logs += 1

    # 2. Process Bids (Non-send Attempts)
    for bid in collected.get("bids", []):
        if bid.get("is_listed") is False:
            continue
        bid_uuid = (bid.get("uuid") or "").strip()
        if bid_uuid and bid_uuid.lower() in existing_aurora_uuids:
            continue
        cu_raw = (bid.get("climb_uuid") or "").strip()
        c = climbs_by_lower.get(cu_raw.lower())
        c_info = external_lookup.get(cu_raw.lower(), {})
        if not c and not c_info:
            continue
        angle = int(bid.get("angle") or active_angle)
        climbed_at = (bid.get("climbed_at") or "")[:10] or time.strftime("%Y-%m-%d")
        is_on_board = c is not None
        on_active_board = _matches_active_board(is_on_board, angle)
        c_uuid = c["u"] if c else c_info.get("uuid", cu_raw)
        c_name = c["n"] if c else c_info.get("name", "Tension Climb")
        c_setter = c["s"] if c else c_info.get("setter", "tension")
        layout_name = active_layout_name if is_on_board else c_info.get("layout_name", "Other TB2 Layout")

        entry_id = f"aurora_bid_{bid_uuid or cu_raw}"
        if entry_id in existing_ids:
            continue
        dedup_key = (username.lower(), c_uuid.lower(), climbed_at, "attempt")
        if dedup_key in existing_by_key:
            existing_entry = existing_by_key[dedup_key]
            existing_entry["aurora_uuid"] = bid_uuid
            existing_entry["synced_to_tension"] = True
            existing_entry["on_active_board"] = on_active_board
            existing_entry["on_10x8_spray"] = on_active_board
            existing_entry["layout_name"] = layout_name
            if bid_uuid:
                existing_aurora_uuids.add(bid_uuid.lower())
            continue

        tries = int(bid.get("bid_count") or 1)
        new_entry = {
            "id": entry_id,
            "aurora_uuid": bid_uuid,
            "climber": username,
            "climb_uuid": c_uuid,
            "climb_name": c_name,
            "setter": c_setter,
            "angle": angle,
            "v_grade": c.get("v", "V0") if c else c_info.get("v", "V0"),
            "full_grade": c.get("g", "V0") if c else c_info.get("g", "V0"),
            "status": "attempt",
            "attempts": max(1, tries),
            "date": climbed_at,
            "ig_url": "",
            "notes": bid.get("comment") or "Attempt session synced from Tension app",
            "on_active_board": on_active_board,
            "on_10x8_spray": on_active_board,
            "layout_name": layout_name,
            "synced_to_tension": True,
        }
        logbook.append(new_entry)
        existing_ids.add(entry_id)
        if bid_uuid:
            existing_aurora_uuids.add(bid_uuid.lower())
        existing_by_key[dedup_key] = new_entry
        added_logs += 1

    # 3. Process Follower Notifications (and auto-add followed climbers to watchlist)
    for n in collected.get("notifications", []):
        u_name = ((n.get("user") or {}).get("username") or "").strip()
        if u_name and u_name.lower() != username.lower():
            _ensure_watchlist_user(st, u_name, role="Followed on Tension", is_me=False)

        if n.get("_type") != "ascent":
            continue
        cu_raw = ((n.get("climb") or {}).get("uuid") or "").strip()
        c = climbs_by_lower.get(cu_raw.lower())
        c_info = external_lookup.get(cu_raw.lower(), {})
        if not u_name or (not c and not c_info):
            continue
        is_on_board = c is not None
        angle = int(n.get("angle") or active_angle)
        on_active_board = bool(is_on_board)
        c_uuid = c["u"] if c else c_info.get("uuid", cu_raw)
        c_name = c["n"] if c else c_info.get("name", (n.get("climb") or {}).get("name") or "Tension Climb")
        c_setter = c["s"] if c else c_info.get("setter", "tension")
        layout_name = active_layout_name if is_on_board else c_info.get("layout_name", "Other TB2 Layout")
        climbed_at = (n.get("created_at") or "")[:10] or time.strftime("%Y-%m-%d")
        entry_id = f"aurora_notif_{n.get('uuid', cu_raw)}"
        dedup_key = (u_name.lower(), c_uuid.lower(), climbed_at, "sent")
        if entry_id in existing_ids or dedup_key in existing_by_key:
            existing_entry = existing_by_key.get(dedup_key)
            if existing_entry:
                existing_entry["on_active_board"] = on_active_board
                existing_entry["on_10x8_spray"] = on_active_board
                existing_entry["layout_name"] = layout_name
            continue
        diff = int(round(n.get("difficulty") or (c.get("d") if c else 11) or 10))
        fallback_g = c.get("g", "V0-") if c else c_info.get("g", "V0")
        fallback_v = c.get("v", "V0") if c else c_info.get("v", "V0")
        full_g, v_g = DIFFICULTY_TO_GRADE.get(diff, (fallback_g, fallback_v))
        tries = max(1, int(n.get("bid_count") or n.get("attempt_id") or 1))
        quality = max(1, min(3, int(n.get("quality") or 2)))
        board_note = f"fits {active_layout_name}" if is_on_board else layout_name
        comment_suffix = f' — "{n.get("comment")}"' if n.get("comment") else ""
        new_entry = {
            "id": entry_id,
            "aurora_uuid": n.get("uuid", ""),
            "climber": u_name,
            "climb_uuid": c_uuid,
            "climb_name": c_name,
            "setter": c_setter,
            "angle": angle,
            "v_grade": v_g,
            "full_grade": full_g,
            "rated_grade": full_g,
            "status": "sent",
            "attempts": tries,
            "quality": quality,
            "date": climbed_at,
            "ig_url": "",
            "notes": f"Synced from @{u_name} on Tension App ({angle}° — {board_note}){comment_suffix}",
            "on_active_board": on_active_board,
            "on_10x8_spray": on_active_board,
            "layout_name": layout_name,
            "synced_to_tension": True,
        }
        logbook.append(new_entry)
        existing_ids.add(entry_id)
        existing_by_key[dedup_key] = new_entry
        added_logs += 1

    # Sort logbook newest first
    logbook.sort(key=lambda x: x.get("date", ""), reverse=True)

    # 4. Process Draft Climbs + Circuits into Tension Lists
    lists = st.setdefault("lists", [])
    by_list_id = {lst["id"]: lst for lst in lists if isinstance(lst, dict) and lst.get("id")}

    draft_uuids = []
    draft_items = []
    for dc in collected.get("draft_climbs", []):
        du = (dc.get("uuid") or "").strip()
        if not du:
            continue
        c_act = climbs_by_lower.get(du.lower())
        if c_act:
            draft_uuids.append(c_act["u"])
            draft_items.append({
                "uuid": c_act["u"],
                "name": c_act["n"],
                "setter": c_act["s"],
                "g": c_act.get("g", "V0"),
                "v": c_act.get("v", "V0"),
                "layout_id": active_layout_id,
                "layout_name": active_layout_name,
                "on_active_board": True,
                "on_10x8_spray": True,
                "notes": dc.get("description") or "",
            })
        elif du.lower() in external_lookup:
            ext = dict(external_lookup[du.lower()])
            ext["on_active_board"] = False
            ext["on_10x8_spray"] = False
            ext.setdefault("notes", dc.get("description") or "")
            draft_items.append(ext)
        elif dc.get("name"):
            draft_items.append({
                "uuid": du,
                "name": dc.get("name") or "Draft Climb",
                "setter": username,
                "g": "V0",
                "v": "V0",
                "layout_id": dc.get("layout_id") or active_layout_id,
                "layout_name": active_layout_name if dc.get("layout_id") == active_layout_id else "Tension Draft",
                "on_active_board": False,
                "on_10x8_spray": False,
                "notes": dc.get("description") or "",
            })

    if draft_items:
        if "drafts" not in by_list_id:
            drafts_list = {
                "id": "drafts",
                "name": "Draft Climbs (Synced from Tension App)",
                "icon": "🛠️",
                "color": "#a855f7",
                "description": f"Your unpublished draft climbs synced from Tension Board 2 (@{username})",
                "climb_uuids": [],
                "items": [],
                "is_tension_circuit": True,
            }
            lists.insert(0, drafts_list)
            by_list_id["drafts"] = drafts_list
        for u in draft_uuids:
            if u not in by_list_id["drafts"]["climb_uuids"]:
                by_list_id["drafts"]["climb_uuids"].append(u)
        by_list_id["drafts"]["items"] = draft_items

    synced_circuits = 0
    for cir in collected.get("circuits", []):
        cid = f"circuit_{cir.get('uuid', '')}"
        c_uuids_active = []
        c_items = []
        other_layout_names = set()
        for item in cir.get("climbs", []):
            raw_u = (item.get("climb_uuid") or item.get("uuid") if isinstance(item, dict) else str(item)).strip()
            if not raw_u:
                continue
            if raw_u.lower() in climbs_by_lower:
                c_act = climbs_by_lower[raw_u.lower()]
                c_uuids_active.append(c_act["u"])
                c_items.append({
                    "uuid": c_act["u"],
                    "name": c_act["n"],
                    "setter": c_act["s"],
                    "g": c_act.get("g", "V0"),
                    "v": c_act.get("v", "V0"),
                    "layout_id": active_layout_id,
                    "layout_name": active_layout_name,
                    "on_active_board": True,
                    "on_10x8_spray": True,
                })
            elif raw_u.lower() in external_lookup:
                ext = dict(external_lookup[raw_u.lower()])
                ext["on_active_board"] = False
                ext["on_10x8_spray"] = False
                if ext.get("layout_name"):
                    other_layout_names.add(ext["layout_name"])
                c_items.append(ext)

        n_act = len(c_uuids_active)
        n_tot = len(c_items)
        other_label = ", ".join(sorted(other_layout_names)) if other_layout_names else "other layouts"
        if n_tot == 0:
            layout_summary = "Empty Tension circuit"
        elif n_act == n_tot:
            layout_summary = f"{n_act} on {active_layout_name}"
        elif n_act == 0:
            layout_summary = f"{n_tot} climbs on {other_label}"
        else:
            layout_summary = f"{n_act} on {active_layout_name} · {n_tot - n_act} on {other_label}"

        if cid in by_list_id:
            by_list_id[cid]["name"] = cir.get("name") or by_list_id[cid]["name"]
            by_list_id[cid]["climb_uuids"] = c_uuids_active
            by_list_id[cid]["items"] = c_items
            by_list_id[cid]["description"] = f"Synced from @{username}'s Tension App ({layout_summary})"
        else:
            lists.append({
                "id": cid,
                "aurora_uuid": cir.get("uuid", ""),
                "name": cir.get("name") or "Tension Circuit",
                "icon": "🔗",
                "color": f"#{str(cir.get('color') or '38bdf8').lstrip('#')}",
                "description": f"Synced from @{username}'s Tension App ({layout_summary})",
                "climb_uuids": c_uuids_active,
                "items": c_items,
                "is_tension_circuit": True,
            })
        synced_circuits += 1

    return {"added_logs": added_logs, "synced_circuits": synced_circuits}


def entry_climbed_at_local(entry):
    # Format climbed_at in the user's own OS local timezone (works on Windows/macOS/Linux with zero tzdata)
    existing = (entry.get("climbed_at") or "").strip()
    if len(existing) >= 19:
        return existing[:19]
    now_local = datetime.datetime.now().astimezone()
    local_tz = now_local.tzinfo
    date_part = (entry.get("date") or now_local.strftime("%Y-%m-%d"))[:10]
    time_part = now_local.strftime("%H:%M:%S")
    lid = entry.get("id") or ""
    if lid.startswith("log_"):
        try:
            ms = int(lid.split("_", 1)[1])
            dt_local = datetime.datetime.fromtimestamp(ms / 1000.0, tz=local_tz)
            time_part = dt_local.strftime("%H:%M:%S")
        except Exception:
            pass
    return f"{date_part} {time_part}"


def push_tick_to_aurora(entry):
    """Pushes a send (/ascents/save) or attempt (/bids/save) to tensionboardapp2.com via form POST."""
    sessions = load_sessions()
    climber = (entry.get("climber") or get_primary_user(sessions)).lstrip("@")
    _, sess = _find_session_for_user(sessions, climber)
    if not sess or not sess.get("token") or not sess.get("user_id"):
        return {"pushed": False, "reason": f"No connected Tension session for @{climber}"}

    cfg = load_config()
    token = sess["token"]
    user_id = int(sess["user_id"])
    tick_uuid = (entry.get("aurora_uuid") or entry.get("client_uuid") or uuid.uuid4().hex).strip()
    entry["client_uuid"] = tick_uuid
    climbed_at = entry_climbed_at_local(entry)

    # Prefer explicit user grade rating (sandbag/upgrade) over default climb grade when pushing to Tension
    difficulty = _grade_to_difficulty(
        rated_grade=entry.get("rated_grade") or "",
        full_grade=entry.get("full_grade") or "",
        v_grade=entry.get("v_grade") or "V0",
        default=11,
    )
    tries = max(1, int(entry.get("attempts") or 1))
    quality = max(1, min(3, int(entry.get("quality") if entry.get("quality") is not None else 2)))
    angle = _clamp_angle(entry.get("angle") if entry.get("angle") is not None else cfg["angle"], cfg["angle"])

    try:
        if entry.get("status") == "sent":
            url = f"{TENSION_WEB_HOST}/ascents/save"
            form_fields = {
                "user_id": user_id,
                "uuid": tick_uuid,
                "climb_uuid": entry["climb_uuid"],
                "angle": angle,
                "difficulty": difficulty,
                "is_mirror": 0,
                "attempt_id": 0,
                "bid_count": tries,
                "quality": quality,
                "is_benchmark": 0,
                "comment": entry.get("notes") or "",
                "climbed_at": climbed_at,
            }
        else:
            url = f"{TENSION_WEB_HOST}/bids/save"
            form_fields = {
                "uuid": tick_uuid,
                "user_id": user_id,
                "climb_uuid": entry["climb_uuid"],
                "angle": angle,
                "is_mirror": 0,
                "bid_count": tries,
                "comment": entry.get("notes") or "",
                "climbed_at": climbed_at,
            }

        encoded = urllib.parse.urlencode({k: str(v) for k, v in form_fields.items()}).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=encoded,
            headers={
                "Accept": "application/json",
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent": TENSION_USER_AGENT,
                "Cookie": f"token={token}",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            raw_resp = resp.read().decode("utf-8", "replace")

        saved_uuid = tick_uuid
        if raw_resp.strip():
            resp_json = json.loads(raw_resp)
            if isinstance(resp_json.get("ascents"), list) and resp_json["ascents"]:
                saved_uuid = resp_json["ascents"][0].get("uuid") or tick_uuid
            elif isinstance(resp_json.get("bids"), list) and resp_json["bids"]:
                saved_uuid = resp_json["bids"][0].get("uuid") or tick_uuid
            elif isinstance(resp_json.get("events"), list):
                for ev in resp_json["events"]:
                    obj = ev.get("ascent") or ev.get("bid") or {}
                    if obj.get("uuid"):
                        saved_uuid = obj["uuid"]
                        break

        return {"pushed": True, "aurora_uuid": saved_uuid, "climbed_at": climbed_at}
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", "ignore")[:200]
        return {"pushed": False, "reason": f"HTTP {e.code}: {err_body}"}
    except Exception as e:
        return {"pushed": False, "reason": str(e)}


def push_pending_logs_to_aurora(st, username):
    """Pushes all unsynced local logbook entries for @username up to tensionboardapp2.com."""
    uname_low = username.lstrip("@").lower()
    primary_low = get_primary_user().lstrip("@").lower()
    pushed_count = 0
    failed_count = 0
    errors = []

    for entry in reversed(st.get("logbook", [])):
        entry_user = (entry.get("climber") or primary_low).lstrip("@").lower()
        if entry_user != uname_low and not (entry_user == "me" and uname_low == primary_low):
            continue
        if entry.get("synced_to_tension") or not entry.get("climb_uuid"):
            continue
        if entry_user == "me":
            entry["climber"] = username
        res = push_tick_to_aurora(entry)
        if res.get("pushed"):
            entry["synced_to_tension"] = True
            entry["aurora_uuid"] = res.get("aurora_uuid", "")
            entry["climbed_at"] = res.get("climbed_at", "")
            entry.pop("sync_error", None)
            pushed_count += 1
        else:
            failed_count += 1
            reason = res.get("reason", "Unknown push error")
            entry["sync_error"] = reason
            errors.append(f"{entry.get('climb_name', 'Climb')}: {reason}")

    return {"pushed_logs": pushed_count, "failed_logs": failed_count, "errors": errors}


def probe_video_meta(path):
    ffprobe_bin = find_ffprobe()
    if not ffprobe_bin:
        return {"w": 1080, "h": 1920, "disp_w": 1080, "disp_h": 1920, "rot": 0, "duration": 10.0}
    try:
        out = subprocess.check_output([
            ffprobe_bin, "-v", "error", "-select_streams", "v:0",
            "-show_entries", "stream=width,height,duration:stream_side_data=rotation:format=duration",
            "-of", "json", path,
        ]).decode("utf-8")
        data = json.loads(out)
        st = (data.get("streams") or [{}])[0]
        w = int(st.get("width") or 0)
        h = int(st.get("height") or 0)
        dur = float(st.get("duration") or data.get("format", {}).get("duration") or 0.0)
        rot = 0
        for sd in st.get("side_data_list") or []:
            if "rotation" in sd:
                rot = int(sd["rotation"])
        disp_w, disp_h = (h, w) if abs(rot) == 90 else (w, h)
        return {"w": w, "h": h, "disp_w": disp_w, "disp_h": disp_h, "rot": rot, "duration": dur}
    except Exception:
        return {"w": 1080, "h": 1920, "disp_w": 1080, "disp_h": 1920, "rot": 0, "duration": 10.0}


def render_cropped_clip(input_path, output_path, trim_start, trim_end):
    ffmpeg_bin = find_ffmpeg()
    if not ffmpeg_bin:
        raise RuntimeError("ffmpeg is not installed")
    subprocess.run([
        ffmpeg_bin, "-y", "-ss", f"{trim_start:.2f}",
        "-i", input_path,
        "-t", f"{max(1.0, trim_end - trim_start):.2f}",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "fast",
        "-crf", "20", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart",
        output_path,
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)


def analyze_and_crop_video(input_path, output_path, trim_start=None, trim_end=None):
    meta = probe_video_meta(input_path)
    duration = max(1.0, float(meta.get("duration") or 10.0))

    if trim_start is None:
        trim_start = 0.0
    if trim_end is None:
        trim_end = duration

    trim_start = max(0.0, float(trim_start))
    trim_end = min(duration, max(trim_start + 1.0, float(trim_end)))
    render_cropped_clip(input_path, output_path, trim_start, trim_end)
    return {
        "duration": round(duration, 2),
        "trim_start": round(trim_start, 2),
        "trim_end": round(trim_end, 2),
    }


def _safe_video_path(rel_path):
    """Resolves a relative videos/... URL path safely inside VIDEOS_DIR."""
    clean = urllib.parse.unquote(rel_path or "").replace("\\", "/")
    if clean.startswith("/"):
        clean = clean[1:]
    if clean.startswith("videos/"):
        clean = clean[len("videos/"):]
    parts = [p for p in clean.split("/") if p and p not in (".", "..")]
    candidate = os.path.abspath(os.path.join(VIDEOS_DIR, *parts)) if parts else os.path.abspath(VIDEOS_DIR)
    videos_root = os.path.abspath(VIDEOS_DIR)
    try:
        if os.path.commonpath([videos_root, candidate]) != videos_root:
            return None
    except ValueError:
        return None
    return candidate


def _parse_optional_int(qs, key):
    raw = (qs.get(key) or [""])[0].strip()
    if not raw:
        return None
    try:
        return int(raw)
    except Exception:
        return None


class BoardLabHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=STATIC_DIR, **kwargs)

    def translate_path(self, path):
        parsed = urllib.parse.urlparse(path)
        req_path = parsed.path or "/"
        if req_path == "/videos" or req_path.startswith("/videos/"):
            resolved = _safe_video_path(req_path)
            if resolved is not None:
                return resolved
        return super().translate_path(path)

    def end_headers(self):
        origin = self.headers.get("Origin", "")
        if origin and re.match(r"^https?://(127\.0\.0\.1|localhost)(:\d+)?$", origin):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type, Range")
        self.send_header("Accept-Ranges", "bytes")
        req_path = urllib.parse.urlparse(self.path).path.lower()
        if req_path in ("/", "") or req_path.startswith("/api/") or req_path.endswith((".html", ".css", ".js", ".json")):
            self.send_header("Cache-Control", "no-cache, must-revalidate")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        qs = urllib.parse.parse_qs(parsed.query)

        if parsed.path == "/api/config":
            cfg = load_config()
            self._send_json(200, {
                "ok": True,
                "config": cfg,
                "boards": get_board_configs_list(),
                "capabilities": get_capabilities(),
                "primary_user": get_primary_user(),
            })
            return

        if parsed.path == "/api/catalog":
            cfg = load_config()
            lid = _parse_optional_int(qs, "layout_id")
            sid = _parse_optional_int(qs, "size_id")
            ang = _parse_optional_int(qs, "angle")
            try:
                catalog = get_or_build_catalog(
                    layout_id=lid if lid is not None else cfg["layout_id"],
                    size_id=sid if sid is not None else cfg["size_id"],
                    angle=ang if ang is not None else cfg["angle"],
                )
                catalog = merge_local_drafts_into_catalog(catalog)
                self._send_json(200, catalog)
            except Exception as e:
                self._send_json(500, {"ok": False, "error": str(e)})
            return

        if parsed.path == "/api/leaderboard":
            cfg = load_config()
            lid = _parse_optional_int(qs, "layout_id")
            sid = _parse_optional_int(qs, "size_id")
            ang = _parse_optional_int(qs, "angle")
            try:
                catalog = get_or_build_catalog(
                    layout_id=lid if lid is not None else cfg["layout_id"],
                    size_id=sid if sid is not None else cfg["size_id"],
                    angle=ang if ang is not None else cfg["angle"],
                )
                lb = _normalize_leaderboard(catalog.get("leaderboard"))
                self._send_json(200, lb)
            except Exception:
                self._send_json(200, _normalize_leaderboard({}))
            return

        if parsed.path == "/api/state":
            self._send_json(200, load_state())
            return

        if parsed.path == "/api/ig-video":
            yt_dlp_bin = find_yt_dlp()
            if not yt_dlp_bin:
                self._send_json(503, {
                    "ok": False,
                    "error": "yt-dlp is not installed. Install yt-dlp (e.g. 'brew install yt-dlp' on macOS or 'winget install yt-dlp.yt-dlp' on Windows) to stream Instagram Reels inside TB2 Board Lab.",
                })
                return

            raw_sc = (qs.get("shortcode") or [""])[0]
            climb_name = (qs.get("climb") or [""])[0].strip()
            is_post = (qs.get("post") or [""])[0] == "1"
            sc = re.sub(r"[^A-Za-z0-9_-]", "", raw_sc)
            if not sc:
                self._send_json(400, {"ok": False, "error": "Missing shortcode"})
                return
            ig_cache_dir = os.path.join(VIDEOS_DIR, "ig_cache")
            os.makedirs(ig_cache_dir, exist_ok=True)

            slide_idx = None
            if (is_post or climb_name) and climb_name:
                meta_path = os.path.join(ig_cache_dir, "carousel_meta.json")
                c_meta = {}
                if os.path.isfile(meta_path):
                    try:
                        with open(meta_path, "r", encoding="utf-8") as mf:
                            c_meta = json.load(mf)
                    except Exception:
                        c_meta = {}
                if sc not in c_meta and is_post:
                    try:
                        j_out = subprocess.check_output(
                            [
                                yt_dlp_bin,
                                "--dump-single-json",
                                "--flat-playlist",
                                f"https://www.instagram.com/p/{sc}/",
                            ],
                            stderr=subprocess.DEVNULL,
                            timeout=18,
                            text=True,
                        )
                        jd = json.loads(j_out)
                        c_meta[sc] = {
                            "type": jd.get("_type", "video"),
                            "count": len(jd.get("entries") or []),
                            "description": jd.get("description") or "",
                        }
                        _write_json_atomic(meta_path, c_meta, indent=2)
                    except Exception:
                        pass

                info = c_meta.get(sc)
                if info and info.get("count", 0) > 1:
                    desc = info.get("description") or ""
                    quoted = re.findall(r'[“"「『]([^”"」』]+)[”"」』]', desc)
                    cn_low = climb_name.lower()
                    for idx_1, q_name in enumerate(quoted, 1):
                        if q_name.strip().lower() == cn_low or cn_low in q_name.strip().lower():
                            if idx_1 <= info["count"]:
                                slide_idx = idx_1
                                break

            cache_stem = f"{sc}_s{slide_idx}" if slide_idx else sc
            mp4_path = os.path.join(ig_cache_dir, f"{cache_stem}.mp4")
            if not (os.path.isfile(mp4_path) and os.path.getsize(mp4_path) > 1024):
                try:
                    cmd = [yt_dlp_bin, "-f", "mp4/best"]
                    if slide_idx:
                        cmd += ["--playlist-items", str(slide_idx), "-o", mp4_path, f"https://www.instagram.com/p/{sc}/"]
                    else:
                        cmd += ["--no-playlist", "-o", mp4_path, f"https://www.instagram.com/reel/{sc}/"]
                    subprocess.run(
                        cmd,
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL,
                        timeout=25,
                        check=False,
                    )
                except Exception:
                    pass
            if os.path.isfile(mp4_path) and os.path.getsize(mp4_path) > 1024:
                self.send_response(302)
                self.send_header("Location", f"/videos/ig_cache/{cache_stem}.mp4")
                self.end_headers()
                return
            self._send_json(404, {"ok": False, "error": f"Could not fetch IG Reel {sc}"})
            return

        # Support HTTP Range requests for smooth HTML5 video scrubbing
        range_header = self.headers.get("Range")
        if range_header and parsed.path.lower().endswith((".mp4", ".mov", ".webm", ".m4v")):
            local_path = self.translate_path(parsed.path)
            if os.path.isfile(local_path):
                file_size = os.path.getsize(local_path)
                m = re.match(r"bytes=(\d+)-(\d*)", range_header)
                if m:
                    start = int(m.group(1))
                    end = int(m.group(2)) if m.group(2) else file_size - 1
                    end = min(end, file_size - 1)
                    if 0 <= start <= end:
                        length = end - start + 1
                        ctype = self.guess_type(local_path) or "video/mp4"
                        self.send_response(206)
                        self.send_header("Content-Type", ctype)
                        self.send_header("Content-Range", f"bytes {start}-{end}/{file_size}")
                        self.send_header("Content-Length", str(length))
                        self.end_headers()
                        try:
                            with open(local_path, "rb") as f:
                                f.seek(start)
                                remaining = length
                                while remaining > 0:
                                    chunk = f.read(min(65536, remaining))
                                    if not chunk:
                                        break
                                    self.wfile.write(chunk)
                                    remaining -= len(chunk)
                        except (BrokenPipeError, ConnectionResetError):
                            pass
                        return

        return super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        length = int(self.headers.get("Content-Length", "0"))
        raw_body = self.rfile.read(length) if length > 0 else b"{}"
        try:
            payload = json.loads(raw_body.decode("utf-8"))
            if not isinstance(payload, dict):
                payload = {}
        except Exception:
            payload = {}

        if parsed.path == "/api/config":
            cfg = load_config()
            if "layout_id" in payload and payload["layout_id"] is not None:
                try:
                    cfg["layout_id"] = int(payload["layout_id"])
                except Exception:
                    self._send_json(400, {"ok": False, "error": "Invalid layout_id"})
                    return
            if "size_id" in payload and payload["size_id"] is not None:
                try:
                    cfg["size_id"] = int(payload["size_id"])
                except Exception:
                    self._send_json(400, {"ok": False, "error": "Invalid size_id"})
                    return
            if "angle" in payload and payload["angle"] is not None:
                try:
                    ang = int(round(float(payload["angle"])))
                except Exception:
                    self._send_json(400, {"ok": False, "error": "Invalid angle"})
                    return
                if not (15 <= ang <= 70):
                    self._send_json(400, {"ok": False, "error": "Angle must be between 15 and 70 degrees"})
                    return
                cfg["angle"] = ang
            if "is_adjustable" in payload:
                cfg["is_adjustable"] = bool(payload["is_adjustable"])
            if "setup_complete" in payload:
                cfg["setup_complete"] = bool(payload["setup_complete"])

            saved = save_config(cfg)
            self._send_json(200, {"ok": True, "config": saved, "capabilities": get_capabilities()})
            return

        if parsed.path == "/api/catalog/refresh":
            cfg = load_config()
            lid = int(payload["layout_id"]) if payload.get("layout_id") is not None else cfg["layout_id"]
            sid = int(payload["size_id"]) if payload.get("size_id") is not None else cfg["size_id"]
            ang = _clamp_angle(payload["angle"] if payload.get("angle") is not None else cfg["angle"], cfg["angle"])
            try:
                catalog = get_or_build_catalog(layout_id=lid, size_id=sid, angle=ang, force_refresh=True)
                catalog = merge_local_drafts_into_catalog(catalog)
                self._send_json(200, catalog)
            except Exception as e:
                self._send_json(500, {"ok": False, "error": str(e)})
            return

        if parsed.path == "/api/beta":
            st = load_state()
            cfg = load_config()
            primary_handle = f"@{get_primary_user().lstrip('@')}"
            climb_uuid = payload.get("climb_uuid", "")
            if not climb_uuid:
                self._send_json(400, {"ok": False, "error": "Missing climb_uuid"})
                return
            ig_url = (payload.get("ig_url") or "").strip()
            entry = {
                "id": f"beta_{int(time.time() * 1000)}",
                "climb_uuid": climb_uuid,
                "climber": (payload.get("climber") or primary_handle).strip() or primary_handle,
                "is_mine": bool(payload.get("is_mine", True)),
                "angle": _clamp_angle(payload.get("angle", cfg["angle"]), cfg["angle"]),
                "grade": payload.get("grade", "V0"),
                "title": payload.get("title", "Beta Clip"),
                "ig_url": ig_url,
                "ig_shortcode": extract_ig_shortcode(ig_url),
                "video_src": payload.get("video_src", ""),
                "raw_src": payload.get("raw_src", ""),
                "trim_start": float(payload.get("trim_start", 0.0)),
                "trim_end": float(payload.get("trim_end", 0.0)),
                "caption": payload.get("caption", ""),
                "notes": payload.get("notes", ""),
                "created_at": time.strftime("%Y-%m-%d"),
            }
            st.setdefault("beta_by_climb", {}).setdefault(climb_uuid, []).insert(0, entry)
            save_state(st)
            self._send_json(200, {"ok": True, "entry": entry, "state": load_state()})
            return

        if parsed.path == "/api/log":
            st = load_state()
            cfg = load_config()
            climbs_by_lower, _, _, board_info, _ = get_active_catalog_index(cfg=cfg, st=st)
            active_layout_name = _board_display_name(board_info, cfg["layout_id"], cfg["size_id"])
            primary_user = get_primary_user()

            full_grade = str(payload.get("full_grade") or payload.get("v_grade") or "V0").strip()
            v_grade = str(payload.get("v_grade") or _base_v_grade(full_grade)).strip()
            rated_grade = str(payload.get("rated_grade") or "").strip()
            angle = _clamp_angle(payload.get("angle") if payload.get("angle") is not None else cfg["angle"], cfg["angle"])
            quality = max(1, min(3, int(payload.get("quality") if payload.get("quality") is not None else 2)))
            attempts = max(1, int(payload.get("attempts") or 1))
            status = payload.get("status") if payload.get("status") in ("sent", "attempt") else "sent"
            climb_uuid = str(payload.get("climb_uuid") or "").strip()
            is_on_board = (not climb_uuid) or (climb_uuid.lower() in climbs_by_lower)
            on_active_board = bool(is_on_board and (cfg["is_adjustable"] or angle == cfg["angle"]))

            entry = {
                "id": f"log_{int(time.time() * 1000)}",
                "climber": (payload.get("climber") or primary_user).lstrip("@"),
                "climb_uuid": climb_uuid,
                "climb_name": payload.get("climb_name", ""),
                "setter": payload.get("setter", ""),
                "angle": angle,
                "v_grade": v_grade,
                "full_grade": full_grade,
                "rated_grade": rated_grade,
                "status": status,
                "attempts": attempts,
                "quality": quality,
                "date": (payload.get("date") or time.strftime("%Y-%m-%d"))[:10],
                "ig_url": payload.get("ig_url", ""),
                "notes": payload.get("notes", ""),
                "on_active_board": on_active_board,
                "on_10x8_spray": on_active_board,
                "layout_name": active_layout_name,
                "synced_to_tension": False,
            }
            push_res = {"pushed": False}
            if payload.get("push_to_tension", True) and climb_uuid:
                push_res = push_tick_to_aurora(entry)
                if push_res.get("pushed"):
                    entry["synced_to_tension"] = True
                    entry["aurora_uuid"] = push_res.get("aurora_uuid", "")
                    entry["climbed_at"] = push_res.get("climbed_at", "")

            st.setdefault("logbook", []).insert(0, entry)
            save_state(st)
            self._send_json(200, {"ok": True, "entry": entry, "push": push_res, "state": load_state()})
            return

        if parsed.path == "/api/log/update":
            st = load_state()
            cfg = load_config()
            log_id = (payload.get("log_id") or "").strip()
            target = next((l for l in st.get("logbook", []) if l.get("id") == log_id), None)
            if not target:
                self._send_json(404, {"ok": False, "error": "Log entry not found"})
                return

            if "notes" in payload:
                target["notes"] = str(payload.get("notes") or "").strip()
            if payload.get("attempts") is not None:
                target["attempts"] = max(1, int(payload.get("attempts") or 1))
            if payload.get("status") in ("sent", "attempt"):
                target["status"] = payload["status"]
            if payload.get("date"):
                target["date"] = str(payload["date"])[:10]
            if payload.get("quality") is not None:
                target["quality"] = max(1, min(3, int(payload["quality"])))
            if payload.get("angle") is not None:
                target["angle"] = _clamp_angle(payload["angle"], cfg["angle"])
            if "full_grade" in payload and payload.get("full_grade"):
                target["full_grade"] = str(payload["full_grade"]).strip()
                if not payload.get("v_grade"):
                    target["v_grade"] = _base_v_grade(target["full_grade"])
            if "v_grade" in payload and payload.get("v_grade"):
                target["v_grade"] = str(payload["v_grade"]).strip()
            if "rated_grade" in payload:
                target["rated_grade"] = str(payload.get("rated_grade") or "").strip()

            push_res = {"pushed": False}
            sessions = load_sessions()
            _, matched_sess = _find_session_for_user(sessions, target.get("climber"))
            if matched_sess and payload.get("push_to_tension", True) and target.get("climb_uuid"):
                push_res = push_tick_to_aurora(target)
                if push_res.get("pushed"):
                    target["synced_to_tension"] = True
                    target["aurora_uuid"] = push_res.get("aurora_uuid", target.get("aurora_uuid", ""))
                    if push_res.get("climbed_at"):
                        target["climbed_at"] = push_res["climbed_at"]

            save_state(st)
            self._send_json(200, {"ok": True, "entry": target, "push": push_res, "state": load_state()})
            return

        if parsed.path == "/api/aurora/connect":
            username = (payload.get("username") or "").strip().lstrip("@")
            password = payload.get("password") or ""
            if not username or not password:
                self._send_json(400, {"ok": False, "error": "Username and password required"})
                return
            login_res = aurora_login(username, password)
            if not login_res.get("ok"):
                self._send_json(401, login_res)
                return

            token = login_res["token"]
            user_id = login_res["user_id"]
            sessions = load_sessions()
            is_first_account = len(sessions) == 0 or (next(iter(sessions.keys())).lower() == username.lower())
            sessions[username] = {
                "token": token,
                "user_id": user_id,
                "last_sync": time.strftime("%Y-%m-%d %H:%M"),
            }
            save_sessions(sessions)

            st = load_state()
            cfg = load_config()
            _, _, _, board_info, _ = get_active_catalog_index(cfg=cfg, st=st)
            board_label = _board_display_name(board_info, cfg["layout_id"], cfg["size_id"])
            _ensure_watchlist_user(
                st,
                username,
                role=f"{board_label} @ {cfg['angle']}°" if is_first_account else "Synced Tension Account",
                is_me=is_first_account,
            )

            try:
                collected = aurora_sync_user_tables(username, token, user_id)
                stats = apply_aurora_sync_to_state(st, username, user_id, collected)
                push_stats = push_pending_logs_to_aurora(st, username)
                stats.update(push_stats)
                save_state(st)
                self._send_json(200, {
                    "ok": True,
                    "username": username,
                    "user_id": user_id,
                    "stats": stats,
                    "state": load_state(),
                })
            except Exception as e:
                save_state(st)
                self._send_json(200, {
                    "ok": True,
                    "username": username,
                    "user_id": user_id,
                    "warning": str(e),
                    "state": load_state(),
                })
            return

        if parsed.path == "/api/aurora/disconnect":
            sessions = load_sessions()
            target_u = (payload.get("username") or "").strip().lstrip("@")
            removed = []
            if payload.get("all") or (not target_u and len(sessions) == 1):
                removed = list(sessions.keys())
                sessions = {}
            elif target_u:
                for k in list(sessions.keys()):
                    if k.lower() == target_u.lower():
                        sessions.pop(k, None)
                        removed.append(k)
            save_sessions(sessions)
            self._send_json(200, {
                "ok": True,
                "disconnected": removed,
                "state": load_state(),
            })
            return

        if parsed.path == "/api/aurora/sync":
            sessions = load_sessions()
            if not sessions:
                self._send_json(400, {"ok": False, "error": "No Tension account connected yet."})
                return
            st = load_state()
            total_added = 0
            total_pushed = 0
            total_failed = 0
            total_circuits = 0
            push_errors = []
            for uname, info in sessions.items():
                try:
                    collected = aurora_sync_user_tables(uname, info["token"], info["user_id"])
                    res = apply_aurora_sync_to_state(st, uname, info["user_id"], collected)
                    total_added += res["added_logs"]
                    total_circuits += res["synced_circuits"]
                except Exception as e:
                    push_errors.append(f"Pull @{uname}: {e}")
                p_res = push_pending_logs_to_aurora(st, uname)
                total_pushed += p_res["pushed_logs"]
                total_failed += p_res["failed_logs"]
                push_errors.extend(p_res["errors"])
                info["last_sync"] = time.strftime("%Y-%m-%d %H:%M")
            save_sessions(sessions)
            save_state(st)
            self._send_json(200, {
                "ok": True,
                "pushed_logs": total_pushed,
                "failed_logs": total_failed,
                "push_errors": push_errors,
                "added_logs": total_added,
                "synced_circuits": total_circuits,
                "state": load_state(),
            })
            return

        if parsed.path == "/api/lists":
            st = load_state()
            cfg = load_config()
            climbs_by_lower, _, _, board_info, _ = get_active_catalog_index(cfg=cfg, st=st)
            active_layout_name = _board_display_name(board_info, cfg["layout_id"], cfg["size_id"])
            action = payload.get("action", "toggle_climb")
            lists = st.setdefault("lists", [])

            if action == "create":
                name = (payload.get("name") or "").strip()
                if name:
                    new_list = {
                        "id": f"list_{int(time.time() * 1000)}",
                        "name": name,
                        "icon": payload.get("icon") or "📌",
                        "color": payload.get("color") or "#38bdf8",
                        "description": payload.get("description") or f"Custom {active_layout_name} list",
                        "climb_uuids": [],
                        "items": [],
                    }
                    lists.append(new_list)
            elif action == "delete":
                lid = payload.get("list_id")
                st["lists"] = [l for l in lists if l.get("id") != lid]
            elif action == "toggle_climb":
                lid = payload.get("list_id")
                cu = payload.get("climb_uuid")
                for l in lists:
                    if l.get("id") == lid and cu:
                        l.setdefault("climb_uuids", [])
                        if cu in l["climb_uuids"]:
                            l["climb_uuids"].remove(cu)
                            l["items"] = [it for it in l.get("items", []) if it.get("uuid", "").lower() != cu.lower()]
                        else:
                            l["climb_uuids"].insert(0, cu)
                            c_act = climbs_by_lower.get(cu.lower())
                            if c_act:
                                l.setdefault("items", []).insert(0, {
                                    "uuid": c_act["u"],
                                    "name": c_act["n"],
                                    "setter": c_act["s"],
                                    "g": c_act.get("g", "V0"),
                                    "v": c_act.get("v", "V0"),
                                    "layout_id": cfg["layout_id"],
                                    "layout_name": active_layout_name,
                                    "on_active_board": True,
                                    "on_10x8_spray": True,
                                })
                        break

            save_state(st)
            self._send_json(200, {"ok": True, "state": load_state()})
            return

        if parsed.path == "/api/draft-climb":
            st = load_state()
            cfg = load_config()
            _, _, _, board_info, _ = get_active_catalog_index(cfg=cfg, st=st)
            active_layout_name = _board_display_name(board_info, cfg["layout_id"], cfg["size_id"])
            active_angle = _clamp_angle(payload.get("angle", cfg["angle"]), cfg["angle"])
            primary_user = get_primary_user()

            name = (payload.get("name") or "Untitled Draft").strip()
            v_grade = str(payload.get("v_grade") or "V2").strip()
            full_grade = str(payload.get("full_grade") or v_grade).strip()
            holds = payload.get("holds") or []
            notes = payload.get("notes") or f"Draft climb set on {active_layout_name}"
            setter = (payload.get("setter") or primary_user).lstrip("@")
            is_draft = bool(payload.get("is_draft", True))

            new_uuid = uuid.uuid4().hex
            frames = "".join(f"p{pid}r{role}" for pid, role in holds)

            sessions = load_sessions()
            _, sess = _find_session_for_user(sessions, setter)
            pushed_to_tension = False
            if payload.get("push_to_tension") and sess and sess.get("token"):
                try:
                    req = urllib.request.Request(
                        f"{TENSION_WEB_HOST}/climbs/save",
                        data=json.dumps({
                            "uuid": new_uuid,
                            "layout_id": cfg["layout_id"],
                            "setter_id": sess["user_id"],
                            "name": name,
                            "description": notes,
                            "is_draft": is_draft,
                            "frames_count": 1,
                            "frames_pace": 0,
                            "frames": frames,
                            "angle": active_angle,
                        }).encode("utf-8"),
                        headers={
                            "Accept": "application/json",
                            "Content-Type": "application/json",
                            "User-Agent": TENSION_USER_AGENT,
                            "Cookie": f"token={sess['token']}",
                        },
                        method="PUT",
                    )
                    with urllib.request.urlopen(req, timeout=12) as r:
                        r.read()
                    pushed_to_tension = True
                except Exception:
                    pass

            diff_id = _grade_to_difficulty(full_grade=full_grade, v_grade=v_grade, default=15)
            new_climb = {
                "u": new_uuid,
                "n": name,
                "s": setter,
                "a": active_angle,
                "sa": active_angle,
                "g": full_grade,
                "vf": full_grade,
                "v": _base_v_grade(v_grade),
                "d": diff_id,
                "a45": 0,
                "a40": 0,
                "a50": 0,
                "at": 0,
                "q": 3.0,
                "b": 0,
                "cl45": False,
                "cladj": False,
                "src": "draft",
                "adj": "",
                "h": holds,
                "layout_id": cfg["layout_id"],
                "size_id": cfg["size_id"],
                "is_draft": is_draft,
                "notes": notes,
                "pushed_to_tension": pushed_to_tension,
            }

            lists = st.setdefault("lists", [])
            drafts_list = next((lst for lst in lists if lst.get("id") == "drafts"), None)
            if drafts_list is None:
                drafts_list = {
                    "id": "drafts",
                    "name": "Draft Climbs",
                    "icon": "🛠️",
                    "color": "#a855f7",
                    "description": f"Draft climbs created on {active_layout_name}",
                    "climb_uuids": [],
                    "items": [],
                    "is_tension_circuit": True,
                }
                lists.insert(0, drafts_list)
            drafts_list.setdefault("climb_uuids", []).insert(0, new_uuid)
            drafts_list.setdefault("items", []).insert(0, {
                "uuid": new_uuid,
                "name": name,
                "setter": setter,
                "g": full_grade,
                "v": _base_v_grade(v_grade),
                "layout_id": cfg["layout_id"],
                "layout_name": active_layout_name,
                "on_active_board": True,
                "on_10x8_spray": True,
                "notes": notes,
            })

            st.setdefault("draft_climbs", []).insert(0, new_climb)
            save_state(st)
            self._send_json(200, {
                "ok": True,
                "climb": new_climb,
                "pushed_to_tension": pushed_to_tension,
                "state": load_state(),
            })
            return

        if parsed.path == "/api/watchlist":
            st = load_state()
            wl = st.setdefault("watchlist", [])
            action = payload.get("action", "add")
            uname = (payload.get("username") or "").strip().lstrip("@")
            if action == "add" and uname:
                _ensure_watchlist_user(st, uname, role=payload.get("role") or "Tracked Climber", is_me=False)
            elif action == "remove" and uname:
                st["watchlist"] = [w for w in wl if w.get("username", "").lower() != uname.lower() or w.get("is_me")]
            save_state(st)
            self._send_json(200, {"ok": True, "state": load_state()})
            return

        if parsed.path == "/api/upload-video":
            if not (find_ffmpeg() and find_ffprobe()):
                self._send_json(400, {
                    "ok": False,
                    "error": "ffmpeg and ffprobe are required for video trimming. Install ffmpeg (e.g. 'brew install ffmpeg' on macOS or 'winget install Gyan.FFmpeg' on Windows) and restart TB2 Board Lab.",
                })
                return

            cfg = load_config()
            primary_handle = f"@{get_primary_user().lstrip('@')}"
            climb_uuid = payload.get("climb_uuid", "")
            climb_name = payload.get("climb_name") or "Climb"
            v_grade = payload.get("v_grade", "V0")
            angle = _clamp_angle(payload.get("angle", cfg["angle"]), cfg["angle"])
            trim_start = payload.get("trim_start")
            trim_end = payload.get("trim_end")
            b64_data = payload.get("video_base64", "")
            source_video = (payload.get("source_video") or "").strip()

            ts_id = int(time.time() * 1000)
            if b64_data:
                if "," in b64_data:
                    b64_data = b64_data.split(",", 1)[1]
                raw_filename = f"raw_upload_{ts_id}.mp4"
                raw_path = os.path.join(VIDEOS_DIR, raw_filename)
                with open(raw_path, "wb") as f:
                    f.write(base64.b64decode(b64_data))
                rel_raw = f"videos/{raw_filename}"
            elif source_video:
                raw_path = _safe_video_path(source_video)
                if not raw_path or not os.path.isfile(raw_path):
                    self._send_json(400, {"ok": False, "error": "Source video not found in user_data/videos"})
                    return
                rel_raw = source_video if source_video.startswith("videos/") else f"videos/{os.path.basename(raw_path)}"
            else:
                self._send_json(400, {"ok": False, "error": "No video file provided"})
                return

            crop_filename = f"cropped_{ts_id}.mp4"
            crop_path = os.path.join(VIDEOS_DIR, crop_filename)
            info = analyze_and_crop_video(raw_path, crop_path, trim_start, trim_end)
            caption = f'"{climb_name}" @ {angle}° on the Tension Board. @tensionclimbing #tensionboard #climbing #bouldering {v_grade}'
            rel_crop = f"videos/{crop_filename}"

            if payload.get("save_to_climb") and climb_uuid:
                st = load_state()
                entry = {
                    "id": f"beta_upload_{ts_id}",
                    "climb_uuid": climb_uuid,
                    "climber": f"{primary_handle} (Uploaded Clip)",
                    "is_mine": True,
                    "angle": angle,
                    "grade": v_grade,
                    "title": payload.get("title") or f"{climb_name} — Uploaded Clip ({round(info['trim_end'] - info['trim_start'], 1)}s)",
                    "ig_url": "",
                    "ig_shortcode": "",
                    "video_src": rel_crop,
                    "raw_src": rel_raw,
                    "trim_start": info["trim_start"],
                    "trim_end": info["trim_end"],
                    "caption": caption,
                    "notes": payload.get("notes", "Uploaded & trimmed session clip"),
                    "created_at": time.strftime("%Y-%m-%d"),
                }
                st.setdefault("beta_by_climb", {}).setdefault(climb_uuid, []).insert(0, entry)
                save_state(st)

            self._send_json(200, {
                "ok": True,
                "raw_src": rel_raw,
                "video_src": rel_crop,
                "duration": info["duration"],
                "trim_start": info["trim_start"],
                "trim_end": info["trim_end"],
                "caption": caption,
                "state": load_state() if payload.get("save_to_climb") else None,
            })
            return

        self._send_json(404, {"ok": False, "error": "Unknown endpoint"})

    def _send_json(self, status, obj):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


class ThreadingTCPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    allow_reuse_address = True
    daemon_threads = True


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description="TB2 Board Lab local web server")
    parser.add_argument("--host", default=DEFAULT_HOST, help=f"Bind address (default: {DEFAULT_HOST}; use 0.0.0.0 for LAN)")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help=f"HTTP port (default: {DEFAULT_PORT})")
    parser.add_argument("--open-browser", action="store_true", help="Open TB2 Board Lab automatically in your browser")
    parser.add_argument("--no-browser", action="store_true", help="Do not automatically open the browser")
    parser.add_argument("--data-dir", default=None, help="Override path for user_data directory")
    return parser.parse_args(argv)


def main(argv=None):
    args = parse_args(argv)
    if args.data_dir:
        configure_paths(args.data_dir)

    display_host = "127.0.0.1" if args.host in ("0.0.0.0", "::", "") else args.host
    url = f"http://{display_host}:{args.port}"
    should_open = (args.open_browser or IS_FROZEN) and not args.no_browser

    try:
        server = ThreadingTCPServer((args.host, args.port), BoardLabHandler)
    except OSError as e:
        # If TB2 Board Lab is already running on this port, open the browser to it instead of crashing
        try:
            with urllib.request.urlopen(f"{url}/api/config", timeout=2) as resp:
                if resp.status == 200:
                    print(f"TB2 Board Lab is already running at {url}")
                    if should_open:
                        webbrowser.open(url)
                    return
        except Exception:
            pass
        print(f"Error: Could not bind {args.host}:{args.port} ({e}). Try --port 8856.")
        sys.exit(1)

    caps = get_capabilities()

    print(f"TB2 Board Lab running at {url}")
    print(f"User data directory: {USER_DATA_DIR}")
    print(f"Optional tools: ffmpeg={'ready' if caps['ffmpeg'] else 'not found'}, yt-dlp={'ready' if caps['yt_dlp'] else 'not found'}")
    print("Press Ctrl+C to stop.")

    if should_open:
        def _open():
            time.sleep(0.6)
            try:
                webbrowser.open(url)
            except Exception:
                pass
        threading.Thread(target=_open, daemon=True).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down TB2 Board Lab...")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
