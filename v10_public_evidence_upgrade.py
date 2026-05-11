from __future__ import annotations

import json
import math
import shutil
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data" / "preview-data.json"
TODAY = datetime.now().strftime("%Y-%m-%d")

CITY = "城市"
DISTRICT = "区县"
STREET = "街道/片区"
DECISION_ID = "决策ID"
LON = "经度"
LAT = "纬度"


CURATED_POI = {
    ("福州", "鼓楼区", "东街街道"): [
        ("东街口商圈", "商圈"),
        ("三坊七巷", "文旅"),
        ("地铁东街口站", "交通"),
        ("东百中心", "商业体"),
        ("达明美食街", "餐饮"),
    ],
    ("福州", "鼓楼区", "南街街道"): [
        ("三坊七巷南入口", "文旅"),
        ("南门兜交通节点", "交通"),
        ("东百中心", "商业体"),
        ("澳门路-吉庇路餐饮带", "餐饮"),
    ],
    ("福州", "鼓楼区", "温泉街道"): [
        ("温泉公园", "文旅"),
        ("五四路办公带", "办公"),
        ("省体育中心周边", "交通"),
        ("树兜商办片区", "办公"),
    ],
    ("福州", "鼓楼区", "杨桥路"): [
        ("福州万象城", "商业体"),
        ("西湖公园", "文旅"),
        ("杨桥路成熟住宅带", "住宅"),
        ("西门-鼓西生活圈", "社区"),
    ],
    ("福州", "鼓楼区", "鼓东街道"): [
        ("五四路商办区", "办公"),
        ("省立医院周边", "医院"),
        ("鼓东路餐饮带", "餐饮"),
    ],
    ("福州", "鼓楼区", "洪山镇"): [
        ("福州大学至诚学院周边", "学校"),
        ("西洪路住宅带", "住宅"),
        ("洪山桥生活圈", "社区"),
    ],
    ("福州", "台江区", "鳌峰街道"): [
        ("金融街万达广场", "商业体"),
        ("鳌峰广场", "商业体"),
        ("海峡金融商务区", "办公"),
        ("鳌峰路餐饮带", "餐饮"),
    ],
    ("福州", "台江区", "上海街道"): [
        ("宝龙城市广场", "商业体"),
        ("万象九宜城", "商业体"),
        ("工业路餐饮带", "餐饮"),
    ],
    ("福州", "台江区", "宁化街道"): [
        ("福州万象城", "商业体"),
        ("宁化生活圈", "社区"),
        ("上浦路餐饮带", "餐饮"),
    ],
    ("福州", "台江区", "茶亭街道"): [
        ("茶亭商圈", "商圈"),
        ("洋头口交通节点", "交通"),
        ("八一七中路餐饮带", "餐饮"),
    ],
    ("福州", "仓山区", "金山街道"): [
        ("仓山万达广场", "商业体"),
        ("浦上大道商业带", "商业体"),
        ("金山成熟住宅区", "住宅"),
        ("金山学校/家庭客群", "学校"),
    ],
    ("福州", "仓山区", "三叉街街道"): [
        ("三叉街生活圈", "社区"),
        ("上三路餐饮带", "餐饮"),
        ("仓山老城住宅带", "住宅"),
    ],
    ("福州", "仓山区", "下渡街道"): [
        ("烟台山商业漫步街区", "文旅"),
        ("学生街餐饮带", "餐饮"),
        ("仓山万达辐射", "商业体"),
    ],
    ("福州", "仓山区", "建新镇"): [
        ("爱琴海购物公园", "商业体"),
        ("奥体中心片区", "交通"),
        ("建新住宅带", "住宅"),
    ],
    ("福州", "晋安区", "岳峰镇"): [
        ("东二环泰禾广场", "商业体"),
        ("世欧广场", "商业体"),
        ("福新路餐饮带", "餐饮"),
        ("岳峰住宅办公混合区", "住宅"),
    ],
    ("福州", "晋安区", "王庄街道"): [
        ("世欧王庄商圈", "商圈"),
        ("长乐中路餐饮带", "餐饮"),
        ("王庄成熟社区", "社区"),
    ],
    ("厦门", "思明区", "中华街道"): [
        ("中山路步行街", "商圈"),
        ("中华城", "商业体"),
        ("轮渡游客客流", "交通"),
        ("八市生活圈", "社区"),
    ],
    ("厦门", "思明区", "鹭江街道"): [
        ("鹭江道", "文旅"),
        ("厦门轮渡码头", "交通"),
        ("中山路商圈", "商圈"),
        ("和平码头周边", "文旅"),
    ],
    ("厦门", "思明区", "梧村街道"): [
        ("厦门万象城", "商业体"),
        ("厦门火车站", "交通"),
        ("罗宾森广场", "商业体"),
        ("厦禾路办公住宅带", "住宅"),
    ],
    ("厦门", "思明区", "嘉禾路"): [
        ("吕厝交通节点", "交通"),
        ("SM城市广场辐射", "商业体"),
        ("嘉禾路商业轴", "商圈"),
        ("莲坂办公住宅带", "办公"),
    ],
    ("厦门", "思明区", "开元街道"): [
        ("厦禾路商业带", "商圈"),
        ("中山公园周边", "文旅"),
        ("斗西路生活圈", "社区"),
    ],
    ("厦门", "思明区", "嘉莲街道"): [
        ("莲花商圈", "商圈"),
        ("明发商业广场", "商业体"),
        ("莲花住宅区", "住宅"),
    ],
    ("厦门", "湖里区", "金山街道"): [
        ("湖里万达广场", "商业体"),
        ("五缘湾片区", "商圈"),
        ("金山住宅区", "住宅"),
        ("湖里创新园辐射", "办公"),
    ],
    ("厦门", "湖里区", "江头街道"): [
        ("SM城市广场", "商业体"),
        ("江头建材/生活商圈", "商圈"),
        ("吕厝交通节点", "交通"),
    ],
    ("厦门", "湖里区", "湖里街道"): [
        ("湖里老工业区更新片", "办公"),
        ("海天路生活圈", "社区"),
        ("湖里步行街餐饮带", "餐饮"),
    ],
    ("泉州", "丰泽区", "泉秀街道"): [
        ("浦西万达广场", "商业体"),
        ("泉秀街餐饮带", "餐饮"),
        ("领SHOW天地", "商圈"),
        ("宝洲路商业带", "商圈"),
    ],
    ("泉州", "丰泽区", "丰泽街道"): [
        ("丰泽广场周边", "商圈"),
        ("泉州商城广场", "商业体"),
        ("田安路办公生活带", "办公"),
    ],
    ("泉州", "丰泽区", "东海街道"): [
        ("东海泰禾广场", "商业体"),
        ("泉州师范学院周边", "学校"),
        ("东海湾住宅区", "住宅"),
    ],
    ("泉州", "丰泽区", "城东街道"): [
        ("中骏世界城", "商业体"),
        ("华侨大学周边", "学校"),
        ("城东住宅片区", "住宅"),
    ],
    ("泉州", "鲤城区", "开元街道"): [
        ("西街", "文旅"),
        ("开元寺", "文旅"),
        ("钟楼商圈", "商圈"),
        ("中山路餐饮带", "餐饮"),
    ],
    ("泉州", "鲤城区", "鲤中街道"): [
        ("中山路", "商圈"),
        ("涂门街", "文旅"),
        ("打锡街餐饮带", "餐饮"),
    ],
    ("泉州", "晋江市", "青阳街道"): [
        ("晋江万达广场", "商业体"),
        ("阳光时代广场", "商业体"),
        ("青阳老城生活圈", "社区"),
    ],
    ("泉州", "晋江市", "梅岭街道"): [
        ("晋江宝龙广场", "商业体"),
        ("五店市传统街区", "文旅"),
        ("梅岭住宅办公区", "住宅"),
    ],
}


