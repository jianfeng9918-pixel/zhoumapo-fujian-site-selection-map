"""
周麻婆福建选址地图 1.4 数据自动补强脚本

目标：
- 在 1.3 Leaflet/OSM 真实地图底盘上，继续补厚县区、镇街、餐饮机会和商业信号。
- 不等待新增内部资料，先用官方/准官方公开资料、公开商业资料和模型推断生成初阶决策数据。
- 所有 L1/L2 数据只用于前置筛选和看铺顺序，不作为最终签约依据。
"""

from __future__ import annotations

import json
import math
import shutil
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
PREVIEW = DATA_DIR / "preview-data.json"
TODAY = "2026-05-11"

SOURCES = {
    "福建省民政厅2025行政区划": "https://mzt.fj.gov.cn/gk/tzgg/202601/t20260105_7071220.htm",
    "福建省2025统计公报": "https://www.fujian.gov.cn/zwgk/sjfb/tjgb/202603/t20260313_7109476.htm",
    "福建统计局年度数据": "https://tjj.fj.gov.cn/xxgk/ndsj/",
    "KPMG 2025餐饮企业发展报告": "https://assets.kpmg.com/content/dam/kpmgsites/cn/pdf/zh/2025/05/2025-china-food-and-beverage-enterprise-development-report.pdf.coredownload.inline.pdf",
    "赢商网福建商业报道": "https://m.winshang.com/news726749.html",
}

PROVINCE_SIGNALS = {
    "行政区划": "福建 9 个设区市、84 个县级单位、1110 个乡级单位；用于全量县镇街骨架。",
    "餐饮市场": "2025 年福建餐饮收入额约 2650.02 亿元，住宿餐饮业增加值约 1072.05 亿元；用于餐饮机会基准。",
    "餐饮趋势": "连锁餐饮继续向社区、购物中心、县城主街和下沉市场渗透；用于店型适配和前置筛选。",
}

CITY_PROFILE = {
    "福州": {"population": 852, "gdp": 15112, "retail": 5969, "foodBase": 92, "commercial": 92, "role": "省会强中心", "signal": "省会商务、家庭消费、核心商圈和社区生活圈都强，适合先做县区和镇街密度筛选。"},
    "厦门": {"population": 535, "gdp": 8589, "retail": 2900, "foodBase": 90, "commercial": 94, "role": "高消费旅游商务", "signal": "旅游、商务、购物中心和岛内外商业圈活跃，适合商圈店、购物中心店和社区店并行。"},
    "泉州": {"population": 888, "gdp": 12900, "retail": 5900, "foodBase": 88, "commercial": 88, "role": "民营经济强市", "signal": "县域民营经济和家庭聚餐场景强，县城主街、成熟社区和购物中心都有机会。"},
    "漳州": {"population": 506, "gdp": 5960, "retail": 2300, "foodBase": 78, "commercial": 76, "role": "厦漳泉外溢", "signal": "承接厦门外溢和本地县城生活消费，优先看龙海、芗城、龙文等成熟区县。"},
    "莆田": {"population": 321, "gdp": 3500, "retail": 1450, "foodBase": 75, "commercial": 74, "role": "沿海县城补点", "signal": "本店基础较强，适合复盘现有覆盖和空白镇街，谨慎处理同区分流。"},
    "宁德": {"population": 318, "gdp": 3800, "retail": 1250, "foodBase": 74, "commercial": 76, "role": "新能源产业城市", "signal": "产业人口、沿海县城和本店覆盖并存，优先看蕉城、福安、霞浦等核心生活圈。"},
    "龙岩": {"population": 272, "gdp": 3400, "retail": 1200, "foodBase": 69, "commercial": 68, "role": "闽西县城机会", "signal": "县城主街、成熟社区和交通节点为主，先做小城镇机会筛选。"},
    "南平": {"population": 263, "gdp": 2400, "retail": 950, "foodBase": 66, "commercial": 66, "role": "文旅县城机会", "signal": "文旅和交通节点明显，适合季节性复核与县城中心谨慎补点。"},
    "三明": {"population": 244, "gdp": 3300, "retail": 1000, "foodBase": 64, "commercial": 64, "role": "山区县城观察", "signal": "以山区县城、成熟社区和本店经营观察为主，先找确定性高的县城主街。"},
}

