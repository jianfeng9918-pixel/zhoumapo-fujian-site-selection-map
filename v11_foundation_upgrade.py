"""
周麻婆福建选址地图 1.1 数据补全脚本

目标：
- 从福建省民政厅 2025 行政区划页面获取 9 城、84 个县级单位、1110 个乡级单位。
- 在不接高德的前提下，用本地县区 GeoJSON 生成县/镇街坐标骨架。
- 将现有周麻婆门店、五大竞品、商圈、租金、公开证据叠加到县镇街骨架。
- 输出 1.1 页面可直接读取的 countyFoundation、townStreetFoundation、foodServiceSignals、v11DecisionMap。

说明：
- 镇街人口/经济/消费为初阶估算，不作为最终签约依据。
- 坐标来源分为已定位、县域示意点、公开行政区划骨架。
"""

from __future__ import annotations

import json
import math
import re
import shutil
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime
from html import unescape
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
PREVIEW = DATA_DIR / "preview-data.json"
ADMIN_CACHE = DATA_DIR / "fujian_admin_2025_cache.json"
ADMIN_URL = "https://mzt.fj.gov.cn/gk/tzgg/202601/t20260105_7071220.htm"
TODAY = "2026-05-10"

FUJIAN_CITY_CODES = {
    "福州": "350100",
    "厦门": "350200",
    "莆田": "350300",
    "三明": "350400",
    "泉州": "350500",
    "漳州": "350600",
    "南平": "350700",
    "龙岩": "350800",
    "宁德": "350900",
}

CORE_COMPETITORS = ["小叫天", "醉得意", "四方桌", "大丰收", "姑奶奶"]

CITY_BASE = {
    "福州": {"score": 91, "population": 852, "gdp": 15112, "retail": 5969, "role": "省会强中心"},
    "厦门": {"score": 90, "population": 535, "gdp": 8589, "retail": 2900, "role": "高消费旅游商务城市"},
    "泉州": {"score": 88, "population": 888, "gdp": 12900, "retail": 5900, "role": "民营经济和县域消费强市"},
    "漳州": {"score": 78, "population": 506, "gdp": 5960, "retail": 2300, "role": "厦漳泉延伸和县域机会"},
    "莆田": {"score": 75, "population": 321, "gdp": 3500, "retail": 1450, "role": "沿海商业和本店基础"},
    "宁德": {"score": 74, "population": 318, "gdp": 3800, "retail": 1250, "role": "新能源产业和县城机会"},
    "龙岩": {"score": 69, "population": 272, "gdp": 3400, "retail": 1200, "role": "闽西中心和县城补点"},
    "南平": {"score": 66, "population": 263, "gdp": 2400, "retail": 950, "role": "文旅和县域谨慎推进"},
    "三明": {"score": 65, "population": 244, "gdp": 3300, "retail": 1000, "role": "山区县城补点和本店观察"},
}

COUNTY_ROLE_BONUS = {
    "区": 10,
    "市": 7,
    "县": 2,
}

TOWN_TYPE_BONUS = {
    "街道": 12,
    "镇": 7,
    "乡": 2,
    "民族乡": 2,
}

COMMERCIAL_NAME_SIGNALS = [
    "城", "东", "西", "南", "北", "中", "中心", "新", "湖", "江", "港", "桥", "口",
    "站", "大学", "学院", "万达", "广场", "商贸", "开发", "工业", "旅游", "古城", "景区",
]

COUNTY_SEAT_HINTS = [
    "城关", "凤城", "螺城", "城厢", "鲤城", "建安", "潭城", "浦城", "武夷", "莲城",
    "汀州", "蕉城", "双城", "梅城", "松城", "大同", "大田", "永安", "南靖", "绥安",
]


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8-sig"))


def write_json(path: Path, data: Any) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def clean_city(value: Any) -> str:
    return str(value or "").strip().replace("市", "").replace("地区", "").replace("省", "")


def clean_text(value: Any, fallback: str = "") -> str:
    text = str(value or "").strip()
    return text if text and text not in {"待补", "缺失", "无"} else fallback


def number_value(value: Any, fallback: float = 0.0) -> float:
    if value is None:
        return fallback
    found = re.findall(r"-?\d+(?:\.\d+)?", str(value).replace(",", ""))
    if not found:
        return fallback
    try:
        return float(found[0])
    except ValueError:
        return fallback


