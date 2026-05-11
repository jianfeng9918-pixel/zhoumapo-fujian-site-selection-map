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

const state = {
  data: null,
  provinceGeo: null,
  cityGeo: null,
  selectedCity: "福州",
  selectedDetail: null,
  selectedType: "城市",
  selectedRadius: null,
  activeTab: "candidates",
  reportMode: "standard",
  currentReportMarkdown: "",
  currentReportTitle: "",
  compareIds: [],
  savedIds: JSON.parse(localStorage.getItem("zhoumapo_saved_v05") || localStorage.getItem("zhoumapo_saved_v04") || "[]"),
  savedStatuses: JSON.parse(localStorage.getItem("zhoumapo_saved_status_v05") || "{}"),
  provinceLayer: "priority",
  districtLayer: "priority",
  filters: {
    city: "福州",
    district: "",
    grade: "",
    storeType: "商圈店",
    confidence: "",
    rent: "",
    source: "",
    sourceLevel: "",
    taskPriority: "",
    search: "",
  },
  layers: {
    areas: true,
    streetDecision: true,
    ownStores: true,
    blankOpportunity: true,
    dataQuality: true,
    poi: false,
    rent: false,
    competitors: true,
    radius: false,
  },
};

const gradeRank = { A: 5, B: 4, C: 3, D: 2, 待定: 1, 待补: 0 };

const tableFields = {
  candidates: ["城市", "区县", "名称", "对象类型", "店型模式", "推荐结论", "推荐等级", "综合评分", "数据质量评分", "来源等级", "推荐门槛说明", "主要依据", "主要风险", "下一步动作"],
  streetDecisions: ["城市", "区县", "街道/片区", "关联商圈", "机会标签", "空白机会类型", "推荐等级", "街道评分", "数据质量评分", "严格决策结论", "适合店型", "可开店容量", "周麻婆现有门店数", "五大竞品门店数", "友商/竞品门店数", "租金样本数", "住宅成熟度", "学校/家庭客群", "餐饮业态", "租金压力", "竞品压力", "主要依据", "主要风险", "下一步核验动作"],
  districtMap: ["城市", "区县", "推荐等级", "综合评分", "平均数据质量分", "街道数", "街道有坐标数", "待定位街道数", "周麻婆门店数", "五大竞品门店数", "高潜空白街道数", "P1任务数", "数据缺口数", "主导机会类型", "数据缺口摘要", "下一步动作"],
  streetMap: ["城市", "区县", "街道/片区", "关联商圈", "经度", "纬度", "定位状态", "机会标签", "机会类型", "推荐等级", "街道评分", "数据质量评分", "适合店型", "可开店容量", "周麻婆现有门店数", "五大竞品门店数", "租金样本数", "数据缺口", "下一步核验动作"],
  stores: ["品牌", "门店名称", "城市", "区县", "街道/片区", "地址", "经度", "纬度", "营业状态", "店型", "来源等级", "备注"],
  brands: ["品牌名称", "竞品类型", "餐饮业态", "价格带", "重点说明", "是否核心竞品", "门店数据状态", "核验动作"],
  requirements: ["需求ID", "需求类别", "需求内容", "优先级", "处理状态", "来源", "暂缓原因", "下一步动作"],
  leads: ["线索ID", "城市", "区县", "关联商圈", "铺位线索名称", "线索类型", "店型模式", "推荐结论", "推荐等级", "综合评分", "数据质量评分", "来源等级", "数据缺口", "核验任务", "下一步动作"],
  radius: ["城市", "区县", "名称", "1公里POI数", "1.5公里POI数", "3公里POI数", "3公里竞品数", "3公里租金样本数", "堂食半径判断", "外卖半径判断", "数据质量评分", "数据缺口"],
  tasks: ["城市", "区县", "任务类型", "优先级", "来源等级", "数据质量评分", "核验内容", "缺口字段", "建议负责人", "状态", "截止建议", "关联商圈"],
  quality: ["对象类型", "对象ID", "城市", "区县", "名称", "字段", "当前值", "是否缺失", "来源等级", "字段权重", "核验优先级", "核验动作"],
  profiles: ["城市", "区县", "商圈名称", "商圈类型", "推荐等级", "综合评分", "严格决策结论", "数据质量评分", "来源等级", "1.5公里POI数", "3公里竞品数", "3公里租金样本数", "缺竞品", "缺租金", "缺照片", "缺平台数据", "下一步动作"],
  cityKpi: ["城市", "推荐等级", "综合评分", "严格决策结论", "平均数据质量分", "商圈数", "街道数", "核验任务数", "P1任务数", "推荐对象数", "潜力推荐数", "缺竞品", "缺租金", "缺照片", "缺平台数据", "下一步动作"],
  districtKpi: ["城市", "区县", "推荐等级", "综合评分", "严格决策结论", "平均数据质量分", "商圈数", "街道数", "核验任务数", "P1任务数", "缺竞品", "缺租金", "缺照片", "缺平台数据", "下一步动作"],
  areas: ["城市", "区县", "街道", "名称", "商圈类型", "推荐等级", "综合评分", "数据质量评分", "来源等级", "数据缺口", "严格决策结论", "店型匹配", "租金压力", "主要依据", "主要风险"],
  streets: ["城市", "区县", "街道/片区", "关联商圈", "最高推荐等级", "环境评分", "数据质量评分", "决策结论", "店型匹配", "堂食1-1.5公里判断", "外卖3公里判断"],
  poi: ["城市", "区县", "街道/片区", "名称", "POI类型", "关联商圈", "推荐等级", "综合评分", "数据质量评分", "选址意义", "验证状态"],
  competitors: ["城市", "区县", "街道/片区", "门店名称", "竞品品牌", "关联商圈", "平台", "评分", "月销量/热度", "竞争压力", "数据质量评分", "验证状态"],
  rent: ["城市", "区县", "街道/片区", "关联商圈", "铺位类型", "租金区间", "面积建议", "回本压力", "数据质量评分", "验证状态"],
  reports: ["标题", "结论", "地图摘要", "评分摘要", "证据摘要", "风险摘要", "下一步动作", "生成状态"],
};

function text(value) {
  if (value === undefined || value === null || String(value).trim() === "") return "待补";
  return String(value).trim();
}

