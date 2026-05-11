const CITY_CODES = {
  福州: "350100",
  厦门: "350200",
  莆田: "350300",
  三明: "350400",
  泉州: "350500",
  漳州: "350600",
  南平: "350700",
  龙岩: "350800",
  宁德: "350900",
};

const CORE_COMPETITORS = ["小叫天", "醉得意", "四方桌", "大丰收", "姑奶奶"];
const FUJIAN_CITIES = Object.keys(CITY_CODES);

const state = {
  data: null,
  provinceGeo: null,
  cityGeo: null,
  selectedCity: "福州",
  selectedDistrict: "",
  selectedStreetId: "",
  selectedMapObject: null,
  provinceMetric: "priority",
  districtMetric: "score",
  mapViewMode: "auto",
  labelDensity: "low",
  streetOpportunity: "all",
  streetStoreType: "all",
  layers: {
    streets: true,
    ownStores: true,
    coreCompetitors: true,
    areas: true,
    evidence: true,
    zones: true,
  },
  compareIds: [],
  leaflet: {
    maps: {},
  },
};

function text(value, fallback = "待判断") {
  if (value === undefined || value === null || String(value).trim() === "") return fallback;
  return String(value).trim();
}

function displayText(value, fallback = "待复核") {
  const raw = text(value, fallback);
  if (raw === "待补" || raw === "缺失" || raw === "无") return fallback;
  return raw.replaceAll("缺平台数据", "待平台复核").replaceAll("缺租金", "待租金复核").replaceAll("缺照片", "待实地确认").replaceAll("缺地理编码", "待定位补充");
}