def grade(score: float) -> str:
    if score >= 84:
        return "A"
    if score >= 74:
        return "B"
    if score >= 64:
        return "C"
    return "D"


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def fetch_admin_rows() -> list[dict[str, str]]:
    if ADMIN_CACHE.exists():
        cached = read_json(ADMIN_CACHE)
        rows = cached.get("rows", [])
        if rows:
            return rows

    request = urllib.request.Request(
        ADMIN_URL,
        headers={"User-Agent": "ZhouMapoSiteSelection/1.1 local data preparation"},
    )
    html = urllib.request.urlopen(request, timeout=40).read().decode("utf-8", errors="ignore")
    rows: list[dict[str, str]] = []
    for tr in re.findall(r"<tr\b.*?</tr>", html, flags=re.S | re.I):
        tds = re.findall(r"<td\b[^>]*>(.*?)</td>", tr, flags=re.S | re.I)
        if len(tds) < 2:
            continue
        name = unescape(re.sub(r"<[^>]+>", "", tds[0])).replace("\xa0", " ").strip()
        code = unescape(re.sub(r"<[^>]+>", "", tds[1])).strip()
        if re.fullmatch(r"\d{6}|\d{9}", code) and name and name != "行政区划名称":
            rows.append({"name": name, "code": code})

    write_json(
        ADMIN_CACHE,
        {
            "source": ADMIN_URL,
            "fetchedAt": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "rows": rows,
        },
    )
    return rows


def parse_admin_tree(rows: list[dict[str, str]]) -> tuple[list[dict[str, str]], list[dict[str, str]], list[dict[str, str]]]:
    cities: list[dict[str, str]] = []
    counties: list[dict[str, str]] = []
    towns: list[dict[str, str]] = []
    current_city: dict[str, str] | None = None
    current_county: dict[str, str] | None = None

    for item in rows:
        name = item["name"]
        code = item["code"]
        if code == "350000":
            continue
        if len(code) == 6 and code.endswith("00"):
            current_city = {"城市": clean_city(name), "城市全称": name, "城市代码": code}
            cities.append(current_city)
            current_county = None
        elif len(code) == 6:
            if not current_city:
                continue
            current_county = {
                "城市": current_city["城市"],
                "城市全称": current_city["城市全称"],
                "城市代码": current_city["城市代码"],
                "区县": name,
                "区县代码": code,
            }
            counties.append(current_county)
        elif len(code) == 9 and current_city and current_county:
            towns.append(
                {
                    "城市": current_city["城市"],
                    "城市全称": current_city["城市全称"],
                    "城市代码": current_city["城市代码"],
                    "区县": current_county["区县"],
                    "区县代码": current_county["区县代码"],
                    "镇街": name,
                    "镇街代码": code,
                }
            )

    return cities, counties, towns


def collect_coords(coords: Any, points: list[tuple[float, float]]) -> None:
    if not isinstance(coords, list):
        return
    if coords and isinstance(coords[0], (int, float)) and len(coords) >= 2:
        points.append((float(coords[0]), float(coords[1])))
        return
    for item in coords:
        collect_coords(item, points)


def feature_bounds(feature: dict[str, Any]) -> tuple[float, float, float, float]:
    points: list[tuple[float, float]] = []
    collect_coords(feature.get("geometry", {}).get("coordinates"), points)
    if not points:
        center = feature.get("properties", {}).get("center") or [119.0, 26.0]
        lon, lat = float(center[0]), float(center[1])
        return lon - 0.05, lat - 0.05, lon + 0.05, lat + 0.05
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    return min(xs), min(ys), max(xs), max(ys)


def feature_center(feature: dict[str, Any]) -> tuple[float, float]:
    props = feature.get("properties", {})
    center = props.get("centroid") or props.get("center")
    if center and len(center) >= 2:
        return float(center[0]), float(center[1])
    x0, y0, x1, y1 = feature_bounds(feature)
    return (x0 + x1) / 2, (y0 + y1) / 2


def load_geo_index() -> dict[str, dict[str, Any]]:
    index: dict[str, dict[str, Any]] = {}
    for city, code in FUJIAN_CITY_CODES.items():
        path = DATA_DIR / "geojson" / f"{code}_full.json"
        if not path.exists():
            continue
        geo = read_json(path)
        for feature in geo.get("features", []):
            props = feature.get("properties", {})
            name = props.get("name") or props.get("fullname")
            if not name:
                continue
            center = feature_center(feature)
            bounds = feature_bounds(feature)
            index[f"{city}|{name}"] = {
                "feature": feature,
                "center": center,
                "bounds": bounds,
                "adcode": str(props.get("adcode", "")),
            }
    return index


def synthetic_point(center: tuple[float, float], bounds: tuple[float, float, float, float], index: int, total: int, code: str) -> tuple[float, float]:
    x0, y0, x1, y1 = bounds
    cx, cy = center
    width = max(0.018, (x1 - x0) * 0.38)
    height = max(0.018, (y1 - y0) * 0.38)
    ring = 0.22 + 0.72 * math.sqrt((index + 1) / max(1, total))
    angle = (index * 137.508 + (int(code[-3:]) % 97) * 11) * math.pi / 180
    lon = cx + math.cos(angle) * width * ring
    lat = cy + math.sin(angle) * height * ring
    lon = clamp(lon, x0 + 0.01, x1 - 0.01)
    lat = clamp(lat, y0 + 0.01, y1 - 0.01)
    return round(lon, 6), round(lat, 6)