TYPE_KEYWORDS = [
    ("商业体", ["万达", "万象", "广场", "中心", "商场", "东百", "宝龙", "泰禾", "SM", "中华城", "罗宾森", "爱琴海", "吾悦"]),
    ("交通", ["地铁", "车站", "火车", "轮渡", "码头", "交通", "机场", "客运", "路", "大道"]),
    ("学校", ["大学", "学院", "学校", "中学", "小学", "师范"]),
    ("医院", ["医院", "门诊", "省立"]),
    ("文旅", ["三坊七巷", "烟台山", "西街", "开元寺", "古城", "公园", "景区", "游客", "文旅", "轮渡", "码头"]),
    ("办公", ["办公", "商务", "金融", "CBD", "软件园", "创新园", "商办"]),
    ("住宅", ["住宅", "社区", "生活圈", "家庭", "小区"]),
    ("餐饮", ["餐饮", "美食", "小吃", "步行街"]),
    ("商圈", ["商圈", "商业带", "商业轴"]),
]


RING_OFFSETS = [
    (0.0042, 0.0019),
    (0.0024, 0.0041),
    (-0.0028, 0.0035),
    (-0.0045, 0.0008),
    (-0.0027, -0.0034),
    (0.0027, -0.0037),
    (0.0054, -0.0012),
    (0.0005, 0.0055),
]