function escapeHtml(value) {
  return text(value, "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function numberValue(value, fallback = 0) {
  const parsed = Number(String(value ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeCity(name) {
  return text(name, "").replace(/市$/, "").replace(/地区$/, "").replace(/省$/, "");
}

function normalizeDistrict(name) {
  return text(name, "").replace(/\s/g, "");
}

function gradeRank(grade) {
  return { A: 5, B: 4, C: 3, D: 2 }[text(grade)] || 0;
}

function gradeValue(row) {
  return text(row && (row["推荐等级"] || row["最高推荐等级"]), "待定");
}

function scoreValue(row) {
  return numberValue(row && (row["综合评分"] || row["街道评分"] || row["环境评分"]), 0);
}

function qualityValue(row) {
  return numberValue(row && (row["数据质量评分"] || row["平均数据质量分"]), 0);
}

function byCity(rows, city = state.selectedCity) {
  return (rows || []).filter((row) => normalizeCity(row["城市"]) === normalizeCity(city));
}

function byDistrict(rows, district = state.selectedDistrict) {
  if (!district) return rows || [];
  return (rows || []).filter((row) => normalizeDistrict(row["区县"]) === normalizeDistrict(district));
}

function sortByDecision(rows, scoreKey = "综合评分", gradeKey = "推荐等级") {
  return [...(rows || [])].sort((a, b) => {
    const gradeDiff = gradeRank(b[gradeKey]) - gradeRank(a[gradeKey]);
    if (gradeDiff) return gradeDiff;
    return numberValue(b[scoreKey]) - numberValue(a[scoreKey]);
  });
}

function fujianCities() {
  return sortByDecision((state.data.cities || []).filter((row) => text(row["省份"], "") === "福建"));
}

function cityRecord(city = state.selectedCity) {
  return fujianCities().find((row) => normalizeCity(row["城市"]) === normalizeCity(city)) || fujianCities()[0] || {};
}

function cityMetric(city = state.selectedCity) {
  return (state.data.mapLayerMetrics || {})[normalizeCity(city)] || {};
}

function cityStreetRows(city = state.selectedCity) {
  const decisionRows = (decisionMap().streetDecisionScore || []).length
    ? decisionMap().streetDecisionScore
    : ((state.data.townStreetMapPoints || []).length ? state.data.townStreetMapPoints : ((state.data.v11DecisionMap && state.data.v11DecisionMap.townStreetScores) || decisionMap().streetSummaries || state.data.townStreetFoundation || state.data.streetMapPoints || []));
  return sortByDecision(byCity(decisionRows, city), "街道评分", "推荐等级");
}

function cityStreetDecisions(city = state.selectedCity) {
  return sortByDecision(byCity(state.data.streetDecisions || [], city), "街道评分", "推荐等级");
}

function districtMetricRows(city = state.selectedCity) {
  return sortByDecision(byCity(state.data.districtMapMetrics || [], city), "综合评分", "推荐等级");
}

function districtMetric(district = state.selectedDistrict, city = state.selectedCity) {
  return districtMetricRows(city).find((row) => normalizeDistrict(row["区县"]) === normalizeDistrict(district));
}

function streetRows(district = state.selectedDistrict, city = state.selectedCity) {
  let rows = byDistrict(cityStreetRows(city), district).map(mergedStreet);
  if (state.streetOpportunity !== "all") {
    rows = rows.filter((row) => streetOpportunityMatches(row, state.streetOpportunity));
  }
  if (state.streetStoreType !== "all") {
    rows = rows.filter((row) => text(row["适合店型"], "").includes(state.streetStoreType));
  }
  return sortByDecision(rows, "街道评分", "推荐等级");
}

function locatedStreetRows(district = state.selectedDistrict, city = state.selectedCity) {
  return streetRows(district, city).filter((row) => pointCoordinates(row));
}

function streetDecisionFor(row) {
  const id = text(row["决策ID"], "");
  const city = normalizeCity(row["城市"]);
  const district = normalizeDistrict(row["区县"]);
  const street = rowTitle(row);
  return (state.data.streetDecisions || []).find((item) => text(item["决策ID"], "") === id) ||
    (state.data.streetDecisions || []).find((item) =>
      normalizeCity(item["城市"]) === city &&
      normalizeDistrict(item["区县"]) === district &&
      rowTitle(item) === street
    ) || {};
}

function mergedStreet(row) {
  return { ...streetDecisionFor(row), ...row };
}

function streetOwnCount(row) {
  return numberValue(row && (row["周边1.5公里本店数"] ?? row["周麻婆现有门店数"] ?? row["周麻婆关联点位数"]), 0);
}

function streetCoreCount(row) {
  return numberValue(row && (row["周边3公里五大竞品数"] ?? row["五大竞品门店数"] ?? row["友商/竞品门店数"] ?? row["五大竞品关联点位数"]), 0);
}

function streetPoiCount(row) {
  return numberValue(row && (row["公开证据点数"] ?? row["POI支撑数"] ?? row["商圈/商业体线索数"] ?? row["公开POI线索数"]), 0);
}

function streetDecision(row) {
  const value = text(row && row["街道潜力判断"], "");
  if (value) return value;
  const tag = text(row && row["机会标签"], "");
  if (tag.includes("过密") || tag.includes("谨慎")) return "谨慎";
  if (tag.includes("空白") || tag.includes("高潜")) return "优先进入";
  if (tag.includes("覆盖")) return "本店已覆盖";
  return "可观察";
}

function streetOpportunityMatches(row, value) {
  const tag = `${text(row["机会标签"], "")} ${text(row["机会类型"], "")} ${streetDecision(row)}`;
  if (value === "priority") return tag.includes("优先进入");
  if (value === "observe") return tag.includes("可观察");
  if (value === "covered") return tag.includes("覆盖");
  if (value === "cautious") return tag.includes("谨慎") || tag.includes("过密");
  if (value === "blank") return tag.includes("空白") || tag.includes("高潜");
  if (value === "competition") return tag.includes("竞争");
  return true;
}

function mapModeRows(rows, mode = state.mapViewMode) {
  const source = rows || [];
  if (mode === "auto" || mode === "county" || mode === "all") return source;
  if (mode === "core") {
    const sorted = sortByDecision(source, "街道评分", "推荐等级");
    const threshold = sorted.length > 14 ? sorted[Math.min(13, sorted.length - 1)] && scoreValue(sorted[Math.min(13, sorted.length - 1)]) : 0;
    return sorted.filter((row, index) => index < 14 || scoreValue(row) >= threshold);
  }
  if (mode === "blank") return source.filter((row) => streetOwnCount(row) === 0 && (scoreValue(row) >= 70 || text(row["机会标签"], "").includes("空白")));
  if (mode === "smalltown") return source.filter((row) => {
    const type = text(row["镇街类型"], "");
    return (type.includes("镇") || type.includes("乡")) && scoreValue(row) >= 62;
  });
  if (mode === "competition") return source.filter((row) => streetCoreCount(row) > 0 || text(row["机会标签"], "").includes("竞争"));
  if (mode === "coverage") return source.filter((row) => streetOwnCount(row) > 0 || text(row["机会标签"], "").includes("覆盖"));
  if (mode === "food") return source.filter((row) => scoreValue(row) >= 64 || text(row["餐饮机会"], "").length > 0);
  if (mode === "commercial") return source.filter((row) => numberValue(row["商业更新指数"]) >= 70 || text(row["镇街角色标签"], "").includes("商业") || text(row["机会标签"], "").includes("商业"));
  if (mode === "tourism") return source.filter((row) => text(row["镇街角色标签"], "").includes("文旅") || text(row["交通学校住宅文旅标签"], "").includes("文旅") || text(row["商业报告线索"], "").includes("文旅"));
  return source;
}

function enhanceMapModeOptions() {
  const select = document.querySelector("#mapViewMode");
  if (!select) return;
  const current = state.mapViewMode || select.value || "auto";
  select.innerHTML = `
    <option value="auto">自动适配</option>
    <option value="food">餐饮机会</option>
    <option value="blank">本店空白</option>
    <option value="competition">竞品验证</option>
    <option value="commercial">商业项目</option>
    <option value="tourism">文旅流量</option>
    <option value="smalltown">小城镇机会</option>
    <option value="coverage">本店覆盖</option>
    <option value="evidence">公开证据</option>
    <option value="county">县域全貌</option>
    <option value="all">全量县镇街</option>
  `;
  select.value = [...select.options].some((item) => item.value === current) ? current : "auto";
}

function mapCameraConfig() {
  return state.data.mapCameraConfig || (state.data.v12DecisionMap && state.data.v12DecisionMap.mapCameraConfig) || {};
}

function configBounds(bounds) {
  if (!bounds) return null;
  const minX = Number(bounds.minX);
  const maxX = Number(bounds.maxX);
  const minY = Number(bounds.minY);
  const maxY = Number(bounds.maxY);
  if (![minX, maxX, minY, maxY].every(Number.isFinite)) return null;
  return { minX, maxX, minY, maxY };
}

function districtCamera(district = state.selectedDistrict, city = state.selectedCity) {
  return ((mapCameraConfig().districtCameras || {})[`${normalizeCity(city)}|${text(district, "")}`]) || null;
}

function streetCamera(row = selectedStreet()) {
  const id = text(row && row["决策ID"], "");
  return id ? ((mapCameraConfig().streetCameras || {})[id] || null) : null;
}

function streetMapLabel(row) {
  const title = compactMapName(rowTitle(row));
  if (state.labelDensity === "low") return title;
  const score = scoreValue(row);
  if (state.labelDensity === "medium") return `${title} ${score}分`;
  return `${title} ${score}分｜本${streetOwnCount(row)}竞${streetCoreCount(row)}`;
}

function conclusionTone(label) {
  if (["优先进入", "优先看", "安排看铺"].some((key) => label.includes(key))) return "good";
  if (["可推进", "可观察", "补平台数据", "查租金"].some((key) => label.includes(key))) return "watch";
  if (["谨慎", "暂缓"].some((key) => label.includes(key))) return "risk";
  if (label.includes("覆盖")) return "covered";
  return "watch";
}

function decisionConclusion(type, row = {}) {
  const score = scoreValue(row);
  const grade = gradeValue(row);
  if (type === "city") {
    const stats = cityStats(normalizeCity(row["城市"] || state.selectedCity));
    const label = grade === "A" || score >= 84 ? "优先进入" : grade === "B" || score >= 74 ? "可推进" : grade === "C" || score >= 64 ? "观察" : "暂缓";
    return {
      label,
      action: label === "优先进入" ? "先看核心区县和镇街机会" : label === "可推进" ? "补强区县与镇街对比" : label === "观察" ? "先保留城市级线索" : "暂缓投入",
      summary: `${normalizeCity(row["城市"] || state.selectedCity)}：${score}分，${stats.streets}个镇街样本，${stats.competitors}个五大竞品点。`,
    };
  }
  if (type === "district") {
    const stats = districtStats(row["区县"] || state.selectedDistrict);
    const label = score >= 80 && stats.streets > 0 ? "建议优先看" : score >= 70 ? "可推进观察" : stats.competitors > 20 && stats.stores > 5 ? "竞争密集谨慎" : "补数据观察";
    return {
      label,
      action: label === "建议优先看" ? "下钻镇街榜，优先看评分靠前镇街" : label === "可推进观察" ? "先比较镇街和本店覆盖" : label === "竞争密集谨慎" ? "重点查租金和同区分流风险" : "先补镇街/商圈线索",
      summary: `${text(row["区县"] || state.selectedDistrict)}：${stats.streets}个镇街，${stats.stores}家本店，${stats.competitors}个五大竞品。`,
    };
  }
  const rawLabel = streetDecision(row);
  const label = displayText(row["推荐动作"] || (rawLabel === "优先进入" ? "本周优先看" : rawLabel));
  const actionMap = {
    本周看铺: "本周建议动作：安排看铺",
    优先查租金: "本周建议动作：先查租金和合同条件",
    补平台数据: "本周建议动作：补美团/点评/外卖数据",
    实地观察: "本周建议动作：实地观察午晚高峰",
    暂缓: "本周建议动作：暂缓，等待证据补强",
    本周优先看: "本周建议动作：安排看铺",
    可观察: "本周建议动作：补平台数据",
    本店已覆盖: "本周建议动作：评估补点或保护半径",
    谨慎: "本周建议动作：查租金后再定",
  };
  return {
    label,
    action: displayText(row["行动建议"] || row["1.5行动建议"] || actionMap[label] || "本周建议动作：复核后再定"),
    summary: `${rowTitle(row)}：${scoreValue(row)}分，证据${displayText(row["证据强度"] || row["1.5证据强度"] || "待复核")}，适合${displayText(row["适合店型"])}，本店${streetOwnCount(row)}，竞品${streetCoreCount(row)}。`,
  };
}

function conclusionHtml(conclusion, extraClass = "") {
  return `
    <div class="conclusion-card ${conclusionTone(conclusion.label)} ${extraClass}">
      <span>当前结论</span>
      <strong>${escapeHtml(conclusion.label)}</strong>
      <p>${escapeHtml(conclusion.summary)}</p>
      <em>${escapeHtml(conclusion.action)}</em>
    </div>
  `;
}

function selectedStreet() {
  const rows = streetRows();
  return rows.find((row) => streetId(row) === state.selectedStreetId) || rows[0] || null;
}

function streetId(row) {
  return text(row && (row["点ID"] || row["决策ID"] || `${row["城市"]}-${row["区县"]}-${rowTitle(row)}`), "");
}

function rowTitle(row) {
  return text(row && (row["街道/片区"] || row["镇街"] || row["街道"] || row["区县"] || row["城市"]));
}

function coreCompetitorRows(rows) {
  return (rows || []).filter((row) => CORE_COMPETITORS.some((brand) => text(row["竞品品牌"] || row["品牌"] || row["门店名称"], "").includes(brand)));
}

function decisionMap() {
  return state.data.v15DecisionMap || state.data.decisionMap || {};
}

function ownStorePoints(city = state.selectedCity, district = "") {
  const rows = state.data.storeMapPoints || decisionMap().ownStorePoints || (state.data.storeDistribution || []).filter((row) => text(row["品牌"], "") === "周麻婆");
  return byDistrict(byCity(rows, city), district).filter(pointCoordinates);
}

function coreCompetitorPoints(city = state.selectedCity, district = "") {
  const rows = state.data.competitorMapPoints || decisionMap().coreCompetitorPoints || coreCompetitorRows(state.data.competitorStores || []);
  return byDistrict(byCity(rows, city), district).filter(pointCoordinates);
}

function areaPoints(city = state.selectedCity, district = "") {
  return byDistrict(byCity(state.data.businessAreas || [], city), district).filter(pointCoordinates);
}

function publicEvidencePoints(row = selectedStreet()) {
  const source = state.data.evidenceMapPoints || state.data.publicEvidencePoints || [];
  if (!row) return [];
  const id = text(row["决策ID"], "");
  const city = normalizeCity(row["城市"]);
  const district = normalizeDistrict(row["区县"]);
  const street = rowTitle(row);
  return source.filter((item) =>
    (id && text(item["决策ID"], "") === id) ||
    (
      normalizeCity(item["城市"]) === city &&
      normalizeDistrict(item["区县"]) === district &&
      rowTitle(item) === street
    )
  ).filter(pointCoordinates);
}

function streetEvidenceBundle(row = selectedStreet()) {
  if (!row) return null;
  const id = text(row["决策ID"], "");
  const city = normalizeCity(row["城市"]);
  const district = normalizeDistrict(row["区县"]);
  const street = rowTitle(row);
  return (state.data.streetEvidenceBundles || []).find((item) =>
    (id && text(item["决策ID"], "") === id) ||
    (
      normalizeCity(item["城市"]) === city &&
      normalizeDistrict(item["区县"]) === district &&
      rowTitle(item) === street
    )
  );
}

function citySummaryRow(city = state.selectedCity) {
  return (decisionMap().citySummaries || []).find((row) => normalizeCity(row["城市"]) === normalizeCity(city));
}

function districtSummaryRow(district = state.selectedDistrict, city = state.selectedCity) {
  return (decisionMap().districtSummaries || []).find((row) => normalizeCity(row["城市"]) === normalizeCity(city) && normalizeDistrict(row["区县"]) === normalizeDistrict(district));
}

function cityStats(city = state.selectedCity) {
  const summary = citySummaryRow(city);
  if (summary) {
    return {
      areas: numberValue(summary["商圈样本数"]),
      streets: numberValue(summary["镇街样本数"] ?? summary["街道样本数"]),
      competitors: numberValue(summary["五大竞品门店数"]),
      stores: numberValue(summary["周麻婆门店数"]),
      quality: qualityValue(summary),
      p1: numberValue(summary["P1任务数"], 0),
      blank: numberValue(summary["高潜街道数"], 0),
    };
  }
  const metric = cityMetric(city);
  const kpi = (state.data.cityKpi || []).find((row) => normalizeCity(row["城市"]) === normalizeCity(city)) || {};
  const areas = byCity(state.data.businessAreas || [], city).length;
  const streets = byCity(state.data.streetMapPoints || [], city).length || byCity(state.data.streetDecisions || [], city).length;
  const competitors = coreCompetitorRows(byCity(state.data.competitorStores || [], city)).length;
  const stores = byCity(state.data.storeDistribution || [], city).filter((row) => text(row["品牌"], "") === "周麻婆").length;
  return {
    areas,
    streets,
    competitors,
    stores,
    quality: numberValue(kpi["平均数据质量分"], metric.avgQuality || qualityValue(cityRecord(city))),
    p1: numberValue(kpi["P1任务数"], metric.p1TaskCount || 0),
    blank: numberValue(kpi["高潜空白街道数"] || metric.blankStreetCount, 0),
  };
}

function districtStats(district = state.selectedDistrict) {
  const row = districtSummaryRow(district) || districtMetric(district) || {};
  const streets = streetRows(district).length || numberValue(row["镇街数量"] ?? row["街道数"], 0);
  const areas = byDistrict(byCity(state.data.businessAreas || []), district).length;
  return {
    row,
    streets,
    areas,
    stores: numberValue(row["周麻婆门店数"], byDistrict(byCity(state.data.storeDistribution || []), district).length),
    competitors: numberValue(row["五大竞品门店数"], coreCompetitorRows(byDistrict(byCity(state.data.competitorStores || []), district)).length),
    blank: numberValue(row["高潜空白街道数"], 0),
    quality: numberValue(row["平均数据质量分"], qualityValue(row)),
    score: scoreValue(row),
  };
}

function pointCoordinates(row) {
  const lon = Number(row && row["经度"]);
  const lat = Number(row && row["纬度"]);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  return [lon, lat];
}

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function gradeColor(grade) {
  const value = text(grade);
  if (value === "A") return cssVar("--green");
  if (value === "B") return cssVar("--blue");
  if (value === "C") return cssVar("--gold");
  if (value === "D") return cssVar("--red");
  return "#87968f";
}

function scoreColor(score) {
  if (score >= 84) return gradeColor("A");
  if (score >= 74) return gradeColor("B");
  if (score >= 64) return gradeColor("C");
  return gradeColor("D");
}

function lerpColor(a, b, t) {
  const aa = a.match(/\w\w/g).map((x) => parseInt(x, 16));
  const bb = b.match(/\w\w/g).map((x) => parseInt(x, 16));
  const rr = aa.map((v, i) => Math.round(v + (bb[i] - v) * Math.max(0, Math.min(1, t))));
  return `#${rr.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function metricColor(value, max, mode = "green") {
  const t = max ? Math.max(0, Math.min(1, Number(value) / max)) : 0;
  if (mode === "blue") return lerpColor("d9e9f1", "286f9f", t);
  if (mode === "warm") return lerpColor("f4ead6", "b34c44", t);
  return lerpColor("dcebe2", "15764f", t);
}

function gradeBadge(grade) {
  const value = text(grade, "待定");
  const cls = { A: "grade-a", B: "grade-b", C: "grade-c", D: "grade-d" }[value] || "grade-pending";
  return `<span class="grade ${cls}">${escapeHtml(value)}</span>`;
}

function opportunityTags(row) {
  return text(row && (row["机会标签"] || row["机会类型"]), "").split(/[、,，\s]+/).filter(Boolean);
}

function tagClass(tag) {
  if (tag.includes("看铺")) return "tag-action";
  if (tag.includes("平台")) return "tag-platform";
  if (tag.includes("实地")) return "tag-field";
  if (tag.includes("暂缓")) return "tag-risk";
  if (tag.includes("空白")) return "tag-blank";
  if (tag.includes("竞争")) return "tag-competition";
  if (tag.includes("覆盖")) return "tag-covered";
  if (tag.includes("租金")) return "tag-rent";
  if (tag.includes("谨慎") || tag.includes("过密")) return "tag-risk";
  return "";
}

function tagPills(row) {
  const tags = opportunityTags(row);
  return tags.slice(0, 4).map((tag) => `<span class="tag ${tagClass(tag)}">${escapeHtml(tag)}</span>`).join("");
}

function pathBounds(features) {
  const points = [];
  const collect = (coords) => {
    if (!Array.isArray(coords)) return;
    if (typeof coords[0] === "number") points.push(coords);
    else coords.forEach(collect);
  };
  (features || []).forEach((feature) => collect(feature.geometry && feature.geometry.coordinates));
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

function paddedBounds(bounds, ratio = 0.08) {
  const dx = Math.max(0.01, (bounds.maxX - bounds.minX) * ratio);
  const dy = Math.max(0.01, (bounds.maxY - bounds.minY) * ratio);
  return {
    minX: bounds.minX - dx,
    maxX: bounds.maxX + dx,
    minY: bounds.minY - dy,
    maxY: bounds.maxY + dy,
  };
}

function boundsFromRows(rows, fallbackBounds, minSpan = 0.018) {
  const coords = (rows || []).map(pointCoordinates).filter(Boolean);
  if (!coords.length) return fallbackBounds;
  const xs = coords.map((point) => point[0]);
  const ys = coords.map((point) => point[1]);
  let bounds = { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const addX = Math.max(0, (minSpan - width) / 2);
  const addY = Math.max(0, (minSpan - height) / 2);
  bounds = { minX: bounds.minX - addX, maxX: bounds.maxX + addX, minY: bounds.minY - addY, maxY: bounds.maxY + addY };
  return paddedBounds(bounds, 0.28);
}

function fitVisibleBounds(rows, fallbackBounds, options = {}) {
  const coords = (rows || []).map(pointCoordinates).filter(Boolean);
  if (!coords.length) return paddedBounds(fallbackBounds, options.fallbackPad ?? 0.08);
  const minSpan = options.minSpan ?? 0.012;
  const pad = options.pad ?? 0.1;
  const maxSpan = options.maxSpan ?? Infinity;
  const xs = coords.map((point) => point[0]);
  const ys = coords.map((point) => point[1]);
  let minX = Math.min(...xs);
  let maxX = Math.max(...xs);
  let minY = Math.min(...ys);
  let maxY = Math.max(...ys);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  let spanX = Math.max(minSpan, maxX - minX);
  let spanY = Math.max(minSpan, maxY - minY);
  const span = Math.min(maxSpan, Math.max(spanX, spanY));
  minX = centerX - span / 2;
  maxX = centerX + span / 2;
  minY = centerY - span / 2;
  maxY = centerY + span / 2;
  const dx = span * pad;
  const dy = span * pad;
  return { minX: minX - dx, maxX: maxX + dx, minY: minY - dy, maxY: maxY + dy };
}

function normalizeBoundsForCanvas(bounds, width, height, options = {}) {
  if (!bounds) return bounds;
  const padding = options.padding ?? 44;
  const fill = Math.max(0.42, Math.min(0.92, options.fill ?? 0.82));
  const innerWidth = Math.max(1, width - padding * 2);
  const innerHeight = Math.max(1, height - padding * 2);
  const targetAspect = innerWidth / innerHeight;
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  let spanX = Math.max(options.minSpan ?? 0.004, bounds.maxX - bounds.minX);
  let spanY = Math.max(options.minSpan ?? 0.004, bounds.maxY - bounds.minY);
  if (spanX / spanY > targetAspect) {
    spanY = spanX / targetAspect;
  } else {
    spanX = spanY * targetAspect;
  }
  spanX /= fill;
  spanY /= fill;
  return {
    minX: centerX - spanX / 2,
    maxX: centerX + spanX / 2,
    minY: centerY - spanY / 2,
    maxY: centerY + spanY / 2,
  };
}

function fitAroundSelectedPoint(center, rows, fallbackBounds, options = {}) {
  if (!center) return fitVisibleBounds(rows, fallbackBounds, options);
  const maxSpan = options.maxSpan ?? 0.034;
  const local = (rows || []).filter((row) => {
    const coords = pointCoordinates(row);
    return coords && Math.abs(coords[0] - center[0]) <= maxSpan && Math.abs(coords[1] - center[1]) <= maxSpan;
  });
  return fitVisibleBounds(local.length ? local : [{ 经度: center[0], 纬度: center[1] }], fallbackBounds, {
    minSpan: options.minSpan ?? 0.010,
    maxSpan,
    pad: options.pad ?? 0.14,
  });
}

function centeredBounds(center, rows, fallbackBounds, minSpan = 0.018, maxSpan = 0.052) {
  if (!center) return boundsFromRows(rows, fallbackBounds, minSpan);
  const coords = (rows || []).map(pointCoordinates).filter(Boolean);
  const local = coords.filter((point) => Math.abs(point[0] - center[0]) <= maxSpan && Math.abs(point[1] - center[1]) <= maxSpan);
  const xs = local.length ? local.map((point) => point[0]) : [center[0]];
  const ys = local.length ? local.map((point) => point[1]) : [center[1]];
  const spanX = Math.min(maxSpan, Math.max(minSpan, Math.max(...xs) - Math.min(...xs)));
  const spanY = Math.min(maxSpan, Math.max(minSpan, Math.max(...ys) - Math.min(...ys)));
  const finalSpan = Math.max(spanX, spanY);
  return {
    minX: center[0] - finalSpan / 2,
    maxX: center[0] + finalSpan / 2,
    minY: center[1] - finalSpan / 2,
    maxY: center[1] + finalSpan / 2,
  };
}

function districtMapBounds(camera, mode, projectRows, fallbackBounds) {
  if (mode === "county") return paddedBounds(fallbackBounds, 0.06);
  if (mode === "auto" || mode === "core") {
    return fitVisibleBounds(projectRows, fallbackBounds, { minSpan: 0.006, maxSpan: 0.075, pad: 0.045 });
  }
  return configBounds(camera && camera.bounds) || fitVisibleBounds(projectRows, fallbackBounds, { minSpan: 0.010, maxSpan: 0.095, pad: 0.08 });
}

function detailMapBounds(camera, selectedCoords, focusRows, fallbackBounds, mode) {
  if (mode === "county") return paddedBounds(fallbackBounds, 0.06);
  const configured = configBounds(camera && (camera.detailBounds || camera.bounds));
  if (mode === "auto" && selectedCoords) {
    return fitAroundSelectedPoint(selectedCoords, focusRows, fallbackBounds, { minSpan: 0.006, maxSpan: 0.020, pad: 0.07 });
  }
  if (configured && mode === "core") return configured;
  return selectedCoords
    ? fitAroundSelectedPoint(selectedCoords, focusRows, fallbackBounds, { minSpan: 0.008, maxSpan: mode === "core" ? 0.024 : 0.030, pad: 0.09 })
    : fitVisibleBounds(focusRows, fallbackBounds, { minSpan: 0.012, maxSpan: 0.060, pad: 0.08 });
}

function distanceKm(a, b) {
  if (!a || !b) return Infinity;
  const toRad = (value) => value * Math.PI / 180;
  const radius = 6371;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function createProjector(bounds, width = 760, height = 560, padding = 28) {
  const safeWidth = Math.max(1, bounds.maxX - bounds.minX);
  const safeHeight = Math.max(1, bounds.maxY - bounds.minY);
  const scale = Math.min((width - padding * 2) / safeWidth, (height - padding * 2) / safeHeight);
  const offsetX = (width - safeWidth * scale) / 2;
  const offsetY = (height - safeHeight * scale) / 2;
  return ([lon, lat]) => [offsetX + (lon - bounds.minX) * scale, height - (offsetY + (lat - bounds.minY) * scale)];
}

function polygonPath(coords, project) {
  return coords.map((ring) => ring.map((point, index) => {
    const [x, y] = project(point);
    return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ") + " Z").join(" ");
}

function featurePath(feature, project) {
  if (!feature || !feature.geometry) return "";
  if (feature.geometry.type === "Polygon") return polygonPath(feature.geometry.coordinates, project);
  if (feature.geometry.type === "MultiPolygon") return feature.geometry.coordinates.map((poly) => polygonPath(poly, project)).join(" ");
  return "";
}

function featureCenter(feature, project) {
  const points = [];
  const collect = (coords) => {
    if (typeof coords[0] === "number") points.push(coords);
    else coords.forEach(collect);
  };
  collect(feature.geometry.coordinates);
  const center = points.reduce((acc, point) => [acc[0] + point[0], acc[1] + point[1]], [0, 0]).map((value) => value / Math.max(1, points.length));
  return project(center);
}

function clearSvg(svg) {
  while (svg.firstChild) svg.removeChild(svg.firstChild);
}

function svgCanvas(svg, fallbackWidth = 960, fallbackHeight = 700) {
  const rect = svg.getBoundingClientRect();
  const width = Math.max(fallbackWidth, Math.round(rect.width || fallbackWidth));
  const height = Math.max(fallbackHeight, Math.round(rect.height || fallbackHeight));
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  return { width, height };
}

function appendText(svg, x, y, value, className) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", "text");
  node.setAttribute("x", x);
  node.setAttribute("y", y);
  node.setAttribute("text-anchor", "middle");
  node.setAttribute("class", className);
  node.textContent = value;
  svg.appendChild(node);
}

function labelLimit() {
  if (state.labelDensity === "high") return 28;
  if (state.labelDensity === "medium") return 12;
  return 8;
}

function layerLabelLimit(kind) {
  if (state.labelDensity === "low") {
    if (kind === "street") return 8;
    if (kind === "evidence") return 3;
    return 0;
  }
  if (state.labelDensity === "high") return kind === "street" ? 18 : kind === "evidence" ? 10 : 5;
  return kind === "street" ? 12 : kind === "evidence" ? 6 : 0;
}

function compactMapName(value, max = 8) {
  const cleaned = text(value, "")
    .replace(/待核验/g, "")
    .replace(/街道\/片区/g, "")
    .replace(/片区/g, "")
    .replace(/商圈/g, "");
  return cleaned.length > max ? `${cleaned.slice(0, max)}…` : cleaned;
}

function canPlaceLabel(slots, x, y, minX = 72, minY = 22) {
  const ok = !slots.some((slot) => Math.abs(slot.x - x) < minX && Math.abs(slot.y - y) < minY);
  if (ok) slots.push({ x, y });
  return ok;
}

function spreadPoint(x, y, index, amount = 12) {
  if (!amount) return [x, y];
  const angle = (index * 137.5 * Math.PI) / 180;
  const ring = 0.45 + (index % 5) / 5;
  return [x + Math.cos(angle) * amount * ring, y + Math.sin(angle) * amount * ring];
}

function projectedExtent(rows, project) {
  const points = (rows || []).map(pointCoordinates).filter(Boolean).map(project);
  if (!points.length) return null;
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  return {
    count: points.length,
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}

function shouldUseDecisionLayout(rows, project, canvas, minWidthRatio = 0.34, minHeightRatio = 0.26) {
  const extent = projectedExtent(rows, project);
  if (!extent || extent.count < 4) return false;
  return extent.width < canvas.width * minWidthRatio || extent.height < canvas.height * minHeightRatio;
}

function decisionGridPosition(index, total, canvas) {
  const cols = Math.max(3, Math.ceil(Math.sqrt(total * 1.35)));
  const rows = Math.ceil(total / cols);
  const col = index % cols;
  const row = Math.floor(index / cols);
  const startX = canvas.width * 0.16;
  const endX = canvas.width * 0.84;
  const startY = canvas.height * 0.18;
  const endY = canvas.height * 0.78;
  const stepX = cols === 1 ? 0 : (endX - startX) / (cols - 1);
  const stepY = rows === 1 ? 0 : (endY - startY) / (rows - 1);
  const stagger = row % 2 ? stepX * 0.18 : 0;
  return [
    Math.min(endX, startX + col * stepX + stagger),
    startY + row * stepY,
  ];
}

function orbitPosition(center, index, total, radius, startAngle = -Math.PI / 2, arc = Math.PI * 2) {
  if (total <= 1) return [center[0] + radius, center[1]];
  const angle = startAngle + (arc * index) / total;
  return [center[0] + Math.cos(angle) * radius, center[1] + Math.sin(angle) * radius * 0.76];
}

function clampPoint(point, canvas, margin = 50) {
  return [
    Math.max(margin, Math.min(canvas.width - margin, point[0])),
    Math.max(margin, Math.min(canvas.height - margin, point[1])),
  ];
}

function appendPointAt(svg, row, x, y, className, label, options = {}) {
  const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
  group.setAttribute("class", `map-poi ${className}`);
  group.setAttribute("transform", `translate(${x.toFixed(2)},${y.toFixed(2)})`);
  const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
  title.textContent = label;
  const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  circle.setAttribute("r", options.radius || 5);
  group.appendChild(title);
  group.appendChild(circle);
  if (options.text) {
    const node = document.createElementNS("http://www.w3.org/2000/svg", "text");
    node.setAttribute("x", 0);
    node.setAttribute("y", -(Number(options.radius || 5) + 6));
    node.setAttribute("text-anchor", "middle");
    node.setAttribute("class", "poi-label");
    node.textContent = options.text;
    group.appendChild(node);
  }
  group.addEventListener("click", (event) => {
    event.stopPropagation();
    state.selectedMapObject = { row, type: options.type || "点位" };
    renderStreetDetail();
  });
  svg.appendChild(group);
  return group;
}

function appendPoint(svg, row, project, className, label, options = {}) {
  const coords = pointCoordinates(row);
  if (!coords) return;
  const [x, y] = project(coords);
  appendPointAt(svg, row, x, y, className, label, options);
}

function appendAggregateBadge(svg, x, y, count, className, label, offsetY = 0) {
  if (!count) return;
  const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
  group.setAttribute("class", `aggregate-badge ${className}`);
  group.setAttribute("transform", `translate(${x.toFixed(2)},${(y + offsetY).toFixed(2)})`);
  const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
  title.textContent = `${label} ${count}`;
  const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  const width = 36 + String(count).length * 5;
  rect.setAttribute("x", -width / 2);
  rect.setAttribute("y", -14);
  rect.setAttribute("width", width);
  rect.setAttribute("height", 24);
  const textNode = document.createElementNS("http://www.w3.org/2000/svg", "text");
  textNode.setAttribute("x", 0);
  textNode.setAttribute("y", 3);
  textNode.setAttribute("text-anchor", "middle");
  textNode.textContent = `${label}${count}`;
  group.appendChild(title);
  group.appendChild(rect);
  group.appendChild(textNode);
  svg.appendChild(group);
}

function appendOverviewInset(svg, feature, rows, canvas, baseBounds) {
  if (!feature || !baseBounds || canvas.width < 820) return;
  const width = 170;
  const height = 126;
  const x = canvas.width - width - 18;
  const y = 18;
  const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
  group.setAttribute("class", "overview-inset");
  group.setAttribute("transform", `translate(${x},${y})`);
  const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  bg.setAttribute("width", width);
  bg.setAttribute("height", height);
  bg.setAttribute("fill", "#ffffff");
  bg.setAttribute("fill-opacity", "0.92");
  bg.setAttribute("stroke", "#d8e2dc");
  bg.setAttribute("stroke-width", "1");
  group.appendChild(bg);
  const insetProject = createProjector(paddedBounds(baseBounds, 0.06), width, height, 12);
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", featurePath(feature, insetProject));
  path.setAttribute("class", "overview-region");
  path.setAttribute("fill", "#e7f1eb");
  path.setAttribute("stroke", "#0c4f36");
  path.setAttribute("stroke-width", "1.3");
  group.appendChild(path);
  (rows || []).slice(0, 80).forEach((row) => {
    const coords = pointCoordinates(row);
    if (!coords) return;
    const [px, py] = insetProject(coords);
    const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    dot.setAttribute("cx", px.toFixed(1));
    dot.setAttribute("cy", py.toFixed(1));
    dot.setAttribute("r", "1.8");
    dot.setAttribute("fill", "#15764f");
    dot.setAttribute("stroke", "#ffffff");
    dot.setAttribute("stroke-width", "0.8");
    group.appendChild(dot);
  });
  const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
  label.setAttribute("x", 10);
  label.setAttribute("y", height - 10);
  label.setAttribute("fill", "#53685f");
  label.setAttribute("font-size", "10");
  label.textContent = "县域全貌";
  group.appendChild(label);
  svg.appendChild(group);
}

function appendDecisionLayoutBadge(svg, canvas, title, subtitle) {
  const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
  group.setAttribute("class", "decision-layout-badge");
  group.setAttribute("transform", "translate(24,24)");
  const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  rect.setAttribute("width", Math.min(560, Math.max(430, canvas.width * 0.42)));
  rect.setAttribute("height", "58");
  rect.setAttribute("fill", "#ffffff");
  rect.setAttribute("fill-opacity", "0.92");
  rect.setAttribute("stroke", "#cddbd4");
  rect.setAttribute("stroke-width", "1");
  const titleNode = document.createElementNS("http://www.w3.org/2000/svg", "text");
  titleNode.setAttribute("x", "16");
  titleNode.setAttribute("y", "24");
  titleNode.setAttribute("class", "layout-badge-title");
  titleNode.textContent = title;
  const subtitleNode = document.createElementNS("http://www.w3.org/2000/svg", "text");
  subtitleNode.setAttribute("x", "16");
  subtitleNode.setAttribute("y", "44");
  subtitleNode.setAttribute("class", "layout-badge-subtitle");
  subtitleNode.textContent = subtitle;
  group.appendChild(rect);
  group.appendChild(titleNode);
  group.appendChild(subtitleNode);
  svg.appendChild(group);
}

function appendMapNotice(svg, message, canvas = { width: 760, height: 560 }) {
  const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
  group.setAttribute("class", "map-notice");
  group.setAttribute("transform", `translate(24,${Math.max(42, canvas.height - 44)})`);
  const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  rect.setAttribute("width", Math.min(560, Math.max(360, canvas.width - 48)));
  rect.setAttribute("height", 32);
  const textNode = document.createElementNS("http://www.w3.org/2000/svg", "text");
  textNode.setAttribute("x", 14);
  textNode.setAttribute("y", 21);
  textNode.textContent = message;
  group.appendChild(rect);
  group.appendChild(textNode);
  svg.appendChild(group);
}

function opportunityZonePathAt(x, y, radius = 42) {
  const sides = 8;
  return Array.from({ length: sides }).map((_, index) => {
    const angle = (Math.PI * 2 * index) / sides + Math.PI / 8;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius * 0.72;
    return `${index === 0 ? "M" : "L"}${px.toFixed(2)},${py.toFixed(2)}`;
  }).join(" ") + " Z";
}

function opportunityZonePath(row, project, radius = 42) {
  const coords = pointCoordinates(row);
  if (!coords) return "";
  const [x, y] = project(coords);
  return opportunityZonePathAt(x, y, radius);
}

function appendOpportunityZoneAt(svg, row, x, y) {
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", opportunityZonePathAt(x, y, Math.max(20, Math.min(44, 18 + scoreValue(row) / 4))));
  path.setAttribute("class", `opportunity-zone ${streetPointClass(row).replace("point-", "zone-")}`);
  const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
  title.textContent = `${rowTitle(row)}机会分区 · ${scoreValue(row)}分`;
  path.appendChild(title);
  path.addEventListener("click", () => selectStreet(row, false));
  svg.appendChild(path);
}

function appendOpportunityZone(svg, row, project) {
  if (!pointCoordinates(row)) return;
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", opportunityZonePath(row, project, Math.max(18, Math.min(36, 14 + scoreValue(row) / 4))));
  path.setAttribute("class", `opportunity-zone ${streetPointClass(row).replace("point-", "zone-")}`);
  const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
  title.textContent = `${rowTitle(row)}机会分区 · ${scoreValue(row)}分`;
  path.appendChild(title);
  path.addEventListener("click", () => selectStreet(row, false));
  svg.appendChild(path);
}

function provinceFill(city, cityName) {
  const stats = cityStats(cityName);
  if (state.provinceMetric === "score") return scoreColor(scoreValue(city));
  if (state.provinceMetric === "quality") return scoreColor(stats.quality);
  if (state.provinceMetric === "competition") return metricColor(stats.competitors, 220, "blue");
  if (state.provinceMetric === "coverage") return metricColor(stats.stores, 60, "green");
  return gradeColor(gradeValue(city));
}

function provinceSubLabel(city, cityName) {
  const stats = cityStats(cityName);
  if (state.provinceMetric === "score") return `${scoreValue(city)}分`;
  if (state.provinceMetric === "quality") return `质量${Math.round(stats.quality)}`;
  if (state.provinceMetric === "competition") return `竞品${stats.competitors}`;
  if (state.provinceMetric === "coverage") return `本店${stats.stores}`;
  return `${scoreValue(city)}分`;
}

function districtFill(row) {
  const stats = districtStats(row["区县"]);
  if (state.districtMetric === "opportunity") return metricColor(stats.blank, 14, "green");
  if (state.districtMetric === "competition") return metricColor(stats.competitors, 80, "blue");
  if (state.districtMetric === "coverage") return metricColor(stats.stores, 28, "green");
  if (state.districtMetric === "quality") return scoreColor(stats.quality);
  return scoreColor(scoreValue(row));
}

function districtSubLabel(row) {
  const stats = districtStats(row["区县"]);
  if (state.districtMetric === "opportunity") return `高潜${stats.blank}`;
  if (state.districtMetric === "competition") return `竞品${stats.competitors}`;
  if (state.districtMetric === "coverage") return `本店${stats.stores}`;
  if (state.districtMetric === "quality") return `质量${Math.round(stats.quality)}`;
  return `${scoreValue(row)}分`;
}

function streetPointClass(row) {
  const tag = `${text(row["机会标签"], "")} ${text(row["机会类型"], "")} ${streetDecision(row)}`;
  if (tag.includes("过密") || tag.includes("谨慎")) return "point-risk";
  if (tag.includes("租金")) return "point-rent";
  if (tag.includes("覆盖")) return "point-covered";
  if (tag.includes("竞争")) return "point-competition";
  if (tag.includes("空白")) return "point-blank";
  return "point-normal";
}

function streetRadius(row) {
  return Math.max(6, Math.min(15, 4 + scoreValue(row) / 12 + streetCoreCount(row) / 22));
}

function renderStats() {
  const stores = (state.data.storeMapPoints || decisionMap().ownStorePoints || state.data.storeDistribution || []).filter((row) => text(row["品牌"], "周麻婆") === "周麻婆" && FUJIAN_CITIES.includes(normalizeCity(row["城市"])));
  const competitors = coreCompetitorRows((state.data.competitorMapPoints || decisionMap().coreCompetitorPoints || state.data.competitorStores || []).filter((row) => FUJIAN_CITIES.includes(normalizeCity(row["城市"]))));
  document.querySelector("#statCities").textContent = fujianCities().length;
  document.querySelector("#statAreas").textContent = (state.data.businessAreas || []).filter((row) => FUJIAN_CITIES.includes(normalizeCity(row["城市"]))).length;
  document.querySelector("#statStreets").textContent = ((state.data.townStreetMapPoints || state.data.townStreetFoundation || state.data.streetMapPoints || state.data.streetDecisions || [])).filter((row) => FUJIAN_CITIES.includes(normalizeCity(row["城市"]))).length;
  document.querySelector("#statCompetitors").textContent = competitors.length;
  document.querySelector("#statStores").textContent = stores.length;
}

function renderProvinceMap() {
  const svg = document.querySelector("#provinceMap");
  clearSvg(svg);
  const features = state.provinceGeo.features || [];
  const project = createProjector(pathBounds(features), 760, 560, 22);
  features.forEach((feature) => {
    const cityName = normalizeCity(feature.properties.name || feature.properties.fullname || "");
    const city = cityRecord(cityName);
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", featurePath(feature, project));
    path.setAttribute("class", `map-region ${normalizeCity(state.selectedCity) === cityName ? "active" : ""}`);
    path.setAttribute("fill", provinceFill(city, cityName));
    path.addEventListener("click", () => selectCity(cityName));
    svg.appendChild(path);
  });
  features.forEach((feature) => {
    const cityName = normalizeCity(feature.properties.name || feature.properties.fullname || "");
    const city = cityRecord(cityName);
    const [x, y] = featureCenter(feature, project);
    appendText(svg, x, y - 2, `${cityName} ${gradeValue(city)}`, "map-label");
    appendText(svg, x, y + 17, provinceSubLabel(city, cityName), "map-sub-label");
  });
}

function renderCityRank() {
  const list = document.querySelector("#cityRankList");
  const rows = fujianCities();
  list.innerHTML = rows.map((city, index) => {
    const cityName = normalizeCity(city["城市"]);
    const stats = cityStats(cityName);
    return `
      <button class="rank-item ${cityName === state.selectedCity ? "active" : ""}" type="button" data-city="${escapeHtml(cityName)}">
        <div class="rank-main"><strong>${index + 1}. ${escapeHtml(cityName)}</strong>${gradeBadge(gradeValue(city))}</div>
        <div class="rank-meta">${scoreValue(city)}分 · 质量${Math.round(stats.quality)} · ${stats.streets}镇街 · ${stats.areas}商圈 · ${stats.competitors}竞品 · ${stats.stores}本店</div>
      </button>
    `;
  }).join("");
  list.querySelectorAll("[data-city]").forEach((node) => node.addEventListener("click", () => selectCity(node.dataset.city)));
}

function renderCitySummary() {
  const city = cityRecord();
  const stats = cityStats();
  const conclusion = decisionConclusion("city", city);
  document.querySelector("#cityTitle").textContent = `${state.selectedCity}城市放大`;
  document.querySelector("#citySubtitle").textContent = `${state.selectedCity}当前结论：${conclusion.label}。${conclusion.action}。`;
  const cards = [
    ["城市等级", gradeValue(city)],
    ["综合评分", scoreValue(city)],
    ["商圈样本", stats.areas],
    ["镇街骨架", stats.streets],
    ["周麻婆门店", stats.stores],
    ["五大竞品", stats.competitors],
  ];
  document.querySelector("#citySummary").innerHTML = conclusionHtml(conclusion, "summary-conclusion") + cards.map(([label, value]) => `
    <div class="summary-card"><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span></div>
  `).join("");
}

function featureDistrictName(feature) {
  return text(feature.properties.name || feature.properties.fullname, "");
}

function cityDistrictFeature(district = state.selectedDistrict) {
  const name = normalizeDistrict(district);
  return (state.cityGeo && state.cityGeo.features || []).find((feature) => normalizeDistrict(featureDistrictName(feature)) === name);
}

function leafletAvailable() {
  return typeof window !== "undefined" && typeof window.L !== "undefined";
}

function setMapSurface(leafletId, svgId, useLeaflet) {
  const leafletNode = document.querySelector(`#${leafletId}`);
  const svgNode = document.querySelector(`#${svgId}`);
  if (leafletNode) leafletNode.style.display = useLeaflet ? "block" : "none";
  if (svgNode) svgNode.style.display = useLeaflet ? "none" : "block";
}

function leafletConfig() {
  return state.data.leafletMapConfig || {};
}

function ensureLeafletMap(key, elementId, center = [26.0745, 119.2965], zoom = 11) {
  if (!leafletAvailable()) return null;
  const L = window.L;
  const node = document.querySelector(`#${elementId}`);
  if (!node) return null;
  if (state.leaflet.maps[key]) {
    setTimeout(() => state.leaflet.maps[key].invalidateSize(), 0);
    return state.leaflet.maps[key];
  }
  const map = L.map(node, {
    zoomControl: true,
    attributionControl: true,
  }).setView(center, zoom);
  const cfg = leafletConfig();
  const tile = L.tileLayer(cfg.tileUrl || "https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: cfg.attribution || "© OpenStreetMap contributors",
  });
  tile.on("tileerror", () => {
    node.classList.add("tile-error");
    addLeafletNotice(map, "真实底图暂未加载；仍可查看本地点位与边界。");
  });
  tile.addTo(map);
  map._zmpLayers = [];
  state.leaflet.maps[key] = map;
  setTimeout(() => map.invalidateSize(), 0);
  return map;
}

function clearLeafletMap(map) {
  if (!map) return;
  (map._zmpLayers || []).forEach((layer) => map.removeLayer(layer));
  map._zmpLayers = [];
  if (map._zmpNotice) {
    map.removeControl(map._zmpNotice);
    map._zmpNotice = null;
  }
}

function addLeafletLayer(map, layer) {
  if (!map || !layer) return layer;
  layer.addTo(map);
  map._zmpLayers = map._zmpLayers || [];
  map._zmpLayers.push(layer);
  return layer;
}

function addLeafletNotice(map, message) {
  if (!map || map._zmpNotice) return;
  const L = window.L;
  const Notice = L.Control.extend({
    options: { position: "bottomleft" },
    onAdd() {
      const div = L.DomUtil.create("div", "leaflet-map-notice");
      div.textContent = message;
      return div;
    },
  });
  map._zmpNotice = new Notice();
  map.addControl(map._zmpNotice);
}

function leafletLatLng(row) {
  const coords = pointCoordinates(row);
  return coords ? [coords[1], coords[0]] : null;
}

function leafletBoundsFromRows(rows) {
  const points = (rows || []).map(leafletLatLng).filter(Boolean);
  return points.length ? window.L.latLngBounds(points) : null;
}

function leafletMarkerColor(kind, row = {}) {
  if (kind === "own") return "#102119";
  if (kind === "competitor") return "#b34c44";
  if (kind === "evidence") return "#c58a28";
  if (kind === "area") return "#6c7b73";
  const action = text(row["推荐动作"], "");
  if (action.includes("看铺")) return "#0f7a50";
  if (action.includes("租金")) return "#c58a28";
  if (action.includes("平台")) return "#286f9f";
  if (action.includes("实地")) return "#7a5aa6";
  if (action.includes("暂缓")) return "#8f4b43";
  const cls = streetPointClass(row);
  if (cls.includes("risk")) return "#b34c44";
  if (cls.includes("rent")) return "#c58a28";
  if (cls.includes("covered")) return "#273b31";
  if (cls.includes("competition")) return "#286f9f";
  if (cls.includes("blank")) return "#15764f";
  return "#7a5aa6";
}

function leafletPopupHtml(row, kind) {
  const title = text(row["Leaflet弹窗标题"] || row["门店名称"] || row["名称"] || rowTitle(row), kind);
  const summary = text(row["Leaflet弹窗摘要"] || row["地址"] || row["公开证据摘要"] || row["街道判断理由"] || row["关联商圈"], "");
  const score = scoreValue(row);
  const precision = displayText(row["坐标精度"] || row["定位状态"] || "坐标待复核");
  const conclusion = kind === "镇街" ? displayText(row["推荐动作"] || decisionConclusion("street", row).label) : displayText(row["验证状态"] || row["营业状态"] || row["来源等级"]);
  const evidence = numberValue(row["证据强度"] || row["1.5证据强度"], 0);
  return `
    <strong>${escapeHtml(title)}</strong>
    <p>${escapeHtml(summary || `${displayText(row["城市"])} · ${displayText(row["区县"])} · ${displayText(row["街道/片区"] || row["镇街"])}`)}</p>
    <div class="popup-meta">
      <span>${escapeHtml(conclusion)}</span>
      <span>${escapeHtml(evidence ? `证据${evidence}` : (score ? `${score}分` : precision))}</span>
      <span>本店${streetOwnCount(row)}</span>
      <span>竞品${streetCoreCount(row)}</span>
    </div>
  `;
}

function addLeafletPoint(map, row, kind, options = {}) {
  const latLng = leafletLatLng(row);
  if (!latLng) return null;
  const color = leafletMarkerColor(kind, row);
  const radius = options.radius || (kind === "镇街" ? Math.max(6, Math.min(12, 5 + scoreValue(row) / 16)) : 5);
  const evidence = numberValue(row["证据强度"] || row["1.5证据强度"], 0);
  const marker = window.L.circleMarker(latLng, {
    radius,
    color: "#ffffff",
    weight: kind === "selected" ? 4 : (kind === "镇街" && evidence >= 70 ? 3 : 2),
    fillColor: color,
    fillOpacity: options.opacity || (kind === "镇街" ? Math.max(0.55, Math.min(0.96, 0.5 + evidence / 180)) : 0.9),
  });
  marker.bindPopup(leafletPopupHtml(row, kind === "selected" ? "镇街" : kind));
  if (options.tooltip) {
    marker.bindTooltip(options.tooltip, {
      permanent: Boolean(options.permanent),
      direction: "top",
      className: kind === "镇街" || kind === "selected" ? "leaflet-town-label" : "",
      offset: [0, -6],
    });
  }
  if (kind === "镇街" || kind === "selected") {
    marker.on("click", () => selectStreet(row));
  } else {
    marker.on("click", () => {
      state.selectedMapObject = { row, type: kind };
      renderStreetDetail();
    });
  }
  return addLeafletLayer(map, marker);
}

function addLeafletDistrictLayer(map, features, selectedDistrict = "", interactive = false, styleOptions = {}) {
  if (!features || !features.length) return null;
  const layer = window.L.geoJSON({ type: "FeatureCollection", features }, {
    style: (feature) => {
      const name = featureDistrictName(feature);
      const metric = districtMetric(name) || { 综合评分: 58, 推荐等级: "C" };
      const active = normalizeDistrict(name) === normalizeDistrict(selectedDistrict);
      return {
        color: styleOptions.color || (active ? "#0c4f36" : "#ffffff"),
        weight: styleOptions.weight || (active ? 3 : 1.5),
        fillColor: styleOptions.fillColor || districtFill(metric),
        fillOpacity: styleOptions.fillOpacity ?? (active ? 0.18 : 0.28),
        opacity: styleOptions.opacity ?? 0.92,
      };
    },
    onEachFeature: (feature, layerItem) => {
      const name = featureDistrictName(feature);
      const metric = districtMetric(name) || {};
      layerItem.bindTooltip(`${name}${metric ? ` ${districtSubLabel(metric)}` : ""}`, {
        permanent: false,
        direction: "center",
        className: "leaflet-district-label",
      });
      if (interactive) {
        layerItem.on("click", () => selectDistrict(name));
      }
    },
  });
  return addLeafletLayer(map, layer);
}

function fitLeafletMap(map, preferredBounds, fallbackRows = [], fallbackZoom = 12) {
  if (!map) return;
  if (preferredBounds && preferredBounds.isValid && preferredBounds.isValid()) {
    map.fitBounds(preferredBounds, { padding: [28, 28], maxZoom: 15 });
    return;
  }
  const rowBounds = leafletBoundsFromRows(fallbackRows);
  if (rowBounds && rowBounds.isValid()) {
    map.fitBounds(rowBounds, { padding: [36, 36], maxZoom: fallbackZoom });
    return;
  }
  const cfg = leafletConfig();
  map.setView(cfg.defaultCenter || [26.0745, 119.2965], cfg.defaultZoom || 11);
}

function renderLeafletCityMap() {
  if (!leafletAvailable()) {
    setMapSurface("cityLeafletMap", "cityMap", false);
    return false;
  }
  setMapSurface("cityLeafletMap", "cityMap", true);
  const map = ensureLeafletMap("city", "cityLeafletMap", leafletConfig().defaultCenter || [26.0745, 119.2965], 10);
  if (!map || !state.cityGeo || !state.cityGeo.features) return false;
  clearLeafletMap(map);
  const layer = addLeafletDistrictLayer(map, state.cityGeo.features, state.selectedDistrict, true);
  const cityRows = [
    ...streetRows("", state.selectedCity).slice(0, 80),
    ...ownStorePoints(state.selectedCity),
    ...coreCompetitorPoints(state.selectedCity),
  ];
  if (layer) fitLeafletMap(map, layer.getBounds(), cityRows, 11);
  return true;
}

function renderLeafletDistrictStreetMap() {
  if (!leafletAvailable()) {
    setMapSurface("districtLeafletMap", "districtStreetMap", false);
    return false;
  }
  setMapSurface("districtLeafletMap", "districtStreetMap", true);
  const map = ensureLeafletMap("district", "districtLeafletMap", leafletConfig().defaultCenter || [26.0745, 119.2965], 12);
  if (!map || !state.selectedDistrict) return false;
  clearLeafletMap(map);
  const feature = cityDistrictFeature();
  const boundary = feature ? addLeafletDistrictLayer(map, [feature], state.selectedDistrict, false, {
    color: "#0c4f36",
    weight: 2,
    fillColor: "#dfeee6",
    fillOpacity: 0.08,
  }) : null;
  const rows = locatedStreetRows();
  const mode = state.mapViewMode;
  const decisionRows = mapModeRows(rows, mode);
  const showOwn = state.layers.ownStores && mode !== "evidence";
  const showCompetitors = state.layers.coreCompetitors && mode !== "coverage" && mode !== "evidence";
  const showEvidence = state.layers.evidence && ["evidence", "all", "blank", "smalltown", "auto", "core"].includes(mode);
  const showAreas = state.layers.areas && ["evidence", "all", "blank", "smalltown", "auto", "core"].includes(mode);
  if (state.layers.streets) {
    decisionRows.forEach((row, index) => {
      addLeafletPoint(map, row, "镇街", {
        tooltip: compactMapName(rowTitle(row), 8),
        permanent: state.labelDensity !== "low" || index < 10,
      });
    });
  }
  if (showAreas) areaPoints(state.selectedCity, state.selectedDistrict).slice(0, 30).forEach((row) => addLeafletPoint(map, row, "area", { radius: 4 }));
  if (showEvidence) decisionRows.flatMap((row) => publicEvidencePoints(row)).slice(0, mode === "evidence" ? 160 : 50).forEach((row) => addLeafletPoint(map, row, "evidence", { radius: 4, opacity: 0.75 }));
  if (showOwn) ownStorePoints(state.selectedCity, state.selectedDistrict).slice(0, 160).forEach((row) => addLeafletPoint(map, row, "own", { radius: 5.5 }));
  if (showCompetitors) coreCompetitorPoints(state.selectedCity, state.selectedDistrict).slice(0, mode === "competition" ? 220 : 90).forEach((row) => addLeafletPoint(map, row, "competitor", { radius: 4.8 }));
  const fitRows = decisionRows.length ? decisionRows : rows;
  fitLeafletMap(map, boundary && mode === "county" ? boundary.getBounds() : leafletBoundsFromRows(fitRows) || (boundary && boundary.getBounds()), fitRows, 13);
  if (!fitRows.length) addLeafletNotice(map, "当前区县镇街坐标正在整理，先使用右侧镇街榜安排初筛。");
  return true;
}

function renderLeafletDetailMap() {
  if (!leafletAvailable()) {
    setMapSurface("detailLeafletMap", "detailMap", false);
    return false;
  }
  setMapSurface("detailLeafletMap", "detailMap", true);
  const map = ensureLeafletMap("detail", "detailLeafletMap", leafletConfig().defaultCenter || [26.0745, 119.2965], 14);
  const selected = selectedStreet();
  if (!map || !selected) return false;
  clearLeafletMap(map);
  const selectedLatLng = leafletLatLng(selected);
  const feature = cityDistrictFeature();
  if (feature) addLeafletDistrictLayer(map, [feature], state.selectedDistrict, false, {
    color: "#0c4f36",
    weight: 1.6,
    fillColor: "#dfeee6",
    fillOpacity: 0.035,
  });
  const rows = locatedStreetRows();
  const stores = ownStorePoints(state.selectedCity, state.selectedDistrict);
  const competitors = coreCompetitorPoints(state.selectedCity, state.selectedDistrict);
  const evidence = publicEvidencePoints(selected);
  const nearRows = selectedLatLng ? rows.filter((row) => streetId(row) === streetId(selected) || distanceKm(pointCoordinates(selected), pointCoordinates(row)) <= 2.5) : rows;
  const nearStores = selectedLatLng ? stores.filter((row) => distanceKm(pointCoordinates(selected), pointCoordinates(row)) <= 1.8) : stores;
  const nearCompetitors = selectedLatLng ? competitors.filter((row) => distanceKm(pointCoordinates(selected), pointCoordinates(row)) <= 3) : competitors;
  nearRows.filter((row) => streetId(row) !== streetId(selected)).forEach((row) => addLeafletPoint(map, row, "镇街", { tooltip: compactMapName(rowTitle(row), 8), permanent: state.labelDensity === "high" }));
  evidence.slice(0, state.mapViewMode === "evidence" ? 80 : 24).forEach((row) => addLeafletPoint(map, row, "evidence", { radius: 4.2, opacity: 0.78, tooltip: state.labelDensity === "high" ? compactMapName(row["名称"], 8) : "" }));
  nearStores.slice(0, state.mapViewMode === "coverage" ? 80 : 24).forEach((row) => addLeafletPoint(map, row, "own", { radius: 5.6, tooltip: state.labelDensity === "high" ? compactMapName(row["门店名称"], 8) : "" }));
  nearCompetitors.slice(0, state.mapViewMode === "competition" ? 120 : 36).forEach((row) => addLeafletPoint(map, row, "competitor", { radius: 4.8, tooltip: state.labelDensity === "high" ? compactMapName(row["竞品品牌"] || row["门店名称"], 8) : "" }));
  if (selectedLatLng) {
    addLeafletLayer(map, window.L.circle(selectedLatLng, { radius: 1500, color: "#15764f", weight: 1.3, fillColor: "#15764f", fillOpacity: 0.04 }));
    addLeafletLayer(map, window.L.circle(selectedLatLng, { radius: 3000, color: "#286f9f", weight: 1.2, fillColor: "#286f9f", fillOpacity: 0.025, dashArray: "6 6" }));
    addLeafletPoint(map, selected, "selected", { radius: 10, tooltip: rowTitle(selected), permanent: true });
    map.setView(selectedLatLng, 14);
  } else {
    fitLeafletMap(map, leafletBoundsFromRows(nearRows), nearRows, 13);
    addLeafletNotice(map, "当前镇街需要定位补充，先使用右侧评分和行动建议。");
  }
  return true;
}

function renderCityMap() {
  if (renderLeafletCityMap()) return;
  const svg = document.querySelector("#cityMap");
  clearSvg(svg);
  if (!state.cityGeo || !state.cityGeo.features) return;
  const features = state.cityGeo.features || [];
  const project = createProjector(pathBounds(features), 760, 560, 24);
  features.forEach((feature) => {
    const name = featureDistrictName(feature);
    const metric = districtMetric(name) || { 城市: state.selectedCity, 区县: name, 综合评分: 58, 推荐等级: "C" };
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", featurePath(feature, project));
    path.setAttribute("class", `district-region ${normalizeDistrict(name) === normalizeDistrict(state.selectedDistrict) ? "active" : ""}`);
    path.setAttribute("fill", districtFill(metric));
    path.addEventListener("click", () => selectDistrict(name));
    svg.appendChild(path);
  });
  features.forEach((feature) => {
    const name = featureDistrictName(feature);
    const metric = districtMetric(name);
    const [x, y] = featureCenter(feature, project);
    appendText(svg, x, y, name, "district-label");
    if (metric) appendText(svg, x, y + 16, districtSubLabel(metric), "map-sub-label");
  });
}

function renderDistrictRank() {
  const list = document.querySelector("#districtRankList");
  const rows = districtMetricRows();
  if (!rows.length) {
    list.innerHTML = `<div class="empty-state">当前城市已有区县边界，但区县评分样本还需要继续补充。可以先从城市总分和商圈样本判断。</div>`;
    return;
  }
  list.innerHTML = rows.map((row, index) => {
    const stats = districtStats(row["区县"]);
    return `
      <button class="rank-item ${normalizeDistrict(row["区县"]) === normalizeDistrict(state.selectedDistrict) ? "active" : ""}" type="button" data-district="${escapeHtml(row["区县"])}">
        <div class="rank-main"><strong>${index + 1}. ${escapeHtml(row["区县"])}</strong>${gradeBadge(gradeValue(row))}</div>
        <div class="rank-meta">${scoreValue(row)}分 · ${stats.streets}镇街 · ${stats.areas}商圈 · ${stats.blank}高潜 · ${stats.competitors}竞品 · ${stats.stores}本店</div>
      </button>
    `;
  }).join("");
  list.querySelectorAll("[data-district]").forEach((node) => node.addEventListener("click", () => selectDistrict(node.dataset.district)));
}

function renderDistrictHeader() {
  const stats = districtStats();
  const conclusion = decisionConclusion("district", stats.row || {});
  document.querySelector("#districtTitle").textContent = `${state.selectedCity} · ${state.selectedDistrict || "区县"}镇街机会`;
  document.querySelector("#districtSubtitle").textContent = state.selectedDistrict
    ? `${state.selectedDistrict}当前结论：${conclusion.label}。${conclusion.action}。`
    : "先点击一个区县，查看区县内镇街机会。";
  const pills = [
    ["镇街", stats.streets],
    ["商圈", stats.areas],
    ["高潜", stats.blank],
    ["竞品", stats.competitors],
    ["本店", stats.stores],
    ["质量", Math.round(stats.quality)],
  ];
  document.querySelector("#districtPills").innerHTML = `<span class="pill conclusion-pill ${conclusionTone(conclusion.label)}">${escapeHtml(conclusion.label)}</span>` +
    pills.map(([label, value]) => `<span class="pill">${escapeHtml(label)} ${escapeHtml(value)}</span>`).join("");
}

function renderDistrictStreetMap() {
  if (renderLeafletDistrictStreetMap()) return;
  const svg = document.querySelector("#districtStreetMap");
  clearSvg(svg);
  if (!state.cityGeo || !state.cityGeo.features || !state.selectedDistrict) return;
  const canvas = svgCanvas(svg, 980, 720);
  const feature = cityDistrictFeature();
  const features = feature ? [feature] : state.cityGeo.features;
  const rows = locatedStreetRows();
  const stores = ownStorePoints(state.selectedCity, state.selectedDistrict);
  const competitors = coreCompetitorPoints(state.selectedCity, state.selectedDistrict);
  const areas = areaPoints(state.selectedCity, state.selectedDistrict);
  const baseBounds = pathBounds(features);
  const evidence = rows.flatMap((row) => publicEvidencePoints(row));
  const mode = state.mapViewMode;
  const decisionRows = mapModeRows(rows, mode);
  const camera = districtCamera();
  const showOwn = state.layers.ownStores && mode !== "evidence";
  const showCompetitors = state.layers.coreCompetitors && mode !== "coverage" && mode !== "evidence";
  const showEvidence = state.layers.evidence && ["evidence", "opportunity", "food", "all", "blank", "smalltown", "auto", "core"].includes(mode);
  const showAreas = state.layers.areas && ["evidence", "opportunity", "food", "all", "blank", "smalltown", "auto", "core"].includes(mode);
  const projectRows = decisionRows.length ? decisionRows : rows;
  const rawBounds = districtMapBounds(camera, mode, projectRows, baseBounds);
  const cameraBounds = normalizeBoundsForCanvas(rawBounds, canvas.width, canvas.height, {
    fill: mode === "county" ? 0.92 : 0.82,
    minSpan: mode === "county" ? 0.020 : 0.004,
    padding: 44,
  });
  const project = createProjector(cameraBounds, canvas.width, canvas.height, 44);
  const useDecisionLayout = mode !== "county" && shouldUseDecisionLayout(projectRows, project, canvas);
  const decisionPositions = new Map();
  if (useDecisionLayout) {
    projectRows.forEach((row, index) => {
      decisionPositions.set(streetId(row), decisionGridPosition(index, projectRows.length, canvas));
    });
  }
  const labelSlots = [];
  if (feature && !useDecisionLayout) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", featurePath(feature, project));
    path.setAttribute("class", "district-focus");
    path.setAttribute("fill", "#e5f0ea");
    svg.appendChild(path);
    const [x, y] = featureCenter(feature, project);
    appendText(svg, x, y, state.selectedDistrict, "district-label");
  } else if (useDecisionLayout) {
    appendDecisionLayoutBadge(svg, canvas, `${state.selectedDistrict}街道机会展开图`, "用于比较进入顺序；位置为决策展开，不代表真实街道边界");
  }
  if (state.layers.zones && state.layers.streets) {
    decisionRows.forEach((row) => {
      const pos = decisionPositions.get(streetId(row));
      if (useDecisionLayout && pos) appendOpportunityZoneAt(svg, row, pos[0], pos[1]);
      else appendOpportunityZone(svg, row, project);
    });
  }
  if (showAreas && !useDecisionLayout) {
    areas.slice(0, mode === "evidence" ? 36 : 18).forEach((row, index) => {
      appendPoint(svg, row, project, "point-area", text(row["名称"]), {
        radius: 3.4,
        text: index < layerLabelLimit("area") ? compactMapName(row["名称"], 7) : "",
        type: "商圈",
      });
    });
  }
  if (state.layers.streets) decisionRows.forEach((row, index) => {
    const coords = pointCoordinates(row);
    if (!coords) return;
    const pos = decisionPositions.get(streetId(row));
    const [rawX, rawY] = pos || project(coords);
    const [x, y] = pos ? [rawX, rawY] : spreadPoint(rawX, rawY, index, 16);
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    group.setAttribute("class", `street-point ${streetPointClass(row)} ${streetId(row) === state.selectedStreetId ? "active" : ""}`);
    group.setAttribute("transform", `translate(${x.toFixed(2)},${y.toFixed(2)})`);
    const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
    title.textContent = `${rowTitle(row)} · ${scoreValue(row)}分 · ${streetDecision(row)} · 本店${streetOwnCount(row)} · 竞品${streetCoreCount(row)}`;
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("r", streetRadius(row));
    group.appendChild(title);
    group.appendChild(circle);
    group.addEventListener("click", () => selectStreet(row));
    svg.appendChild(group);
    const labelY = y - streetRadius(row) - 7;
    if (index < layerLabelLimit("street") && canPlaceLabel(labelSlots, x, labelY)) {
      appendText(svg, x, labelY, streetMapLabel(row), "street-label");
    }
    if (useDecisionLayout) {
      appendAggregateBadge(svg, x, y, streetOwnCount(row), "own", "本", -38);
      appendAggregateBadge(svg, x, y, streetCoreCount(row), "competitor", "竞", 38);
    }
  });
  if (showEvidence && !useDecisionLayout) {
    evidence.slice(0, mode === "evidence" ? 80 : 24).forEach((row, index) => {
      appendPoint(svg, row, project, "point-public-evidence", `${text(row["类型"])} · ${text(row["名称"])}`, {
        radius: mode === "evidence" ? 4.4 : 3.2,
        text: mode === "evidence" && index < layerLabelLimit("evidence") ? compactMapName(row["名称"], 7) : "",
        type: "公开证据点",
      });
    });
  }
  if (showOwn && !useDecisionLayout) {
    stores.slice(0, mode === "coverage" ? 120 : 50).forEach((row, index) => {
      appendPoint(svg, row, project, "point-own-store", text(row["门店名称"]), {
        radius: mode === "coverage" ? 5 : 3.7,
        text: index < layerLabelLimit("own") ? compactMapName(text(row["门店名称"]).replace("周麻婆·", "").replace("周麻婆", ""), 7) : "",
        type: "周麻婆门店",
      });
    });
  }
  if (showCompetitors && !useDecisionLayout) {
    competitors.slice(0, mode === "competition" ? 140 : 60).forEach((row, index) => {
      const brand = text(row["核心竞品品牌"] || row["竞品品牌"]);
      appendPoint(svg, row, project, "point-core-competitor", `${brand} · ${text(row["门店名称"])}`, {
        radius: mode === "competition" ? 4.2 : 3.4,
        text: index < layerLabelLimit("core") ? brand : "",
        type: "五大竞品",
      });
    });
  }
  if ((useDecisionLayout || (camera && camera.mode === "coreLens")) && mode !== "county") {
    appendOverviewInset(svg, feature, rows, canvas, baseBounds);
  }
  if (!rows.length) appendMapNotice(svg, "当前区县镇街骨架正在补充，先使用区县排序安排初筛。", canvas);
  else if (!decisionRows.length) appendMapNotice(svg, "当前视野模式下没有匹配镇街，切换到“全量县镇街”可查看全部骨架。", canvas);
  else if (useDecisionLayout) appendMapNotice(svg, "镇街坐标过密，已展开为街道决策图谱；点击街道查看本店、竞品和证据详情。", canvas);
}

function renderDetailMap() {
  if (renderLeafletDetailMap()) return;
  const svg = document.querySelector("#detailMap");
  clearSvg(svg);
  if (!state.cityGeo || !state.selectedDistrict) return;
  const canvas = svgCanvas(svg, 980, 740);
  const feature = cityDistrictFeature();
  const features = feature ? [feature] : (state.cityGeo.features || []);
  const selected = selectedStreet();
  const rows = locatedStreetRows();
  const stores = ownStorePoints(state.selectedCity, state.selectedDistrict);
  const competitors = coreCompetitorPoints(state.selectedCity, state.selectedDistrict);
  const selectedCoords = pointCoordinates(selected);
  const evidence = publicEvidencePoints(selected);
  const nearRows = selectedCoords ? rows.filter((row) => streetId(row) === streetId(selected) || distanceKm(selectedCoords, pointCoordinates(row)) <= 2.5) : rows;
  const nearStores = selectedCoords ? stores.filter((row) => distanceKm(selectedCoords, pointCoordinates(row)) <= 1.8) : stores;
  const nearCompetitors = selectedCoords ? competitors.filter((row) => distanceKm(selectedCoords, pointCoordinates(row)) <= 3) : competitors;
  const mode = state.mapViewMode;
  const visibleEvidence = state.layers.evidence && mode !== "coverage" && mode !== "competition" ? evidence.slice(0, mode === "evidence" ? 28 : 14) : [];
  const visibleStores = state.layers.ownStores && mode !== "evidence" && mode !== "competition" ? nearStores.slice(0, mode === "coverage" ? 36 : 16) : [];
  const visibleCompetitors = state.layers.coreCompetitors && mode !== "evidence" && mode !== "coverage" ? nearCompetitors.slice(0, mode === "competition" ? 48 : 24) : [];
  const focusRows = [selected, ...nearRows, ...visibleEvidence, ...visibleStores, ...visibleCompetitors].filter(Boolean);
  const baseBounds = pathBounds(features);
  const camera = streetCamera(selected);
  const rawBounds = detailMapBounds(camera, selectedCoords, focusRows, baseBounds, mode);
  const bounds = normalizeBoundsForCanvas(rawBounds, canvas.width, canvas.height, {
    fill: mode === "county" ? 0.90 : 0.78,
    minSpan: mode === "county" ? 0.020 : 0.004,
    padding: 46,
  });
  const project = createProjector(bounds, canvas.width, canvas.height, 46);
  const useDecisionLayout = mode !== "county" && shouldUseDecisionLayout(focusRows, project, canvas, 0.30, 0.24);
  const layoutCenter = [canvas.width * 0.46, canvas.height * 0.56];
  const peerRows = nearRows.filter((row) => streetId(row) !== streetId(selected));
  const peerPositions = new Map();
  if (useDecisionLayout) {
    peerRows.forEach((row, index) => {
      peerPositions.set(streetId(row), clampPoint(orbitPosition(layoutCenter, index, peerRows.length, 148, -Math.PI * 0.95, Math.PI * 1.75), canvas));
    });
  }
  const labelSlots = [];
  if (feature && !useDecisionLayout) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", featurePath(feature, project));
    path.setAttribute("class", "district-focus");
    path.setAttribute("fill", "#e7f1eb");
    svg.appendChild(path);
  } else if (useDecisionLayout) {
    appendDecisionLayoutBadge(svg, canvas, `${rowTitle(selected)}街道详情展开图`, "中心为当前街道；周边环绕本店、竞品和公开证据，非真实比例");
  }
  nearRows.forEach((row) => {
    if (streetId(row) === streetId(selected)) return;
    const pos = peerPositions.get(streetId(row));
    if (useDecisionLayout && pos) appendOpportunityZoneAt(svg, row, pos[0], pos[1]);
    else appendOpportunityZone(svg, row, project);
  });
  if (selected && pointCoordinates(selected)) {
    if (useDecisionLayout) appendOpportunityZoneAt(svg, selected, layoutCenter[0], layoutCenter[1]);
    else appendOpportunityZone(svg, selected, project);
  }
  nearRows.forEach((row) => {
    if (streetId(row) === streetId(selected)) return;
    const pos = peerPositions.get(streetId(row));
    if (useDecisionLayout && pos) {
      appendPointAt(svg, row, pos[0], pos[1], `street-point-mini ${streetPointClass(row)}`, `${rowTitle(row)} · ${scoreValue(row)}分 · ${streetDecision(row)}`, { radius: 5.2, type: "街道", text: compactMapName(rowTitle(row), 6) });
    } else {
      appendPoint(svg, row, project, `street-point-mini ${streetPointClass(row)}`, `${rowTitle(row)} · ${scoreValue(row)}分 · ${streetDecision(row)}`, { radius: 4.4, type: "街道" });
    }
  });
  if (state.layers.evidence) {
    visibleEvidence.forEach((row, index) => {
      const pos = useDecisionLayout ? clampPoint(orbitPosition(layoutCenter, index, Math.max(1, visibleEvidence.length), 220, Math.PI * 0.95, Math.PI * 0.95), canvas) : null;
      const options = {
        radius: 4.1,
        text: index < layerLabelLimit("evidence") ? compactMapName(row["名称"], 7) : "",
        type: "公开证据点",
      };
      if (pos) appendPointAt(svg, row, pos[0], pos[1], "point-public-evidence", `${text(row["类型"])} · ${text(row["名称"])}`, options);
      else appendPoint(svg, row, project, "point-public-evidence", `${text(row["类型"])} · ${text(row["名称"])}`, options);
    });
  }
  visibleStores.forEach((row, index) => {
    const pos = useDecisionLayout ? clampPoint(orbitPosition(layoutCenter, index, Math.max(1, visibleStores.length), 164, -Math.PI * 0.15, Math.PI * 0.8), canvas) : null;
    const options = {
      radius: 4.8,
      text: index < layerLabelLimit("own") ? compactMapName(text(row["门店名称"]).replace("周麻婆·", "").replace("周麻婆", ""), 7) : "",
      type: "周麻婆门店",
    };
    if (pos) appendPointAt(svg, row, pos[0], pos[1], "point-own-store", text(row["门店名称"]), options);
    else appendPoint(svg, row, project, "point-own-store", text(row["门店名称"]), options);
  });
  visibleCompetitors.forEach((row, index) => {
    const brand = text(row["核心竞品品牌"] || row["竞品品牌"]);
    const pos = useDecisionLayout ? clampPoint(orbitPosition(layoutCenter, index, Math.max(1, visibleCompetitors.length), 188, Math.PI * 0.22, Math.PI * 1.18), canvas) : null;
    const options = {
      radius: 4,
      text: index < layerLabelLimit("core") ? brand : "",
      type: "五大竞品",
    };
    if (pos) appendPointAt(svg, row, pos[0], pos[1], "point-core-competitor", `${brand} · ${text(row["门店名称"])}`, options);
    else appendPoint(svg, row, project, "point-core-competitor", `${brand} · ${text(row["门店名称"])}`, options);
  });
  if (selected && pointCoordinates(selected)) {
    const coords = pointCoordinates(selected);
    const [sx, sy] = useDecisionLayout ? layoutCenter : project(coords);
    const selectedOptions = {
      radius: 11,
      text: "",
      type: "选中街道",
    };
    if (useDecisionLayout) appendPointAt(svg, selected, sx, sy, `point-selected-street ${streetPointClass(selected)}`, `${rowTitle(selected)} · ${scoreValue(selected)}分 · ${streetDecision(selected)} · 本店${streetOwnCount(selected)} · 竞品${streetCoreCount(selected)}`, selectedOptions);
    else appendPoint(svg, selected, project, `point-selected-street ${streetPointClass(selected)}`, `${rowTitle(selected)} · ${scoreValue(selected)}分 · ${streetDecision(selected)} · 本店${streetOwnCount(selected)} · 竞品${streetCoreCount(selected)}`, selectedOptions);
    if (canPlaceLabel(labelSlots, sx, sy - 22, 84, 26)) appendText(svg, sx, sy - 22, streetMapLabel(selected), "street-label active-label");
    appendAggregateBadge(svg, sx, sy, Math.max(0, evidence.length - visibleEvidence.length), "evidence", "证据+", -42);
    appendAggregateBadge(svg, sx, sy, Math.max(0, nearStores.length - visibleStores.length), "own", "本店+", 42);
    appendAggregateBadge(svg, sx, sy, Math.max(0, nearCompetitors.length - visibleCompetitors.length), "competitor", "竞品+", 70);
  }
  if (mode !== "county") {
    appendOverviewInset(svg, feature, rows, canvas, baseBounds);
  }
  if (selectedCoords && !evidence.length && !nearStores.length && !nearCompetitors.length) {
    appendMapNotice(svg, "本街道已定位；周边公开证据点待补充，先结合右侧评分、本店覆盖和竞品判断。", canvas);
  }
  if (!selectedCoords) {
    appendMapNotice(svg, "当前街道需要定位补充；先使用区县排行、街道评分和商圈样本安排初筛。", canvas);
  } else if (useDecisionLayout) {
    appendMapNotice(svg, "坐标过密，已切换为街道详情展开图；中心为当前街道，周边为本店、竞品和公开证据。", canvas);
  }
}

function renderStreetRank() {
  const rows = streetRows();
  const list = document.querySelector("#streetRankList");
  document.querySelector("#streetRankHint").textContent = `${state.selectedDistrict || state.selectedCity} · ${rows.length} 个镇街`;
  if (!rows.length) {
    list.innerHTML = `<div class="empty-state">当前区县镇街骨架仍在补充。建议先使用区县排序和商圈样本安排初筛。</div>`;
    return;
  }
  const visibleRows = rows.slice(0, 10);
  document.querySelector("#streetRankHint").textContent = `${state.selectedDistrict || state.selectedCity} · 显示前 ${visibleRows.length} / ${rows.length} 个镇街`;
  list.innerHTML = visibleRows.map((raw, index) => {
    const row = mergedStreet(raw);
    const id = streetId(raw);
    const poi = streetPoiCount(row);
    const decision = displayText(row["推荐动作"] || (streetDecision(row) === "优先进入" ? "本周优先看" : streetDecision(row)));
    const evidence = numberValue(row["证据强度"] || row["1.5证据强度"], 0);
    return `
      <button class="street-item ${id === state.selectedStreetId ? "active" : ""}" type="button" data-street="${escapeHtml(id)}">
        <div class="street-main"><strong>${index + 1}. ${escapeHtml(rowTitle(row))}</strong><span class="decision-badge">${escapeHtml(decision)}</span>${gradeBadge(gradeValue(row))}</div>
        <div class="tag-row">${tagPills(row)}</div>
        <div class="street-meta">${scoreValue(row)}分 · 证据${evidence || "待复核"} · ${escapeHtml(text(row["适合店型"]))} · 本店${streetOwnCount(row)} · 竞品${streetCoreCount(row)} · POI${poi} · ${escapeHtml(displayText(row["行动建议"] || row["1.5行动建议"] || row["消费能力"] || row["公开POI线索"] || row["街道判断理由"]))}</div>
      </button>
    `;
  }).join("");
  list.querySelectorAll("[data-street]").forEach((node) => {
    const found = visibleRows.find((row) => streetId(row) === node.dataset.street);
    node.addEventListener("click", () => selectStreet(found));
  });
}

function renderStreetDetail() {
  const raw = selectedStreet();
  const container = document.querySelector("#streetDetail");
  if (!raw) {
    container.innerHTML = `<div class="empty-state">点击一个街道后，这里会显示适合店型、评分、竞品、本店覆盖和下一步看铺动作。</div>`;
    return;
  }
  const row = mergedStreet(raw);
  const competitors = streetCoreCount(row);
  const ownStores = streetOwnCount(row);
  const evidence = publicEvidencePoints(row);
  const bundle = streetEvidenceBundle(row);
  const poiSupport = Math.max(streetPoiCount(row), evidence.length);
  const conclusion = decisionConclusion("street", row);
  const mapObject = state.selectedMapObject;
  const objectHtml = mapObject ? `
    <div class="map-object-note">
      <strong>地图选中：${escapeHtml(mapObject.type)}</strong>
      <p>${escapeHtml(text(mapObject.row["门店名称"] || mapObject.row["名称"] || mapObject.row["街道/片区"]))}</p>
      <span>${escapeHtml(displayText(mapObject.row["地址"] || mapObject.row["关联商圈"] || mapObject.row["街道/片区"]))}</span>
    </div>
  ` : "";
  const metrics = [
    ["街道评分", scoreValue(row)],
    ["推荐动作", displayText(row["推荐动作"] || decisionConclusion("street", row).label)],
    ["适合店型", text(row["适合店型"])],
    ["本店1.5km", ownStores],
    ["五大竞品", competitors],
    ["证据强度", row["证据强度"] || row["1.5证据强度"] || "待复核"],
    ["餐饮机会", row["餐饮机会指数"] || poiSupport],
  ];
  const foundationText = [
    displayText(row["1.4基础底盘"], ""),
    row["县区人口经济摘要"] ? `县区：${row["县区人口经济摘要"]}` : "",
    row["镇街角色标签"] ? `角色：${row["镇街角色标签"]}` : "",
    row["服务人口估算万人"] ? `服务人口约${row["服务人口估算万人"]}万人` : "",
    row["社零贡献估算亿元"] ? `社零贡献约${row["社零贡献估算亿元"]}亿元` : "",
    row["商业更新信号"] ? `商业更新：${row["商业更新信号"]}` : "",
    displayText(row["人口线索"], ""),
    displayText(row["经济线索"], ""),
    displayText(row["商业成熟度"], ""),
    displayText(row["餐饮机会"], ""),
  ].filter(Boolean).join("；");
  const evidenceText = displayText(
    row["1.4证据摘要"] ||
    row["1.2证据摘要"] ||
    row["街道周边证据摘要"] ||
    row["公开证据摘要"] ||
    (bundle && bundle["公开证据摘要"]) ||
    row["公开POI线索"] ||
    "本街道公开证据点仍在补充，先看本店覆盖、五大竞品和商圈样本。"
  );
  container.innerHTML = `
    <div class="detail-top">
      <div>
        <h3>${escapeHtml(rowTitle(row))}</h3>
        <p class="rank-meta">${escapeHtml(state.selectedCity)} · ${escapeHtml(displayText(row["区县"]))} · ${escapeHtml(displayText(row["关联商圈"]))} · ${escapeHtml(displayText(row["适合店型"]))}</p>
      </div>
      ${gradeBadge(gradeValue(row))}
    </div>
    ${conclusionHtml(conclusion, "street-conclusion")}
    <div class="score-grid">
      ${metrics.map(([label, value]) => `<div class="metric"><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span></div>`).join("")}
    </div>
    <div class="tag-row">${tagPills(row)}</div>
    ${objectHtml}
    <div class="detail-blocks">
      <div class="detail-block"><strong>基础底盘</strong><p>${escapeHtml(foundationText || "镇街级人口、经济、商业和餐饮机会已进入初阶估算，后续用平台与实地数据校准。")}</p></div>
      <div class="detail-block source-card"><strong>证据来源</strong><p>${escapeHtml(displayText(row["1.5来源摘要"] || row["来源说明"] || row["来源等级"] || "参考行政区划、统计公报、公开商业资料、OSM/公开POI和模型推断。"))}</p><span>${escapeHtml(displayText(row["来源等级"] || "来源待复核"))} · 证据强度 ${escapeHtml(displayText(row["证据强度"] || row["1.5证据强度"] || "待复核"))}</span></div>
      <div class="detail-block"><strong>为什么值得看</strong><p>${escapeHtml(displayText(row["街道判断理由"] || row["主要依据"] || row["住宅成熟度"] || row["餐饮业态"] || "根据街道评分、商圈关联、竞品验证和本店覆盖综合判断。"))}</p></div>
      <div class="detail-block"><strong>公开证据支撑</strong><p>${escapeHtml(evidenceText)}</p></div>
      <div class="detail-block"><strong>餐饮与商业信号</strong><p>${escapeHtml(displayText(row["1.5证据卡"] || row["餐饮市场线索"] || row["商业报告线索"] || row["商业更新信号"] || "餐饮与商业信号已按公开资料和模型估算进入评分。"))}</p></div>
      <div class="detail-block"><strong>需要警惕什么</strong><p>${escapeHtml(displayText(row["主要风险"] || row["竞品压力"] || row["租金压力"] || "需要进一步看租金、门头、动线和平台表现。"))}</p></div>
      <div class="detail-block action-card"><strong>下一步动作</strong><p>${escapeHtml(displayText(row["1.5行动建议"] || row["行动建议"] || row["1.4最终动作"] || row["1.2最终动作"] || row["本周动作建议"] || row["下一步动作"] || row["下一步核验动作"] || "用平台截图、租金报价和实地照片复核，再判断是否进入看铺清单。"))}</p></div>
    </div>
    <div class="action-row">
      <button type="button" id="addCompare">加入对比</button>
      <button type="button" class="secondary" id="focusStreet">回到街道地图</button>
    </div>
  `;
  document.querySelector("#addCompare").addEventListener("click", () => addCompare(raw));
  document.querySelector("#focusStreet").addEventListener("click", () => document.querySelector("#districtStage").scrollIntoView({ behavior: "smooth", block: "start" }));
}

function renderCompare() {
  const panel = document.querySelector("#comparePanel");
  const rows = state.compareIds.map((id) => cityStreetRows().find((row) => streetId(row) === id)).filter(Boolean).map(mergedStreet);
  document.querySelector("#compareHint").textContent = `${rows.length} / 4 个街道`;
  if (!rows.length) {
    panel.innerHTML = `<div class="empty-state">从街道详情中加入 2-4 个街道，可横向比较评分、店型、竞品、本店覆盖和下一步动作。</div>`;
    return;
  }
  panel.innerHTML = `
    <table class="compare-table">
      <thead><tr><th>街道</th><th>判断/评分</th><th>店型</th><th>本店/竞品/POI</th><th>风险与动作</th><th></th></tr></thead>
      <tbody>
        ${rows.map((row) => {
          const conclusion = decisionConclusion("street", row);
          return `
          <tr>
            <td><strong>${escapeHtml(rowTitle(row))}</strong><br>${gradeBadge(gradeValue(row))}</td>
            <td>${escapeHtml(conclusion.label)}<br><span class="rank-meta">${scoreValue(row)}分 · 质量${qualityValue(row) || "待复核"}</span></td>
            <td>${escapeHtml(text(row["适合店型"]))}</td>
            <td>本店${streetOwnCount(row)}<br>竞品${streetCoreCount(row)}<br>POI${streetPoiCount(row)}</td>
            <td>${escapeHtml(displayText(row["主要风险"] || "待租金复核"))}<br><span class="rank-meta">${escapeHtml(conclusion.action)}</span></td>
            <td><button class="compare-remove" type="button" data-remove="${escapeHtml(streetId(row))}">移除</button></td>
          </tr>
        `; }).join("")}
      </tbody>
    </table>
  `;
  panel.querySelectorAll("[data-remove]").forEach((button) => button.addEventListener("click", () => {
    state.compareIds = state.compareIds.filter((id) => id !== button.dataset.remove);
    renderCompare();
  }));
}

function addCompare(row) {
  const id = streetId(row);
  if (!id) return;
  if (!state.compareIds.includes(id)) state.compareIds = [...state.compareIds, id].slice(-4);
  renderCompare();
}

async function loadCityGeo(city) {
  const code = CITY_CODES[normalizeCity(city)];
  if (!code) {
    state.cityGeo = null;
    return;
  }
  const res = await fetch(`./data/geojson/${code}_full.json`, { cache: "no-store" });
  state.cityGeo = res.ok ? await res.json() : null;
}

function defaultDistrict(city = state.selectedCity) {
  return text(districtMetricRows(city)[0] && districtMetricRows(city)[0]["区县"], "");
}

function defaultStreetId() {
  const row = streetRows()[0];
  return row ? streetId(row) : "";
}

async function selectCity(city) {
  state.selectedCity = normalizeCity(city);
  await loadCityGeo(state.selectedCity);
  state.selectedDistrict = defaultDistrict(state.selectedCity);
  state.selectedStreetId = defaultStreetId();
  state.selectedMapObject = null;
  renderAll();
  document.querySelector("#cityStage").scrollIntoView({ behavior: "smooth", block: "start" });
}

function selectDistrict(district) {
  state.selectedDistrict = text(district, "");
  state.selectedStreetId = defaultStreetId();
  state.selectedMapObject = null;
  renderAll();
  document.querySelector("#districtStage").scrollIntoView({ behavior: "smooth", block: "start" });
}

function selectStreet(row) {
  state.selectedStreetId = streetId(row);
  state.selectedMapObject = null;
  renderAll();
  document.querySelector("#detailStage").scrollIntoView({ behavior: "smooth", block: "start" });
}

function bindControls() {
  enhanceMapModeOptions();
  document.querySelector("#provinceMetric").addEventListener("input", (event) => {
    state.provinceMetric = event.target.value;
    renderProvinceMap();
  });
  document.querySelector("#districtMetric").addEventListener("input", (event) => {
    state.districtMetric = event.target.value;
    renderCityMap();
  });
  document.querySelector("#mapViewMode").addEventListener("input", (event) => {
    state.mapViewMode = event.target.value;
    renderDistrictStreetMap();
    renderDetailMap();
  });
  document.querySelector("#labelDensity").addEventListener("input", (event) => {
    state.labelDensity = event.target.value;
    renderCityMap();
    renderDistrictStreetMap();
    renderDetailMap();
  });
  document.querySelector("#streetOpportunity").addEventListener("input", (event) => {
    state.streetOpportunity = event.target.value;
    state.selectedStreetId = defaultStreetId();
    renderDistrictStreetMap();
    renderStreetRank();
    renderDetailMap();
    renderStreetDetail();
    renderCompare();
  });
  document.querySelector("#streetStoreType").addEventListener("input", (event) => {
    state.streetStoreType = event.target.value;
    state.selectedStreetId = defaultStreetId();
    renderDistrictStreetMap();
    renderStreetRank();
    renderDetailMap();
    renderStreetDetail();
    renderCompare();
  });
  document.querySelectorAll(".layer-toggle").forEach((button) => {
    button.addEventListener("click", () => {
      const layer = button.dataset.layer;
      state.layers[layer] = !state.layers[layer];
      button.classList.toggle("active", state.layers[layer]);
      renderCityMap();
      renderDistrictStreetMap();
      renderDetailMap();
    });
  });
}

function renderAll() {
  renderStats();
  renderProvinceMap();
  renderCityRank();
  renderCitySummary();
  renderCityMap();
  renderDistrictRank();
  renderDistrictHeader();
  renderDistrictStreetMap();
  renderStreetRank();
  renderDetailMap();
  renderStreetDetail();
  renderCompare();
}

async function boot() {
  const [dataRes, provinceRes] = await Promise.all([
    fetch("./data/preview-data.json", { cache: "no-store" }),
    fetch("./data/fujian-350000-full.json", { cache: "no-store" }),
  ]);
  state.data = await dataRes.json();
  state.provinceGeo = await provinceRes.json();
  await loadCityGeo(state.selectedCity);
  state.selectedDistrict = defaultDistrict(state.selectedCity);
  state.selectedStreetId = defaultStreetId();
  bindControls();
  renderAll();
}

boot().catch((error) => {
  console.error(error);
  document.body.innerHTML = `<main class="app-shell"><section class="hero"><h1>页面加载失败</h1><p class="subtitle">${escapeHtml(error.message || error)}</p></section></main>`;
});