def town_type(name: str) -> str:
    if name.endswith("民族乡"):
        return "民族乡"
    if name.endswith("街道"):
        return "街道"
    if name.endswith("镇"):
        return "镇"
    if name.endswith("乡"):
        return "乡"
    return "镇街"


def county_type(name: str) -> str:
    if name.endswith("区"):
        return "市辖区"
    if name.endswith("市"):
        return "县级市"
    return "县"


def key_city_district_street(city: str, district: str, street: str) -> tuple[str, str, str]:
    return clean_city(city), str(district or "").strip(), str(street or "").strip()


def row_coords(row: dict[str, Any]) -> tuple[float, float] | None:
    try:
        lon = float(row.get("经度"))
        lat = float(row.get("纬度"))
    except (TypeError, ValueError):
        return None
    if not math.isfinite(lon) or not math.isfinite(lat):
        return None
    return lon, lat


def build_existing_street_index(data: dict[str, Any]) -> dict[tuple[str, str, str], dict[str, Any]]:
    index: dict[tuple[str, str, str], dict[str, Any]] = {}
    for row in data.get("streetMapPoints", []) + data.get("streetDecisions", []):
        street = row.get("街道/片区") or row.get("街道")
        if not street:
            continue
        key = key_city_district_street(row.get("城市", ""), row.get("区县", ""), street)
        if key not in index or row_coords(row):
            index[key] = row
    return index


def rows_by_city_district(rows: list[dict[str, Any]]) -> dict[tuple[str, str], list[dict[str, Any]]]:
    result: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        result[(clean_city(row.get("城市")), str(row.get("区县") or "").strip())].append(row)
    return result


def count_core_competitors(rows: list[dict[str, Any]]) -> int:
    return sum(
        1
        for row in rows
        if any(brand in str(row.get("核心竞品品牌") or row.get("竞品品牌") or row.get("门店名称") or "") for brand in CORE_COMPETITORS)
    )


def match_name_count(rows: list[dict[str, Any]], name: str) -> int:
    if not name:
        return 0
    short = name.replace("街道", "").replace("镇", "").replace("乡", "")
    total = 0
    for row in rows:
        haystack = " ".join(str(row.get(k, "")) for k in ["街道/片区", "地址", "关联商圈", "门店名称", "名称"])
        if name in haystack or (len(short) >= 2 and short in haystack):
            total += 1
    return total


def commercial_signal_score(name: str, county: str, city: str) -> int:
    score = 0
    source = f"{name} {county} {city}"
    for word in COMMERCIAL_NAME_SIGNALS:
        if word in source:
            score += 1
    for word in COUNTY_SEAT_HINTS:
        if word in source:
            score += 3
    return min(score, 8)


def district_counts(data: dict[str, Any]) -> dict[tuple[str, str], dict[str, int]]:
    stores = rows_by_city_district(data.get("storeDistribution", []))
    comps = rows_by_city_district(data.get("decisionMap", {}).get("coreCompetitorPoints", data.get("competitorStores", [])))
    areas = rows_by_city_district(data.get("businessAreas", []))
    rents = rows_by_city_district(data.get("rentSamples", []))
    poi = rows_by_city_district(data.get("poi", []))
    evidence = rows_by_city_district(data.get("publicEvidencePoints", []))
    keys = set(stores) | set(comps) | set(areas) | set(rents) | set(poi) | set(evidence)
    result: dict[tuple[str, str], dict[str, int]] = {}
    for key in keys:
        result[key] = {
            "stores": len([row for row in stores.get(key, []) if row.get("品牌") == "周麻婆"]),
            "competitors": count_core_competitors(comps.get(key, [])),
            "areas": len(areas.get(key, [])),
            "rents": len(rents.get(key, [])),
            "poi": len(poi.get(key, [])),
            "evidence": len(evidence.get(key, [])),
        }
    return result


def city_counts(data: dict[str, Any]) -> dict[str, dict[str, int]]:
    result: dict[str, dict[str, int]] = defaultdict(lambda: {"stores": 0, "competitors": 0, "areas": 0, "rents": 0, "poi": 0, "evidence": 0})
    for row in data.get("storeDistribution", []):
        if row.get("品牌") == "周麻婆":
            result[clean_city(row.get("城市"))]["stores"] += 1
    for row in data.get("decisionMap", {}).get("coreCompetitorPoints", data.get("competitorStores", [])):
        if any(brand in str(row.get("核心竞品品牌") or row.get("竞品品牌") or row.get("门店名称") or "") for brand in CORE_COMPETITORS):
            result[clean_city(row.get("城市"))]["competitors"] += 1
    for source, field in [
        ("businessAreas", "areas"),
        ("rentSamples", "rents"),
        ("poi", "poi"),
        ("publicEvidencePoints", "evidence"),
    ]:
        for row in data.get(source, []):
            result[clean_city(row.get("城市"))][field] += 1
    return result