function escapeHtml(value) {
  return text(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function numberValue(value, fallback = 0) {
  const parsed = Number(String(value || "").replace(/[^\d.]/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeCityName(name) {
  return text(name).replace(/市$/, "").replace(/地区$/, "").replace(/省$/, "");
}

function normalizeDistrictName(name) {
  return text(name).replace(/\s/g, "");
}

function rowId(row) {
  return text(row["指标ID"] || row["点ID"] || row["记录ID"] || row["决策ID"] || row["门店ID"] || row["候选ID"] || row["任务ID"] || row["报告ID"] || row["线索ID"] || row["对象ID"] || row["名称"]);
}

function rowTitle(row) {
  if (row["指标ID"]) return text(row["区县"] || row["城市"]);
  if (row["点ID"]) return text(row["街道/片区"] || row["关联商圈"] || row["区县"]);
  if (row["决策ID"]) return text(row["街道/片区"] || row["关联商圈"] || row["区县"]);
  return text(row["铺位线索名称"] || row["名称"] || row["区县"] || row["街道/片区"] || row["门店名称"] || row["关联商圈"] || row["标题"] || row["城市"]);
}

function gradeValue(row) {
  return text(row["推荐等级"] || row["最高推荐等级"] || "待定");
}

function scoreValue(row) {
  return numberValue(row["综合评分"] || row["环境评分"] || row["街道评分"], 0);
}

function qualityValue(row) {
  return numberValue(row["数据质量评分"] || row["平均数据质量分"], 0);
}

function sourceLevel(row) {
  return text(row["来源等级"] || "L0");
}

function sourceClass(level) {
  return `source-${text(level).toLowerCase()}`;
}

function sourceBadge(level) {
  return `<span class="source-badge ${sourceClass(level)}">${escapeHtml(level)}</span>`;
}

function gradeClass(grade) {
  const value = text(grade);
  if (value === "A") return "grade-a";
  if (value === "B") return "grade-b";
  if (value === "C") return "grade-c";
  if (value === "D") return "grade-d";
  return "grade-pending";
}

function gradeColor(grade) {
  const css = getComputedStyle(document.documentElement);
  const value = text(grade);
  if (value === "A") return css.getPropertyValue("--green").trim();
  if (value === "B") return css.getPropertyValue("--blue").trim();
  if (value === "C") return css.getPropertyValue("--gold").trim();
  if (value === "D") return css.getPropertyValue("--red").trim();
  return css.getPropertyValue("--pending").trim();
}

function lerpColor(a, b, t) {
  const aa = a.match(/\w\w/g).map((x) => parseInt(x, 16));
  const bb = b.match(/\w\w/g).map((x) => parseInt(x, 16));
  const rr = aa.map((v, i) => Math.round(v + (bb[i] - v) * Math.max(0, Math.min(1, t))));
  return `#${rr.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function metricColor(value, max, mode = "green") {
  const t = max ? Math.max(0, Math.min(1, Number(value) / max)) : 0;
  if (mode === "warn") return lerpColor("f0e5cf", "aa473e", t);
  if (mode === "blue") return lerpColor("dbeaf0", "246f9f", t);
  return lerpColor("dce9df", "14724d", t);
}

function scoreColor(score) {
  if (score >= 84) return gradeColor("A");
  if (score >= 74) return gradeColor("B");
  if (score >= 64) return gradeColor("C");
  return gradeColor("D");
}

function gradeBadge(grade) {
  return `<span class="grade-badge ${gradeClass(grade)}">${escapeHtml(grade)}</span>`;
}

function currentDecision(row) {
  return text(row["严格决策结论"] || row["推荐结论"] || row["决策结论"] || "待核验");
}

function fujianCities() {
  return state.data.cities.filter((row) => row["省份"] === "福建");
}

function isFujianRow(row) {
  return text(row["省份"]) === "福建" || ["福州", "厦门", "泉州", "漳州", "莆田", "三明", "南平", "龙岩", "宁德"].includes(normalizeCityName(row["城市"]));
}

function cityRecord(city = state.selectedCity) {
  return state.data.cities.find((row) => row["省份"] === "福建" && normalizeCityName(row["城市"]) === normalizeCityName(city)) || fujianCities()[0];
}

function byCity(rows, city = state.selectedCity) {
  return rows.filter((row) => normalizeCityName(row["城市"]) === normalizeCityName(city));
}

function sortRows(rows, gradeKey = "推荐等级", scoreKey = "综合评分") {
  return [...rows].sort((a, b) => {
    const gd = (gradeRank[text(b[gradeKey])] || 0) - (gradeRank[text(a[gradeKey])] || 0);
    if (gd) return gd;
    return numberValue(b[scoreKey]) - numberValue(a[scoreKey]);
  });
}

function cityAreas() {
  return sortRows(byCity(state.data.businessAreas), "推荐等级", "综合评分");
}

function cityDistricts() {
  return sortRows(byCity(state.data.districts), "推荐等级", "综合评分");
}

function cityStreets() {
  return sortRows(byCity(state.data.streets), "最高推荐等级", "环境评分");
}

function cityStreetDecisions() {
  return sortRows(byCity((state.data.streetDecisions || []).filter(isFujianRow)), "推荐等级", "街道评分");
}

function filteredStreetDecisions() {
  return cityStreetDecisions().filter((row) => {
    if (state.filters.district && text(row["区县"]) !== state.filters.district) return false;
    if (state.filters.grade && gradeValue(row) !== state.filters.grade) return false;
    if (state.filters.storeType && !text(row["适合店型"]).includes(state.filters.storeType)) return false;
    if (state.filters.sourceLevel && sourceLevel(row) !== state.filters.sourceLevel) return false;
    if (state.filters.search && !JSON.stringify(row).includes(state.filters.search)) return false;
    return true;
  });
}

function cityPoi() {
  return sortRows(byCity(state.data.poi), "推荐等级", "综合评分");
}

function cityCompetitors() {
  return byCity(state.data.competitorStores);
}

function cityOwnStores() {
  return byCity(state.data.storeDistribution || []).filter((row) => text(row["品牌"]) === "周麻婆" && text(row["经度"]) !== "待补");
}

function cityRent() {
  return byCity(state.data.rentSamples);
}

function cityCandidates() {
  return byCity(state.data.candidates).filter((row) => text(row["店型模式"]) === state.filters.storeType);
}

function citySiteLeads() {
  return byCity(state.data.siteLeads || []).filter((row) => text(row["店型模式"]) === state.filters.storeType);
}

function cityTasks() {
  return byCity(state.data.verificationTasks);
}

function cityImages() {
  return byCity(state.data.images);
}

function radiusFor(row) {
  const ids = [row["对象ID"], row["记录ID"], row["来源对象ID"]].map(text).filter((item) => item !== "待补");
  const names = [rowTitle(row), row["关联商圈"], row["名称"], row["商圈名称"]].map(text).filter((item) => item !== "待补");
  return state.data.radiusStats.find((item) => ids.includes(text(item["对象ID"]))) ||
    state.data.radiusStats.find((item) => names.includes(text(item["名称"])));
}

function cityKpi(city = state.selectedCity) {
  return (state.data.cityKpi || []).find((row) => normalizeCityName(row["城市"]) === normalizeCityName(city));
}

function districtKpiRows() {
  return byCity(state.data.districtKpi || []);
}

function cityDistrictMapMetrics() {
  return sortRows(byCity(state.data.districtMapMetrics || []), "推荐等级", "综合评分");
}

function districtMapMetric(name) {
  const normalized = normalizeDistrictName(name);
  return cityDistrictMapMetrics().find((row) => normalizeDistrictName(row["区县"]) === normalized);
}

function cityStreetMapPoints() {
  return sortRows(byCity((state.data.streetMapPoints || []).filter(isFujianRow)), "推荐等级", "街道评分");
}

function filteredStreetMapPoints() {
  return cityStreetMapPoints().filter((row) => {
    if (state.filters.district && text(row["区县"]) !== state.filters.district) return false;
    if (state.filters.grade && gradeValue(row) !== state.filters.grade) return false;
    if (state.filters.storeType && !text(row["适合店型"]).includes(state.filters.storeType)) return false;
    if (state.filters.sourceLevel && sourceLevel(row) !== state.filters.sourceLevel) return false;
    if (state.filters.search && !JSON.stringify(row).includes(state.filters.search)) return false;
    return true;
  });
}

function locatedStreetMapPoints() {
  return filteredStreetMapPoints().filter((row) => text(row["定位状态"]) === "已定位" && pointCoordinates(row));
}

function unlocatedStreetMapPoints() {
  return filteredStreetMapPoints().filter((row) => text(row["定位状态"]) !== "已定位" || !pointCoordinates(row));
}

function businessProfileFor(row) {
  const id = text(row["记录ID"] || row["对象ID"]);
  const name = rowTitle(row);
  const areaName = text(row["关联商圈"] || row["商圈名称"]);
  return (state.data.businessProfiles || []).find((item) => text(item["画像ID"]).includes(id)) ||
    (state.data.businessProfiles || []).find((item) => text(item["商圈名称"]) === name) ||
    (state.data.businessProfiles || []).find((item) => text(item["商圈名称"]) === areaName);
}

function rowMatchesFilters(row) {
  const f = state.filters;
  if (f.city && normalizeCityName(row["城市"]) !== normalizeCityName(f.city)) return false;
  if (f.district && text(row["区县"]) !== f.district) return false;
  if (f.grade && gradeValue(row) !== f.grade) return false;
  if (f.confidence && text(row["数据置信度"]) !== f.confidence) return false;
  if (f.rent && !text(row["租金压力"] || row["回本压力"] || "").includes(f.rent)) return false;
  if (f.source && !text(row["来源类型"] || row["来源"] || "").includes(f.source)) return false;
  if (f.sourceLevel && sourceLevel(row) !== f.sourceLevel) return false;
  if (f.search) {
    const haystack = JSON.stringify(row);
    if (!haystack.includes(f.search)) return false;
  }
  return true;
}

function filteredAreas() {
  return cityAreas().filter(rowMatchesFilters);
}

function filteredCandidates() {
  return cityCandidates().filter(rowMatchesFilters);
}

function filteredTasks() {
  return cityTasks().filter((row) => {
    if (state.filters.district && text(row["区县"]) !== state.filters.district) return false;
    if (state.filters.taskPriority && text(row["优先级"]) !== state.filters.taskPriority) return false;
    if (state.filters.sourceLevel && sourceLevel(row) !== state.filters.sourceLevel) return false;
    if (state.filters.search && !JSON.stringify(row).includes(state.filters.search)) return false;
    return true;
  });
}

function filteredSiteLeads() {
  return citySiteLeads().filter(rowMatchesFilters);
}

function pathBounds(features) {
  const points = [];
  const collect = (coords) => {
    if (typeof coords[0] === "number") points.push(coords);
    else coords.forEach(collect);
  };
  features.forEach((feature) => collect(feature.geometry.coordinates));
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

function createProjector(bounds, width, height, padding) {
  const scale = Math.min((width - padding * 2) / (bounds.maxX - bounds.minX), (height - padding * 2) / (bounds.maxY - bounds.minY));
  const offsetX = (width - (bounds.maxX - bounds.minX) * scale) / 2;
  const offsetY = (height - (bounds.maxY - bounds.minY) * scale) / 2;
  return ([lon, lat]) => [offsetX + (lon - bounds.minX) * scale, height - (offsetY + (lat - bounds.minY) * scale)];
}

function polygonPath(coords, project) {
  return coords.map((ring) => ring.map((point, index) => {
    const [x, y] = project(point);
    return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ") + " Z").join(" ");
}

function featurePath(feature, project) {
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
  const avg = points.reduce((acc, point) => [acc[0] + point[0], acc[1] + point[1]], [0, 0]).map((value) => value / points.length);
  return project(avg);
}

function clearSvg(svg) {
  while (svg.firstChild) svg.removeChild(svg.firstChild);
}

function appendSvgText(svg, x, y, content, className) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", "text");
  node.setAttribute("x", x);
  node.setAttribute("y", y);
  node.setAttribute("text-anchor", "middle");
  node.setAttribute("class", className);
  node.textContent = content;
  svg.appendChild(node);
}

function pointCoordinates(row) {
  const lon = Number(row["经度"]);
  const lat = Number(row["纬度"]);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  return [lon, lat];
}

function cityMetric(cityName) {
  return (state.data.mapLayerMetrics || {})[normalizeCityName(cityName)] || {};
}

function provinceFill(city, cityName) {
  const metric = cityMetric(cityName);
  if (state.provinceLayer === "priority") return gradeColor(city["推荐等级"]);
  if (state.provinceLayer === "quality") return scoreColor(numberValue(metric.avgQuality || city["数据质量评分"], 0));
  if (state.provinceLayer === "areas") return metricColor((metric.areaCount || 0) + byCity(state.data.streetDecisions || [], cityName).length, 170, "green");
  if (state.provinceLayer === "competitors") return metricColor(metric.competitorCount || 0, 20, "blue");
  if (state.provinceLayer === "tasks") return metricColor(metric.taskCount || 0, 160, "warn");
  if (state.provinceLayer === "missing") return metricColor(metric.missingFieldCount || 0, 1000, "warn");
  return gradeColor(city["推荐等级"]);
}

function provinceSubLabel(city, cityName) {
  const metric = cityMetric(cityName);
  if (state.provinceLayer === "quality") return `质量${metric.avgQuality || text(city["数据质量评分"])}`;
  if (state.provinceLayer === "areas") return `${byCity(state.data.streetDecisions || [], cityName).length}街道`;
  if (state.provinceLayer === "competitors") return `${metric.competitorCount || 0}竞品`;
  if (state.provinceLayer === "tasks") return `${metric.taskCount || 0}任务`;
  if (state.provinceLayer === "missing") return `${metric.missingFieldCount || 0}缺口`;
  return `${text(city["综合评分"])}分`;
}

function renderProvinceMap() {
  const svg = document.querySelector("#provinceMap");
  const layerName = document.querySelector(`#provinceLayer option[value="${state.provinceLayer}"]`)?.textContent || "城市优先级";
  document.querySelector("#mapTitle").textContent = `福建省城市地图 · ${layerName}`;
  document.querySelector("#mapSubtitle").textContent = `点击城市进入区县/商圈下钻；省图当前显示${layerName}，城市图叠加商圈、POI、竞品、租金和铺位线索。`;
  const features = state.provinceGeo.features || [];
  const bounds = pathBounds(features);
  const project = createProjector(bounds, 760, 560, 22);
  clearSvg(svg);
  features.forEach((feature) => {
    const cityName = normalizeCityName(feature.properties.name || feature.properties.fullname || "");
    const city = cityRecord(cityName);
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", featurePath(feature, project));
    path.setAttribute("class", `map-region ${state.selectedCity === cityName ? "active" : ""}`);
    path.setAttribute("fill", provinceFill(city, cityName));
    path.addEventListener("click", () => selectCity(cityName));
    svg.appendChild(path);
  });
  features.forEach((feature) => {
    const cityName = normalizeCityName(feature.properties.name || feature.properties.fullname || "");
    const city = cityRecord(cityName);
    const [x, y] = featureCenter(feature, project);
    appendSvgText(svg, x, y - 2, `${cityName} ${text(city["推荐等级"])}`, "map-label");
    appendSvgText(svg, x, y + 17, provinceSubLabel(city, cityName), "map-sub-label");
  });
}

function districtMatch(name) {
  const normalized = normalizeDistrictName(name);
  return cityDistricts().find((row) => normalizeDistrictName(row["区县"]) === normalized);
}

function districtFill(district, metric) {
  const row = metric || district || {};
  if (state.districtLayer === "stores") return metricColor(numberValue(row["周麻婆门店数"], 0), 30, "green");
  if (state.districtLayer === "coreCompetitors") return metricColor(numberValue(row["五大竞品门店数"], 0), 60, "blue");
  if (state.districtLayer === "blanks") return metricColor(numberValue(row["高潜空白街道数"], 0), 12, "green");
  if (state.districtLayer === "missing") return metricColor(numberValue(row["数据缺口数"], 0), 260, "warn");
  if (state.districtLayer === "quality") return scoreColor(numberValue(row["平均数据质量分"] || row["数据质量评分"], 0));
  return gradeColor(gradeValue(row));
}

function districtSubLabel(metric, district) {
  const row = metric || district || {};
  if (state.districtLayer === "stores") return `本店${text(row["周麻婆门店数"] || 0)}`;
  if (state.districtLayer === "coreCompetitors") return `五大竞品${text(row["五大竞品门店数"] || 0)}`;
  if (state.districtLayer === "blanks") return `空白${text(row["高潜空白街道数"] || 0)}`;
  if (state.districtLayer === "missing") return `缺口${text(row["数据缺口数"] || 0)}`;
  if (state.districtLayer === "quality") return `质量${text(row["平均数据质量分"] || row["数据质量评分"])}`;
  return `${text(row["综合评分"] || row["街道数"] || 0)}分`;
}

function streetPointClass(row) {
  const tag = `${text(row["机会标签"])} ${text(row["机会类型"])}`;
  if (tag.includes("过密") || tag.includes("谨慎")) return "point-risk";
  if (tag.includes("租金")) return "point-rent";
  if (tag.includes("覆盖")) return "point-own";
  if (tag.includes("竞争")) return "point-competition";
  if (tag.includes("空白")) return "point-blank";
  return "point-street";
}

function appendMapPoint(svg, row, project, className, type, offsetX = 0, offsetY = 0, clusterSize = 1) {
  const coords = pointCoordinates(row);
  if (!coords) return;
  const [x, y] = project(coords);
  const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
  group.setAttribute("class", `map-point ${className}`);
  group.setAttribute("transform", `translate(${(x + offsetX).toFixed(2)},${(y + offsetY).toFixed(2)})`);
  const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
  title.textContent = rowTitle(row);
  const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  const bubble = numberValue(row["气泡大小"], 0);
  circle.setAttribute("r", bubble ? String(Math.max(4.2, Math.min(11, bubble))) : (className === "point-area" ? "6" : "4.2"));
  group.appendChild(title);
  group.appendChild(circle);
  if (clusterSize > 2 && className === "point-area") {
    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", "0");
    label.setAttribute("y", "3");
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("class", "cluster-label");
    label.textContent = clusterSize;
    group.appendChild(label);
  }
  group.addEventListener("click", (event) => {
    event.stopPropagation();
    selectDetail(row, type);
  });
  svg.appendChild(group);
}

function appendLayeredPoints(svg, rows, project) {
  const bucketCounts = new Map();
  rows.forEach(({ row }) => {
    const coords = pointCoordinates(row);
    if (!coords) return;
    const [x, y] = project(coords);
    const key = `${Math.round(x / 14)}:${Math.round(y / 14)}`;
    bucketCounts.set(key, (bucketCounts.get(key) || 0) + 1);
  });
  const bucketIndex = new Map();
  rows.forEach(({ row, className, type }) => {
    const coords = pointCoordinates(row);
    if (!coords) return;
    const [x, y] = project(coords);
    const key = `${Math.round(x / 14)}:${Math.round(y / 14)}`;
    const index = bucketIndex.get(key) || 0;
    const total = bucketCounts.get(key) || 1;
    bucketIndex.set(key, index + 1);
    const angle = (Math.PI * 2 * index) / Math.max(1, total);
    const radius = total > 1 ? Math.min(20, 6 + total * 1.5) : 0;
    appendMapPoint(svg, row, project, className, type, Math.cos(angle) * radius, Math.sin(angle) * radius, total);
  });
}

function radiusPx(row, project, km) {
  const lon = Number(row["经度"]);
  const lat = Number(row["纬度"]);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return 0;
  const deltaLon = km / (111 * Math.cos(lat * Math.PI / 180));
  const [x1] = project([lon, lat]);
  const [x2] = project([lon + deltaLon, lat]);
  return Math.abs(x2 - x1);
}

function renderRadiusCircles(svg, project) {
  if (!state.layers.radius || !state.selectedRadius) return;
  const coords = pointCoordinates(state.selectedRadius);
  if (!coords) return;
  const [x, y] = project(coords);
  [
    ["3km 外卖", 3, "radius-3"],
    ["1.5km 堂食", 1.5, "radius-15"],
    ["1km 核心", 1, "radius-1"],
  ].forEach(([label, km, className]) => {
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", x);
    circle.setAttribute("cy", y);
    circle.setAttribute("r", radiusPx(state.selectedRadius, project, km));
    circle.setAttribute("class", `radius-circle ${className}`);
    svg.appendChild(circle);
    appendSvgText(svg, x, y - radiusPx(state.selectedRadius, project, km) - 5, label, "radius-label");
  });
}

function renderCityMap() {
  const svg = document.querySelector("#cityMap");
  clearSvg(svg);
  if (!state.cityGeo || !state.cityGeo.features) return;
  const layerName = document.querySelector(`#districtLayer option[value="${state.districtLayer}"]`)?.textContent || "推荐等级";
  document.querySelector("#cityMapTitle").textContent = `${state.selectedCity}区县地图 · ${layerName}`;
  document.querySelector("#cityMapSubtitle").textContent = state.filters.district
    ? `${state.filters.district}：街道点、商圈、本店、竞品和租金缺口已联动过滤`
    : "点击区县后，下方街道榜、任务、竞品和租金会自动过滤；街道层只用点位/气泡，不画假边界。";
  const features = state.cityGeo.features || [];
  const bounds = pathBounds(features);
  const project = createProjector(bounds, 760, 560, 24);
  features.forEach((feature) => {
    const rawName = feature.properties.name || feature.properties.fullname || "";
    const district = districtMatch(rawName);
    const metric = districtMapMetric(rawName);
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", featurePath(feature, project));
    path.setAttribute("class", `district-region ${state.filters.district && normalizeDistrictName(state.filters.district) === normalizeDistrictName(rawName) ? "active" : ""}`);
    path.setAttribute("fill", districtFill(district, metric));
    path.addEventListener("click", () => selectDistrict(metric || district, rawName));
    svg.appendChild(path);
  });
  renderRadiusCircles(svg, project);
  features.forEach((feature) => {
    const rawName = feature.properties.name || feature.properties.fullname || "";
    const district = districtMatch(rawName);
    const metric = districtMapMetric(rawName);
    const [x, y] = featureCenter(feature, project);
    appendSvgText(svg, x, y, rawName, "district-label");
    if (district || metric) appendSvgText(svg, x, y + 16, districtSubLabel(metric, district), "district-score-label");
  });
  const points = [];
  if (state.layers.streetDecision) locatedStreetMapPoints().slice(0, 100).forEach((row) => points.push({ row, className: streetPointClass(row), type: "街道点" }));
  if (state.layers.blankOpportunity) locatedStreetMapPoints().filter((row) => text(row["机会标签"]).includes("空白") || text(row["机会类型"]).includes("空白")).slice(0, 70).forEach((row) => points.push({ row, className: "point-blank", type: "街道点" }));
  if (state.layers.areas) filteredAreas().slice(0, 60).forEach((row) => points.push({ row, className: "point-area", type: "商圈" }));
  if (state.layers.ownStores) cityOwnStores().filter(rowMatchesFilters).slice(0, 120).forEach((row) => points.push({ row, className: "point-own", type: "周麻婆门店" }));
  if (state.layers.poi) cityPoi().filter(rowMatchesFilters).slice(0, 80).forEach((row) => points.push({ row, className: "point-poi", type: "POI" }));
  if (state.layers.rent) cityRent().filter(rowMatchesFilters).slice(0, 80).forEach((row) => points.push({ row, className: "point-rent", type: "租金" }));
  if (state.layers.competitors) cityCompetitors().filter(rowMatchesFilters).slice(0, 80).forEach((row) => points.push({ row, className: "point-competitor", type: "竞品" }));
  appendLayeredPoints(svg, points, project);
}

function renderStats() {
  const stats = state.data.stats;
  const fujianAreas = state.data.businessAreas.filter(isFujianRow);
  const fujianCompetitors = state.data.competitorStores.filter(isFujianRow);
  const fujianStores = (state.data.storeDistribution || []).filter(isFujianRow);
  const fujianStreetDecisions = (state.data.streetDecisions || []).filter(isFujianRow);
  const fujianMissing = (state.data.fieldCoverage || []).filter((row) => isFujianRow(row) && text(row["是否缺失"]) === "是");
  document.querySelector("#statCities").textContent = stats.fujianCityCount;
  document.querySelector("#statAreas").textContent = fujianAreas.length;
  document.querySelector("#statCompetitors").textContent = fujianCompetitors.length;
  document.querySelector("#statStores").textContent = fujianStores.length;
  document.querySelector("#statRadius").textContent = stats.radiusCount;
  document.querySelector("#statTasks").textContent = stats.pendingTaskCount;
  document.querySelector("#statCandidates").textContent = stats.candidateCount;
  document.querySelector("#statLeads").textContent = fujianStreetDecisions.length || stats.siteLeadCount || 0;
  document.querySelector("#statP1").textContent = stats.p1TaskCount || 0;
  document.querySelector("#statMissing").textContent = fujianMissing.length || stats.missingFieldCount || 0;
  document.querySelector("#statQuality").textContent = stats.avgQuality;
  document.querySelector("#generatedAt").textContent = `数据更新时间：${state.data.meta.generatedAt} · ${state.data.meta.version}`;
}

function renderFilters() {
  const citySelect = document.querySelector("#filterCity");
  citySelect.innerHTML = fujianCities().map((row) => `<option ${normalizeCityName(row["城市"]) === state.selectedCity ? "selected" : ""}>${escapeHtml(row["城市"])}</option>`).join("");
  const districts = ["", ...new Set(cityDistricts().map((row) => text(row["区县"])).filter((item) => item !== "待补"))];
  document.querySelector("#filterDistrict").innerHTML = districts.map((item) => {
    const optionValue = item ? escapeHtml(item) : "";
    return `<option value="${optionValue}" ${item === state.filters.district ? "selected" : ""}>${item || "全部"}</option>`;
  }).join("");
  document.querySelector("#filterGrade").value = state.filters.grade;
  document.querySelector("#filterStoreType").value = state.filters.storeType;
  document.querySelector("#filterConfidence").value = state.filters.confidence;
  document.querySelector("#filterRent").value = state.filters.rent;
  document.querySelector("#filterSource").value = state.filters.source;
  document.querySelector("#filterSourceLevel").value = state.filters.sourceLevel;
  document.querySelector("#filterTaskPriority").value = state.filters.taskPriority;
  document.querySelector("#filterSearch").value = state.filters.search;
  document.querySelector("#provinceLayer").value = state.provinceLayer;
  document.querySelector("#districtLayer").value = state.districtLayer;
}

function renderCityRank() {
  const container = document.querySelector("#cityRankList");
  container.innerHTML = sortRows(fujianCities()).map((city) => {
    const cityName = normalizeCityName(city["城市"]);
    const depth = state.data.stats.cityDepth[cityName];
    const metric = cityMetric(cityName);
    const kpi = (state.data.cityKpi || []).find((row) => normalizeCityName(row["城市"]) === cityName);
    const blankCount = kpi && (kpi["高潜空白街道数"] || kpi["空白街道数"]);
    const storeCount = kpi && kpi["周麻婆门店数"] || byCity(state.data.storeDistribution || [], cityName).length;
    const coreCompetitorCount = kpi && kpi["五大竞品门店数"] || metric.competitorCount || 0;
    return `
      <button class="rank-item ${cityName === state.selectedCity ? "active" : ""}" type="button" data-city="${escapeHtml(cityName)}">
        <div class="rank-main"><strong>${escapeHtml(city["城市"])}</strong>${gradeBadge(city["推荐等级"])}</div>
        <div class="rank-meta">${escapeHtml(city["综合评分"])}分 · ${byCity((state.data.streetDecisions || []).filter(isFujianRow), cityName).length}街道 · ${depth ? `${depth.areas}商圈 / ${coreCompetitorCount}五大竞品 / ${storeCount}本店 / ${blankCount || 0}高潜空白` : "骨架待补"} · 质量${escapeHtml(metric.avgQuality || city["数据质量评分"])}</div>
      </button>
    `;
  }).join("");
  container.querySelectorAll("[data-city]").forEach((node) => node.addEventListener("click", () => selectCity(node.dataset.city)));
}

function selectDetail(row, type) {
  state.selectedDetail = row;
  state.selectedType = type;
  state.selectedRadius = radiusFor(row) || (type === "商圈" ? row : null);
  renderDetail();
  renderRadiusSummary();
  renderCityMap();
  renderReport();
}

function currentDetail() {
  return state.selectedDetail || cityRecord();
}

function renderDetail() {
  const row = currentDetail();
  const title = rowTitle(row);
  const grade = gradeValue(row);
  const score = scoreValue(row);
  const quality = qualityValue(row);
  const profile = businessProfileFor(row);
  const level = sourceLevel(row);
  const city = text(row["城市"] || state.selectedCity);
  const district = text(row["区县"]);
  const area = text(row["关联商圈"] || row["名称"]);
  const crumbs = ["福建", city];
  if (district !== "待补" && district !== city) crumbs.push(district);
  if (state.selectedType !== "城市" && area !== "待补" && area !== city && area !== district) crumbs.push(area);
  crumbs.push(state.selectedType);
  document.querySelector("#breadcrumbTrail").textContent = crumbs.join(" → ");
  document.querySelector("#detailTitle").textContent = title;
  document.querySelector("#detailSubtitle").textContent = [row["省份"], row["城市"], row["区县"], state.selectedType].filter((item) => text(item) !== "待补").map(text).join(" / ");
  const badge = document.querySelector("#detailBadge");
  badge.textContent = grade;
  badge.className = `badge ${gradeClass(grade)}`;
  document.querySelector("#detailDecision").textContent = currentDecision(row);
  document.querySelector("#detailScore").textContent = score || "待补";
  document.querySelector("#detailQuality").textContent = quality || "待补";
  document.querySelector("#scoreBar").style.width = `${Math.min(100, Math.max(score, quality))}%`;
  const sourceNode = document.querySelector("#detailSourceLevel");
  sourceNode.textContent = level;
  sourceNode.className = `source-badge ${sourceClass(level)}`;
  document.querySelector("#detailThreshold").textContent = text(row["推荐门槛说明"] || row["质量门槛说明"] || (quality < 70 ? "质量分低于70，只能待核验" : "质量达标，可进入复核推荐池"));
  document.querySelector("#detailTags").innerHTML = tagPills(row);
  renderDetailRadar(row, profile);
  document.querySelector("#detailReason").textContent = text(row["主要依据"] || row["主导机会类型"] || row["优先逻辑"] || row["选址意义"] || row["结论"]);
  document.querySelector("#detailRisk").textContent = text(row["主要风险"] || row["风险摘要"] || row["数据缺口摘要"] || row["备注"]);
  document.querySelector("#detailGap").textContent = text(row["数据缺口"] || row["数据缺口摘要"] || "缺平台截图、租金报价、真实照片和地图API复核");
  document.querySelector("#detailNext").textContent = text(row["下一步核验动作"] || row["下一步动作"] || row["核验动作"] || "拓展/选址团队补核验任务");
  document.querySelector("#toggleSave").textContent = state.savedIds.includes(detailKey(row)) ? "已收藏" : "收藏";
}

function renderDetailRadar(row, profile) {
  const radius = state.selectedRadius || radiusFor(row) || {};
  const items = [
    ["评分", scoreValue(row) || numberValue(profile && profile["综合评分"], 0)],
    ["质量", qualityValue(row) || numberValue(profile && profile["数据质量评分"], 0)],
    ["竞品", numberValue(profile && profile["3公里竞品数"], numberValue(radius["3公里竞品数"], 0)) * 10],
    ["租金", 100 - Math.min(100, numberValue(profile && profile["3公里租金样本数"], numberValue(radius["3公里租金样本数"], 0)) * 12)],
    ["POI", Math.min(100, numberValue(profile && profile["1.5公里POI数"], numberValue(radius["1.5公里POI数"], 0)) * 18)],
  ];
  document.querySelector("#detailRadar").innerHTML = items.map(([label, value]) => {
    const safe = Math.max(0, Math.min(100, Number(value) || 0));
    return `<div class="radar-row"><span>${escapeHtml(label)}</span><i><b style="width:${safe}%"></b></i><em>${Math.round(safe)}</em></div>`;
  }).join("");
}

function detailKey(row) {
  return `${state.selectedType}:${rowId(row)}`;
}

function renderRadiusSummary() {
  const radius = state.selectedRadius || radiusFor(currentDetail());
  const container = document.querySelector("#radiusSummary");
  document.querySelector("#radiusTitle").textContent = radius ? `${text(radius["名称"])} · ${text(radius["堂食半径判断"])}` : "点击商圈查看 1km、1.5km、3km 圈层统计";
  if (!radius) {
    container.innerHTML = `<div class="metric-card"><strong>待补</strong><span>暂无半径统计</span></div>`;
    return;
  }
  const items = [
    ["1km POI", radius["1公里POI数"]],
    ["1.5km POI", radius["1.5公里POI数"]],
    ["3km POI", radius["3公里POI数"]],
    ["3km 竞品", radius["3公里竞品数"]],
    ["3km 租金", radius["3公里租金样本数"]],
    ["质量分", radius["数据质量评分"]],
  ];
  container.innerHTML = items.map(([label, value]) => `<div class="metric-card"><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span></div>`).join("") +
    `<div class="radius-note"><b>堂食：</b>${escapeHtml(radius["堂食半径判断"])}<br><b>外卖：</b>${escapeHtml(radius["外卖半径判断"])}<br><b>缺口：</b>${escapeHtml(radius["数据缺口"])}</div>`;
}

function opportunityTags(row) {
  return text(row["机会标签"]).split(/[、,，]/).map((item) => item.trim()).filter((item) => item && item !== "待补");
}

function tagClass(tag) {
  if (tag.includes("空白")) return "tag-blank";
  if (tag.includes("竞争")) return "tag-competition";
  if (tag.includes("覆盖")) return "tag-covered";
  if (tag.includes("租金")) return "tag-rent";
  if (tag.includes("POI")) return "tag-poi";
  if (tag.includes("谨慎")) return "tag-risk";
  return "tag-neutral";
}

function tagPills(row) {
  const tags = opportunityTags(row);
  if (!tags.length) return "";
  return `<div class="tag-row">${tags.slice(0, 5).map((tag) => `<span class="opportunity-tag ${tagClass(tag)}">${escapeHtml(tag)}</span>`).join("")}</div>`;
}

function card(row, type) {
  const id = rowId(row);
  const title = rowTitle(row);
  const grade = gradeValue(row);
  const score = scoreValue(row) || text(row["综合评分"] || row["环境评分"]);
  const quality = qualityValue(row) || text(row["数据质量评分"]);
  const meta = [row["区县"], row["街道"] || row["街道/片区"], row["适合店型"] || row["店型模式"] || row["商圈类型"] || row["任务类型"]].filter((item) => text(item) !== "待补").join(" · ");
  const desc = row["主要依据"] || row["核验内容"] || row["选址意义"] || row["可开店容量"] || row["租金区间"] || row["数据缺口"] || row["备注"];
  const extra = (type === "街道决策" || type === "街道点") ? `${tagPills(row)}<div class="tile-metrics"><span>${escapeHtml(row["可开店容量"])}</span><span>本店${escapeHtml(row["周麻婆现有门店数"])}</span><span>五大竞品${escapeHtml(row["五大竞品门店数"] || row["友商/竞品门店数"])}</span><span>租金样本${escapeHtml(row["租金样本数"])}</span></div>` : "";
  return `
    <article class="info-card" data-type="${type}" data-id="${escapeHtml(id)}">
      <div class="card-main"><strong>${escapeHtml(title)}</strong><span>${sourceBadge(sourceLevel(row))}${gradeBadge(grade)}</span></div>
      <div class="card-meta">${escapeHtml(meta)} · ${escapeHtml(currentDecision(row))} · ${escapeHtml(score)}分 · 质量${escapeHtml(quality)}</div>
      <p>${escapeHtml(desc)}</p>
      ${extra}
      <div class="card-actions">
        <button type="button" data-action="select">查看</button>
        <button type="button" data-action="report">报告</button>
        <button type="button" data-action="compare">对比</button>
        <button type="button" data-action="save">${state.savedIds.includes(`${type}:${id}`) ? "已收藏" : "收藏"}</button>
      </div>
    </article>
  `;
}

function bindCardActions(container, rows, type) {
  container.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const cardNode = button.closest(".info-card");
      const nodeType = cardNode.dataset.type || type;
      const found = lookupByKey(`${nodeType}:${cardNode.dataset.id}`);
      const row = rows.find((item) => rowId(item) === cardNode.dataset.id) || (found && found.row);
      if (!row) return;
      if (button.dataset.action === "select") selectDetail(row, nodeType);
      if (button.dataset.action === "report") {
        selectDetail(row, nodeType);
        renderReport();
        document.querySelector(".report-center-panel").scrollIntoView({ behavior: "smooth", block: "start" });
      }
      if (button.dataset.action === "compare") toggleCompare(row, nodeType);
      if (button.dataset.action === "save") toggleSave(row, nodeType);
    });
  });
  container.querySelectorAll(".info-card").forEach((node) => {
    node.addEventListener("click", () => {
      const nodeType = node.dataset.type || type;
      const found = lookupByKey(`${nodeType}:${node.dataset.id}`);
      const row = rows.find((item) => rowId(item) === node.dataset.id) || (found && found.row);
      if (row) selectDetail(row, nodeType);
    });
  });
}

function renderLists() {
  const streets = filteredStreetDecisions();
  const unlocated = unlocatedStreetMapPoints();
  const candidates = filteredCandidates();
  const areas = filteredAreas();
  const tasks = filteredTasks();
  const leads = filteredSiteLeads();
  const poi = cityPoi().filter(rowMatchesFilters);
  const competitors = cityCompetitors().filter(rowMatchesFilters);
  const rent = cityRent().filter(rowMatchesFilters);
  const images = cityImages().filter((row) => !state.filters.district || row["区县"] === state.filters.district);

  renderList("#streetDecisionList", "#streetDecisionLabel", streets, "街道决策", 24);
  renderUnlocatedStreets(unlocated);
  renderList("#areaList", "#areaLabel", [...cityDistricts(), ...areas].filter(rowMatchesFilters), "商圈", 18);
  renderList("#taskList", "#taskLabel", tasks, "任务", 18);
  renderList("#poiList", "#poiLabel", poi, "POI", 12);
  renderList("#competitorList", "#competitorLabel", competitors, "竞品", 12);
  renderList("#rentList", "#rentLabel", rent, "租金", 12);
  renderImages(images);
  renderSiteLeads(leads);
}

function renderUnlocatedStreets(rows = unlocatedStreetMapPoints()) {
  const container = document.querySelector("#unlocatedStreetList");
  if (!container) return;
  document.querySelector("#unlocatedStreetLabel").textContent = `${rows.length} 个`;
  container.innerHTML = rows.slice(0, 12).map((row) => card(row, "街道点")).join("") ||
    `<div class="info-card"><strong>当前无待定位街道</strong><p>当前筛选下的街道点都有经纬度，可在区县地图中显示。</p></div>`;
  bindCardActions(container, rows, "街道点");
}

function renderList(listSelector, labelSelector, rows, type, limit) {
  const container = document.querySelector(listSelector);
  document.querySelector(labelSelector).textContent = `${rows.length} 个`;
  container.innerHTML = rows.slice(0, limit).map((row) => card(row, type)).join("") || `<div class="info-card"><strong>待补</strong><p>当前筛选下暂无数据。</p></div>`;
  bindCardActions(container, rows, type);
}

function renderImages(images) {
  document.querySelector("#imageLabel").textContent = `${images.length} 张`;
  const container = document.querySelector("#imageList");
  container.innerHTML = images.slice(0, 8).map((row) => `
    <div class="image-card">
      <span>${escapeHtml(row["图片类型"])}</span>
      <strong>${escapeHtml(row["关联对象"])}</strong>
      <em>${escapeHtml(row["说明"])}</em>
    </div>
  `).join("") || `<div class="image-card"><span>待补</span><strong>暂无图片任务</strong><em>后续填入本地照片路径即可展示。</em></div>`;
}

function renderSiteLeads(leads = filteredSiteLeads()) {
  const container = document.querySelector("#siteLeadList");
  if (!container) return;
  document.querySelector("#siteLeadSubtitle").textContent = `${state.selectedCity} · ${state.filters.storeType} · ${leads.length}条铺位线索，默认都需现场核验。`;
  container.innerHTML = leads.slice(0, 32).map((row) => card(row, "铺位线索")).join("") || `<div class="info-card"><strong>暂无铺位线索</strong><p>当前筛选下暂无线索，先补商圈坐标和铺位信息。</p></div>`;
  bindCardActions(container, leads, "铺位线索");
}

function toggleCompare(row, type) {
  const key = `${type}:${rowId(row)}`;
  if (state.compareIds.includes(key)) {
    state.compareIds = state.compareIds.filter((item) => item !== key);
  } else if (state.compareIds.length < 4) {
    state.compareIds.push(key);
  }
  renderCompare();
}

function toggleSave(row = currentDetail(), type = state.selectedType) {
  const key = `${type}:${rowId(row)}`;
  if (state.savedIds.includes(key)) state.savedIds = state.savedIds.filter((item) => item !== key);
  else state.savedIds.push(key);
  if (!state.savedStatuses[key]) state.savedStatuses[key] = "关注";
  localStorage.setItem("zhoumapo_saved_v05", JSON.stringify(state.savedIds));
  localStorage.setItem("zhoumapo_saved_status_v05", JSON.stringify(state.savedStatuses));
  renderSaved();
  renderDetail();
  renderLists();
}

function allSelectableRows() {
  return [
    ...state.data.candidates.map((row) => ["候选", row]),
    ...(state.data.streetDecisions || []).map((row) => ["街道决策", row]),
    ...(state.data.districtMapMetrics || []).map((row) => ["区县指标", row]),
    ...(state.data.streetMapPoints || []).map((row) => ["街道点", row]),
    ...(state.data.storeDistribution || []).map((row) => ["周麻婆门店", row]),
    ...state.data.businessAreas.map((row) => ["商圈", row]),
    ...state.data.districts.map((row) => ["区县", row]),
    ...state.data.streets.map((row) => ["街道", row]),
    ...state.data.poi.map((row) => ["POI", row]),
    ...state.data.rentSamples.map((row) => ["租金", row]),
    ...state.data.competitorStores.map((row) => ["竞品", row]),
    ...(state.data.siteLeads || []).map((row) => ["铺位线索", row]),
  ];
}

function lookupByKey(key) {
  const [type, id] = key.split(":");
  const found = allSelectableRows().find(([rowType, row]) => rowType === type && rowId(row) === id);
  return found ? { type: found[0], row: found[1] } : null;
}

function renderCompare() {
  document.querySelector("#compareLabel").textContent = `${state.compareIds.length} / 4`;
  const items = state.compareIds.map(lookupByKey).filter(Boolean);
  if (!items.length) {
    document.querySelector("#comparePanel").innerHTML = `<div class="empty-box">从候选、商圈、街道或铺位线索点击“对比”，可横向比较 2-4 个对象。</div>`;
    return;
  }
  const bestScore = Math.max(...items.map((item) => scoreValue(item.row)));
  const bestQuality = Math.max(...items.map((item) => qualityValue(item.row)));
  const worstQuality = Math.min(...items.map((item) => qualityValue(item.row)));
  const rows = [
    ["对象", (item) => rowTitle(item.row)],
    ["类型", (item) => item.type],
    ["结论", (item) => currentDecision(item.row)],
    ["评分", (item) => scoreValue(item.row) || "待补", (item) => scoreValue(item.row) === bestScore ? "compare-best" : ""],
    ["质量", (item) => qualityValue(item.row) || "待补", (item) => qualityValue(item.row) === bestQuality ? "compare-best" : (qualityValue(item.row) === worstQuality ? "compare-warn" : "")],
    ["来源", (item) => sourceLevel(item.row)],
    ["租金/压力", (item) => text(item.row["租金压力"] || item.row["回本压力"])],
    ["主要风险", (item) => text(item.row["主要风险"] || item.row["数据缺口"])],
    ["下一步", (item) => text(item.row["下一步动作"] || item.row["核验动作"])],
  ];
  document.querySelector("#comparePanel").innerHTML = `
    <table class="compare-table">
      <tbody>${rows.map(([label, getter, classer]) => `<tr><th>${label}</th>${items.map((item) => `<td class="${classer ? classer(item) : ""}">${escapeHtml(getter(item))}</td>`).join("")}</tr>`).join("")}</tbody>
    </table>
  `;
}

function renderSaved() {
  document.querySelector("#savedLabel").textContent = `${state.savedIds.length} 个`;
  const items = state.savedIds.map(lookupByKey).filter(Boolean);
  const container = document.querySelector("#savedList");
  container.innerHTML = items.map((item) => {
    const key = `${item.type}:${rowId(item.row)}`;
    return card(item.row, item.type).replace("</article>", `
      <select class="save-status" data-save-key="${escapeHtml(key)}">
        ${["关注", "待核验", "已核验", "暂缓", "放弃"].map((status) => `<option ${state.savedStatuses[key] === status ? "selected" : ""}>${status}</option>`).join("")}
      </select>
    </article>`);
  }).join("") || `<div class="info-card"><strong>暂无收藏</strong><p>收藏后会形成本周重点核验清单。</p></div>`;
  items.forEach((item) => bindCardActions(container, [item.row], item.type));
  container.querySelectorAll(".save-status").forEach((select) => {
    select.addEventListener("click", (event) => event.stopPropagation());
    select.addEventListener("input", () => {
      state.savedStatuses[select.dataset.saveKey] = select.value;
      localStorage.setItem("zhoumapo_saved_status_v05", JSON.stringify(state.savedStatuses));
    });
  });
}

function reportObjectType(row = currentDetail()) {
  if (state.selectedType === "铺位线索" || row["线索ID"]) return "铺位线索";
  if (state.selectedType === "街道决策" || row["决策ID"]) return "街道";
  if (state.selectedType === "候选" || row["候选ID"]) return "候选清单";
  if (state.selectedType === "商圈" || row["商圈类型"]) return "商圈";
  if (state.selectedType === "区县" || row["区县"]) return "区县";
  return "城市";
}

function allowedDirectRecommendation(row) {
  return qualityValue(row) >= 70 && currentDecision(row) === "推荐";
}

function reportDecision(row) {
  const decision = currentDecision(row);
  const quality = qualityValue(row);
  if (quality < 70 && decision === "推荐") return scoreValue(row) >= 78 ? "潜力推荐/待核验" : "谨慎/待核验";
  return decision;
}

function reportDecisionNote(row) {
  if (allowedDirectRecommendation(row)) return "质量分达到70且严格结论为推荐，可进入内部推荐池；仍需按流程复核租金、竞品和合同。";
  if (qualityValue(row) < 70) return "质量分低于70，禁止作为直接推荐，只能作为潜力对象安排核验。";
  if (sourceLevel(row) === "L1") return "当前仍含AI线索，不能作为签约依据，需补平台截图、租金报价和实地证据。";
  return "当前对象可用于内部讨论，但签约前仍需完成现场和合同核验。";
}

function reportTitle(row) {
  const city = text(row["城市"] || state.selectedCity);
  const type = reportObjectType(row);
  const title = rowTitle(row);
  return `${city}${title}${title.includes(type) ? "" : type}选址报告`;
}

function sourceLevelDescription(level) {
  const item = (state.data.sourceLevels || []).find((row) => row["等级"] === level);
  return item ? `${text(item["标签"])}：${text(item["使用说明"])}` : "来源等级待补";
}

function associatedNames(row) {
  const names = [rowTitle(row), row["关联商圈"], row["商圈名称"], row["名称"]].map(text);
  const type = reportObjectType(row);
  if (type === "区县") names.push(text(row["区县"]));
  if (type === "城市") names.push(text(row["城市"] || state.selectedCity));
  return names.filter((item, index, arr) => item !== "待补" && arr.indexOf(item) === index);
}

function relatedTasksFor(row) {
  const names = associatedNames(row);
  const city = normalizeCityName(row["城市"] || state.selectedCity);
  const district = text(row["区县"]);
  const objectId = text(row["记录ID"] || row["对象ID"] || row["来源对象ID"] || row["线索ID"]);
  return (state.data.verificationQueue || []).filter((task) => {
    if (normalizeCityName(task["城市"]) !== city) return false;
    if (district !== "待补" && text(task["区县"]) !== "待补" && text(task["区县"]) !== district) return false;
    const haystack = JSON.stringify(task);
    return (objectId !== "待补" && haystack.includes(objectId)) || names.some((name) => haystack.includes(name));
  }).sort((a, b) => prioritySort(a) - prioritySort(b));
}

function prioritySort(row) {
  return { P1: 1, P2: 2, P3: 3 }[text(row["优先级"])] || 9;
}

function relatedFieldGapsFor(row) {
  const names = associatedNames(row);
  const city = normalizeCityName(row["城市"] || state.selectedCity);
  const district = text(row["区县"]);
  return (state.data.fieldCoverage || []).filter((gap) => {
    if (text(gap["是否缺失"]) !== "是") return false;
    if (normalizeCityName(gap["城市"]) !== city) return false;
    if (district !== "待补" && text(gap["区县"]) !== "待补" && text(gap["区县"]) !== district) return false;
    const gapName = text(gap["名称"]);
    return names.includes(gapName) || names.some((name) => gapName.includes(name) || JSON.stringify(gap).includes(name));
  });
}

function reportEvidence(row, profile, radius) {
  return [
    ["1.5公里POI", radius && radius["1.5公里POI数"] || profile && profile["1.5公里POI数"]],
    ["3公里POI", radius && radius["3公里POI数"] || profile && profile["3公里POI数"]],
    ["3公里竞品", radius && radius["3公里竞品数"] || profile && profile["3公里竞品数"]],
    ["3公里租金样本", radius && radius["3公里租金样本数"] || profile && profile["3公里租金样本数"]],
    ["竞品核验数", profile && profile["竞品核验数"]],
    ["租金样本数", profile && profile["租金样本数"]],
  ].map(([label, value]) => [label, text(value)]);
}

function buildReportModel(row = currentDetail()) {
  const profile = businessProfileFor(row);
  const radius = state.selectedRadius || radiusFor(row);
  const tasks = relatedTasksFor(row).slice(0, 8);
  const gaps = relatedFieldGapsFor(row).slice(0, 12);
  const title = reportTitle(row);
  const quality = qualityValue(row);
  const level = sourceLevel(row);
  const decision = reportDecision(row);
  const directAllowed = allowedDirectRecommendation(row);
  const objectType = reportObjectType(row);
  const evidence = reportEvidence(row, profile, radius);
  const cityKpiRow = cityKpi(row["城市"] || state.selectedCity);
  return {
    row,
    profile,
    radius,
    tasks,
    gaps,
    title,
    objectType,
    decision,
    directAllowed,
    quality,
    level,
    evidence,
    cityKpi: cityKpiRow,
    decisionNote: reportDecisionNote(row),
    sourceNote: sourceLevelDescription(level),
    reason: text(row["主要依据"] || row["优先逻辑"] || row["选址意义"] || profile && profile["主要依据"]),
    risk: text(row["主要风险"] || row["风险摘要"] || row["数据缺口"] || profile && profile["主要风险"]),
    next: text(row["下一步动作"] || row["核验动作"] || row["核验任务"] || profile && profile["下一步动作"]),
    gapSummary: text(row["数据缺口"] || profile && profile["数据缺口"] || (gaps.length ? gaps.map((gap) => gap["字段"]).join("；") : "待补")),
  };
}

function mdLine(label, value) {
  return `- **${label}**：${text(value)}`;
}

function taskMarkdown(tasks) {
  if (!tasks.length) return "- 待补：当前对象暂无直接关联任务，需人工补建核验任务。";
  return tasks.map((task, index) => `${index + 1}. ${text(task["优先级"])}｜${text(task["任务类型"])}｜${text(task["关联商圈"])}｜${text(task["核验内容"])}｜负责人：${text(task["建议负责人"])}｜截止：${text(task["截止建议"])}`).join("\n");
}

function gapsMarkdown(gaps, fallback) {
  if (!gaps.length) return `- ${text(fallback)}`;
  return gaps.map((gap) => `- ${text(gap["字段"])}：${text(gap["核验动作"])}`).join("\n");
}

function evidenceMarkdown(evidence) {
  return evidence.map(([label, value]) => mdLine(label, value)).join("\n");
}

function buildBriefMarkdown(model) {
  return `# ${model.title}

## 结论
${mdLine("对象类型", model.objectType)}
${mdLine("推荐结论", model.decision)}
${mdLine("综合评分", scoreValue(model.row) || "待补")}
${mdLine("数据质量分", model.quality || "待补")}
${mdLine("来源等级", `${model.level}｜${model.sourceNote}`)}
${mdLine("是否允许直接推荐", model.directAllowed ? "是，可进入内部推荐池" : "否，只能作为待核验对象")}

## 核心判断
${mdLine("主要依据", model.reason)}
${mdLine("主要风险", model.risk)}
${mdLine("数据缺口", model.gapSummary)}
${mdLine("下一步动作", model.next)}
${model.level === "L1" ? "\n> 注意：当前含AI线索，不能作为签约依据。\n" : ""}`;
}

function buildStandardMarkdown(model) {
  return `# ${model.title}

## 1. 对象概况
${mdLine("对象类型", model.objectType)}
${mdLine("城市/区县", `${text(model.row["城市"] || state.selectedCity)} / ${text(model.row["区县"])}`)}
${mdLine("名称", rowTitle(model.row))}
${mdLine("店型/类型", text(model.row["店型模式"] || model.row["商圈类型"] || model.row["线索类型"]))}
${mdLine("推荐结论", model.decision)}
${mdLine("综合评分", scoreValue(model.row) || "待补")}
${mdLine("推荐等级", gradeValue(model.row))}

## 2. 数据质量与推荐门槛
${mdLine("数据质量分", model.quality || "待补")}
${mdLine("来源等级", `${model.level}｜${model.sourceNote}`)}
${mdLine("推荐门槛", model.decisionNote)}
${mdLine("是否允许直接推荐", model.directAllowed ? "是，可进入内部推荐池" : "否，只能作为潜力推荐/待核验")}

## 3. 地图/半径摘要
${evidenceMarkdown(model.evidence)}
${mdLine("堂食半径判断", model.radius && model.radius["堂食半径判断"])}
${mdLine("外卖半径判断", model.radius && model.radius["外卖半径判断"])}

## 4. 评分依据
${mdLine("主要依据", model.reason)}
${mdLine("主要风险", model.risk)}
${mdLine("数据缺口", model.gapSummary)}

## 5. 下一步核验任务
${taskMarkdown(model.tasks)}

## 6. 字段缺口
${gapsMarkdown(model.gaps, model.gapSummary)}
${model.level === "L1" ? "\n> 注意：当前含AI线索，不能作为签约依据。\n" : ""}`;
}

function buildActionMarkdown(model) {
  return `# ${model.title}｜核验行动版

## 核验结论
${mdLine("当前结论", model.decision)}
${mdLine("推荐门槛", model.decisionNote)}
${mdLine("质量/来源", `${model.quality || "待补"}分 / ${model.level}`)}

## 本周优先任务
${taskMarkdown(model.tasks.filter((task) => text(task["优先级"]) === "P1").length ? model.tasks.filter((task) => text(task["优先级"]) === "P1") : model.tasks)}

## 需要补齐的字段
${gapsMarkdown(model.gaps, model.gapSummary)}

## 现场核验关注点
${mdLine("竞品", "补评分、评论数、人均、月销量、榜单、距离和堂食/外卖表现")}
${mdLine("租金", "补面积、租金、转让费、物业费、合同年限、递增条款")}
${mdLine("铺位", "补门牌、楼层、门头可见度、动线、停车和100米环境")}
${mdLine("下一步", model.next)}
${model.level === "L1" ? "\n> 注意：当前含AI线索，不能作为签约依据。\n" : ""}`;
}

function markdownToPreview(markdown) {
  const lines = markdown.split("\n");
  return lines.map((line) => {
    if (line.startsWith("# ")) return `<h3>${escapeHtml(line.slice(2))}</h3>`;
    if (line.startsWith("## ")) return `<h4>${escapeHtml(line.slice(3))}</h4>`;
    if (line.startsWith("> ")) return `<blockquote>${escapeHtml(line.slice(2))}</blockquote>`;
    if (/^\d+\.\s/.test(line)) return `<p class="report-item">${escapeHtml(line)}</p>`;
    if (line.startsWith("- ")) return `<p>${escapeHtml(line).replaceAll("**", "")}</p>`;
    if (!line.trim()) return "";
    return `<p>${escapeHtml(line)}</p>`;
  }).join("");
}

function buildReportMarkdown(model) {
  if (state.reportMode === "brief") return buildBriefMarkdown(model);
  if (state.reportMode === "action") return buildActionMarkdown(model);
  return buildStandardMarkdown(model);
}

function renderReport() {
  const model = buildReportModel();
  const markdown = buildReportMarkdown(model);
  state.currentReportMarkdown = markdown;
  state.currentReportTitle = model.title;
  document.querySelector("#reportObjectLabel").textContent = `${model.objectType} · ${rowTitle(model.row)} · ${model.decision}`;
  document.querySelector("#reportPreview").innerHTML = markdownToPreview(markdown);
  document.querySelector("#reportMarkdown").value = markdown;
  document.querySelector("#reportStatus").textContent = `已生成 · ${state.reportMode === "brief" ? "简版摘要" : state.reportMode === "action" ? "核验行动版" : "标准报告"}`;
}

function safeFilename(value) {
  return text(value).replace(/[\\/:*?"<>|]/g, "_").slice(0, 90);
}

async function copyReportMarkdown() {
  const textValue = state.currentReportMarkdown || "";
  try {
    await navigator.clipboard.writeText(textValue);
    document.querySelector("#reportStatus").textContent = "已复制Markdown";
  } catch {
    const textarea = document.querySelector("#reportMarkdown");
    textarea.focus();
    textarea.select();
    document.execCommand("copy");
    document.querySelector("#reportStatus").textContent = "已复制Markdown";
  }
}

function downloadReportMarkdown() {
  const content = state.currentReportMarkdown || "";
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${safeFilename(state.currentReportTitle || "周麻婆选址报告")}.md`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  document.querySelector("#reportStatus").textContent = "已下载.md";
}

function renderTable() {
  const maps = {
    candidates: state.data.candidates,
    streetDecisions: state.data.streetDecisions || [],
    districtMap: state.data.districtMapMetrics || [],
    streetMap: state.data.streetMapPoints || [],
    stores: state.data.storeDistribution || [],
    brands: state.data.competitorBrands || [],
    requirements: state.data.requirementBacklog || [],
    leads: state.data.siteLeads || [],
    radius: state.data.radiusStats,
    tasks: state.data.verificationTasks,
    quality: state.data.fieldCoverage || [],
    profiles: state.data.businessProfiles || [],
    cityKpi: state.data.cityKpi || [],
    districtKpi: state.data.districtKpi || [],
    areas: state.data.businessAreas,
    streets: state.data.streets,
    poi: state.data.poi,
    competitors: state.data.competitorStores,
    rent: state.data.rentSamples,
    reports: state.data.reports,
  };
  const rows = maps[state.activeTab] || [];
  const fields = tableFields[state.activeTab];
  document.querySelector("#dataTable thead").innerHTML = `<tr>${fields.map((field) => `<th>${field}</th>`).join("")}</tr>`;
  document.querySelector("#dataTable tbody").innerHTML = rows.map((row) => `<tr>${fields.map((field) => `<td>${escapeHtml(row[field])}</td>`).join("")}</tr>`).join("");
}

function renderCityKpi() {
  const kpi = cityKpi();
  const metric = cityMetric(state.selectedCity);
  const cards = [
    ["平均质量", kpi && kpi["平均数据质量分"] || metric.avgQuality || "待补"],
    ["商圈", kpi && kpi["商圈数"] || metric.areaCount || 0],
    ["街道", kpi && kpi["街道数"] || 0],
    ["本店", kpi && kpi["周麻婆门店数"] || byCity(state.data.storeDistribution || []).length],
    ["五大竞品", kpi && kpi["五大竞品门店数"] || metric.competitorCount || 0],
    ["高潜空白", kpi && kpi["高潜空白街道数"] || 0],
    ["P1任务", kpi && kpi["P1任务数"] || metric.p1TaskCount || 0],
    ["潜力推荐", kpi && kpi["潜力推荐数"] || metric.potentialRecommended || 0],
    ["缺竞品", kpi && kpi["缺竞品"] || 0],
    ["缺租金", kpi && kpi["缺租金"] || 0],
    ["缺照片", kpi && kpi["缺照片"] || 0],
  ];
  document.querySelector("#cityKpiSubtitle").textContent = kpi ? text(kpi["下一步动作"]) : "当前城市KPI待补。";
  document.querySelector("#cityKpiCards").innerHTML = cards.map(([label, value]) => `
    <div class="kpi-card"><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span></div>
  `).join("");
}

function renderQualityDashboard() {
  const dashboard = state.data.qualityDashboard || {};
  document.querySelector("#qualityRule").textContent = dashboard.qualityRule || "质量规则待补";
  const cityRows = (dashboard.cityQuality || []).filter((row) => !state.filters.search || JSON.stringify(row).includes(state.filters.search));
  document.querySelector("#qualityCityList").innerHTML = cityRows.slice(0, 12).map((row) => `
    <div class="quality-tile">
      <strong>${escapeHtml(row["城市"])} · 质量${escapeHtml(row["平均数据质量分"])}</strong>
      <p>${escapeHtml(row["下一步动作"])}</p>
      <div class="tile-metrics">
        <span>${escapeHtml(row["商圈数"])}商圈</span>
        <span>${escapeHtml(row["P1任务数"])}个P1</span>
        <span>缺竞品${escapeHtml(row["缺竞品"])}</span>
        <span>缺租金${escapeHtml(row["缺租金"])}</span>
        <span>缺照片${escapeHtml(row["缺照片"])}</span>
      </div>
    </div>
  `).join("");
  const sourceCounts = dashboard.sourceLevelCounts || {};
  document.querySelector("#sourceLevelList").innerHTML = Object.entries(sourceCounts).map(([level, count]) => `
    <div class="source-tile"><strong>${sourceBadge(level)} ${escapeHtml(count)}条</strong><p>${escapeHtml((state.data.sourceLevels || []).find((row) => row["等级"] === level)?.["标签"] || "来源等级")}</p></div>
  `).join("");
  const missing = dashboard.missingByField || {};
  document.querySelector("#missingFieldList").innerHTML = Object.entries(missing).slice(0, 12).map(([field, count]) => `
    <div class="source-tile"><strong>${escapeHtml(field)}</strong><p>${escapeHtml(count)} 个对象缺失</p></div>
  `).join("");
  renderGapChecklist();
  const lowRows = (dashboard.lowQualityObjects || []).filter((row) => normalizeCityName(row["城市"]) === normalizeCityName(state.selectedCity)).slice(0, 10);
  const lowContainer = document.querySelector("#lowQualityList");
  lowContainer.innerHTML = lowRows.map((row) => card(row, row["线索ID"] ? "铺位线索" : (row["候选ID"] ? "候选" : "商圈"))).join("") || `<div class="info-card"><strong>暂无低质量高潜力对象</strong><p>当前城市筛选下暂无需要重点提示的低质量对象。</p></div>`;
  bindCardActions(lowContainer, lowRows, "商圈");
}

function renderGapChecklist() {
  const city = state.selectedCity;
  const streets = byCity((state.data.streetDecisions || []).filter(isFujianRow), city);
  const ownStores = byCity(state.data.storeDistribution || [], city);
  const competitors = byCity(state.data.competitorStores || [], city);
  const geoRows = [...streets, ...ownStores, ...competitors, ...byCity(state.data.rentSamples || [], city), ...byCity(state.data.poi || [], city)];
  const gaps = [
    ["缺租金", streets.filter((row) => numberValue(row["租金样本数"], 0) === 0).length, "补街铺/商场/社区底商租金、面积、转让费、合同条件"],
    ["缺实地照片", streets.length, "补门头、动线、停车、竞品排队、商场入口和周边100米环境"],
    ["缺平台截图", competitors.filter((row) => text(row["来源等级"]) === "L3" && text(row["验证状态"]).includes("待")).length, "抽样留存五大竞品评分、评论、人均、销量/热度截图"],
    ["缺POI", streets.filter((row) => text(row["机会标签"]).includes("需POI核验")).length, "补住宅、学校、办公、医院、交通、商场、餐饮密度"],
    ["缺地理编码", geoRows.filter((row) => text(row["经度"]) === "待补" || text(row["纬度"]) === "待补").length, "拿到高德/百度Key后批量补经纬度"],
  ];
  const container = document.querySelector("#gapChecklist");
  if (!container) return;
  container.innerHTML = gaps.map(([label, count, action]) => `
    <div class="source-tile gap-tile">
      <strong>${escapeHtml(label)} · ${escapeHtml(count)}</strong>
      <p>${escapeHtml(action)}</p>
    </div>
  `).join("");
}

function renderVerificationCenter() {
  const rows = (state.data.verificationQueue || []).filter((row) => {
    if (normalizeCityName(row["城市"]) !== normalizeCityName(state.selectedCity)) return false;
    if (state.filters.district && text(row["区县"]) !== state.filters.district) return false;
    if (state.filters.taskPriority && text(row["优先级"]) !== state.filters.taskPriority) return false;
    if (state.filters.sourceLevel && sourceLevel(row) !== state.filters.sourceLevel) return false;
    if (state.filters.search && !JSON.stringify(row).includes(state.filters.search)) return false;
    return true;
  });
  document.querySelector("#verificationSubtitle").textContent = `${state.selectedCity} · ${rows.length}条待处理任务，优先补能影响推荐结论的字段。`;
  const container = document.querySelector("#verificationQueue");
  container.innerHTML = rows.slice(0, 48).map((row) => `
    <article class="task-row">
      <strong>${escapeHtml(row["优先级"])} · ${escapeHtml(row["任务类型"])}</strong>
      <p>${escapeHtml(row["关联商圈"])} · ${escapeHtml(row["区县"])} · 截止 ${escapeHtml(row["截止建议"])}</p>
      <p>${escapeHtml(row["核验内容"])}</p>
      <div class="tile-metrics">
        <span>${escapeHtml(row["建议负责人"])}</span>
        <span>${sourceBadge(sourceLevel(row))}</span>
        <span>质量${escapeHtml(row["数据质量评分"])}</span>
      </div>
    </article>
  `).join("") || `<div class="empty-box">当前筛选下暂无核验任务。</div>`;
}

async function loadCityGeo(city) {
  const code = CITY_CODES[normalizeCityName(city)];
  if (!code) {
    state.cityGeo = null;
    return;
  }
  try {
    const res = await fetch(`./data/geojson/${code}_full.json`, { cache: "no-store" });
    state.cityGeo = res.ok ? await res.json() : null;
  } catch {
    state.cityGeo = null;
  }
}

async function selectCity(city) {
  state.selectedCity = normalizeCityName(city);
  state.filters.city = state.selectedCity;
  state.filters.district = "";
  state.selectedDetail = null;
  state.selectedType = "城市";
  state.selectedRadius = null;
  await loadCityGeo(state.selectedCity);
  renderAll();
}

function selectDistrict(row, rawName = "") {
  const districtName = text((row && row["区县"]) || rawName);
  state.filters.district = districtName === "待补" ? "" : districtName;
  state.selectedDetail = row || districtMatch(rawName) || districtMapMetric(rawName);
  state.selectedType = "区县";
  state.selectedRadius = null;
  renderAll();
}

function updateFiltersFromInputs() {
  state.filters.city = normalizeCityName(document.querySelector("#filterCity").value);
  state.filters.district = document.querySelector("#filterDistrict").value;
  state.filters.grade = document.querySelector("#filterGrade").value;
  state.filters.storeType = document.querySelector("#filterStoreType").value;
  state.filters.confidence = document.querySelector("#filterConfidence").value;
  state.filters.rent = document.querySelector("#filterRent").value;
  state.filters.source = document.querySelector("#filterSource").value;
  state.filters.sourceLevel = document.querySelector("#filterSourceLevel").value;
  state.filters.taskPriority = document.querySelector("#filterTaskPriority").value;
  state.filters.search = document.querySelector("#filterSearch").value.trim();
}

function bindEvents() {
  document.querySelectorAll(".mode").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".mode").forEach((node) => node.classList.toggle("active", node === button));
      if (button.id === "toggleAdvanced") {
        document.body.classList.toggle("show-advanced");
        button.textContent = document.body.classList.contains("show-advanced") ? "收起高级" : "高级数据";
        document.querySelector("#advancedIntro").scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      document.querySelector(button.dataset.scroll).scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
  document.querySelectorAll(".layer").forEach((button) => {
    button.addEventListener("click", () => {
      const layer = button.dataset.layer;
      state.layers[layer] = !state.layers[layer];
      button.classList.toggle("active", state.layers[layer]);
      renderCityMap();
    });
  });
  document.querySelector("#provinceLayer").addEventListener("input", (event) => {
    state.provinceLayer = event.target.value;
    renderProvinceMap();
    renderCityRank();
  });
  document.querySelector("#districtLayer").addEventListener("input", (event) => {
    state.districtLayer = event.target.value;
    renderCityMap();
  });
  document.querySelectorAll(".filter-panel select, .filter-panel input").forEach((node) => {
    node.addEventListener("input", async () => {
      const priorCity = state.selectedCity;
      const priorDistrict = state.filters.district;
      updateFiltersFromInputs();
      if (state.filters.city !== priorCity) {
        state.selectedCity = state.filters.city;
        await loadCityGeo(state.selectedCity);
        state.filters.district = "";
      }
      if (state.filters.district && state.filters.district !== priorDistrict) {
        state.selectedDetail = districtMapMetric(state.filters.district) || districtMatch(state.filters.district) || state.selectedDetail;
        state.selectedType = "区县";
        state.selectedRadius = null;
      }
      if (!state.filters.district && priorDistrict) {
        state.selectedDetail = null;
        state.selectedType = "城市";
        state.selectedRadius = null;
      }
      renderAll();
    });
  });
  document.querySelector("#resetFilters").addEventListener("click", () => {
    state.filters = { city: state.selectedCity, district: "", grade: "", storeType: "商圈店", confidence: "", rent: "", source: "", sourceLevel: "", taskPriority: "", search: "" };
    renderAll();
  });
  document.querySelectorAll(".tab").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeTab = button.dataset.tab;
      document.querySelectorAll(".tab").forEach((node) => node.classList.toggle("active", node === button));
      renderTable();
    });
  });
  document.querySelectorAll(".report-mode").forEach((button) => {
    button.addEventListener("click", () => {
      state.reportMode = button.dataset.reportMode;
      document.querySelectorAll(".report-mode").forEach((node) => node.classList.toggle("active", node === button));
      renderReport();
    });
  });
  document.querySelector("#addCompare").addEventListener("click", () => toggleCompare(currentDetail(), state.selectedType));
  document.querySelector("#toggleSave").addEventListener("click", () => toggleSave());
  document.querySelector("#makeReport").addEventListener("click", () => {
    renderReport();
    document.querySelector(".report-center-panel").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  document.querySelector("#copyReport").addEventListener("click", copyReportMarkdown);
  document.querySelector("#downloadReport").addEventListener("click", downloadReportMarkdown);
}

function renderAll() {
  renderStats();
  renderFilters();
  renderProvinceMap();
  renderCityMap();
  renderCityRank();
  renderDetail();
  renderCityKpi();
  renderRadiusSummary();
  renderLists();
  renderQualityDashboard();
  renderVerificationCenter();
  renderCompare();
  renderSaved();
  renderReport();
  renderTable();
}

async function boot() {
  const [dataRes, provinceRes] = await Promise.all([
    fetch("./data/preview-data.json", { cache: "no-store" }),
    fetch("./data/fujian-350000-full.json", { cache: "no-store" }),
  ]);
  state.data = await dataRes.json();
  state.provinceGeo = await provinceRes.json();
  await loadCityGeo(state.selectedCity);
  bindEvents();
  renderAll();
}

boot().catch((error) => {
  document.body.innerHTML = `<main class="app-shell"><section class="detail-panel"><h1>页面加载失败</h1><p>${escapeHtml(String(error))}</p></section></main>`;
});
