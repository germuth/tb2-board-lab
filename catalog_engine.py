"""Multi-Board Catalog & Board Asset Engine for TB2 Board Lab.

Pure Python stdlib module powering dynamic catalog generation, board geometry,
Boardsesh snapshot downloads, and Multi-Angle Weighted Consensus + Multi-Classic
Interpolation across all 8 Tension Board 2 configurations (Spray & Mirror ×
10×8, 12×8, 10×12, 12×12) at any angle from 15° to 70°.
"""

import gzip
import json
import math
import os
import re
import sqlite3
import time
import urllib.request

# Empirical TB2 steepness scaling (~1.0 French difficulty unit per +5°).
DIFF_STEP_PER_5_DEG = 1.00

BOARDSESH_MANIFEST_URL = (
    "https://snapshots.boardsesh.com/board-snapshots/v1-gzip/manifest.json"
)
BOARDSESH_USER_AGENT = "Mozilla/5.0 (compatible; TB2BoardLab/1.0)"

# Bump whenever the cached catalog JSON structure changes.
CATALOG_SCHEMA_VERSION = 1

_FRAME_RE = re.compile(r"p(\d+)r(\d+)")
_NO_MATCH_PREFIX_RE = re.compile(r"(?i)^no\s+matching\.?\s*")

# In-process caches to keep repeat API reads near-instant.
_HOLDS_FILE_CACHE = {}
_CATALOG_MEM_CACHE = {}

# All 8 Tension Board 2 configurations keyed by (layout_id, size_id).
# Layout 11 = Spray, Layout 10 = Mirror.
# Sizes: 9 = 10×8, 8 = 12×8, 7 = 10×12, 6 = 12×12.
BOARD_CONFIGS = {
    (11, 9): {
        "layout_id": 11,
        "size_id": 9,
        "label": "10×8 Spray",
        "layout_name": "Spray",
        "size_name": "10×8",
        "edges": {"left": -44, "right": 44, "bottom": 0, "top": 120},
        "width": 1080,
        "height": 1473,
        "col_min": -5,
        "col_max": 5,
        "row_min": 1,
        "row_max": 15,
        "layers": [
            "assets/boards/8x10-tb2-wood.webp",
            "assets/boards/8x10-tb2-plastic.webp",
        ],
        "has_3d_render": True,
        "render_img": "assets/boards/board_render_10x8_spray.png",
    },
    (11, 8): {
        "layout_id": 11,
        "size_id": 8,
        "label": "12×8 Spray",
        "layout_name": "Spray",
        "size_name": "12×8",
        "edges": {"left": -44, "right": 44, "bottom": 0, "top": 144},
        "width": 1080,
        "height": 1767,
        "col_min": -5,
        "col_max": 5,
        "row_min": 1,
        "row_max": 18,
        "layers": [
            "assets/boards/8x12-tb2-wood.webp",
            "assets/boards/8x12-tb2-plastic.webp",
        ],
        "has_3d_render": False,
        "render_img": None,
    },
    (11, 7): {
        "layout_id": 11,
        "size_id": 7,
        "label": "10×12 Spray",
        "layout_name": "Spray",
        "size_name": "10×12",
        "edges": {"left": -68, "right": 68, "bottom": 0, "top": 120},
        "width": 1080,
        "height": 953,
        "col_min": -8,
        "col_max": 8,
        "row_min": 1,
        "row_max": 15,
        "layers": [
            "assets/boards/12x10-tb2-wood.webp",
            "assets/boards/12x10-tb2-plastic.webp",
        ],
        "has_3d_render": False,
        "render_img": None,
    },
    (11, 6): {
        "layout_id": 11,
        "size_id": 6,
        "label": "12×12 Spray",
        "layout_name": "Spray",
        "size_name": "12×12",
        "edges": {"left": -68, "right": 68, "bottom": 0, "top": 144},
        "width": 1080,
        "height": 1144,
        "col_min": -8,
        "col_max": 8,
        "row_min": 1,
        "row_max": 18,
        "layers": [
            "assets/boards/12x12-tb2-wood.webp",
            "assets/boards/12x12-tb2-plastic.webp",
        ],
        "has_3d_render": False,
        "render_img": None,
    },
    (10, 9): {
        "layout_id": 10,
        "size_id": 9,
        "label": "10×8 Mirror",
        "layout_name": "Mirror",
        "size_name": "10×8",
        "edges": {"left": -44, "right": 44, "bottom": 0, "top": 120},
        "width": 1080,
        "height": 1473,
        "col_min": -5,
        "col_max": 5,
        "row_min": 1,
        "row_max": 15,
        "layers": [
            "assets/boards/27.webp",
            "assets/boards/28.webp",
        ],
        "has_3d_render": False,
        "render_img": None,
    },
    (10, 8): {
        "layout_id": 10,
        "size_id": 8,
        "label": "12×8 Mirror",
        "layout_name": "Mirror",
        "size_name": "12×8",
        "edges": {"left": -44, "right": 44, "bottom": 0, "top": 144},
        "width": 1080,
        "height": 1767,
        "col_min": -5,
        "col_max": 5,
        "row_min": 1,
        "row_max": 18,
        "layers": [
            "assets/boards/25.webp",
            "assets/boards/26.webp",
        ],
        "has_3d_render": False,
        "render_img": None,
    },
    (10, 7): {
        "layout_id": 10,
        "size_id": 7,
        "label": "10×12 Mirror",
        "layout_name": "Mirror",
        "size_name": "10×12",
        "edges": {"left": -68, "right": 68, "bottom": 0, "top": 120},
        "width": 1080,
        "height": 953,
        "col_min": -8,
        "col_max": 8,
        "row_min": 1,
        "row_max": 15,
        "layers": [
            "assets/boards/23.webp",
            "assets/boards/24-2.webp",
        ],
        "has_3d_render": False,
        "render_img": None,
    },
    (10, 6): {
        "layout_id": 10,
        "size_id": 6,
        "label": "12×12 Mirror",
        "layout_name": "Mirror",
        "size_name": "12×12",
        "edges": {"left": -68, "right": 68, "bottom": 0, "top": 144},
        "width": 1080,
        "height": 1144,
        "col_min": -8,
        "col_max": 8,
        "row_min": 1,
        "row_max": 18,
        "layers": [
            "assets/boards/21-2.webp",
            "assets/boards/22-2.webp",
        ],
        "has_3d_render": False,
        "render_img": None,
    },
}