def infer_county_score(city: str, district: str, town_count: int, counts: dict[str, int]) -> float:
    city_base = CITY_BASE.get(city, {"score": 66})["score"]
    role_bonus = COUNTY_ROLE_BONUS.get(district[-1:], 2)
    data_bonus = min(8, counts.get("areas", 0) * 0.7 + counts.get("competitors", 0) * 0.12 + counts.get("stores", 0) * 0.25 + counts.get("evidence", 0) * 0.05)
    scale_bonus = min(5, town_count / 22)
    score = city_base * 0.72 + 13 + role_bonus + data_bonus + scale_bonus
    return round(clamp(score, 58, 93), 1)


def infer_town_score(city: str, district: str, town: str, county_score: float, counts: dict[str, int], own: int, comp: int) -> float:
    t_type = town_type(town)
    city_score = CITY_BASE.get(city, {"score": 66})["score"]
    score = county_score * 0.58 + city_score * 0.18 + TOWN_TYPE_BONUS.get(t_type, 4)
    score += commercial_signal_score(town, district, city) * 1.5
    score += min(7, comp * 0.8)
    score += min(4, own * 1.2)
    if district.endswith("区"):
        score += 3.5
    if district.endswith("市"):
        score += 2
    if "街道" in t_type and any(key in town for key in ["东", "南", "中", "城", "湖", "港", "桥", "路"]):
        score += 2.5
    return round(clamp(score, 56, 94), 1)


def opportunity_label(score: float, own: int, comp: int, poi_count: int, t_type: str) -> tuple[str, str, str]:
    tags: list[str] = []
    if own == 0 and score >= 82:
        tags.append("空白机会")
    if comp >= 3 or (comp >= 1 and score >= 82):
        tags.append("竞争验证强")
    if own > 0:
        tags.append("本店已覆盖")
    if poi_count <= 1 and score >= 78:
        tags.append("需POI复核")
    if score < 64:
        tags.append("谨慎")
    if not tags:
        tags.append("可观察")

    if own > 0 and score >= 75:
        decision = "本店已覆盖"
        action = "观察补点：评估同区分流、外卖半径和是否需要保护半径。"
    elif score >= 84:
        decision = "优先进入"
        action = "本周优先看铺：先核验平台热度、租金、门头动线和100米竞品。"
    elif score >= 72:
        decision = "可观察"
        action = "补平台数据：先看美团/点评榜单、竞品销量、租金区间。"
    else:
        decision = "谨慎"
        action = "暂缓投入：先做县区级复盘，等商圈/租金/客群证据更完整再看。"

    if t_type in {"乡", "民族乡"} and score < 78:
        decision = "谨慎" if decision != "本店已覆盖" else decision
        action = "先看县城主街和成熟社区，不急于进入乡镇腹地。"

    return "、".join(dict.fromkeys(tags)), decision, action


def store_type_for(town: str, district: str, score: float) -> str:
    t_type = town_type(town)
    text = f"{town}{district}"
    if any(word in text for word in ["大学", "学院", "高新", "软件", "开发", "工业", "园"]):
        return "高校/办公店、社区店"
    if any(word in text for word in ["万达", "广场", "中心", "东街", "南街", "商业", "商贸"]):
        return "商圈店、购物中心店"
    if t_type == "街道" or district.endswith("区"):
        return "社区店、商圈店"
    if t_type == "镇" and score >= 78:
        return "社区店、小城镇店"
    return "社区店"


def v11_evidence_points(row: dict[str, Any]) -> list[dict[str, Any]]:
    lon = float(row["经度"])
    lat = float(row["纬度"])
    code = row["镇街代码"]
    t_type = row["镇街类型"]
    templates = [
        ("生活圈中心", f"{row['街道/片区']}生活圈中心复核点", 0.0000, 0.0000),
        ("餐饮/商业", f"{row['街道/片区']}餐饮商业复核点", 0.0065, 0.0038),
    ]
    if t_type == "街道" or row["街道评分"] >= 76:
        templates.append(("交通/学校/社区", f"{row['街道/片区']}交通学校社区复核点", -0.0056, 0.0045))
    elif t_type == "镇":
        templates.append(("镇区主街", f"{row['街道/片区']}镇区主街复核点", -0.0048, -0.0036))
    points = []
    for index, (ptype, name, dx, dy) in enumerate(templates, 1):
        points.append(
            {
                "证据ID": f"V11-EVID-{code}-{index}",
                "决策ID": row["决策ID"],
                "省份": "福建",
                "城市": row["城市"],
                "区县": row["区县"],
                "街道/片区": row["街道/片区"],
                "名称": name,
                "类型": ptype,
                "经度": f"{lon + dx:.6f}",
                "纬度": f"{lat + dy:.6f}",
                "坐标精度": row["坐标精度"],
                "来源": "1.1县镇街骨架推导：用于地图初筛和采集任务，不作为签约依据",
                "来源等级": "L1",
                "说明": f"{row['街道/片区']}初阶证据点；后续用平台截图、租金和实地照片替换。",
                "数据更新时间": TODAY,
            }
        )
    return points


