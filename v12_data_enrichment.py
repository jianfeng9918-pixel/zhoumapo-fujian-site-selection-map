"""
周麻婆福建选址地图 1.2 数据深化脚本

在 1.1 全量县镇街骨架上继续补：
- countyDataPack：84 个县区的人口/经济/消费/餐饮/商业初阶数据包。
- townStreetDataPack：1110 个镇街的类型、消费、餐饮机会、看铺动作。
- foodOpportunitySignals：镇街级餐饮机会信号。
- mapCameraConfig：前端自动适配放大的地图相机配置。

说明：
- 本脚本不接高德，不伪造街道边界。
- L1/L2 字段用于前置筛选，不作为签约依据。
"""

from __future__ import annotations

import json
import math
import shutil
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
PREVIEW = DATA_DIR / "preview-data.json"
TODAY = "2026-05-11"

CITY_PROFILE = {
    "福州": {"population": 852, "gdp": 15112, "retail": 5969, "service": 8910, "foodTone": "省会商务、家庭消费和核心商圈活跃"},
    "厦门": {"population": 535, "gdp": 8589, "retail": 2900, "service": 5200, "foodTone": "旅游商务、高消费客群和购物中心活跃"},
    "泉州": {"population": 888, "gdp": 12900, "retail": 5900, "service": 6200, "foodTone": "县域民营经济强、家庭聚餐和镇区消费活跃"},
    "漳州": {"population": 506, "gdp": 5960, "retail": 2300, "service": 2700, "foodTone": "厦漳泉外溢、县城主街和社区消费机会"},
    "莆田": {"population": 321, "gdp": 3500, "retail": 1450, "service": 1700, "foodTone": "沿海商业、本店基础和县城补点机会"},
    "三明": {"population": 244, "gdp": 3300, "retail": 1000, "service": 1350, "foodTone": "山区县城、成熟社区和本店经营观察"},
    "南平": {"population": 263, "gdp": 2400, "retail": 950, "service": 1200, "foodTone": "文旅县城、交通节点和谨慎补点机会"},
    "龙岩": {"population": 272, "gdp": 3400, "retail": 1200, "service": 1500, "foodTone": "闽西中心、县城主街和社区生活圈机会"},
    "宁德": {"population": 318, "gdp": 3800, "retail": 1250, "service": 1550, "foodTone": "新能源产业、沿海县城和本店覆盖观察"},
}

SOURCE_LIBRARY = {
    "福建省民政厅2025行政区划": "https://mzt.fj.gov.cn/gk/tzgg/202601/t20260105_7071220.htm",
    "福建省2025统计公报": "https://www.fujian.gov.cn/zwgk/sjfb/tjgb/202603/t20260313_7109476.htm",
    "KPMG 2025餐饮企业发展报告": "https://assets.kpmg.com/content/dam/kpmgsites/cn/pdf/zh/2025/05/2025-china-food-and-beverage-enterprise-development-report.pdf.coredownload.inline.pdf",
    "赢商网福建重点城市商业报道": "https://m.winshang.com/news726749.html",
}

URBAN_KEYWORDS = ["街道", "城", "中心", "东", "南", "西", "北", "中", "桥", "口", "路", "湖", "江", "港"]
INDUSTRY_KEYWORDS = ["开发", "高新", "工业", "产业", "园", "软件", "科技", "经开"]
CULTURE_TOURISM_KEYWORDS = ["古城", "温泉", "土楼", "武夷", "太姥", "白水洋", "鼓浪", "湄洲", "崇武", "东山", "景区", "旅游", "山", "海"]
SCHOOL_OFFICE_KEYWORDS = ["大学", "学院", "学校", "职教", "软件", "高新", "办公", "金融"]
TRAFFIC_KEYWORDS = ["站", "港", "机场", "码头", "动车", "高速", "枢纽", "桥"]


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8-sig"))


