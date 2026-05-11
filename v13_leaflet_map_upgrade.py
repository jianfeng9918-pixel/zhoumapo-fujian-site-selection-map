"""
周麻婆福建选址地图 1.3 Leaflet 数据整理脚本

目标：
- 输出 Leaflet 真实地图专用数据包。
- 统一“镇街”和“街道/片区”字段，避免榜单有数据但地图/详情读不到。
- 保留现有坐标，不做 Nominatim/OSM 批量地理编码。
"""

from __future__ import annotations

import json
import math
import shutil
from datetime import datetime
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
PREVIEW = DATA_DIR / "preview-data.json"
TODAY = "2026-05-11"
CORE_COMPETITORS = ("小叫天", "醉得意", "四方桌", "大丰收", "姑奶奶")


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8-sig"))


def write_json(path: Path, data: Any) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def text(value: Any, default: str = "") -> str:
    if value is None:
        return default
    value = str(value).strip()
    return value if value else default


def num(value: Any, default: float = 0.0) -> float:
    try:
        parsed = float(str(value).replace(",", "").replace("分", ""))
    except (TypeError, ValueError):
        return default
    return parsed if math.isfinite(parsed) else default


def has_point(row: dict[str, Any]) -> bool:
    try:
        lon = float(row.get("经度"))
        lat = float(row.get("纬度"))
    except (TypeError, ValueError):
        return False
    return math.isfinite(lon) and math.isfinite(lat)


def norm_city(value: Any) -> str:
    return text(value).replace("市", "").replace("地区", "").replace("省", "")


def norm_district(value: Any) -> str:
    return text(value).replace(" ", "")


def street_name(row: dict[str, Any]) -> str:
    return text(row.get("街道/片区") or row.get("镇街") or row.get("街道") or row.get("名称"))


def point_id(row: dict[str, Any]) -> str:
    return text(row.get("点ID") or row.get("决策ID") or f"{row.get('城市','')}-{row.get('区县','')}-{street_name(row)}")


def merge_rows(base: dict[str, Any], extra: dict[str, Any]) -> dict[str, Any]:
    merged = dict(base)
    for key, value in extra.items():
        if value not in (None, "", "待补"):
            merged[key] = value
    return merged


def index_rows(rows: list[dict[str, Any]]) -> dict[tuple[str, str, str], dict[str, Any]]:
    result: dict[tuple[str, str, str], dict[str, Any]] = {}
    for row in rows:
        key = (norm_city(row.get("城市")), norm_district(row.get("区县")), street_name(row))
        if all(key):
            result[key] = row
    return result


def coord_precision(row: dict[str, Any]) -> str:
    precision = text(row.get("坐标精度") or row.get("定位状态") or row.get("坐标来源"))
    if precision:
        if "估算" in precision or "示意" in precision:
            return "估算坐标"
        if "待" in precision:
            return "待复核坐标"
        return precision
    source_level = text(row.get("来源等级"))
    if source_level in ("L3", "L4", "L5"):
        return "样本坐标"
    return "估算坐标"


def normalize_town_rows(data: dict[str, Any]) -> list[dict[str, Any]]:
    decision_map = data.setdefault("decisionMap", {})
    primary = decision_map.get("streetDecisionScore") or data.get("streetMapPoints") or data.get("streetDecisions") or []
    by_key = index_rows(data.get("streetDecisions", []))
    by_map_key = index_rows(data.get("streetMapPoints", []))
    output: list[dict[str, Any]] = []
    seen: set[str] = set()

    for raw in primary:
        row = dict(raw)
        name = street_name(row)
        key = (norm_city(row.get("城市")), norm_district(row.get("区县")), name)
        if key in by_key:
            row = merge_rows(by_key[key], row)
        if key in by_map_key:
            row = merge_rows(row, by_map_key[key])
        row["街道/片区"] = name
        row["镇街"] = name
        row["点ID"] = point_id(row)
        row["坐标精度"] = coord_precision(row)
        row["地图点类型"] = "镇街"
        row["地图图层"] = "推荐镇街"
        row["Leaflet弹窗标题"] = name
        row["Leaflet弹窗摘要"] = (
            f"{name}：{num(row.get('街道评分')):.0f}分，"
            f"{text(row.get('适合店型'), '适合店型待判断')}，"
            f"本店{num(row.get('周麻婆现有门店数')):.0f}，"
            f"竞品{num(row.get('五大竞品门店数')):.0f}。"
        )
        if has_point(row):
            seen.add(row["点ID"])
            output.append(row)

    # 把 1.1 的全量镇街也纳入，若缺坐标则暂不进地图点，但保留在镇街数据包。
    for raw in data.get("townStreetDataPack", []):
        row = dict(raw)
        name = street_name(row)
        row["街道/片区"] = name
        row["镇街"] = name
        row["点ID"] = point_id(row)
        row["坐标精度"] = coord_precision(row)
        row["地图点类型"] = "镇街"
        if row["点ID"] not in seen and has_point(row):
            seen.add(row["点ID"])
            output.append(row)

    output.sort(key=lambda item: (norm_city(item.get("城市")), norm_district(item.get("区县")), -num(item.get("街道评分"))))
    decision_map["streetDecisionScore"] = output
    decision_map["streetSummaries"] = output
    return output