_BOARD_ORDER = [
    (11, 9),
    (11, 8),
    (11, 7),
    (11, 6),
    (10, 9),
    (10, 8),
    (10, 7),
    (10, 6),
]


def get_board_config(layout_id: int, size_id: int) -> dict:
    """Return a copy of the board configuration for (layout_id, size_id)."""
    key = (int(layout_id), int(size_id))
    if key not in BOARD_CONFIGS:
        raise ValueError(
            f"Unsupported TB2 board configuration: layout_id={layout_id}, size_id={size_id}"
        )
    cfg = BOARD_CONFIGS[key]
    return {
        **cfg,
        "edges": dict(cfg["edges"]),
        "layers": list(cfg["layers"]),
    }


def get_board_configs_list() -> list:
    """Return a JSON-serializable list of all 8 TB2 board configurations."""
    return [get_board_config(lid, sid) for lid, sid in _BOARD_ORDER]


def diff_float_to_grade(d_val: float):
    """Map continuous Tension difficulty (10.0..33.0) to (full_grade, base_v_str, v_num, int_diff_id).

    In Tension's boulder_grades table:
      10 = 4a/V0 (V0-)
      11 = 4b/V0 (V0)
      12 = 4c/V0 (V0+)
      13 = 5a/V1 (V1 — Official Tension V1 Benchmark)
      14 = 5b/V1 (V1+)
      15 = 5c/V2 (V2; 14.6..14.85 -> V2-, 15.35..15.75 -> V2+)
      16 = 6a/V3 (V3- / V3)
      17 = 6a+/V3 (V3+)
      18 = 6b/V4 (V4)
      19 = 6b+/V4 (V4+)
      20 = 6c/V5 (V5)
      21 = 6c+/V5 (V5+)
      22 = 7a/V6 (V6)
      23 = 7a+/V7 (V7)
      24 = 7b/V8 (V8)
      25 = 7b+/V8 (V8+)
      26 = 7c/V9 (V9)
      27 = 7c+/V10 (V10)
    """
    if d_val is None:
        return ("V0", "V0", 0, 11)
    d = float(d_val)
    if d < 10.5:
        return ("V0-", "V0", 0, 10)
    if d < 11.5:
        return ("V0", "V0", 0, 11)
    if d < 12.45:
        return ("V0+", "V0", 0, 12)
    if d < 12.85:
        return ("V1-", "V1", 1, 13)
    if d < 13.55:
        return ("V1", "V1", 1, 13)
    if d < 14.45:
        return ("V1+", "V1", 1, 14)
    if d < 14.85:
        return ("V2-", "V2", 2, 15)
    if d < 15.35:
        return ("V2", "V2", 2, 15)
    if d < 15.85:
        return ("V2+", "V2", 2, 15)
    if d < 16.35:
        return ("V3-", "V3", 3, 16)
    if d < 16.85:
        return ("V3", "V3", 3, 16)
    if d < 17.55:
        return ("V3+", "V3", 3, 17)
    if d < 18.55:
        return ("V4", "V4", 4, 18)
    if d < 19.55:
        return ("V4+", "V4", 4, 19)
    if d < 20.55:
        return ("V5", "V5", 5, 20)
    if d < 21.55:
        return ("V5+", "V5", 5, 21)
    if d < 22.40:
        return ("V6", "V6", 6, 22)
    if d < 22.75:
        return ("V6+", "V6", 6, 22)
    if d < 23.55:
        return ("V7", "V7", 7, 23)
    if d < 24.55:
        return ("V8", "V8", 8, 24)
    if d < 25.55:
        return ("V8+", "V8", 8, 25)
    if d < 26.55:
        return ("V9", "V9", 9, 26)
    vn = min(16, max(10, int(round(d)) - 17))
    return (f"V{vn}", f"V{vn}", vn, int(round(d)))