COMMERCIAL_SIGNAL = {
    "福州": "省会核心商圈、社区生活圈、办公家庭客群强；重点看东街口、台江、仓山、晋安等。",
    "厦门": "旅游商务和购物中心强；岛内核心商圈与岛外成熟居住区都需要分层看。",
    "泉州": "县域商业活跃，家庭聚餐和县城主街需求强；晋江、石狮、丰泽、鲤城优先。",
    "漳州": "厦漳泉外溢和县城生活消费并存；龙海、芗城、龙文、漳浦优先补平台数据。",
    "莆田": "本店覆盖与县区补点并存；荔城、城厢、仙游要重点看同区分流。",
    "宁德": "新能源产业和沿海县城带动生活消费；蕉城、福安、霞浦优先观察。",
    "龙岩": "闽西中心城市，县城主街和成熟社区为主；新罗、上杭、漳平优先。",
    "南平": "文旅县城和交通节点机会；延平、建阳、武夷山需要季节性复核。",
    "三明": "山区县城、成熟社区和本店样本并存；三元、沙县、永安优先观察。",
}

URBAN_WORDS = ("街道", "城关", "城区", "中心", "东", "南", "西", "北", "中", "路", "湖", "江", "桥")
COMMERCIAL_WORDS = ("万达", "吾悦", "宝龙", "泰禾", "万象", "广场", "商圈", "商业", "步行街", "中心", "街")
INDUSTRY_WORDS = ("开发", "高新", "工业", "产业", "园", "软件", "科技", "经开", "新区")
TOURISM_WORDS = ("古城", "温泉", "土楼", "武夷", "太姥", "白水洋", "鼓浪", "湄洲", "崇武", "景区", "旅游", "山", "海", "岛")
SCHOOL_WORDS = ("大学", "学院", "学校", "职教", "软件", "高新", "办公", "金融")
TRAFFIC_WORDS = ("站", "港", "机场", "码头", "动车", "高速", "枢纽", "桥")


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


def clamp(value: float, low: float = 0.0, high: float = 100.0) -> float:
    return max(low, min(high, value))


def grade(score: float) -> str:
    if score >= 84:
        return "A"
    if score >= 74:
        return "B"
    if score >= 64:
        return "C"
    return "D"


def city_name(value: Any) -> str:
    return text(value).replace("市", "").replace("地区", "").replace("省", "")


def town_name(row: dict[str, Any]) -> str:
    return text(row.get("街道/片区") or row.get("镇街") or row.get("街道") or row.get("名称"))


def town_key(row: dict[str, Any]) -> tuple[str, str, str]:
    return (city_name(row.get("城市")), text(row.get("区县")), town_name(row))


def row_id(row: dict[str, Any]) -> str:
    return text(row.get("点ID") or row.get("决策ID") or f"{row.get('城市')}-{row.get('区县')}-{town_name(row)}")


def point(row: dict[str, Any]) -> tuple[float, float] | None:
    try:
        lon = float(row.get("经度"))
        lat = float(row.get("纬度"))
    except (TypeError, ValueError):
        return None
    if not math.isfinite(lon) or not math.isfinite(lat):
        return None
    return lon, lat