def source_level_for(existing: dict[str, Any] | None, t_type: str) -> str:
    if existing and row_coords(existing):
        return clean_text(existing.get("来源等级"), "L3")
    if t_type == "街道":
        return "L2"
    return "L1"


def build_foundation(data: dict[str, Any]) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    admin_rows = fetch_admin_rows()
    cities, counties, towns = parse_admin_tree(admin_rows)
    geo_index = load_geo_index()
    existing_streets = build_existing_street_index(data)
    d_counts = district_counts(data)
    c_counts = city_counts(data)
    town_by_county: dict[str, list[dict[str, str]]] = defaultdict(list)
    for town in towns:
        town_by_county[town["区县代码"]].append(town)

    county_foundation: list[dict[str, Any]] = []
    town_foundation: list[dict[str, Any]] = []
    food_signals: list[dict[str, Any]] = []
    v11_evidence: list[dict[str, Any]] = []
    county_summary_by_key: dict[tuple[str, str], dict[str, Any]] = {}

    for county in counties:
        city = county["城市"]
        district = county["区县"]
        key = (city, district)
        geo = geo_index.get(f"{city}|{district}")
        center = geo["center"] if geo else (119.0, 26.0)
        bounds = geo["bounds"] if geo else (center[0] - 0.12, center[1] - 0.08, center[0] + 0.12, center[1] + 0.08)
        counts = d_counts.get(key, {"stores": 0, "competitors": 0, "areas": 0, "rents": 0, "poi": 0, "evidence": 0})
        county_towns = town_by_county[county["区县代码"]]
        score = infer_county_score(city, district, len(county_towns), counts)
        ctype = county_type(district)
        pop_base = CITY_BASE.get(city, {"population": 260})["population"]
        town_factor = max(1, len(county_towns))
        county_pop_est = round(pop_base * (1.35 if ctype == "市辖区" else 1.0 if ctype == "县级市" else 0.82) / max(5, len([c for c in counties if c["城市"] == city])), 1)
        evidence_line = f"{district}为{city}{ctype}，含{len(county_towns)}个镇街；本店{counts['stores']}、五大竞品{counts['competitors']}、商圈样本{counts['areas']}。"
        county_row = {
            "记录ID": f"V11-COUNTY-{county['区县代码']}",
            "省份": "福建",
            "城市": city,
            "区县": district,
            "城市代码": county["城市代码"],
            "区县代码": county["区县代码"],
            "县区类型": ctype,
            "经度": f"{center[0]:.6f}",
            "纬度": f"{center[1]:.6f}",
            "镇街数量": len(county_towns),
            "人口线索": f"县区人口按{city}城市底盘和区县类型初阶估算，约{county_pop_est}万人级；需以县区统计公报复核。",
            "经济线索": f"参考{city}城市GDP/社零底盘与{district}区位，当前用于初筛，不做尽调结论。",
            "消费能力": "强" if score >= 84 else "较强" if score >= 74 else "中等" if score >= 64 else "谨慎",
            "商业成熟度": "核心成熟" if ctype == "市辖区" and score >= 80 else "县城成熟" if ctype != "县" or score >= 76 else "基础商业",
            "餐饮机会": "优先看主街/社区/购物中心" if score >= 80 else "先看县城成熟商圈" if score >= 70 else "谨慎看本店和竞品验证",
            "周麻婆门店数": counts["stores"],
            "五大竞品门店数": counts["competitors"],
            "商圈样本数": counts["areas"],
            "租金样本数": counts["rents"],
            "POI证据数": counts["poi"] + counts["evidence"],
            "综合评分": score,
            "推荐等级": grade(score),
            "来源等级": "L4官方/准官方 + L1模型推断",
            "数据状态": "行政区划官方确认；人口/经济为初阶估算",
            "主要依据": evidence_line,
            "主要风险": "镇街消费、租金、门头和平台热力仍需线下/平台复核。",
            "下一步动作": "先看评分靠前镇街，再补美团/点评、租金、门头动线和竞品截图。",
            "数据更新时间": TODAY,
        }
        county_foundation.append(county_row)
        county_summary_by_key[key] = county_row

        for index, town in enumerate(county_towns):
            name = town["镇街"]
            t_type = town_type(name)
            existing = existing_streets.get(key_city_district_street(city, district, name))
            existing_coords = row_coords(existing) if existing else None
            if existing_coords:
                lon, lat = existing_coords
                location_status = "已定位"
                coord_precision = "现有街道样本"
            else:
                lon, lat = synthetic_point(center, bounds, index, len(county_towns), town["镇街代码"])
                location_status = "县域示意点"
                coord_precision = "县域示意点"

            district_stores = rows_by_city_district(data.get("storeDistribution", [])).get(key, [])
            district_comps = rows_by_city_district(data.get("decisionMap", {}).get("coreCompetitorPoints", data.get("competitorStores", []))).get(key, [])
            district_areas = rows_by_city_district(data.get("businessAreas", [])).get(key, [])
            district_rents = rows_by_city_district(data.get("rentSamples", [])).get(key, [])
            own = match_name_count(district_stores, name)
            comp = match_name_count(district_comps, name)
            area_count = match_name_count(district_areas, name)
            rent_count = match_name_count(district_rents, name)
            signal = commercial_signal_score(name, district, city)
            poi_est = max(area_count, 3 if signal >= 3 or t_type == "街道" else 2 if t_type == "镇" else 1)
            if existing:
                own = max(own, int(number_value(existing.get("周麻婆现有门店数"), own)))
                comp = max(comp, int(number_value(existing.get("五大竞品门店数") or existing.get("友商/竞品门店数"), comp)))
                rent_count = max(rent_count, int(number_value(existing.get("租金样本数"), rent_count)))
                poi_est = max(poi_est, int(number_value(existing.get("公开证据点数") or existing.get("POI支撑数") or existing.get("公开POI线索数"), poi_est)))
            town_score = number_value(existing.get("街道评分") if existing else None, 0)
            if not town_score:
                town_score = infer_town_score(city, district, name, score, counts, own, comp)
            tags, decision, action = opportunity_label(town_score, own, comp, poi_est, t_type)
            stype = clean_text(existing.get("适合店型") if existing else "", store_type_for(name, district, town_score))
            quality = number_value(existing.get("数据质量评分") if existing else None, 0)
            if not quality:
                quality = round(clamp(52 + TOWN_TYPE_BONUS.get(t_type, 3) * 1.2 + signal * 1.5 + (8 if coord_precision == "现有街道样本" else 0), 50, 86), 1)
            capacity = 2 if town_score >= 88 and own == 0 else 1 if town_score >= 74 else 0
            pop_hint = round((county_pop_est * 10000 / town_factor) / 10000 * (1.7 if t_type == "街道" else 1.15 if t_type == "镇" else 0.7), 1)
            evidence_summary = clean_text(
                existing.get("街道周边证据摘要") if existing else "",
                f"{name}为{district}{t_type}，{coord_precision}；商业/交通/学校/住宅线索按区县底盘和镇街类型初阶估算。"
            )
            row = {
                "点ID": f"V11-TOWN-{town['镇街代码']}",
                "决策ID": f"V11-TOWN-{town['镇街代码']}",
                "省份": "福建",
                "城市": city,
                "区县": district,
                "街道/片区": name,
                "镇街代码": town["镇街代码"],
                "镇街类型": t_type,
                "关联商圈": clean_text(existing.get("关联商圈") if existing else "", f"{district}镇街生活圈"),
                "经度": f"{lon:.6f}",
                "纬度": f"{lat:.6f}",
                "定位状态": location_status,
                "坐标精度": coord_precision,
                "机会标签": tags,
                "机会类型": tags.split("、")[0],
                "推荐等级": grade(town_score),
                "街道评分": town_score,
                "数据质量评分": quality,
                "严格决策结论": decision,
                "街道潜力判断": decision,
                "适合店型": stype,
                "可开店容量": capacity,
                "周麻婆现有门店数": own,
                "五大竞品门店数": comp,
                "友商/竞品门店数": comp,
                "租金样本数": rent_count,
                "公开证据点数": poi_est,
                "POI支撑数": poi_est,
                "商圈/商业体线索数": area_count,
                "公开POI线索": f"{t_type}生活圈、县区商业配套、交通/学校/住宅初阶线索",
                "公开POI线索数": poi_est,
                "公开资料状态": "初阶估算" if not existing else "现有样本+公开补充",
                "数据缺口": "待平台复核/待租金复核/待实地确认",
                "人口线索": f"按{district}人口底盘估算，{name}服务人口约{pop_hint}万人级；需镇街/社区资料复核。",
                "经济线索": f"参考{city}城市经济和{district}县区商业成熟度，作为前置筛选线索。",
                "消费能力": "强" if town_score >= 84 else "较强" if town_score >= 74 else "中等" if town_score >= 64 else "谨慎",
                "商业成熟度": "成熟街道" if t_type == "街道" and town_score >= 76 else "成熟镇区" if t_type == "镇" and town_score >= 76 else "基础生活圈",
                "餐饮机会": "优先看社区主街/商圈入口" if decision == "优先进入" else "先看竞品和租金验证" if decision == "可观察" else "观察补点/保护半径" if decision == "本店已覆盖" else "谨慎推进",
                "交通/学校/住宅/办公/文旅标签": "县域中心/住宅/学校/交通/餐饮生活圈初阶线索",
                "来源等级": source_level_for(existing, t_type),
                "来源说明": "福建省民政厅2025行政区划 + 本地门店/竞品/商圈样本 + 初阶模型推断",
                "公开证据摘要": evidence_summary,
                "地图证据提示": f"{coord_precision}；用于县镇街前置筛选，不作为签约依据。",
                "街道判断理由": clean_text(
                    existing.get("街道判断理由") if existing else "",
                    f"评分由{district}县区底盘、{t_type}类型、竞品{comp}、本店{own}、商业线索{poi_est}综合生成。"
                ),
                "地图视野范围": clean_text(existing.get("地图视野范围") if existing else "", "县镇街图谱视野"),
                "本店覆盖判断": "已有周麻婆覆盖，适合观察补点或保护半径。" if own > 0 else "周麻婆空白，可作为新增机会观察。",
                "竞品验证判断": "五大竞品已验证需求，重点比较租金和门头。" if comp > 0 else "五大竞品线索较少，需平台搜索验证。",
                "本周动作建议": action,
                "下一步核验动作": action,
                "数据更新时间": TODAY,
                "1.1备注": "全量镇街骨架；非已有样本数据为初阶估算。",
            }
            v11_evidence.extend(v11_evidence_points(row))
            town_foundation.append(row)
            food_signals.append(
                {
                    "信号ID": f"V11-FOOD-{town['镇街代码']}",
                    "省份": "福建",
                    "城市": city,
                    "区县": district,
                    "镇街": name,
                    "信号类型": "餐饮机会初阶判断",
                    "信号摘要": row["街道判断理由"],
                    "适合店型": stype,
                    "来源等级": row["来源等级"],
                    "来源": "福建省民政厅行政区划 + KPMG餐饮趋势/公开商业资料方法论 + 本地样本推断",
                    "数据更新时间": TODAY,
                }
            )

    official_keys = {key_city_district_street(row["城市"], row["区县"], row["街道/片区"]) for row in town_foundation}
    extra_existing: list[dict[str, Any]] = []
    for row in data.get("streetMapPoints", []):
        key = key_city_district_street(row.get("城市", ""), row.get("区县", ""), row.get("街道/片区", ""))
        if key not in official_keys and clean_city(row.get("城市")) in FUJIAN_CITY_CODES:
            extra = dict(row)
            extra["点ID"] = clean_text(extra.get("点ID"), f"V11-EXTRA-{len(extra_existing)+1:04d}")
            extra["决策ID"] = clean_text(extra.get("决策ID"), extra["点ID"])
            extra["镇街类型"] = "商圈片区"
            extra["来源等级"] = clean_text(extra.get("来源等级"), "L2")
            extra["1.1备注"] = "现有商圈/片区样本，作为官方镇街骨架之外的辅助判断点。"
            extra_existing.append(extra)

    all_scores = town_foundation + extra_existing

    city_town_counts = Counter(row["城市"] for row in town_foundation)
    county_town_counts = Counter((row["城市"], row["区县"]) for row in town_foundation)
    city_summaries: list[dict[str, Any]] = []
    for city in FUJIAN_CITY_CODES:
        existing_city = next((row for row in data.get("cities", []) if clean_city(row.get("城市")) == city and row.get("省份") == "福建"), {})
        counts = c_counts.get(city, {})
        city_score = number_value(existing_city.get("综合评分"), CITY_BASE.get(city, {"score": 66})["score"])
        town_rows = [row for row in town_foundation if row["城市"] == city]
        high_potential = sum(1 for row in town_rows if "空白机会" in row["机会标签"] and row["街道评分"] >= 80)
        city_summaries.append(
            {
                "城市": city,
                "推荐等级": grade(city_score),
                "综合评分": city_score,
                "数据质量评分": 86 if city in {"福州", "厦门", "泉州"} else 76,
                "商圈样本数": counts.get("areas", 0),
                "街道样本数": city_town_counts[city],
                "镇街样本数": city_town_counts[city],
                "周麻婆门店数": counts.get("stores", 0),
                "五大竞品门店数": counts.get("competitors", 0),
                "高潜街道数": high_potential,
                "P1任务数": max(3, min(18, high_potential // 3)),
                "城市角色": CITY_BASE.get(city, {}).get("role", "县域机会城市"),
                "当前结论": "优先进入" if city_score >= 84 else "可推进" if city_score >= 74 else "观察" if city_score >= 64 else "暂缓",
                "下一步动作": "先看县区和镇街榜，优先核验高分空白镇街。",
            }
        )

    district_summaries: list[dict[str, Any]] = []
    for county in county_foundation:
        city = county["城市"]
        district = county["区县"]
        rows = [row for row in town_foundation if row["城市"] == city and row["区县"] == district]
        high_potential = sum(1 for row in rows if "空白机会" in row["机会标签"] and row["街道评分"] >= 78)
        district_summaries.append(
            {
                "城市": city,
                "区县": district,
                "推荐等级": county["推荐等级"],
                "综合评分": county["综合评分"],
                "平均数据质量分": round(sum(float(row["数据质量评分"]) for row in rows) / max(1, len(rows)), 1),
                "街道数": len(rows),
                "镇街数量": len(rows),
                "商圈样本数": county["商圈样本数"],
                "周麻婆门店数": county["周麻婆门店数"],
                "五大竞品门店数": county["五大竞品门店数"],
                "高潜空白街道数": high_potential,
                "高潜镇街数": high_potential,
                "P1任务数": max(1, min(8, high_potential // 2 + (1 if county["综合评分"] >= 78 else 0))),
                "数据缺口数": max(1, len(rows) * 3 - county["POI证据数"]),
                "人口线索": county["人口线索"],
                "经济线索": county["经济线索"],
                "商业成熟度": county["商业成熟度"],
                "来源等级": county["来源等级"],
                "主要依据": county["主要依据"],
                "主要风险": county["主要风险"],
                "下一步动作": county["下一步动作"],
            }
        )

    decision_map = dict(data.get("decisionMap", {}))
    decision_map.update(
        {
            "citySummaries": city_summaries,
            "districtSummaries": district_summaries,
            "streetSummaries": all_scores,
            "streetDecisionScore": all_scores,
            "townStreetScores": town_foundation,
            "extraStreetSamples": extra_existing,
            "ownStorePoints": decision_map.get("ownStorePoints", data.get("storeDistribution", [])),
            "coreCompetitorPoints": decision_map.get("coreCompetitorPoints", data.get("competitorStores", [])),
        }
    )

    v11_decision_map = {
        "citySummaries": city_summaries,
        "countySummaries": district_summaries,
        "townStreetScores": town_foundation,
        "extraStreetSamples": extra_existing,
        "sourcePolicy": "全量骨架优先；L1/L2为初阶估算或公开线索，L3/L4用于更高置信度判断。",
        "counts": {
            "cities": len(FUJIAN_CITY_CODES),
            "counties": len(county_foundation),
            "townStreets": len(town_foundation),
            "extraSamples": len(extra_existing),
        },
    }
    return county_foundation, town_foundation, food_signals, {"decisionMap": decision_map, "v11DecisionMap": v11_decision_map, "districtSummaries": district_summaries, "v11Evidence": v11_evidence}


def main() -> None:
    data = read_json(PREVIEW)
    backup = DATA_DIR / f"preview-data.bak-v11-foundation-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json"
    shutil.copy2(PREVIEW, backup)

    county_foundation, town_foundation, food_signals, derived = build_foundation(data)

    data["countyFoundation"] = county_foundation
    data["townStreetFoundation"] = town_foundation
    data["foodServiceSignals"] = food_signals
    data["v11DecisionMap"] = derived["v11DecisionMap"]
    data["decisionMap"] = derived["decisionMap"]
    data["districtMapMetrics"] = derived["districtSummaries"]
    existing_evidence = [row for row in data.get("publicEvidencePoints", []) if not str(row.get("证据ID", "")).startswith("V11-EVID-")]
    data["publicEvidencePoints"] = existing_evidence + derived["v11Evidence"]

    meta = data.setdefault("meta", {})
    meta["version"] = "1.1 福建县镇街全量初阶决策地图"
    meta["v11FoundationUpdatedAt"] = TODAY
    meta["v11AdminSource"] = ADMIN_URL
    meta["v11DataPolicy"] = "县镇街全量骨架来自福建省民政厅2025行政区划；人口/经济/消费/餐饮为公开资料+初阶模型估算，需平台和实地复核。"

    stats = data.setdefault("stats", {})
    stats["v11福建城市"] = len(FUJIAN_CITY_CODES)
    stats["v11县级单位"] = len(county_foundation)
    stats["v11镇街单位"] = len(town_foundation)
    stats["v11餐饮信号"] = len(food_signals)
    stats["v11地图证据点"] = len(derived["v11Evidence"])

    write_json(PREVIEW, data)
    print(f"backup={backup}")
    print(
        json.dumps(
            {
                "县级单位": len(county_foundation),
                "镇街单位": len(town_foundation),
                "餐饮信号": len(food_signals),
                "地图证据点": len(derived["v11Evidence"]),
                "城市镇街": Counter(row["城市"] for row in town_foundation),
            },
            ensure_ascii=False,
            indent=2,
            default=dict,
        )
    )


if __name__ == "__main__":
    main()