def ensure_layout_db(
    layout_id: int, cache_dir: str, force_refresh: bool = False
) -> str:
    """Ensure the Boardsesh SQLite snapshot for a TB2 layout exists locally.

    Downloads the gzipped SQLite snapshot listed in Boardsesh's manifest when
    missing or when force_refresh=True, decompressing atomically via a temp file.
    """
    lid = int(layout_id)
    if lid not in (10, 11):
        raise ValueError(f"Unsupported TB2 layout_id={layout_id}; expected 10 or 11")

    os.makedirs(cache_dir, exist_ok=True)
    db_path = os.path.join(cache_dir, f"tb2_layout_{lid}.db")
    if not force_refresh and os.path.exists(db_path) and os.path.getsize(db_path) > 0:
        return db_path

    # Fetch Boardsesh snapshot manifest.
    manifest_req = urllib.request.Request(
        BOARDSESH_MANIFEST_URL,
        headers={"User-Agent": BOARDSESH_USER_AGENT},
    )
    with urllib.request.urlopen(manifest_req, timeout=30) as resp:
        manifest = json.loads(resp.read().decode("utf-8"))

    entries = manifest.get("entries", []) if isinstance(manifest, dict) else manifest
    target_entry = None
    for entry in entries:
        if (
            isinstance(entry, dict)
            and entry.get("boardType") == "tension"
            and int(entry.get("layoutId", -1)) == lid
        ):
            target_entry = entry
            break

    if not target_entry or not target_entry.get("url"):
        raise RuntimeError(
            f"Could not find tension layout_id={lid} in Boardsesh manifest"
        )

    db_url = target_entry["url"]
    tmp_path = f"{db_path}.{os.getpid()}.{int(time.time() * 1000)}.tmp"
    try:
        db_req = urllib.request.Request(
            db_url,
            headers={"User-Agent": BOARDSESH_USER_AGENT},
        )
        with urllib.request.urlopen(db_req, timeout=120) as resp:
            raw = resp.read()

        # Handle gzip-compressed payload (standard) or raw SQLite defensively.
        if raw[:2] == b"\x1f\x8b":
            decompressed = gzip.decompress(raw)
        else:
            decompressed = raw

        if not decompressed.startswith(b"SQLite format 3\x00"):
            raise RuntimeError(
                f"Downloaded snapshot for layout {lid} is not a valid SQLite file"
            )

        with open(tmp_path, "wb") as out_f:
            out_f.write(decompressed)
        os.replace(tmp_path, db_path)
    except Exception:
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError:
                pass
        raise

    return db_path


