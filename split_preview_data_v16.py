"""
周麻婆福建选址地图 1.6：数据分包脚本

把单个大型 preview-data.json 拆成：
- data/preview-data-core.json：首页和城市排行轻量数据
- data/city-packs/<城市>.json：城市/区县/镇街下钻所需数据

原 preview-data.json 保留在本地但不再作为线上主加载入口。
"""

from __future__ import annotations

import json
import shutil
from datetime import datetime
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
PREVIEW = DATA_DIR / "preview-data.json"
PACK_DIR = DATA_DIR / "city-packs"
TODAY = "2026-05-11"

FUJIAN_CITIES = ["福州", "厦门", "泉州", "漳州", "莆田", "宁德", "龙岩", "南平", "三明"]

GLOBAL_KEYS = [
    "meta",
    "stats",
    "cities",
    "businessAreas",
    "sources",
    "mapLayerMetrics",
    "qualityDashboard",
    "sourceLevels",
    "sourceRadarPack",
    "commercialSignalPack",
    "leafletMapConfig",
    "mapCameraConfig",
    "v15DecisionMap",
    "v14DecisionMap",
    "decisionMap",
    "countyInsightPack",
    "countyEvidencePack",
    "districtMapMetrics",
]

CITY_FILTER_KEYS = [
    # Keep only what the 1.6 front-end needs for maps, ranking, detail cards and popups.
    "businessAreas",
    "townStreetMapPoints",
    "storeMapPoints",
    "competitorMapPoints",
    "evidenceMapPoints",
]

DECISION_MAP_LIST_KEYS = [
    "citySummaries",
    "districtSummaries",
    "streetDecisionScore",
    "streetSummaries",
    "ownStorePoints",
    "coreCompetitorPoints",
    "countyInsightPack",
    "townOpportunityPack",
    "countyEvidencePack",
    "townEvidencePack",
]


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8-sig"))


def write_json(path: Path, data: Any) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def text(value: Any, default: str = "") -> str:
    if value is None:
        return default
    value = str(value).strip()
    return value if value else default


def city_of(row: dict[str, Any]) -> str:
    return text(row.get("城市")).replace("市", "").replace("地区", "").replace("省", "")


def filter_rows(rows: Any, city: str) -> list[dict[str, Any]]:
    if not isinstance(rows, list):
        return []
    return [row for row in rows if isinstance(row, dict) and city_of(row) == city]


def filter_decision_map(dm: Any, city: str) -> dict[str, Any]:
    if not isinstance(dm, dict):
        return {}
    result: dict[str, Any] = {}
    for key, value in dm.items():
        if isinstance(value, list) and key in DECISION_MAP_LIST_KEYS:
            result[key] = filter_rows(value, city)
        else:
            result[key] = value
    return result


def compact_decision_map(dm: Any) -> dict[str, Any]:
    if not isinstance(dm, dict):
        return {}
    keep = {}
    for key, value in dm.items():
        if key in {"citySummaries", "sourceRadarPack", "sourceSummary", "provinceSignals", "sources", "commercialSignalPack"}:
            keep[key] = value
        elif key in {"countyEvidencePack", "countyInsightPack", "districtSummaries"} and isinstance(value, list):
            keep[key] = value
    return keep


def make_core(data: dict[str, Any]) -> dict[str, Any]:
    core = {key: data.get(key) for key in GLOBAL_KEYS if key in data}
    core["meta"] = dict(core.get("meta") or {})
    core["meta"]["version"] = "1.6 数据分包提速"
    core["meta"]["splitUpdatedAt"] = TODAY
    core["meta"]["cityPackPath"] = "data/city-packs/{city}.json"
    core["decisionMap"] = compact_decision_map(data.get("decisionMap") or data.get("v15DecisionMap"))
    core["v15DecisionMap"] = compact_decision_map(data.get("v15DecisionMap"))
    core["v14DecisionMap"] = compact_decision_map(data.get("v14DecisionMap"))
    core["cityPackIndex"] = [
        {
            "城市": city,
            "文件": f"data/city-packs/{city}.json",
            "数据更新时间": TODAY,
        }
        for city in FUJIAN_CITIES
    ]
    return core


def make_city_pack(data: dict[str, Any], city: str) -> dict[str, Any]:
    pack: dict[str, Any] = {
        "meta": {
            "version": "1.6 城市分包",
            "城市": city,
            "数据更新时间": TODAY,
        }
    }
    for key in CITY_FILTER_KEYS:
        if key in data:
            pack[key] = filter_rows(data[key], city)
    pack["decisionMap"] = filter_decision_map(data.get("decisionMap") or data.get("v15DecisionMap"), city)
    pack["v15DecisionMap"] = filter_decision_map(data.get("v15DecisionMap"), city)
    pack["v14DecisionMap"] = filter_decision_map(data.get("v14DecisionMap"), city)
    pack["sourceRadarPack"] = data.get("sourceRadarPack", [])
    pack["commercialSignalPack"] = filter_rows(data.get("commercialSignalPack", []), city)
    pack["leafletMapConfig"] = data.get("leafletMapConfig", {})
    pack["mapCameraConfig"] = data.get("mapCameraConfig", {})
    return pack


def main() -> None:
    data = read_json(PREVIEW)
    PACK_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup = DATA_DIR / f"preview-data.bak-v16-split-{stamp}.json"
    shutil.copy2(PREVIEW, backup)

    core = make_core(data)
    write_json(DATA_DIR / "preview-data-core.json", core)

    total_city_bytes = 0
    for city in FUJIAN_CITIES:
        pack = make_city_pack(data, city)
        out = PACK_DIR / f"{city}.json"
        write_json(out, pack)
        total_city_bytes += out.stat().st_size

    print("已生成数据分包")
    print("core:", (DATA_DIR / "preview-data-core.json").stat().st_size)
    print("city packs total:", total_city_bytes)
    for city in FUJIAN_CITIES:
        out = PACK_DIR / f"{city}.json"
        pack = read_json(out)
        rows = pack.get("townStreetMapPoints") or []
        print(city, out.stat().st_size, "镇街", len(rows))
    print("backup:", backup)


if __name__ == "__main__":
    main()