def write_json(path: Path, data: Any) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def num(value: Any, fallback: float = 0.0) -> float:
    try:
        if value is None or value == "":
            return fallback
        return float(str(value).replace(",", "").replace("分", ""))
    except ValueError:
        return fallback


def clean_city(value: Any) -> str:
    return str(value or "").strip().replace("市", "").replace("地区", "").replace("省", "")


def grade(score: float) -> str:
    if score >= 84:
        return "A"
    if score >= 74:
        return "B"
    if score >= 64:
        return "C"
    return "D"


def point(row: dict[str, Any]) -> tuple[float, float] | None:
    try:
        lon = float(row.get("经度"))
        lat = float(row.get("纬度"))
    except (TypeError, ValueError):
        return None
    if not math.isfinite(lon) or not math.isfinite(lat):
        return None
    return lon, lat


def bounds(points: list[tuple[float, float]], min_span: float = 0.012, pad: float = 0.12) -> dict[str, float] | None:
    if not points:
        return None
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    width = max_x - min_x
    height = max_y - min_y
    if width < min_span:
        add = (min_span - width) / 2
        min_x -= add
        max_x += add
    if height < min_span:
        add = (min_span - height) / 2
        min_y -= add
        max_y += add
    width = max_x - min_x
    height = max_y - min_y
    return {
        "minX": round(min_x - width * pad, 6),
        "maxX": round(max_x + width * pad, 6),
        "minY": round(min_y - height * pad, 6),
        "maxY": round(max_y + height * pad, 6),
    }


def distance_km(a: tuple[float, float] | None, b: tuple[float, float] | None) -> float:
    if not a or not b:
        return 9999
    radius = 6371
    lon1, lat1 = math.radians(a[0]), math.radians(a[1])
    lon2, lat2 = math.radians(b[0]), math.radians(b[1])
    dlon = lon2 - lon1
    dlat = lat2 - lat1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * radius * math.atan2(math.sqrt(h), math.sqrt(1 - h))