def _load_all_holds(holds_catalog_path: str) -> dict:
    """Load holds_all_tb2.json with mtime-based in-memory caching."""
    abs_path = os.path.abspath(holds_catalog_path)
    mtime = os.path.getmtime(abs_path)
    cached = _HOLDS_FILE_CACHE.get(abs_path)
    if cached and cached[0] == mtime:
        return cached[1]
    with open(abs_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    _HOLDS_FILE_CACHE[abs_path] = (mtime, data)
    return data


def get_holds_for_board(
    layout_id: int, size_id: int, holds_catalog_path: str
) -> list:
    """Return holds for (layout_id, size_id) with exact Boardsesh percentage coords."""
    cfg = get_board_config(layout_id, size_id)
    edges = cfg["edges"]
    el = edges["left"]
    er = edges["right"]
    eb = edges["bottom"]
    et = edges["top"]
    span_x = float(er - el)
    span_y = float(et - eb)

    all_holds = _load_all_holds(holds_catalog_path)
    layout_holds = all_holds.get(str(int(layout_id)), [])

    result = []
    for h in layout_holds:
        x_in = h["x_in"]
        y_in = h["y_in"]
        if el < x_in < er and eb < y_in < et:
            item = dict(h)
            item["x_pct"] = round((x_in - el) / span_x * 100.0, 3)
            item["y_pct"] = round((et - y_in) / span_y * 100.0, 3)
            result.append(item)
    return result


def _parse_compatible_sizes(raw_compat) -> set:
    """Parse compatible_size_ids JSON array into a set of integer size IDs."""
    if not raw_compat:
        return set()
    try:
        vals = json.loads(raw_compat)
        if isinstance(vals, list):
            return {int(v) for v in vals}
    except (ValueError, TypeError):
        pass
    return set()


def _infer_layout_size_label(layout_id: int, compat_sizes: set) -> str:
    """Infer a concise human-readable board label (smallest compatible size + layout)."""
    layout_name = "Spray" if int(layout_id) == 11 else (
        "Mirror" if int(layout_id) == 10 else f"Layout {layout_id}"
    )
    for sid, sname in ((9, "10×8"), (8, "12×8"), (7, "10×12"), (6, "12×12")):
        if sid in compat_sizes:
            return f"{sname} {layout_name}"
    return layout_name


def build_board_catalog(
    layout_id: int,
    size_id: int,
    target_angle: int,
    cache_dir: str,
    holds_catalog_path: str,
    force_rebuild: bool = False,
) -> dict:
    """Build (or load cached) catalog for any TB2 board configuration and angle.

    Applies the Multi-Angle Weighted Consensus + Multi-Classic Interpolation
    algorithm generalized to any target_angle in 15..70, and computes a dynamic
    FA & setter leaderboard for the selected board.
    """
    lid = int(layout_id)
    sid = int(size_id)
    t_ang = int(target_angle)
    if t_ang < 15 or t_ang > 70:
        raise ValueError(f"target_angle must be between 15 and 70, got {target_angle}")

    board_cfg = get_board_config(lid, sid)
    db_path = ensure_layout_db(lid, cache_dir)
    db_mtime = os.path.getmtime(db_path)
    holds_mtime = os.path.getmtime(holds_catalog_path)

    mem_key = (lid, sid, t_ang)
    if not force_rebuild:
        mem_hit = _CATALOG_MEM_CACHE.get(mem_key)
        if mem_hit and mem_hit[0] == (db_mtime, holds_mtime, CATALOG_SCHEMA_VERSION):
            return mem_hit[1]

    os.makedirs(cache_dir, exist_ok=True)
    cache_path = os.path.join(cache_dir, f"catalog_l{lid}_s{sid}_a{t_ang}.json")
    if not force_rebuild and os.path.exists(cache_path):
        try:
            with open(cache_path, "r", encoding="utf-8") as f:
                cached = json.load(f)
            cmeta = cached.get("_cache_meta", {})
            if (
                cmeta.get("db_mtime") == db_mtime
                and cmeta.get("holds_mtime") == holds_mtime
                and cmeta.get("schema_version") == CATALOG_SCHEMA_VERSION
            ):
                _CATALOG_MEM_CACHE[mem_key] = (
                    (db_mtime, holds_mtime, CATALOG_SCHEMA_VERSION),
                    cached,
                )
                return cached
        except (OSError, ValueError, TypeError):
            pass

    holds = get_holds_for_board(lid, sid, holds_catalog_path)
    valid_pids = {h["placement_id"] for h in holds}

    lo_angle = max(15, t_ang - 5)
    hi_angle = min(70, t_ang + 5)
    has_lo = lo_angle != t_ang
    has_hi = hi_angle != t_ang
    nearby_angles = {t_ang}
    if has_lo:
        nearby_angles.add(lo_angle)
    if has_hi:
        nearby_angles.add(hi_angle)

    conn = sqlite3.connect(db_path)
    try:
        cur = conn.cursor()

        # Load per-angle climb stats across the layout.
        cur.execute(
            """
            SELECT climb_uuid, angle, ascensionist_count, difficulty_average,
                   quality_average, fa_username, fa_at, benchmark_difficulty
            FROM board_climb_stats
            """
        )
        stats_by_uuid = {}
        for u, ang, asc, diff, qual, fa_u, fa_at, bench in cur.fetchall():
            if u not in stats_by_uuid:
                stats_by_uuid[u] = {}
            is_bm = 1 if (bench is not None and float(bench) > 0) else 0
            # Use benchmark_difficulty when present and higher than raw difficulty_average.
            raw_d = float(diff) if diff is not None else 11.0
            if is_bm and float(bench) > raw_d:
                raw_d = float(bench)
            full_g, base_v, vn, diff_id = diff_float_to_grade(raw_d)
            fa_at_full = str(fa_at).strip() if fa_at else ""
            stats_by_uuid[u][int(ang)] = {
                "a": int(ang),
                "asc": int(asc or 0),
                "q": round(float(qual), 2) if qual is not None else 3.0,
                "d_raw": round(raw_d, 3),
                "d": diff_id,
                "g": full_g,
                "v": base_v,
                "vn": vn,
                "fa_u": (fa_u or "").strip(),
                "fa_at": fa_at_full[:7] if fa_at_full else "",
                "fa_at_full": fa_at_full,
                "bm": is_bm,
            }

        # Filter climbs belonging to this layout, listed, and compatible with size_id.
        cur.execute(
            """
            SELECT uuid, name, setter_username, description, frames, angle,
                   characteristics, compatible_size_ids
            FROM board_climbs
            WHERE layout_id = ?
              AND is_listed = 1
              AND (is_draft = 0 OR is_draft IS NULL)
            """,
            (lid,),
        )
        raw_climbs = cur.fetchall()
    finally:
        conn.close()

    climbs = []
    monotonic_fixed_count = 0

    # Dynamic leaderboard accumulators scoped to climbs on this board.
    fa_acc = {}
    setter_acc = {}

    for u, name, setter, desc, frames, setter_angle, chars, compat_json in raw_climbs:
        compat_sizes = _parse_compatible_sizes(compat_json)
        if sid not in compat_sizes:
            continue

        ang_stats = stats_by_uuid.get(u)
        if not ang_stats:
            continue

        asc_total = sum(x["asc"] for x in ang_stats.values())
        if asc_total < 1:
            continue

        # Parse holds and verify every hold fits on the selected board size.
        parsed_holds = []
        valid_on_board = True
        for m in _FRAME_RE.finditer(frames or ""):
            pid = int(m.group(1))
            role = int(m.group(2))
            if pid not in valid_pids:
                valid_on_board = False
                break
            parsed_holds.append([pid, role])
        if not valid_on_board or not parsed_holds:
            continue

        s_tgt = ang_stats.get(t_ang)
        s_lo = ang_stats.get(lo_angle) if has_lo else None
        s_hi = ang_stats.get(hi_angle) if has_hi else None

        asc_tgt = s_tgt["asc"] if s_tgt else 0
        asc_lo = s_lo["asc"] if s_lo else 0
        asc_hi = s_hi["asc"] if s_hi else 0
        asc_nearby = asc_tgt + asc_lo + asc_hi

        # Official Tension Classic flags strictly from benchmark_difficulty > 0.
        bm_angles = sorted(ang for ang, st in ang_stats.items() if st["bm"])
        cl_tgt = 1 if t_ang in bm_angles else 0
        cl_adj = 1 if bm_angles else 0

        raw_desc = (desc or "").strip()
        raw_chars = (chars or "").strip()
        no_match = (
            1
            if ("no_match" in raw_chars.lower() or "no match" in raw_desc.lower())
            else 0
        )
        clean_desc = _NO_MATCH_PREFIX_RE.sub("", raw_desc).strip()

        sa_int = (
            int(setter_angle)
            if setter_angle is not None
            else (bm_angles[0] if bm_angles else t_ang)
        )

        # Pick FA attribution preferring target angle, then adjacent angles, then setter angle.
        fa_user = ""
        fa_date = ""
        for pref_ang in (t_ang, lo_angle, hi_angle, sa_int):
            st = ang_stats.get(pref_ang)
            if st and st.get("fa_u"):
                fa_user = st["fa_u"]
                fa_date = st["fa_at"]
                break
        if not fa_user:
            for st in ang_stats.values():
                if st.get("fa_u"):
                    fa_user = st["fa_u"]
                    fa_date = st["fa_at"]
                    break

        # Primary reference angle (Classic benchmark with most sends, else angle with most sends).
        bm_list = [st for st in ang_stats.values() if st["bm"] and st["asc"] > 0]
        if bm_list:
            dom_st = max(bm_list, key=lambda x: (x["asc"], -abs(x["a"] - t_ang)))
        else:
            dom_st = max(ang_stats.values(), key=lambda x: (x["asc"], -abs(x["a"] - t_ang)))

        raw_vtgt = s_tgt["g"] if (s_tgt and s_tgt["asc"] > 0) else ""
        raw_vlo = s_lo["g"] if (s_lo and s_lo["asc"] > 0) else ""
        raw_vhi = s_hi["g"] if (s_hi and s_hi["asc"] > 0) else ""

        eff_vlo = raw_vlo
        eff_vtgt = raw_vtgt
        eff_vhi = raw_vhi
        adj_note = ""

        # 1. Compute Classic benchmark anchor at target_angle (direct, interpolated, or projected).
        bm_anchor = None
        emp_slope = DIFF_STEP_PER_5_DEG
        if t_ang in bm_angles and s_tgt and s_tgt["asc"] > 0:
            bm_anchor = s_tgt["d_raw"]
        elif len(bm_angles) >= 2:
            lower_bms = [
                a for a in bm_angles if a < t_ang and ang_stats[a]["asc"] > 0
            ]
            upper_bms = [
                a for a in bm_angles if a > t_ang and ang_stats[a]["asc"] > 0
            ]
            if lower_bms and upper_bms:
                # Interpolate between surrounding Classics.
                a_lo_bm, a_hi_bm = max(lower_bms), min(upper_bms)
                d_lo_bm = ang_stats[a_lo_bm]["d_raw"]
                d_hi_bm = ang_stats[a_hi_bm]["d_raw"]
                emp_slope = (d_hi_bm - d_lo_bm) / ((a_hi_bm - a_lo_bm) / 5.0)
                bm_anchor = d_lo_bm + (
                    (float(t_ang) - a_lo_bm) / (a_hi_bm - a_lo_bm)
                ) * (d_hi_bm - d_lo_bm)
            else:
                a_near = min(bm_angles, key=lambda a: abs(t_ang - a))
                bm_anchor = (
                    ang_stats[a_near]["d_raw"]
                    + ((float(t_ang) - a_near) / 5.0) * DIFF_STEP_PER_5_DEG
                )
        elif len(bm_angles) == 1:
            a_bm = bm_angles[0]
            bm_anchor = (
                ang_stats[a_bm]["d_raw"]
                + ((float(t_ang) - a_bm) / 5.0) * DIFF_STEP_PER_5_DEG
            )

        # 2. If target_angle is itself an Official Classic, use its benchmark directly;
        #    otherwise blend all angles within ±20° via weighted consensus.
        if t_ang in bm_angles and s_tgt and s_tgt["asc"] > 0:
            d_tgt_eff = s_tgt["d_raw"]
        else:
            num, den = 0.0, 0.0
            for a, st in sorted(ang_stats.items()):
                n = st["asc"]
                if n <= 0 or abs(t_ang - a) > 20:
                    continue
                d_a = st["d_raw"]
                d_proj = d_a + ((float(t_ang) - a) / 5.0) * emp_slope
                # Floor unbenchmarked steeper angles that invert below a shallower Classic.
                if bm_anchor is not None and len(bm_angles) == 1 and a > bm_angles[0]:
                    if d_a < ang_stats[bm_angles[0]]["d_raw"] - 0.10 and d_proj < bm_anchor:
                        d_proj = bm_anchor
                steps = abs(t_ang - a) / 5.0
                # Saturating ascent confidence so fluke logs get tiny weight without drowning target.
                w_n = (n / (n + 8.0)) * (1.0 + 0.35 * math.log10(max(1, n)))
                w_dist = 0.65 ** steps
                w_direct = 1.6 if a == t_ang else 1.0
                w_bm = 2.5 if st["bm"] else 1.0
                w_sa = 1.15 if a == sa_int else 1.0
                w = w_n * w_dist * w_direct * w_bm * w_sa
                num += w * d_proj
                den += w
            d_tgt_eff = (
                max(10.0, num / den)
                if den > 0
                else max(
                    10.0,
                    dom_st["d_raw"]
                    + ((float(t_ang) - dom_st["a"]) / 5.0) * DIFF_STEP_PER_5_DEG,
                )
            )

            # 3. Weak monotonicity floor against proven lo_angle (target_angle - 5).
            if s_lo and (s_lo["asc"] >= 8 or s_lo["bm"]):
                d_lo = s_lo["d_raw"]
                flat_hi = bool(
                    s_hi
                    and (s_hi["asc"] >= 10 or s_hi["bm"])
                    and s_hi["d_raw"] <= d_lo + 0.25
                )
                if flat_hi:
                    floor_lo = d_lo
                elif s_tgt and s_tgt["asc"] >= 50 and s_tgt["d_raw"] >= d_lo - 0.05:
                    floor_lo = d_lo + 0.40
                else:
                    floor_lo = d_lo + 0.75
                if d_tgt_eff < floor_lo:
                    d_tgt_eff = floor_lo

        full_grade, v_grade, _, diff_id = diff_float_to_grade(d_tgt_eff)
        eff_vtgt = full_grade

        # 4. Source tag, quality, and adjustment note when consensus differs from raw target_angle.
        if s_tgt and s_tgt["asc"] > 0:
            src_type = "45"
            qual = s_tgt["q"]
            if eff_vtgt != raw_vtgt and dom_st:
                monotonic_fixed_count += 1
                bm_tag = " Classic" if dom_st["bm"] else f" ({dom_st['asc']} asc)"
                adj_note = (
                    f"{dom_st['g']} @ {dom_st['a']}°{bm_tag} → {full_grade} @ {t_ang}° "
                    f"(raw {t_ang}°: {raw_vtgt})"
                )
        else:
            if has_lo and dom_st and dom_st["a"] == lo_angle:
                src_type = "adj40"
            elif has_hi and dom_st and dom_st["a"] == hi_angle:
                src_type = "adj50"
            else:
                src_type = "other"
            qual = dom_st["q"] if dom_st else 3.0
            if dom_st:
                bm_tag = " Classic" if dom_st["bm"] else f" ({dom_st['asc']} asc)"
                adj_note = f"{dom_st['g']} @ {dom_st['a']}°{bm_tag} → {full_grade} @ {t_ang}°"

        # 5. Keep lo_angle and hi_angle display columns weakly monotonic with target_angle unless Classic.
        if s_lo and s_lo["asc"] > 0 and not s_lo["bm"]:
            if s_lo["d_raw"] > d_tgt_eff + 0.25 or (d_tgt_eff - s_lo["d_raw"]) > 1.85:
                eff_vlo = diff_float_to_grade(max(10.0, d_tgt_eff - DIFF_STEP_PER_5_DEG))[0]
        if s_hi and s_hi["asc"] > 0 and not s_hi["bm"]:
            if s_hi["d_raw"] < d_tgt_eff - 0.25 or (
                s_hi["asc"] < 15 and s_hi["d_raw"] < d_tgt_eff + 0.45
            ):
                eff_vhi = diff_float_to_grade(d_tgt_eff + DIFF_STEP_PER_5_DEG)[0]

        # Capture primary reference angle stats when outside {lo_angle, target_angle, hi_angle}.
        if bm_angles and bm_angles[0] not in nearby_angles:
            sa_ref = bm_angles[0]
        elif dom_st and dom_st["a"] not in nearby_angles:
            sa_ref = dom_st["a"]
        else:
            sa_ref = sa_int
        s_sa = ang_stats.get(sa_ref)
        a_sa = s_sa["asc"] if s_sa else 0
        v_sa = s_sa["g"] if (s_sa and s_sa["asc"] > 0) else ""

        raw_vtgt_out = raw_vtgt if raw_vtgt != eff_vtgt else ""
        raw_vlo_out = raw_vlo if raw_vlo != eff_vlo else ""
        raw_vhi_out = raw_vhi if raw_vhi != eff_vhi else ""

        climb_name = name or "Untitled"
        setter_name = setter or "unknown"

        climbs.append(
            {
                "u": u,
                "n": climb_name,
                "s": setter_name,
                "sa": sa_int,
                "sa_ref": sa_ref,
                "dom_a": dom_st["a"] if dom_st else t_ang,
                "a_sa": a_sa,
                "v_sa": v_sa,
                "h": parsed_holds,
                "v": v_grade,
                "vf": full_grade,
                "g": full_grade,
                "d": diff_id,
                "src": src_type,
                "adj": adj_note,
                # Generalized target/adjacent keys
                "a_tgt": asc_tgt,
                "a_lo": asc_lo,
                "a_hi": asc_hi,
                "v_tgt": eff_vtgt,
                "v_lo": eff_vlo,
                "v_hi": eff_vhi,
                "raw_vtgt": raw_vtgt_out,
                "raw_vlo": raw_vlo_out,
                "raw_vhi": raw_vhi_out,
                "cl_tgt": cl_tgt,
                # Backwards-compatible aliases
                "a45": asc_tgt,
                "a40": asc_lo,
                "a50": asc_hi,
                "v45": eff_vtgt,
                "v40": eff_vlo,
                "v50": eff_vhi,
                "raw_v45": raw_vtgt_out,
                "raw_v40": raw_vlo_out,
                "raw_v50": raw_vhi_out,
                "cl45": cl_tgt,
                # Totals & metadata
                "anb": asc_nearby,
                "at": asc_total,
                "q": qual,
                "cladj": cl_adj,
                "bma": bm_angles,
                "nm": no_match,
                "desc": clean_desc,
                "fa": fa_user,
                "fa_at": fa_date,
            }
        )

        # Accumulate setter leaderboard stats.
        s_entry = setter_acc.get(setter_name)
        if s_entry is None:
            setter_acc[setter_name] = {
                "username": setter_name,
                "climbs_count": 1,
                "total_ascents": asc_total,
                "top_climb": [climb_name, asc_total, full_grade, u],
            }
        else:
            s_entry["climbs_count"] += 1
            s_entry["total_ascents"] += asc_total
            if asc_total > s_entry["top_climb"][1]:
                s_entry["top_climb"] = [climb_name, asc_total, full_grade, u]

        # Accumulate FA leaderboard stats across nearby_angles ({lo, tgt, hi}).
        for ang in nearby_angles:
            st = ang_stats.get(ang)
            if not st or st["asc"] <= 0 or not st["fa_u"]:
                continue
            uname = st["fa_u"]
            f_entry = fa_acc.get(uname)
            if f_entry is None:
                f_entry = {
                    "username": uname,
                    "fa_tgt": 0,
                    "fa_nearby": 0,
                    "latest": None,
                }
                fa_acc[uname] = f_entry
            if ang == t_ang:
                f_entry["fa_tgt"] += 1
            f_entry["fa_nearby"] += 1
            fa_ts = st["fa_at_full"] or ""
            if f_entry["latest"] is None or fa_ts > (f_entry["latest"][0] or ""):
                f_entry["latest"] = [fa_ts, climb_name, st["g"], ang, u]

    climbs.sort(key=lambda c: (-c["a_tgt"], -c["anb"], -c["at"], c["n"].lower()))

    top_fa_rows = sorted(
        fa_acc.values(),
        key=lambda r: (-r["fa_nearby"], -r["fa_tgt"], r["username"].lower()),
    )[:25]
    top_fa = [
        {
            "username": r["username"],
            "fa_tgt": r["fa_tgt"],
            "fa_nearby": r["fa_nearby"],
            "fa_45": r["fa_tgt"],
            "fa_40_50": r["fa_nearby"],
            "latest": r["latest"],
        }
        for r in top_fa_rows
    ]

    top_setters = sorted(
        setter_acc.values(),
        key=lambda r: (-r["total_ascents"], -r["climbs_count"], r["username"].lower()),
    )[:25]

    leaderboard = {
        "top_fa": top_fa,
        "top_setters": top_setters,
        "top_fa_10x8": top_fa,
        "top_setters_10x8": top_setters,
    }

    strict_count = sum(1 for c in climbs if c["a_tgt"] > 0)
    classics_at_angle_count = sum(1 for c in climbs if c["cl_tgt"])
    classics_count = sum(1 for c in climbs if c["cladj"] or c["cl_tgt"])

    payload = {
        "ok": True,
        "layout_id": lid,
        "size_id": sid,
        "angle": t_ang,
        "board": board_cfg,
        "holds": holds,
        "climbs": climbs,
        "leaderboard": leaderboard,
        "meta": {
            "target_angle": t_ang,
            "lo_angle": lo_angle,
            "hi_angle": hi_angle,
            "total_climbs": len(climbs),
            "strict_count": strict_count,
            "classics_count": classics_count,
            "classics_at_angle_count": classics_at_angle_count,
            "monotonic_fixed_count": monotonic_fixed_count,
            "holds_count": len(holds),
        },
        "_cache_meta": {
            "db_mtime": db_mtime,
            "holds_mtime": holds_mtime,
            "schema_version": CATALOG_SCHEMA_VERSION,
            "built_at": int(time.time()),
        },
    }

    # Atomically write cached JSON to disk.
    tmp_cache = f"{cache_path}.{os.getpid()}.{int(time.time() * 1000)}.tmp"
    try:
        with open(tmp_cache, "w", encoding="utf-8") as f:
            json.dump(payload, f, separators=(",", ":"))
        os.replace(tmp_cache, cache_path)
    except OSError:
        if os.path.exists(tmp_cache):
            try:
                os.remove(tmp_cache)
            except OSError:
                pass

    _CATALOG_MEM_CACHE[mem_key] = (
        (db_mtime, holds_mtime, CATALOG_SCHEMA_VERSION),
        payload,
    )
    return payload


def lookup_climbs_by_uuids(uuids, cache_dir: str) -> dict:
    """Resolve climb metadata and grades across cached layout 10 & 11 SQLite DBs.

    Returns a dict keyed by each matched input UUID (preserving caller casing)
    with name, setter, layout info, ascents, default grade, and per-angle grades.
    """
    if not uuids or not cache_dir or not os.path.isdir(cache_dir):
        return {}

    # Preserve caller's original UUID strings while matching case-insensitively.
    req_by_lower = {}
    for raw_u in uuids:
        if not raw_u:
            continue
        s = str(raw_u).strip()
        if s:
            req_by_lower.setdefault(s.lower(), []).append(s)

    if not req_by_lower:
        return {}

    # Scan cached layout DBs (preferring 11 then 10, plus any other tb2_layout_*.db).
    db_candidates = []
    for lid in (11, 10):
        p = os.path.join(cache_dir, f"tb2_layout_{lid}.db")
        if os.path.exists(p) and os.path.getsize(p) > 0:
            db_candidates.append(p)
    for fname in sorted(os.listdir(cache_dir)):
        if fname.startswith("tb2_layout_") and fname.endswith(".db"):
            p = os.path.join(cache_dir, fname)
            if p not in db_candidates and os.path.getsize(p) > 0:
                db_candidates.append(p)

    remaining_lowers = set(req_by_lower.keys())
    results = {}

    for db_path in db_candidates:
        if not remaining_lowers:
            break

        # Build fast PK lookup variants (original, lower, upper) for indexed IN query.
        query_keys = set()
        for low in remaining_lowers:
            query_keys.add(low)
            query_keys.add(low.upper())
            for orig in req_by_lower[low]:
                query_keys.add(orig)
        query_list = list(query_keys)

        conn = sqlite3.connect(db_path)
        try:
            cur = conn.cursor()
            found_climbs = {}

            # Chunk IN clauses safely below SQLite's 999 variable limit.
            chunk_size = 400
            for i in range(0, len(query_list), chunk_size):
                chunk = query_list[i : i + chunk_size]
                placeholders = ",".join("?" for _ in chunk)
                cur.execute(
                    f"""
                    SELECT uuid, layout_id, name, setter_username, description,
                           angle, frames, compatible_size_ids
                    FROM board_climbs
                    WHERE uuid IN ({placeholders})
                    """,
                    chunk,
                )
                for row in cur.fetchall():
                    found_climbs[row[0]] = row

            if not found_climbs:
                continue

            # Fetch stats for all matched climbs in this DB.
            matched_uuids = list(found_climbs.keys())
            stats_map = {u: {} for u in matched_uuids}
            for i in range(0, len(matched_uuids), chunk_size):
                chunk = matched_uuids[i : i + chunk_size]
                placeholders = ",".join("?" for _ in chunk)
                cur.execute(
                    f"""
                    SELECT climb_uuid, angle, ascensionist_count, difficulty_average,
                           quality_average, benchmark_difficulty
                    FROM board_climb_stats
                    WHERE climb_uuid IN ({placeholders})
                    """,
                    chunk,
                )
                for cu, ang, asc, diff, qual, bench in cur.fetchall():
                    is_bm = 1 if (bench is not None and float(bench) > 0) else 0
                    raw_d = float(diff) if diff is not None else 11.0
                    if is_bm and float(bench) > raw_d:
                        raw_d = float(bench)
                    full_g, base_v, _, diff_id = diff_float_to_grade(raw_d)
                    stats_map[cu][int(ang)] = {
                        "a": int(ang),
                        "asc": int(asc or 0),
                        "d_raw": round(raw_d, 3),
                        "d": diff_id,
                        "g": full_g,
                        "v": base_v,
                        "q": round(float(qual), 2) if qual is not None else 3.0,
                        "bm": is_bm,
                    }

            for db_u, row in found_climbs.items():
                _, lid, name, setter, desc, setter_angle, frames, compat_json = row
                compat_sizes = _parse_compatible_sizes(compat_json)
                ang_stats = stats_map.get(db_u, {})
                total_asc = sum(st["asc"] for st in ang_stats.values())

                # Pick representative grade (dominant Classic or highest-ascent angle).
                bm_list = [st for st in ang_stats.values() if st["bm"] and st["asc"] > 0]
                if bm_list:
                    dom_st = max(bm_list, key=lambda x: x["asc"])
                elif ang_stats:
                    dom_st = max(ang_stats.values(), key=lambda x: x["asc"])
                else:
                    dom_st = None

                full_g = dom_st["g"] if dom_st else "V0"
                base_v = dom_st["v"] if dom_st else "V0"
                diff_id = dom_st["d"] if dom_st else 11

                grades_by_angle = {
                    str(a): {
                        "g": st["g"],
                        "v": st["v"],
                        "d": st["d"],
                        "asc": st["asc"],
                        "q": st["q"],
                        "bm": st["bm"],
                    }
                    for a, st in sorted(ang_stats.items())
                }

                info = {
                    "uuid": db_u,
                    "u": db_u,
                    "name": name or "Untitled",
                    "n": name or "Untitled",
                    "setter": setter or "unknown",
                    "s": setter or "unknown",
                    "layout_id": int(lid) if lid is not None else None,
                    "layout_name": _infer_layout_size_label(lid or 0, compat_sizes),
                    "compatible_size_ids": sorted(compat_sizes),
                    "angle": int(setter_angle) if setter_angle is not None else None,
                    "g": full_g,
                    "v": base_v,
                    "d": diff_id,
                    "ascents": total_asc,
                    "at": total_asc,
                    "on_10x8_spray": bool(int(lid or 0) == 11 and 9 in compat_sizes),
                    "grades_by_angle": grades_by_angle,
                    "frames": frames or "",
                    "desc": (desc or "").strip(),
                }

                low = db_u.lower()
                for orig_key in req_by_lower.get(low, [db_u]):
                    results[orig_key] = info
                remaining_lowers.discard(low)
        finally:
            conn.close()

    return results