def group(rows: list[dict[str, Any]], *keys: str) -> dict[tuple[Any, ...], list[dict[str, Any]]]:
    result: dict[tuple[Any, ...], list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        result[tuple(city_name(row.get(key)) if key == "城市" else text(row.get(key)) for key in keys)].append(row)
    return result


def tags_for_town(row: dict[str, Any]) -> list[str]:
    blob = " ".join(text(row.get(key)) for key in [
        "镇街", "街道/片区", "关联商圈", "镇街角色标签", "交通学校住宅文旅标签", "公开POI线索", "商业更新信号"
    ])
    tags: list[str] = []
    town_type = text(row.get("镇街类型"))
    if town_type == "街道" or any(word in blob for word in URBAN_WORDS):
        tags.append("县城主街/成熟社区")
    if town_type == "镇":
        tags.append("乡镇中心")
    if any(word in blob for word in COMMERCIAL_WORDS):
        tags.append("商业项目/商圈")
    if any(word in blob for word in INDUSTRY_WORDS):
        tags.append("产业园/办公")
    if any(word in blob for word in TOURISM_WORDS):
        tags.append("文旅客流")
    if any(word in blob for word in SCHOOL_WORDS):
        tags.append("高校/办公")
    if any(word in blob for word in TRAFFIC_WORDS):
        tags.append("交通节点")
    if not tags:
        tags.append("基础生活圈")
    return list(dict.fromkeys(tags))


def infer_store_type(tags: list[str], existing: str = "") -> str:
    if existing and existing != "待判断":
        return existing
    result = ["社区店"]
    if "商业项目/商圈" in tags or "县城主街/成熟社区" in tags:
        result.append("商圈店")
    if "商业项目/商圈" in tags:
        result.append("购物中心店")
    if "高校/办公" in tags or "产业园/办公" in tags:
        result.append("高校/办公店")
    return "、".join(dict.fromkeys(result))


def classify_conclusion(score: float, food_index: float, own: int, comp: int, evidence: int, tags: list[str]) -> str:
    if own > 0 and score >= 62:
        return "本店已覆盖"
    if own == 0 and (score >= 78 or food_index >= 78) and (comp >= 1 or evidence >= 3 or "商业项目/商圈" in tags):
        return "本周优先看"
    if own == 0 and comp >= 2 and score >= 66:
        return "竞品验证强"
    if score >= 58 or food_index >= 62:
        return "可观察"
    return "谨慎"


def action_for(conclusion: str, tags: list[str]) -> str:
    if conclusion == "本周优先看":
        return "本周优先看：先查租金和平台销量，再安排午晚高峰实地观察门头、动线、停车和周边100米竞品。"
    if conclusion == "竞品验证强":
        return "补平台数据：竞品已验证需求，优先补美团/点评销量、评分、人均和租金报价。"
    if conclusion == "本店已覆盖":
        return "复盘覆盖：评估是否补点、是否保护半径，以及同区门店和外卖半径是否分流。"
    if conclusion == "可观察":
        return "可观察：先补商业体/社区/学校/办公 POI 和租金线索，再决定是否进入看铺清单。"
    if "文旅客流" in tags:
        return "谨慎观察：文旅点需核验季节性客流、停车和外卖半径，暂不直接进推荐池。"
    return "暂缓：先保留在线索库，等平台热度、租金或竞品证据补强后再看。"


def risk_for(conclusion: str, source_level: str, own: int, comp: int, evidence: int) -> str:
    risks = []
    if "L1" in source_level:
        risks.append("镇街人口/消费为初阶估算")
    if evidence < 3:
        risks.append("POI证据仍需补强")
    if comp == 0:
        risks.append("竞品验证不足")
    if own > 0:
        risks.append("需要评估同区分流和保护半径")
    if conclusion == "谨慎":
        risks.append("暂不直接进入看铺清单")
    return "；".join(risks) or "主要风险在租金、门头动线、平台热度和实地客流，需要看铺前复核。"


def source_level_for(row: dict[str, Any], own: int, comp: int, evidence: int) -> str:
    raw = text(row.get("来源等级"))
    if raw.startswith("L3") or raw == "L3":
        return "L3用户/平台样本 + L1模型推断"
    if own or comp:
        return "L2公开/样本线索 + L1模型推断"
    if evidence >= 4:
        return "L2公开资料 + L1模型推断"
    return "L1模型推断/待复核"


def build_indexes(data: dict[str, Any]) -> dict[str, Any]:
    town_rows = data.get("townStreetMapPoints") or data.get("townStreetDataPack") or []
    return {
        "town_by_county": group(town_rows, "城市", "区县"),
        "store_by_county": group(data.get("storeMapPoints", []), "城市", "区县"),
        "comp_by_county": group(data.get("competitorMapPoints", []), "城市", "区县"),
        "evidence_by_county": group(data.get("evidenceMapPoints", []), "城市", "区县"),
        "areas_by_county": group(data.get("businessAreas", []), "城市", "区县"),
        "county_pack": {(city_name(r.get("城市")), text(r.get("区县"))): r for r in data.get("countyDataPack", [])},
    }


def county_insight(row: dict[str, Any], indexes: dict[str, Any]) -> dict[str, Any]:
    city = city_name(row.get("城市"))
    district = text(row.get("区县"))
    profile = CITY_PROFILE.get(city, CITY_PROFILE["三明"])
    pack = indexes["county_pack"].get((city, district), {})
    towns = indexes["town_by_county"].get((city, district), [])
    stores = len(indexes["store_by_county"].get((city, district), [])) or int(num(row.get("周麻婆门店数")))
    comps = len(indexes["comp_by_county"].get((city, district), [])) or int(num(row.get("五大竞品门店数")))
    evidence = len(indexes["evidence_by_county"].get((city, district), [])) or int(num(row.get("POI证据数")))
    areas = len(indexes["areas_by_county"].get((city, district), [])) or int(num(row.get("商圈样本数")))
    population = num(pack.get("常住人口估算万人"), num(row.get("人口估算万人"), 35 if text(row.get("县区类型")) == "市辖区" else 22))
    gdp = num(pack.get("GDP估算亿元"), population * (10.5 if text(row.get("县区类型")) == "市辖区" else 7.2))
    retail = num(pack.get("社零估算亿元"), gdp * 0.38)
    food_market = retail * 0.115
    commercial_index = clamp(profile["commercial"] * 0.42 + min(evidence, 80) * 0.18 + min(comps, 50) * 0.28 + min(areas, 12) * 1.4 + (6 if stores else 0))
    food_index = clamp(profile["foodBase"] * 0.45 + commercial_index * 0.28 + min(comps, 45) * 0.38 + min(evidence, 80) * 0.12 + min(population, 90) * 0.08)
    score = clamp(num(row.get("综合评分"), food_index * 0.85 + commercial_index * 0.15))
    quality = clamp(58 + min(evidence, 90) * 0.16 + min(comps, 60) * 0.12 + min(stores, 30) * 0.18 + (8 if city in ("福州", "厦门", "泉州") else 3))
    rec_grade = grade(max(score, food_index))
    priority_towns = "、".join(town_name(t) for t in sorted(towns, key=lambda t: num(t.get("街道评分")), reverse=True)[:5])
    conclusion = "优先县区" if max(score, food_index) >= 84 else "可推进县区" if max(score, food_index) >= 74 else "观察县区" if max(score, food_index) >= 64 else "暂缓县区"
    action = "先看高分镇街，并同步查租金、平台销量和门头动线。" if conclusion == "优先县区" else "保留为本轮备选，先补平台热度和租金样本。"
    return {
        "记录ID": f"V14-COUNTY-{text(row.get('区县代码') or row.get('记录ID'))}",
        "省份": "福建",
        "城市": city,
        "区县": district,
        "县区类型": text(row.get("县区类型")),
        "常住人口估算万人": round(population, 2),
        "GDP估算亿元": round(gdp, 2),
        "社零估算亿元": round(retail, 2),
        "餐饮市场估算亿元": round(food_market, 2),
        "餐饮机会指数": round(food_index, 1),
        "商业更新指数": round(commercial_index, 1),
        "镇街数量": len(towns) or int(num(row.get("镇街数量"))),
        "周麻婆门店数": stores,
        "五大竞品门店数": comps,
        "公开证据点数": evidence,
        "商圈样本数": areas,
        "推荐等级": rec_grade,
        "综合评分": round(max(score, food_index * 0.94), 1),
        "平均数据质量分": round(quality, 1),
        "数据质量评分": round(quality, 1),
        "当前结论": conclusion,
        "推荐镇街": priority_towns or "按镇街榜继续补定位",
        "城市商业信号": COMMERCIAL_SIGNAL.get(city, profile["signal"]),
        "主要依据": f"{district}：服务人口约{population:.1f}万人、社零约{retail:.1f}亿元、餐饮市场约{food_market:.1f}亿元；本店{stores}、五大竞品{comps}、证据点{evidence}。",
        "主要风险": "县区人口/经济为初阶估算，仍需县区公报、平台热力、租金报价和实地照片复核。",
        "下一步动作": action,
        "来源等级": "L2公开资料 + L1模型推断",
        "来源": "；".join(SOURCES.values()),
        "数据更新时间": TODAY,
    }


def enrich_town(row: dict[str, Any], county: dict[str, Any], evidence_count: int) -> dict[str, Any]:
    city = city_name(row.get("城市"))
    district = text(row.get("区县"))
    name = town_name(row)
    tags = tags_for_town(row)
    own = int(num(row.get("周麻婆现有门店数") or row.get("本店覆盖") or row.get("周麻婆门店数")))
    comp = int(num(row.get("五大竞品门店数") or row.get("五大竞品验证") or row.get("友商/竞品门店数")))
    poi = max(int(num(row.get("公开证据点数") or row.get("证据点数") or row.get("POI支撑数"))), evidence_count)
    base_score = num(row.get("1.4原始街道评分"), num(row.get("街道评分"), num(row.get("综合评分"), 62)))
    county_food = num(county.get("餐饮机会指数"), CITY_PROFILE.get(city, CITY_PROFILE["三明"])["foodBase"])
    service_pop = num(row.get("服务人口估算万人"), max(1.2, num(county.get("常住人口估算万人"), 30) / max(4, num(county.get("镇街数量"), 10)) * (1.35 if "县城主街/成熟社区" in tags else 0.9)))
    retail_contrib = num(row.get("社零贡献估算亿元"), service_pop * max(2.5, num(county.get("社零估算亿元"), 100) / max(1, num(county.get("常住人口估算万人"), 30))))
    food_index = clamp(base_score * 0.42 + county_food * 0.28 + min(comp, 8) * 2.0 + min(poi, 12) * 1.15 + (5 if "商业项目/商圈" in tags else 0) + (3 if "文旅客流" in tags else 0) - min(own, 4) * 1.2)
    commercial_index = clamp(num(county.get("商业更新指数"), 60) * 0.36 + min(poi, 16) * 2.0 + (8 if "商业项目/商圈" in tags else 0) + (5 if "产业园/办公" in tags else 0) + (3 if "交通节点" in tags else 0))
    final_score = clamp(base_score * 0.58 + food_index * 0.27 + commercial_index * 0.15)
    conclusion = classify_conclusion(final_score, food_index, own, comp, poi, tags)
    action = action_for(conclusion, tags)
    source_level = source_level_for(row, own, comp, poi)
    store_type = infer_store_type(tags, text(row.get("适合店型")))
    risk = risk_for(conclusion, source_level, own, comp, poi)
    evidence_summary = (
        f"{name}属于{district}，角色为{'、'.join(tags)}；"
        f"服务人口估算约{service_pop:.1f}万人，餐饮机会指数{food_index:.1f}，"
        f"本店{own}、五大竞品{comp}、公开/示意证据{poi}。"
    )
    enriched = dict(row)
    enriched.update({
        "点ID": row_id(row),
        "决策ID": text(row.get("决策ID") or row_id(row)),
        "城市": city,
        "区县": district,
        "街道/片区": name,
        "镇街": name,
        "镇街角色标签": "、".join(tags),
        "适合店型": store_type,
        "服务人口估算万人": round(service_pop, 2),
        "社零贡献估算亿元": round(retail_contrib, 2),
        "餐饮机会指数": round(food_index, 1),
        "商业更新指数": round(commercial_index, 1),
        "餐饮机会": "餐饮机会强" if food_index >= 84 else "可观察餐饮机会" if food_index >= 72 else "谨慎观察",
        "商业更新信号": "强商业更新" if commercial_index >= 82 else "有商业验证" if commercial_index >= 70 else "初阶商业线索",
        "周麻婆现有门店数": own,
        "五大竞品门店数": comp,
        "公开证据点数": poi,
        "POI支撑数": poi,
        "街道评分": round(final_score, 1),
        "1.4原始街道评分": round(base_score, 1),
        "推荐等级": grade(final_score),
        "当前结论": conclusion,
        "严格决策结论": conclusion,
        "街道潜力判断": conclusion,
        "机会类型": conclusion,
        "机会标签": "、".join(dict.fromkeys([conclusion, "餐饮机会强" if food_index >= 84 else "需平台复核", "商业项目" if "商业项目/商圈" in tags else "生活圈"])),
        "1.4基础底盘": f"{name}：服务人口约{service_pop:.1f}万人、社零贡献约{retail_contrib:.1f}亿元；{county.get('城市商业信号', '')}",
        "1.4证据摘要": evidence_summary,
        "1.4最终动作": action,
        "本周动作建议": action,
        "下一步核验动作": action,
        "街道判断理由": f"{name}综合{district}县区底盘、餐饮机会、商业/POI证据、本店覆盖和五大竞品验证后，当前判断为“{conclusion}”。",
        "主要依据": evidence_summary,
        "主要风险": risk,
        "县区人口经济摘要": f"{district}人口约{county.get('常住人口估算万人')}万人、社零约{county.get('社零估算亿元')}亿元、餐饮市场约{county.get('餐饮市场估算亿元')}亿元。",
        "餐饮市场线索": PROVINCE_SIGNALS["餐饮市场"],
        "商业报告线索": COMMERCIAL_SIGNAL.get(city, CITY_PROFILE.get(city, CITY_PROFILE["三明"])["signal"]),
        "来源等级": source_level,
        "来源说明": "福建行政区划/统计公报/公开商业资料/本店竞品样本/模型推断",
        "数据更新时间": TODAY,
        "Leaflet弹窗标题": name,
        "Leaflet弹窗摘要": f"{name}：{final_score:.0f}分，{conclusion}，{store_type}，本店{own}，竞品{comp}。",
    })
    if not text(enriched.get("坐标精度")):
        enriched["坐标精度"] = "估算坐标" if text(enriched.get("定位状态")) else "待复核坐标"
    return enriched


def main() -> None:
    data = read_json(PREVIEW)
    backup = DATA_DIR / f"preview-data.bak-v14-auto-enrichment-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json"
    shutil.copy2(PREVIEW, backup)

    indexes = build_indexes(data)
    counties = data.get("countyFoundation") or data.get("countyDataPack") or []
    county_pack = [county_insight(row, indexes) for row in counties]
    county_by_key = {(row["城市"], row["区县"]): row for row in county_pack}

    evidence_by_town = defaultdict(int)
    for item in data.get("evidenceMapPoints", []):
        evidence_by_town[town_key(item)] += 1

    source_towns = data.get("townStreetMapPoints") or data.get("townStreetDataPack") or []
    town_pack = []
    for row in source_towns:
        key = town_key(row)
        county = county_by_key.get((key[0], key[1]), {})
        town_pack.append(enrich_town(row, county, evidence_by_town.get(key, 0)))

    town_pack.sort(key=lambda row: (row["城市"], row["区县"], -num(row.get("街道评分"))))

    poi_pack = []
    for row in town_pack:
        poi_pack.append({
            "决策ID": row["决策ID"],
            "城市": row["城市"],
            "区县": row["区县"],
            "镇街": row["镇街"],
            "公开证据点数": row["公开证据点数"],
            "POI支撑数": row["POI支撑数"],
            "证据摘要": row["1.4证据摘要"],
            "来源等级": row["来源等级"],
            "数据更新时间": TODAY,
        })

    commercial_pack = []
    for city, profile in CITY_PROFILE.items():
        city_towns = [row for row in town_pack if row["城市"] == city]
        county_rows = [row for row in county_pack if row["城市"] == city]
        commercial_pack.append({
            "城市": city,
            "城市角色": profile["role"],
            "餐饮机会基准": profile["foodBase"],
            "商业更新基准": profile["commercial"],
            "重点信号": COMMERCIAL_SIGNAL.get(city, profile["signal"]),
            "优先县区": "、".join(row["区县"] for row in sorted(county_rows, key=lambda r: num(r.get("综合评分")), reverse=True)[:5]),
            "优先镇街": "、".join(row["镇街"] for row in sorted(city_towns, key=lambda r: num(r.get("街道评分")), reverse=True)[:8]),
            "来源等级": "L2公开商业资料 + L1模型推断",
            "来源": SOURCES["赢商网福建商业报道"],
            "数据更新时间": TODAY,
        })

    commercial_by_city = {row["城市"]: row for row in commercial_pack}

    # 同步页面主读取包，避免地图、榜单和详情数字不一致。
    data["countyInsightPack"] = county_pack
    data["townOpportunityPack"] = town_pack
    data["poiEvidencePack"] = poi_pack
    data["commercialSignalPack"] = commercial_pack
    data["townStreetMapPoints"] = town_pack
    data["townStreetDataPack"] = town_pack

    decision_map = data.setdefault("decisionMap", {})
    decision_map["streetDecisionScore"] = town_pack
    decision_map["streetSummaries"] = town_pack
    decision_map["districtSummaries"] = county_pack
    decision_map["citySummaries"] = []
    for city, profile in CITY_PROFILE.items():
        rows = [row for row in town_pack if row["城市"] == city]
        county_rows = [row for row in county_pack if row["城市"] == city]
        stores = sum(int(num(row.get("周麻婆现有门店数"))) for row in rows)
        comps = sum(int(num(row.get("五大竞品门店数"))) for row in rows)
        priority_count = sum(1 for row in rows if row.get("当前结论") == "本周优先看")
        avg_score = sum(num(row.get("街道评分")) for row in rows) / max(1, len(rows))
        city_score = clamp(profile["foodBase"] * 0.45 + profile["commercial"] * 0.25 + avg_score * 0.30)
        decision_map["citySummaries"].append({
            "城市": city,
            "推荐等级": grade(city_score),
            "综合评分": round(city_score, 1),
            "数据质量评分": 86 if city in ("福州", "厦门", "泉州") else 76,
            "商圈样本数": len([r for r in data.get("businessAreas", []) if city_name(r.get("城市")) == city]),
            "镇街样本数": len(rows),
            "周麻婆门店数": len([r for r in data.get("storeMapPoints", []) if city_name(r.get("城市")) == city]) or stores,
            "五大竞品门店数": len([r for r in data.get("competitorMapPoints", []) if city_name(r.get("城市")) == city]) or comps,
            "高潜街道数": priority_count,
            "P1任务数": max(1, min(8, priority_count // 3)),
            "城市角色": profile["role"],
            "当前结论": "优先进入" if city_score >= 84 else "可推进" if city_score >= 74 else "观察",
            "下一步动作": f"先看{commercial_by_city.get(city, {}).get('优先县区', '重点县区')}，再下钻镇街榜安排看铺顺序。",
            "城市商业信号": COMMERCIAL_SIGNAL.get(city, profile["signal"]),
        })
    decision_map["citySummaries"].sort(key=lambda row: -num(row.get("综合评分")))

    data["v14DecisionMap"] = {
        "citySummaries": decision_map["citySummaries"],
        "countyInsightPack": county_pack,
        "townOpportunityPack": town_pack,
        "commercialSignalPack": commercial_pack,
        "provinceSignals": PROVINCE_SIGNALS,
        "sources": SOURCES,
    }
    data.setdefault("meta", {})["version"] = "1.4 数据自动补强 + 地图决策深化"
    data.setdefault("meta", {})["updated"] = TODAY
    data.setdefault("meta", {})["v14Sources"] = SOURCES
    data.setdefault("meta", {})["v14DataPolicy"] = "L4/L2/L1 混合数据用于前置筛选；镇街人口、经济、消费和餐饮机会多为初阶估算，需平台与实地复核。"
    data.setdefault("stats", {})["v14县区洞察"] = len(county_pack)
    data.setdefault("stats", {})["v14镇街机会"] = len(town_pack)
    data.setdefault("stats", {})["v14商业信号"] = len(commercial_pack)

    write_json(PREVIEW, data)
    print(json.dumps({
        "backup": str(backup),
        "countyInsightPack": len(county_pack),
        "townOpportunityPack": len(town_pack),
        "poiEvidencePack": len(poi_pack),
        "commercialSignalPack": len(commercial_pack),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