def group_by(rows: list[dict[str, Any]], *keys: str) -> dict[tuple[Any, ...], list[dict[str, Any]]]:
    result: dict[tuple[Any, ...], list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        result[tuple(row.get(key, "") for key in keys)].append(row)
    return result


def row_count(rows: list[dict[str, Any]], name: str) -> int:
    short = name.replace("街道", "").replace("镇", "").replace("乡", "")
    count = 0
    for row in rows:
        hay = " ".join(str(row.get(key, "")) for key in ["街道/片区", "地址", "关联商圈", "门店名称", "名称"])
        if name in hay or (len(short) >= 2 and short in hay):
            count += 1
    return count


def classify_town(row: dict[str, Any]) -> list[str]:
    name = row.get("街道/片区", "")
    district = row.get("区县", "")
    text = f"{name}{district}{row.get('关联商圈','')}"
    tags: list[str] = []
    if row.get("镇街类型") == "街道" or any(word in text for word in URBAN_KEYWORDS):
        tags.append("县城主街/成熟社区")
    if row.get("镇街类型") == "镇":
        tags.append("乡镇中心")
    if any(word in text for word in INDUSTRY_KEYWORDS):
        tags.append("产业园/办公客群")
    if any(word in text for word in CULTURE_TOURISM_KEYWORDS):
        tags.append("文旅消费")
    if any(word in text for word in SCHOOL_OFFICE_KEYWORDS):
        tags.append("高校/办公")
    if any(word in text for word in TRAFFIC_KEYWORDS):
        tags.append("交通节点")
    if not tags:
        tags.append("基础生活圈")
    return tags


def county_weight(row: dict[str, Any]) -> float:
    kind = row.get("县区类型", "")
    base = 2.4 if kind == "市辖区" else 2.0 if kind == "县级市" else 1.35
    base += min(2.2, num(row.get("镇街数量")) / 18)
    base += min(2.4, num(row.get("五大竞品门店数")) / 22)
    base += min(1.8, num(row.get("周麻婆门店数")) / 12)
    base += min(1.4, num(row.get("商圈样本数")) / 6)
    return max(0.6, base)


def town_weight(row: dict[str, Any]) -> float:
    tags = classify_town(row)
    base = 2.2 if row.get("镇街类型") == "街道" else 1.5 if row.get("镇街类型") == "镇" else 0.9
    base += min(1.8, num(row.get("街道评分")) / 50)
    base += min(1.5, num(row.get("五大竞品门店数")) / 4)
    base += min(1.2, num(row.get("周麻婆现有门店数")) / 2)
    if "县城主街/成熟社区" in tags:
        base += 0.8
    if "产业园/办公客群" in tags or "高校/办公" in tags:
        base += 0.55
    if "文旅消费" in tags:
        base += 0.45
    return max(0.5, base)


def decision_action(row: dict[str, Any], tags: list[str]) -> str:
    score = num(row.get("街道评分"))
    own = num(row.get("周麻婆现有门店数"))
    comp = num(row.get("五大竞品门店数"))
    if own > 0 and score >= 74:
        return "本店已覆盖：评估补点、保护半径和同区分流。"
    if score >= 84 and own == 0:
        return "本周优先看：先核验租金、平台销量、门头动线和100米竞品。"
    if comp > 0 and score >= 74:
        return "可观察：竞品已验证需求，优先补美团/点评和租金。"
    if "文旅消费" in tags and score >= 70:
        return "季节性观察：补文旅客流、停车和外卖半径。"
    if score < 64:
        return "谨慎：先做县区级复核，暂不进入看铺清单。"
    return "补数据观察：先查平台热度、成熟社区和商业主街。"


def evidence_summary(row: dict[str, Any], tags: list[str], profile: dict[str, Any]) -> str:
    return (
        f"{row['街道/片区']}属于{row['区县']}，标签为{'、'.join(tags)}；"
        f"结合{row['城市']}的{profile['foodTone']}，当前用于前置筛选。"
    )


def build_data_packs(data: dict[str, Any]) -> dict[str, Any]:
    counties = data.get("countyFoundation", [])
    towns = data.get("townStreetFoundation", [])
    stores_by_county = group_by(data.get("storeDistribution", []), "城市", "区县")
    comps_by_county = group_by(data.get("decisionMap", {}).get("coreCompetitorPoints", []), "城市", "区县")
    areas_by_county = group_by(data.get("businessAreas", []), "城市", "区县")
    rents_by_county = group_by(data.get("rentSamples", []), "城市", "区县")
    evidence_by_street = group_by(data.get("publicEvidencePoints", []), "决策ID")
    towns_by_county = group_by(towns, "城市", "区县")

    county_weight_sum: dict[str, float] = defaultdict(float)
    weights: dict[str, float] = {}
    for row in counties:
        w = county_weight(row)
        weights[row["记录ID"]] = w
        county_weight_sum[row["城市"]] += w

    county_pack: list[dict[str, Any]] = []
    county_estimates: dict[tuple[str, str], dict[str, float]] = {}
    for row in counties:
        city = row["城市"]
        profile = CITY_PROFILE.get(city, CITY_PROFILE["漳州"])
        share = weights[row["记录ID"]] / max(0.1, county_weight_sum[city])
        population = round(profile["population"] * share, 1)
        gdp = round(profile["gdp"] * share, 1)
        retail = round(profile["retail"] * share, 1)
        service = round(profile["service"] * share, 1)
        key = (city, row["区县"])
        town_rows = towns_by_county.get(key, [])
        top_towns = sorted(town_rows, key=lambda item: num(item.get("街道评分")), reverse=True)[:5]
        county_estimates[key] = {"population": population, "gdp": gdp, "retail": retail, "service": service}
        county_pack.append(
            {
                "记录ID": row["记录ID"].replace("V11", "V12"),
                "省份": "福建",
                "城市": city,
                "区县": row["区县"],
                "区县代码": row["区县代码"],
                "县区类型": row["县区类型"],
                "常住人口估算万人": population,
                "GDP估算亿元": gdp,
                "社零估算亿元": retail,
                "第三产业估算亿元": service,
                "居民消费线索": "高消费/商务家庭客群" if retail >= 500 else "县城稳定消费" if retail >= 180 else "基础生活消费",
                "餐饮活跃度": "强" if num(row.get("综合评分")) >= 84 else "较强" if num(row.get("综合评分")) >= 74 else "中等",
                "商业成熟度": row.get("商业成熟度", "基础商业"),
                "本店覆盖": row.get("周麻婆门店数", 0),
                "五大竞品验证": row.get("五大竞品门店数", 0),
                "商圈样本": row.get("商圈样本数", 0),
                "租金样本": row.get("租金样本数", 0),
                "镇街数量": row.get("镇街数量", len(town_rows)),
                "推荐镇街": "、".join(item["街道/片区"] for item in top_towns),
                "主要机会": f"{row['区县']}优先看{('、'.join(item['街道/片区'] for item in top_towns[:3]) or '县城主街')}；{profile['foodTone']}。",
                "主要风险": "估算口径需用县区统计公报、平台热力、租金和实地照片复核。",
                "下一步动作": "按镇街榜安排本周看铺/平台核验/租金复核。",
                "来源等级": "L2公开资料+L1模型估算",
                "来源": "；".join(SOURCE_LIBRARY.values()),
                "数据更新时间": TODAY,
            }
        )

    town_pack: list[dict[str, Any]] = []
    food_signals: list[dict[str, Any]] = []
    enriched_towns: list[dict[str, Any]] = []
    for (city, district), rows in towns_by_county.items():
        profile = CITY_PROFILE.get(city, CITY_PROFILE["漳州"])
        county_est = county_estimates.get((city, district), {"population": 20, "gdp": 150, "retail": 60, "service": 70})
        total_weight = sum(town_weight(row) for row in rows) or 1
        for row in rows:
            tags = classify_town(row)
            share = town_weight(row) / total_weight
            population = round(county_est["population"] * share, 2)
            retail = round(county_est["retail"] * share, 2)
            food_index = round(min(95, max(45, num(row.get("街道评分")) * 0.64 + num(row.get("五大竞品门店数")) * 4 + num(row.get("公开证据点数")) * 1.6 + (8 if "县城主街/成熟社区" in tags else 0))), 1)
            commercial_update = "强商业更新" if food_index >= 82 else "有商业验证" if food_index >= 70 else "基础生活圈"
            source_level = row.get("来源等级") or "L1"
            if row.get("定位状态") == "已定位" and source_level == "L1":
                source_level = "L2"
            action = decision_action(row, tags)
            detail = dict(row)
            detail.update(
                {
                    "镇街角色标签": "、".join(tags),
                    "服务人口估算万人": population,
                    "社零贡献估算亿元": retail,
                    "餐饮机会指数": food_index,
                    "商业更新信号": commercial_update,
                    "居民消费线索": "家庭聚餐/工作餐" if "县城主街/成熟社区" in tags else "乡镇生活消费" if row.get("镇街类型") == "镇" else "基础消费",
                    "交通学校住宅文旅标签": "、".join(tags),
                    "1.2最终动作": action,
                    "1.2证据摘要": evidence_summary(row, tags, profile),
                    "来源等级": source_level,
                    "数据更新时间": TODAY,
                }
            )
            enriched_towns.append(detail)
            town_pack.append(
                {
                    "决策ID": row["决策ID"],
                    "省份": "福建",
                    "城市": city,
                    "区县": district,
                    "镇街": row["街道/片区"],
                    "镇街类型": row.get("镇街类型"),
                    "镇街角色标签": detail["镇街角色标签"],
                    "服务人口估算万人": population,
                    "社零贡献估算亿元": retail,
                    "餐饮机会指数": food_index,
                    "商业更新信号": commercial_update,
                    "本店覆盖": row.get("周麻婆现有门店数", 0),
                    "五大竞品验证": row.get("五大竞品门店数", 0),
                    "证据点数": len(evidence_by_street.get((row["决策ID"],), [])) or row.get("公开证据点数", 0),
                    "推荐等级": row.get("推荐等级"),
                    "街道评分": row.get("街道评分"),
                    "最终动作": action,
                    "来源等级": source_level,
                    "来源": "福建省行政区划/统计公报/餐饮报告方法论/本地样本推断",
                    "数据更新时间": TODAY,
                }
            )
            food_signals.append(
                {
                    "信号ID": row["决策ID"].replace("V11", "V12-FOOD"),
                    "决策ID": row["决策ID"],
                    "城市": city,
                    "区县": district,
                    "镇街": row["街道/片区"],
                    "信号类型": "餐饮机会",
                    "餐饮机会指数": food_index,
                    "商业更新信号": commercial_update,
                    "信号摘要": detail["1.2证据摘要"],
                    "最终动作": action,
                    "来源等级": source_level,
                    "数据更新时间": TODAY,
                }
            )

    camera = build_camera_config(data, enriched_towns)
    return {
        "countyDataPack": county_pack,
        "townStreetDataPack": town_pack,
        "foodOpportunitySignals": food_signals,
        "enrichedTownFoundation": enriched_towns,
        "mapCameraConfig": camera,
    }


def build_camera_config(data: dict[str, Any], towns: list[dict[str, Any]]) -> dict[str, Any]:
    stores = data.get("decisionMap", {}).get("ownStorePoints", data.get("storeDistribution", []))
    comps = data.get("decisionMap", {}).get("coreCompetitorPoints", [])
    evidence = data.get("publicEvidencePoints", [])
    by_county = group_by(towns, "城市", "区县")
    stores_by_county = group_by(stores, "城市", "区县")
    comps_by_county = group_by(comps, "城市", "区县")
    evidence_by_decision = group_by(evidence, "决策ID")
    config: dict[str, Any] = {
        "version": "1.2",
        "defaultMode": "auto",
        "districtCameras": {},
        "streetCameras": {},
        "rules": {
            "districtMinFillRatio": 0.72,
            "districtMaxFillRatio": 0.86,
            "detailRadiusKm": "1.5-3",
            "densePointClusterThreshold": 18,
        },
    }
    for key, rows in by_county.items():
        city, district = key
        pts = [point(row) for row in rows]
        pts = [p for p in pts if p]
        top_rows = sorted(rows, key=lambda row: num(row.get("街道评分")), reverse=True)[: min(12, max(5, len(rows)))]
        top_pts = [point(row) for row in top_rows]
        top_pts = [p for p in top_pts if p]
        all_bounds = bounds(pts, min_span=0.018, pad=0.08)
        core_bounds = bounds(top_pts or pts, min_span=0.014, pad=0.10)
        config["districtCameras"][f"{city}|{district}"] = {
            "mode": "coreLens" if len(rows) >= 13 else "auto",
            "townCount": len(rows),
            "bounds": all_bounds,
            "coreBounds": core_bounds,
            "ownStores": len(stores_by_county.get((city, district), [])),
            "coreCompetitors": len(comps_by_county.get((city, district), [])),
        }
        for row in rows:
            center = point(row)
            around = [row] + evidence_by_decision.get((row["决策ID"],), [])
            if center:
                around += [item for item in stores_by_county.get((city, district), []) if distance_km(center, point(item)) <= 2.0]
                around += [item for item in comps_by_county.get((city, district), []) if distance_km(center, point(item)) <= 3.0]
            pts_around = [point(item) for item in around]
            pts_around = [p for p in pts_around if p]
            config["streetCameras"][row["决策ID"]] = {
                "center": {"lon": center[0], "lat": center[1]} if center else None,
                "bounds": bounds(pts_around, min_span=0.010, pad=0.16),
                "detailBounds": bounds(pts_around, min_span=0.012, pad=0.12),
                "nearEvidence": len(evidence_by_decision.get((row["决策ID"],), [])),
                "recommendedZoom": "local",
            }
    for county in data.get("countyFoundation", []):
        city = county.get("城市", "")
        district = county.get("区县", "")
        camera_key = f"{city}|{district}"
        if camera_key in config["districtCameras"]:
            continue
        try:
            lon = float(county.get("经度"))
            lat = float(county.get("纬度"))
        except (TypeError, ValueError):
            lon, lat = 119.0, 26.0
        fallback_bounds = bounds([(lon, lat)], min_span=0.05, pad=0.18)
        config["districtCameras"][camera_key] = {
            "mode": "countyOnly",
            "townCount": 0,
            "bounds": fallback_bounds,
            "coreBounds": fallback_bounds,
            "ownStores": county.get("周麻婆门店数", 0),
            "coreCompetitors": county.get("五大竞品门店数", 0),
        }
    return config


def main() -> None:
    data = read_json(PREVIEW)
    backup = DATA_DIR / f"preview-data.bak-v12-enrichment-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json"
    shutil.copy2(PREVIEW, backup)

    packs = build_data_packs(data)
    data["countyDataPack"] = packs["countyDataPack"]
    data["townStreetDataPack"] = packs["townStreetDataPack"]
    data["foodOpportunitySignals"] = packs["foodOpportunitySignals"]
    data["mapCameraConfig"] = packs["mapCameraConfig"]
    data["townStreetFoundation"] = packs["enrichedTownFoundation"]

    decision = data.setdefault("decisionMap", {})
    extras = decision.get("extraStreetSamples", [])
    decision["streetDecisionScore"] = packs["enrichedTownFoundation"] + extras
    decision["streetSummaries"] = packs["enrichedTownFoundation"] + extras
    decision["townStreetScores"] = packs["enrichedTownFoundation"]

    data["v12DecisionMap"] = {
        "citySummaries": decision.get("citySummaries", []),
        "countySummaries": data.get("districtMapMetrics", []),
        "townStreetScores": packs["enrichedTownFoundation"],
        "mapCameraConfig": packs["mapCameraConfig"],
        "sourcePolicy": "L1/L2 用于前置筛选；L3/L4 用于更高置信判断；最终签约仍需平台、租金、实地复核。",
        "counts": {
            "counties": len(packs["countyDataPack"]),
            "townStreets": len(packs["townStreetDataPack"]),
            "foodSignals": len(packs["foodOpportunitySignals"]),
            "districtCameras": len(packs["mapCameraConfig"]["districtCameras"]),
            "streetCameras": len(packs["mapCameraConfig"]["streetCameras"]),
        },
    }

    meta = data.setdefault("meta", {})
    meta["version"] = "1.2 自适应地图与县镇街数据深化"
    meta["v12UpdatedAt"] = TODAY
    meta["v12Sources"] = SOURCE_LIBRARY
    meta["v12DataPolicy"] = "县镇街数据为官方区划+公开统计/商业资料+模型估算；用于前置筛选，不作为签约依据。"

    stats = data.setdefault("stats", {})
    stats["v12县区数据包"] = len(packs["countyDataPack"])
    stats["v12镇街数据包"] = len(packs["townStreetDataPack"])
    stats["v12餐饮信号"] = len(packs["foodOpportunitySignals"])
    stats["v12地图相机"] = len(packs["mapCameraConfig"]["districtCameras"]) + len(packs["mapCameraConfig"]["streetCameras"])

    write_json(PREVIEW, data)
    print(
        json.dumps(
            {
                "backup": str(backup),
                "countyDataPack": len(packs["countyDataPack"]),
                "townStreetDataPack": len(packs["townStreetDataPack"]),
                "foodOpportunitySignals": len(packs["foodOpportunitySignals"]),
                "mapCameraDistricts": len(packs["mapCameraConfig"]["districtCameras"]),
                "mapCameraStreets": len(packs["mapCameraConfig"]["streetCameras"]),
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