def normalize_store_rows(data: dict[str, Any]) -> list[dict[str, Any]]:
    rows = data.get("decisionMap", {}).get("ownStorePoints") or [
        row for row in data.get("storeDistribution", []) if text(row.get("品牌")) == "周麻婆"
    ]
    output: list[dict[str, Any]] = []
    for raw in rows:
        if not has_point(raw):
            continue
        row = dict(raw)
        row["地图点类型"] = "周麻婆门店"
        row["坐标精度"] = coord_precision(row)
        row["Leaflet弹窗标题"] = text(row.get("门店名称"), "周麻婆门店")
        row["Leaflet弹窗摘要"] = text(row.get("地址") or row.get("街道/片区") or row.get("区县"))
        output.append(row)
    data.setdefault("decisionMap", {})["ownStorePoints"] = output
    return output


def normalize_competitor_rows(data: dict[str, Any]) -> list[dict[str, Any]]:
    rows = data.get("decisionMap", {}).get("coreCompetitorPoints") or data.get("competitorStores", [])
    output: list[dict[str, Any]] = []
    for raw in rows:
        brand_blob = text(raw.get("核心竞品品牌") or raw.get("竞品品牌") or raw.get("品牌") or raw.get("门店名称"))
        if not any(brand in brand_blob for brand in CORE_COMPETITORS):
            continue
        if not has_point(raw):
            continue
        row = dict(raw)
        row["地图点类型"] = "五大竞品"
        row["坐标精度"] = coord_precision(row)
        row["Leaflet弹窗标题"] = text(row.get("门店名称"), "五大竞品门店")
        row["Leaflet弹窗摘要"] = f"{text(row.get('竞品品牌') or row.get('核心竞品品牌'))} · {text(row.get('地址') or row.get('关联商圈') or row.get('街道/片区'))}"
        output.append(row)
    data.setdefault("decisionMap", {})["coreCompetitorPoints"] = output
    return output


def normalize_evidence_rows(data: dict[str, Any]) -> list[dict[str, Any]]:
    rows = data.get("publicEvidencePoints", [])
    output: list[dict[str, Any]] = []
    for raw in rows:
        if not has_point(raw):
            continue
        row = dict(raw)
        row["地图点类型"] = "公开证据点"
        row["坐标精度"] = coord_precision(row)
        row["Leaflet弹窗标题"] = text(row.get("名称"), "公开证据点")
        row["Leaflet弹窗摘要"] = f"{text(row.get('类型'))} · {text(row.get('说明') or row.get('街道/片区'))}"
        output.append(row)
    return output


def main() -> None:
    data = read_json(PREVIEW)
    backup = DATA_DIR / f"preview-data.bak-v13-leaflet-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json"
    shutil.copy2(PREVIEW, backup)

    town_points = normalize_town_rows(data)
    store_points = normalize_store_rows(data)
    competitor_points = normalize_competitor_rows(data)
    evidence_points = normalize_evidence_rows(data)

    data["townStreetMapPoints"] = town_points
    data["storeMapPoints"] = store_points
    data["competitorMapPoints"] = competitor_points
    data["evidenceMapPoints"] = evidence_points
    data["leafletMapConfig"] = {
        "provider": "OpenStreetMap",
        "tileUrl": "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        "attribution": "© OpenStreetMap contributors",
        "defaultCenter": [26.0745, 119.2965],
        "defaultZoom": 11,
        "version": "1.3",
    }
    data.setdefault("stats", {})["v13镇街地图点"] = len(town_points)
    data.setdefault("stats", {})["v13本店地图点"] = len(store_points)
    data.setdefault("stats", {})["v13竞品地图点"] = len(competitor_points)
    data.setdefault("stats", {})["v13证据地图点"] = len(evidence_points)
    data.setdefault("meta", {})["version"] = "1.3 Leaflet/OSM 真实地图版"
    data.setdefault("meta", {})["updated"] = TODAY

    write_json(PREVIEW, data)
    print(json.dumps({
        "backup": str(backup),
        "townStreetMapPoints": len(town_points),
        "storeMapPoints": len(store_points),
        "competitorMapPoints": len(competitor_points),
        "evidenceMapPoints": len(evidence_points),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