def text(value, fallback=""):
    if value is None:
        return fallback
    value = str(value).strip()
    return value if value else fallback


def number(value):
    try:
        parsed = float(str(value).strip())
        return parsed if math.isfinite(parsed) else None
    except Exception:
        return None


def count_value(row, *fields):
    for field in fields:
        parsed = number(row.get(field))
        if parsed is not None:
            return int(parsed)
    return 0


def row_key(row):
    return (text(row.get(CITY)), text(row.get(DISTRICT)), text(row.get(STREET)))


def row_id(row):
    return text(row.get(DECISION_ID)) or "|".join(row_key(row))


def split_poi(value):
    value = text(value)
    if not value or value in {"待补", "待复核"}:
        return []
    for sep in ["；", ";", "，", ",", "、", "/", "｜", "|"]:
        value = value.replace(sep, "、")
    return [item.strip() for item in value.split("、") if item.strip()]


def poi_type(name, fallback="公开POI"):
    for kind, keywords in TYPE_KEYWORDS:
        if any(keyword in name for keyword in keywords):
            return kind
    return fallback


def offset_coord(lon, lat, index):
    dx, dy = RING_OFFSETS[index % len(RING_OFFSETS)]
    ring = index // len(RING_OFFSETS)
    scale = 1 + ring * 0.35
    return round(lon + dx * scale, 6), round(lat + dy * scale, 6)


def stable_names(row):
    names = []
    for name in split_poi(row.get("公开POI线索")):
        if name not in names:
            names.append(name)
    for name, _kind in CURATED_POI.get(row_key(row), []):
        if name not in names:
            names.append(name)
    if row_key(row)[0] in {"福州", "厦门", "泉州"} and len(names) < 3:
        for name, _kind in fallback_poi(row):
            if name not in names:
                names.append(name)
    return names


def fallback_poi(row):
    city, district, street = row_key(row)
    if not street:
        return []
    clean_street = street.replace("街道/片区", "").replace("待核验", "")
    return [
        (f"{clean_street}生活圈", "社区"),
        (f"{clean_street}餐饮带", "餐饮"),
        (f"{district}成熟住宅客群", "住宅"),
    ]


def build_evidence_points(street_rows):
    points = []
    by_id = defaultdict(list)
    for row in street_rows:
        lon = number(row.get(LON))
        lat = number(row.get(LAT))
        if lon is None or lat is None:
            continue
        did = row_id(row)
        seed_kind = {name: kind for name, kind in CURATED_POI.get(row_key(row), [])}
        seed_kind.update({name: kind for name, kind in fallback_poi(row)})
        names = stable_names(row)
        for index, name in enumerate(names[:10]):
            kind = seed_kind.get(name) or poi_type(name)
            ev_lon, ev_lat = offset_coord(lon, lat, index)
            point = {
                "证据ID": f"PE-{did}-{index + 1:02d}",
                "决策ID": did,
                "省份": "福建",
                "城市": row_key(row)[0],
                "区县": row_key(row)[1],
                "街道/片区": row_key(row)[2],
                "名称": name,
                "类型": kind,
                "经度": ev_lon,
                "纬度": ev_lat,
                "坐标精度": "街道级示意",
                "来源": "公开地名/商圈资料整理" if row_key(row) in CURATED_POI or name in split_poi(row.get("公开POI线索")) else "街道名称派生线索",
                "来源等级": "L2" if row_key(row) in CURATED_POI or name in split_poi(row.get("公开POI线索")) else "L1",
                "说明": "用于前置选址判断；坐标为街道级示意锚点，不作为签约依据。",
                "数据更新时间": TODAY,
            }
            points.append(point)
            by_id[did].append(point)
    return points, by_id


