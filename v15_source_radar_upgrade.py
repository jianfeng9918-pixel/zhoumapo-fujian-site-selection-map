"""
周麻婆福建选址地图 1.5：外部数据源雷达 + 镇街决策深化

本脚本只做本地 JSON 数据增强：
- 保留 1.4 Leaflet/OSM 地图数据包。
- 新增 sourceRadarPack / countyEvidencePack / townEvidencePack / v15DecisionMap。
- 将镇街证据强度、推荐动作、来源摘要回写到 townOpportunityPack 与 townStreetMapPoints。

说明：镇街级人口、经济、餐饮机会仍属于前置筛选用数据。L1/L2/L3/L4 会清楚标注，
不作为最终签约依据。
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


SOURCE_RADAR = [
    {
        "来源ID": "SRC-L4-FJ-STAT-BULLETIN-2025",
        "来源名称": "福建省2025年国民经济和社会发展统计公报",
        "来源等级": "L4官方/准官方",
        "来源类型": "统计公报",
        "适用范围": "福建全省/城市/县区基础底盘",
        "关键事实": "用于人口、产业、住宿餐饮业增加值、消费基本盘和全省餐饮机会基准。",
        "可用于字段": "人口、GDP、第三产业、住宿餐饮、餐饮机会基准",
        "URL": "https://www.fujian.gov.cn/zwgk/sjfb/tjgb/202603/t20260313_7109476.htm",
        "数据日期": "2026-03-13",
    },
    {
        "来源ID": "SRC-L4-FJ-RETAIL-2025",
        "来源名称": "福建统计局2025年社会消费品零售总额数据",
        "来源等级": "L4官方/准官方",
        "来源类型": "社零/消费",
        "适用范围": "福建全省/城市消费力基准",
        "关键事实": "2025年福建社会消费品零售总额约25433.59亿元，餐饮收入额约2650.02亿元。",
        "可用于字段": "社零、餐饮收入、消费能力、餐饮机会",
        "URL": "https://tjj.fj.gov.cn/xxgk/tjxx/shxfpls/202601/t20260122_7084217.htm",
        "数据日期": "2026-01-22",
    },
    {
        "来源ID": "SRC-L4-FJ-CIVIL-2025",
        "来源名称": "福建省民政厅2025行政区划统计",
        "来源等级": "L4官方/准官方",
        "来源类型": "行政区划",
        "适用范围": "福建9城/84县级/乡镇街道骨架",
        "关键事实": "用于福建9个设区市、84个县级单位、约1110个乡级单位的全量骨架校验。",
        "可用于字段": "城市、县区、镇街名称、层级归属",
        "URL": "https://mzt.fj.gov.cn/gk/tzgg/202601/t20260105_7071220.htm",
        "数据日期": "2026-01-05",
    },
    {
        "来源ID": "SRC-L2-WINSHANG-FJ-COMMERCE",
        "来源名称": "赢商网福建商业项目与首店/存量焕新报道",
        "来源等级": "L2公开商业资料",
        "来源类型": "商业报道",
        "适用范围": "重点城市/重点商圈/商业项目线索",
        "关键事实": "用于识别福州、厦门、泉州、漳州等城市商业活跃度、首店经济和购物中心更新。",
        "可用于字段": "商业更新指数、商圈线索、购物中心、首店/品牌更新",
        "URL": "https://m.winshang.com/news738880.html",
        "数据日期": "2025-2026",
    },
    {
        "来源ID": "SRC-L2-KPMG-FNB-2025",
        "来源名称": "KPMG 2025中国餐饮企业发展报告",
        "来源等级": "L2公开商业资料",
        "来源类型": "餐饮行业报告",
        "适用范围": "餐饮趋势/连锁化/社区店和下沉市场判断",
        "关键事实": "用于连锁餐饮、消费分层、购物中心/社区店/县域市场等趋势判断。",
        "可用于字段": "餐饮机会、适合店型、下沉市场机会、风险提示",
        "URL": "https://assets.kpmg.com/content/dam/kpmgsites/cn/pdf/zh/2025/05/2025-china-food-and-beverage-enterprise-development-report.pdf.coredownload.inline.pdf",
        "数据日期": "2025-05",
    },
    {
        "来源ID": "SRC-L2-FJ-COMMERCE-FIRST-STORE",
        "来源名称": "福建商务/公开新闻首发经济与商业更新线索",
        "来源等级": "L2公开商业资料",
        "来源类型": "商务/新闻",
        "适用范围": "商业项目、首店经济、消费场景更新",
        "关键事实": "用于补充购物中心、商业街、夜经济、文旅消费和首店经济信号。",
        "可用于字段": "商业更新指数、文旅流量、夜市/商业街、商圈机会",
        "URL": "https://swt.fujian.gov.cn/",
        "数据日期": "2025-2026",
    },
    {
        "来源ID": "SRC-L2-OSM-OVERPASS",
        "来源名称": "OpenStreetMap / Overpass 公开POI",
        "来源等级": "L2公开地图资料",
        "来源类型": "地图/POI",
        "适用范围": "商场、学校、医院、车站、景区、产业园、社区、餐饮街等POI种子",
        "关键事实": "只做低频、小范围、重点区域查询；不做高频批量地理编码。",
        "可用于字段": "POI支撑、坐标精度、公开证据点、半径线索",
        "URL": "https://dev.overpass-api.de/overpass-doc/en/preface/commons.html",
        "数据日期": "长期公开资料",
    },
    {
        "来源ID": "SRC-L2-OSM-NOMINATIM-POLICY",
        "来源名称": "Nominatim 使用政策",
        "来源等级": "L2公开地图规则",
        "来源类型": "合规规则",
        "适用范围": "少量重点点位坐标补充的合规边界",
        "关键事实": "不对1121个镇街做系统性批量地理编码；少量查询需低频、缓存、署名。",
        "可用于字段": "坐标精度、待复核状态、数据采集规则",
        "URL": "https://operations.osmfoundation.org/policies/nominatim/",
        "数据日期": "长期公开规则",
    },
]


CITY_SIGNAL = {
    "福州": {
        "商业信号": "省会核心商圈、社区生活圈、办公家庭客群强；东街口、台江、仓山、晋安、长乐是重点下钻区。",
        "餐饮信号": "家庭聚餐、工作餐、社区小炒和购物中心餐饮均强，适合社区店、商圈店并行。",
        "优先策略": "福州先做深：鼓楼/台江/仓山/晋安优先查租金和平台销量。",
    },
    "厦门": {
        "商业信号": "旅游商务、购物中心和岛内外成熟生活圈并存，岛内核心商圈与岛外居住区要分层看。",
        "餐饮信号": "高消费和游客消费更强，但租金压力高，需要严控回本周期。",
        "优先策略": "思明/湖里看商圈和办公家庭客群，集美/同安/海沧看成熟社区。",
    },
    "泉州": {
        "商业信号": "县域商业和民营经济活跃，晋江、石狮、丰泽、鲤城具备强生活餐饮场景。",
        "餐饮信号": "家庭聚餐、县城主街、成熟社区机会较强，适合社区店和商圈店。",
        "优先策略": "优先比较晋江、丰泽、鲤城、石狮的本店覆盖与竞品验证。",
    },
    "漳州": {
        "商业信号": "厦漳泉外溢、县城生活消费和产业人口并存，龙海、芗城、龙文需要补平台数据。",
        "餐饮信号": "适合先做县城主街和成熟社区筛选，不急于大面积铺开。",
        "优先策略": "先看龙海区、芗城区、龙文区、漳浦县的高证据镇街。",
    },
    "莆田": {
        "商业信号": "本店覆盖与县区补点并存，荔城、城厢、仙游需要评估同区分流。",
        "餐饮信号": "已有门店样本较多，重点不是盲目新增，而是判断保护半径和空白镇街。",
        "优先策略": "先复盘本店覆盖，再找竞品强但本店弱的镇街。",
    },
    "宁德": {
        "商业信号": "新能源产业、沿海县城和本店覆盖带动生活消费，蕉城、福安、福鼎、霞浦优先观察。",
        "餐饮信号": "产业人口和县城生活圈是主要机会，需验证午晚高峰和外卖半径。",
        "优先策略": "先看蕉城/福安/霞浦核心镇街，再补平台热力。",
    },
    "龙岩": {
        "商业信号": "闽西中心城市和县城主街机会并存，新罗、永定、上杭、漳平优先。",
        "餐饮信号": "以县城主街、成熟社区、交通节点为主，谨慎看租金和客流稳定性。",
        "优先策略": "优先找有竞品验证或本店空白的县城主街。",
    },
    "南平": {
        "商业信号": "文旅县城、交通节点和县城中心机会明显，但客流季节性强。",
        "餐饮信号": "适合先筛县城中心与文旅节点，谨慎判断淡旺季。",
        "优先策略": "延平、建阳、武夷山先做平台与实地复核。",
    },
    "三明": {
        "商业信号": "山区县城、成熟社区、本店样本和五大竞品验证并存，三元、沙县、永安优先观察。",
        "餐饮信号": "以县城生活圈和社区小炒为主，重点看本店分流和竞品验证。",
        "优先策略": "先筛本店空白且竞品有效的镇街，避免同区过密。",
    },
}


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


def row_id(row: dict[str, Any]) -> str:
    return text(row.get("点ID") or row.get("决策ID") or f"{row.get('城市')}-{row.get('区县')}-{town_name(row)}")


def group_by(rows: list[dict[str, Any]], *keys: str) -> dict[tuple[Any, ...], list[dict[str, Any]]]:
    grouped: dict[tuple[Any, ...], list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        grouped[tuple(city_name(row.get(key)) if key == "城市" else text(row.get(key)) for key in keys)].append(row)
    return grouped


def score_value(row: dict[str, Any]) -> float:
    return num(row.get("街道评分") or row.get("综合评分") or row.get("环境评分"), 0)


def quality_value(row: dict[str, Any]) -> float:
    return num(row.get("数据质量评分") or row.get("平均数据质量分"), 0)


def street_own(row: dict[str, Any]) -> int:
    return int(num(row.get("周边1.5公里本店数") or row.get("周麻婆现有门店数") or row.get("周麻婆关联点位数"), 0))


def street_comp(row: dict[str, Any]) -> int:
    return int(num(row.get("周边3公里五大竞品数") or row.get("五大竞品门店数") or row.get("友商/竞品门店数") or row.get("五大竞品关联点位数"), 0))


def street_evidence(row: dict[str, Any]) -> int:
    return int(num(row.get("公开证据点数") or row.get("POI支撑数") or row.get("公开POI线索数") or row.get("商圈/商业体线索数"), 0))


def tags(row: dict[str, Any]) -> list[str]:
    raw = "、".join(
        text(row.get(key))
        for key in ["机会标签", "机会类型", "镇街角色标签", "交通学校住宅文旅标签", "公开POI线索"]
    )
    found = [item for item in raw.replace(",", "、").replace("，", "、").split("、") if item]
    return list(dict.fromkeys(found))


def source_level_for(row: dict[str, Any], strength_hint: float) -> str:
    raw = text(row.get("来源等级"))
    own = street_own(row)
    comp = street_comp(row)
    evidence = street_evidence(row)
    if raw.startswith("L3") or own > 0 or comp >= 3:
        return "L3用户/平台样本 + L4行政骨架 + L1模型推断"
    if raw.startswith("L2") or evidence >= 3 or strength_hint >= 62:
        return "L2公开证据 + L4行政骨架 + L1模型推断"
    return "L4行政骨架 + L1模型推断"


def evidence_strength(row: dict[str, Any]) -> float:
    own = street_own(row)
    comp = street_comp(row)
    evidence = street_evidence(row)
    score = score_value(row)
    quality = quality_value(row)
    food = num(row.get("餐饮机会指数") or row.get("餐饮机会"), 0)
    commercial = num(row.get("商业更新指数"), 0)
    precision = text(row.get("坐标精度") or row.get("定位状态"))
    level = text(row.get("来源等级"))
    value = 22
    value += min(evidence * 4.2, 24)
    value += min(comp * 2.4, 18)
    value += min(own * 5.5, 12)
    value += min(score * 0.12, 12)
    value += min(food * 0.10, 10)
    value += min(commercial * 0.08, 8)
    value += min(quality * 0.06, 6)
    if "L3" in level:
        value += 7
    elif "L2" in level:
        value += 4
    if "真实" in precision or "样本" in precision:
        value += 5
    elif "估算" in precision:
        value += 1
    return round(clamp(value), 1)


def evidence_grade(strength: float) -> str:
    if strength >= 78:
        return "强证据"
    if strength >= 64:
        return "较强"
    if strength >= 50:
        return "可用"
    return "初阶"


def recommended_action(row: dict[str, Any], strength: float) -> tuple[str, str]:
    own = street_own(row)
    comp = street_comp(row)
    score = score_value(row)
    conclusion = text(row.get("当前结论") or row.get("严格决策结论") or row.get("街道潜力判断"))
    tag_blob = "、".join(tags(row))
    if own == 0 and (conclusion in {"本周优先看", "优先进入"} or (score >= 78 and strength >= 58 and (comp > 0 or "商业项目" in tag_blob))):
        return "本周看铺", "本周看铺：先查租金、平台销量和门头动线，再安排午晚高峰实地观察。"
    if own == 0 and comp >= 2:
        return "补平台数据", "补平台数据：五大竞品已有验证，优先补美团/点评评分、销量、人均和榜单截图。"
    if own > 0:
        return "实地观察", "实地观察：已有周麻婆覆盖，重点复盘保护半径、同区分流和是否仍有补点空间。"
    if strength >= 62 and score >= 66:
        return "优先查租金", "优先查租金：证据可用但签约压力未知，先拿租金、转让费、面积和合同条件。"
    if score >= 58 or strength >= 48:
        return "实地观察", "实地观察：作为备选镇街，先补商业体、社区、学校、办公和晚高峰客流。"
    return "暂缓", "暂缓：先保留在线索库，等平台热度、租金或竞品证据补强后再进入看铺清单。"


def risk_summary(row: dict[str, Any], source_level: str, strength: float) -> str:
    risks: list[str] = []
    if "L1模型推断" in source_level:
        risks.append("人口/消费含模型估算")
    if street_evidence(row) < 3:
        risks.append("POI证据偏薄")
    if street_comp(row) == 0:
        risks.append("竞品验证不足")
    if street_own(row) > 0:
        risks.append("需评估本店分流")
    if strength < 50:
        risks.append("证据强度仍偏初阶")
    return "；".join(risks) or "主要风险集中在租金、门头动线、平台销量和实地客流，需要看铺前复核。"


def source_summary(city: str, source_level: str) -> str:
    signal = CITY_SIGNAL.get(city, {})
    return (
        f"{source_level}；参考福建统计公报/社零数据/行政区划、公开商业报道、OSM/公开POI和现有本店/竞品样本。"
        f"{signal.get('餐饮信号', '')}"
    )


def compact_join(items: list[str], fallback: str = "待补充公开证据") -> str:
    cleaned = [item for item in items if text(item)]
    return "；".join(cleaned) if cleaned else fallback


def build_town_evidence(row: dict[str, Any]) -> dict[str, Any]:
    city = city_name(row.get("城市"))
    district = text(row.get("区县"))
    town = town_name(row)
    strength = evidence_strength(row)
    level = source_level_for(row, strength)
    action, action_detail = recommended_action(row, strength)
    own = street_own(row)
    comp = street_comp(row)
    evidence = street_evidence(row)
    tag_text = "、".join(tags(row)[:5]) or "基础生活圈"
    city_signal = CITY_SIGNAL.get(city, {})
    food = num(row.get("餐饮机会指数") or row.get("餐饮机会"), 0)
    commercial = num(row.get("商业更新指数"), 0)
    basis = compact_join([
        f"{town}属于{district}",
        f"角色：{tag_text}",
        f"评分{score_value(row):.1f}",
        f"证据强度{strength}",
        f"本店{own}",
        f"五大竞品{comp}",
        f"POI/证据{evidence}",
        city_signal.get("商业信号", ""),
    ])
    risk = risk_summary(row, level, strength)
    return {
        "决策ID": row_id(row),
        "城市": city,
        "区县": district,
        "镇街": town,
        "推荐动作": action,
        "行动建议": action_detail,
        "证据强度": strength,
        "证据等级": evidence_grade(strength),
        "来源等级": level,
        "来源摘要": source_summary(city, level),
        "基础底盘摘要": text(row.get("1.4基础底盘") or row.get("人口线索") or row.get("经济线索")),
        "商业餐饮摘要": compact_join([
            f"餐饮机会指数{food:.1f}" if food else "",
            f"商业更新指数{commercial:.1f}" if commercial else "",
            city_signal.get("餐饮信号", ""),
            text(row.get("商业报告线索") or row.get("商业更新信号")),
        ]),
        "POI证据摘要": text(row.get("1.4证据摘要") or row.get("公开证据摘要") or row.get("公开POI线索")),
        "本店竞品摘要": f"周麻婆{own}，五大竞品{comp}，公开/示意证据{evidence}。",
        "主要依据": basis,
        "主要风险": risk,
        "数据更新时间": TODAY,
    }


def enrich_town_row(row: dict[str, Any], evidence: dict[str, Any]) -> dict[str, Any]:
    enriched = dict(row)
    action = evidence["推荐动作"]
    old_tags = tags(enriched)
    action_tags = {
        "本周看铺": "本周看铺",
        "优先查租金": "优先查租金",
        "补平台数据": "补平台数据",
        "实地观察": "实地观察",
        "暂缓": "暂缓观察",
    }
    prepend = [action_tags[action], evidence["证据等级"]]
    tag_list = list(dict.fromkeys(prepend + old_tags))
    enriched["机会标签"] = "、".join(tag_list[:7])
    enriched["来源等级"] = evidence["来源等级"]
    enriched["证据强度"] = evidence["证据强度"]
    enriched["证据等级"] = evidence["证据等级"]
    enriched["推荐动作"] = action
    enriched["行动建议"] = evidence["行动建议"]
    enriched["1.5证据强度"] = evidence["证据强度"]
    enriched["1.5来源摘要"] = evidence["来源摘要"]
    enriched["1.5证据卡"] = compact_join([
        evidence["基础底盘摘要"],
        evidence["商业餐饮摘要"],
        evidence["POI证据摘要"],
        evidence["本店竞品摘要"],
    ])
    enriched["1.5行动建议"] = evidence["行动建议"]
    enriched["1.5最终结论"] = f"{action}：{evidence['主要依据']}"
    enriched["主要依据"] = evidence["主要依据"]
    enriched["主要风险"] = evidence["主要风险"]
    enriched["Leaflet弹窗摘要"] = f"{town_name(enriched)}：{action}，证据{evidence['证据强度']}，本店{street_own(enriched)}，竞品{street_comp(enriched)}。"
    enriched["数据更新时间"] = TODAY
    return enriched


def build_county_pack(county_rows: list[dict[str, Any]], town_pack: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_county = group_by(town_pack, "城市", "区县")
    result = []
    for county in county_rows:
        city = city_name(county.get("城市"))
        district = text(county.get("区县"))
        rows = by_county.get((city, district), [])
        actions = Counter(text(row.get("推荐动作")) for row in rows)
        avg_strength = round(sum(num(row.get("证据强度")) for row in rows) / max(1, len(rows)), 1)
        high = actions.get("本周看铺", 0) + actions.get("优先查租金", 0)
        source_level = "L2/L3样本较多 + L4行政底盘" if avg_strength >= 60 else "L4行政底盘 + L1/L2初阶证据"
        signal = CITY_SIGNAL.get(city, {})
        result.append({
            "记录ID": f"V15-COUNTY-{city}-{district}",
            "城市": city,
            "区县": district,
            "镇街数量": len(rows) or int(num(county.get("镇街数量"), 0)),
            "本周看铺镇街": actions.get("本周看铺", 0),
            "优先查租金镇街": actions.get("优先查租金", 0),
            "补平台数据镇街": actions.get("补平台数据", 0),
            "实地观察镇街": actions.get("实地观察", 0),
            "暂缓镇街": actions.get("暂缓", 0),
            "高价值镇街": high,
            "平均证据强度": avg_strength,
            "证据等级": evidence_grade(avg_strength),
            "来源等级": source_level,
            "基础底盘": text(county.get("主要依据") or county.get("县区人口经济摘要")),
            "商业餐饮信号": compact_join([signal.get("商业信号", ""), signal.get("餐饮信号", "")]),
            "推荐动作": "优先下钻镇街榜" if high else "先补平台/租金/POI后观察",
            "主要风险": text(county.get("主要风险") or "县区人口/经济为初阶估算，需要平台、租金和实地复核。"),
            "来源": text(county.get("来源")),
            "数据更新时间": TODAY,
        })
    return result


def build_city_summaries(town_pack: list[dict[str, Any]], existing: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_city = group_by(town_pack, "城市")
    existing_by_city = {city_name(row.get("城市")): row for row in existing}
    result = []
    for city, rows in sorted(by_city.items(), key=lambda item: item[0][0]):
        city_name_key = city[0]
        base = dict(existing_by_city.get(city_name_key, {}))
        actions = Counter(text(row.get("推荐动作")) for row in rows)
        avg_strength = round(sum(num(row.get("证据强度")) for row in rows) / max(1, len(rows)), 1)
        high = actions.get("本周看铺", 0) + actions.get("优先查租金", 0)
        base.update({
            "城市": city_name_key,
            "镇街样本数": len(rows),
            "证据强度": avg_strength,
            "证据等级": evidence_grade(avg_strength),
            "本周看铺镇街": actions.get("本周看铺", 0),
            "优先查租金镇街": actions.get("优先查租金", 0),
            "补平台数据镇街": actions.get("补平台数据", 0),
            "实地观察镇街": actions.get("实地观察", 0),
            "高价值镇街": high,
            "城市商业信号": CITY_SIGNAL.get(city_name_key, {}).get("商业信号", base.get("城市商业信号", "")),
            "下一步动作": CITY_SIGNAL.get(city_name_key, {}).get("优先策略", base.get("下一步动作", "")),
            "数据更新时间": TODAY,
        })
        if not base.get("推荐等级"):
            base["推荐等级"] = grade(num(base.get("综合评分"), 65))
        result.append(base)
    return sorted(result, key=lambda row: (num(row.get("综合评分"), 0), num(row.get("证据强度"), 0)), reverse=True)


def main() -> None:
    data = read_json(PREVIEW)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup = DATA_DIR / f"preview-data.bak-v15-source-radar-{stamp}.json"
    shutil.copy2(PREVIEW, backup)

    raw_towns = data.get("townOpportunityPack") or data.get("townStreetMapPoints") or []
    town_evidence = [build_town_evidence(row) for row in raw_towns]
    evidence_by_id = {item["决策ID"]: item for item in town_evidence}
    enriched_towns = [enrich_town_row(row, evidence_by_id[row_id(row)]) for row in raw_towns]

    county_rows = data.get("countyInsightPack") or []
    county_pack = build_county_pack(county_rows, town_evidence)

    previous_decision = data.get("v14DecisionMap") or data.get("decisionMap") or {}
    city_summaries = build_city_summaries(town_evidence, previous_decision.get("citySummaries", []))

    decision_map = {
        **previous_decision,
        "citySummaries": city_summaries,
        "countyEvidencePack": county_pack,
        "townEvidencePack": town_evidence,
        "streetDecisionScore": enriched_towns,
        "streetSummaries": enriched_towns,
        "sourceRadarPack": SOURCE_RADAR,
        "sourceSummary": {
            "sourceCount": len(SOURCE_RADAR),
            "officialSources": sum(1 for item in SOURCE_RADAR if item["来源等级"].startswith("L4")),
            "commercialSources": sum(1 for item in SOURCE_RADAR if item["来源等级"].startswith("L2")),
            "policy": "公开资料 + 用户/平台样本 + 模型推断；仅用于内部前置筛选。",
        },
    }

    data["sourceRadarPack"] = SOURCE_RADAR
    data["countyEvidencePack"] = county_pack
    data["townEvidencePack"] = town_evidence
    data["townOpportunityPack"] = enriched_towns
    data["townStreetMapPoints"] = enriched_towns
    data["v15DecisionMap"] = decision_map
    data["decisionMap"] = decision_map

    meta = data.setdefault("meta", {})
    meta["version"] = "1.5 外部数据源雷达 + 镇街决策深化"
    meta["v15UpdatedAt"] = TODAY
    meta["v15Backup"] = str(backup)
    meta["v15DataPolicy"] = "L4/L2/L3/L1分层使用；不做未授权平台抓取；镇街级估算仅用于前置筛选。"

    stats = data.setdefault("stats", {})
    stats["v15外部来源"] = len(SOURCE_RADAR)
    stats["v15县区证据"] = len(county_pack)
    stats["v15镇街证据"] = len(town_evidence)
    stats["v15平均证据强度"] = round(sum(num(row.get("证据强度")) for row in town_evidence) / max(1, len(town_evidence)), 1)
    stats["v15本周看铺镇街"] = sum(1 for row in town_evidence if row.get("推荐动作") == "本周看铺")

    write_json(PREVIEW, data)

    counts = Counter(row.get("推荐动作") for row in town_evidence)
    sources = Counter(row.get("来源等级") for row in town_evidence)
    print(f"已生成 1.5 数据包：{PREVIEW}")
    print(f"备份：{backup}")
    print(f"sourceRadarPack={len(SOURCE_RADAR)} countyEvidencePack={len(county_pack)} townEvidencePack={len(town_evidence)}")
    print("推荐动作分布：", dict(counts))
    print("来源等级分布：", dict(sources))


if __name__ == "__main__":
    main()