def evidence_summary(points):
    if not points:
        return "公开证据待补充"
    type_counts = Counter(point["类型"] for point in points)
    names = "、".join(point["名称"] for point in points[:5])
    types = "、".join(f"{kind}{count}" for kind, count in type_counts.most_common(4))
    return f"{types}；重点线索：{names}"


def coverage_judgement(row):
    own = count_value(row, "周边1.5公里本店数", "周麻婆现有门店数", "周麻婆关联点位数")
    if own <= 0:
        return "本店空白，可优先看是否存在合适铺位"
    if own <= 2:
        return "已有本店覆盖，适合观察补点或保护半径"
    return "本店覆盖较密，需评估同区分流"


def competition_judgement(row):
    core = count_value(row, "周边3公里五大竞品数", "五大竞品门店数", "五大竞品关联点位数", "友商/竞品门店数")
    if core >= 20:
        return "五大竞品验证强，但需警惕竞争和租金"
    if core >= 6:
        return "有竞品验证，可作为看铺候选"
    return "竞品验证偏弱，需平台截图和实地客流复核"


def action_suggestion(row, points):
    tag = text(row.get("机会标签"))
    score = number(row.get("街道评分") or row.get("综合评分")) or 0
    own = count_value(row, "周边1.5公里本店数", "周麻婆现有门店数", "周麻婆关联点位数")
    core = count_value(row, "周边3公里五大竞品数", "五大竞品门店数", "五大竞品关联点位数", "友商/竞品门店数")
    if "过密" in tag or "谨慎" in tag or own >= 3:
        return "本周动作：先查租金与同区分流，再决定是否看铺"
    if score >= 86 and own == 0 and (core >= 6 or len(points) >= 3):
        return "本周动作：安排看铺，并同步补美团/点评截图和租金报价"
    if score >= 78:
        return "本周动作：进入观察清单，先补平台表现和周边100米实地照片"
    return "本周动作：暂缓看铺，保留街道级线索"


def merge_poi_text(row, points):
    existing = split_poi(row.get("公开POI线索"))
    names = existing[:]
    for point in points:
        if point["名称"] not in names:
            names.append(point["名称"])
    return "、".join(names[:12]) if names else text(row.get("公开POI线索"), "待平台复核")


def update_street_row(row, points):
    if row_key(row)[0] not in {"福州", "厦门", "泉州"}:
        return
    row["地图视野范围"] = "街道中心1.5-3公里"
    row["本店覆盖判断"] = coverage_judgement(row)
    row["竞品验证判断"] = competition_judgement(row)
    row["本周动作建议"] = action_suggestion(row, points)
    if not points:
        row["公开证据点数"] = text(row.get("公开证据点数"), "0")
        row["公开证据摘要"] = text(row.get("公开证据摘要"), "公开证据待补充")
        row["街道周边证据摘要"] = row["公开证据摘要"]
        return
    count = len(points)
    summary = evidence_summary(points)
    row["公开证据点数"] = count
    row["公开证据摘要"] = summary
    row["街道周边证据摘要"] = f"{row['本店覆盖判断']}；{row['竞品验证判断']}；{summary}"
    row["地图证据提示"] = f"已加入{count}个公开证据点；{summary}。"
    row["公开POI线索"] = merge_poi_text(row, points)
    for field in ["公开POI线索数", "POI支撑数", "商圈/商业体线索数"]:
        current = number(row.get(field)) or 0
        row[field] = int(max(current, count))
    reason = text(row.get("街道判断理由") or row.get("主要依据"))
    if reason and "公开证据" not in reason:
        row["街道判断理由"] = f"{reason} 公开证据补强：{summary}。"
    elif not reason:
        row["街道判断理由"] = f"公开证据补强：{summary}。结合街道评分、本店覆盖与五大竞品验证安排前置筛选。"


def build_bundles(street_rows, by_id):
    bundles = []
    for row in street_rows:
        if row_key(row)[0] not in {"福州", "厦门", "泉州"}:
            continue
        did = row_id(row)
        points = by_id.get(did, [])
        bundles.append(
            {
                "决策ID": did,
                "城市": row_key(row)[0],
                "区县": row_key(row)[1],
                "街道/片区": row_key(row)[2],
                "街道评分": row.get("街道评分") or row.get("综合评分"),
                "推荐等级": row.get("推荐等级"),
                "适合店型": row.get("适合店型"),
                "机会标签": row.get("机会标签"),
                "周麻婆门店数": row.get("周麻婆现有门店数") or row.get("周边1.5公里本店数"),
                "五大竞品数": row.get("五大竞品门店数") or row.get("周边3公里五大竞品数"),
                "公开证据点数": len(points),
                "公开证据摘要": evidence_summary(points),
                "地图视野范围": row.get("地图视野范围") or "街道中心1.5-3公里",
                "街道周边证据摘要": row.get("街道周边证据摘要") or evidence_summary(points),
                "本店覆盖判断": row.get("本店覆盖判断") or coverage_judgement(row),
                "竞品验证判断": row.get("竞品验证判断") or competition_judgement(row),
                "本周动作建议": row.get("本周动作建议") or action_suggestion(row, points),
                "地图表达": "街道中心 + 公开证据点 + 周麻婆门店 + 五大竞品门店",
                "使用说明": "公开证据用于前置区域/街道筛选，仍需平台截图、租金和实地走访复核。",
                "数据更新时间": TODAY,
            }
        )
    return bundles


def main():
    backup = DATA.with_name(f"{DATA.stem}.bak-v10-public-evidence-{datetime.now().strftime('%Y%m%d-%H%M%S')}{DATA.suffix}")
    shutil.copy2(DATA, backup)
    data = json.loads(DATA.read_text(encoding="utf-8"))
    street_rows = data.get("streetMapPoints") or data.get("streetDecisions") or []
    points, by_id = build_evidence_points(street_rows)

    for collection_name in ["streetMapPoints", "streetDecisions"]:
        for row in data.get(collection_name, []):
            update_street_row(row, by_id.get(row_id(row), []))

    decision_map = data.setdefault("decisionMap", {})
    for collection_name in ["streetSummaries", "streetDecisionScore"]:
        for row in decision_map.get(collection_name, []):
            update_street_row(row, by_id.get(row_id(row), []))

    data["publicEvidencePoints"] = points
    data["streetEvidenceBundles"] = build_bundles(street_rows, by_id)
    data["publicEvidenceSources"] = [
        {
            "来源": "现有街道公开POI线索",
            "用途": "把已有公开地名拆成可视化证据点",
            "来源等级": "L2",
        },
        {
            "来源": "公开商圈/地名资料整理",
            "用途": "补充福州、厦门、泉州重点街道的商业体、交通、学校、文旅、住宅和办公线索",
            "来源等级": "L2",
        },
        {
            "来源": "OpenStreetMap/Nominatim/Overpass 预留",
            "用途": "后续小批量复核地名坐标或边界线索，遵守公开服务限速和缓存要求",
            "来源等级": "L2",
        },
        {
            "来源": "街道名称派生线索",
            "用途": "为暂未补足公开资料的街道生成生活圈、餐饮带、住宅客群等待复核证据点",
            "来源等级": "L1",
        },
    ]
    data.setdefault("meta", {})["v10PublicEvidenceUpdatedAt"] = TODAY
    data["meta"]["publicEvidenceRule"] = "公开证据点为街道级示意锚点，只用于前置选址判断，不作为最终签约依据。"

    DATA.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Updated: {DATA}")
    print(f"Backup: {backup}")
    print(f"Public evidence points: {len(points)}")
    print(f"Street evidence bundles: {len(data['streetEvidenceBundles'])}")


if __name__ == "__main__":
    main()
