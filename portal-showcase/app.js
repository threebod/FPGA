"use strict";

const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 600;
const BOARD_PADDING = 52;
const MAX_SEGMENTS = 12;
const EPSILON = 0.0001;

const canvas = document.getElementById("portalCanvas");
const ctx = canvas.getContext("2d");

const ui = {
  resetButton: document.getElementById("resetButton"),
  modeButtons: [...document.querySelectorAll(".mode-button")],
  telemetryPanel: document.getElementById("telemetryPanel"),
  plannerPanel: document.getElementById("plannerPanel"),
  sidePanelTitle: document.getElementById("sidePanelTitle"),
  systemState: document.getElementById("systemState"),
  interactionHint: document.getElementById("interactionHint"),
  boardReadout: document.getElementById("boardReadout"),
  canvasModeLabel: document.querySelector(".canvas-label span:last-child"),
  resultPanel: document.getElementById("resultPanel"),
  resultTitle: document.getElementById("resultTitle"),
  resultDetail: document.getElementById("resultDetail"),
  objectCount: document.getElementById("objectCount"),
  reflectionCount: document.getElementById("reflectionCount"),
  portalCount: document.getElementById("portalCount"),
  segmentCount: document.getElementById("segmentCount"),
  boardSize: document.getElementById("boardSize"),
  scaleReadout: document.getElementById("scaleReadout"),
  selectedObjectName: document.getElementById("selectedObjectName"),
  selectedObjectShape: document.getElementById("selectedObjectShape"),
  inputX: document.getElementById("inputX"),
  inputY: document.getElementById("inputY"),
  inputLength: document.getElementById("inputLength"),
  inputWidth: document.getElementById("inputWidth"),
  inputDiameter: document.getElementById("inputDiameter"),
  inputAngle: document.getElementById("inputAngle"),
  inputMarker: document.getElementById("inputMarker"),
  lengthField: document.getElementById("lengthField"),
  widthField: document.getElementById("widthField"),
  radiusField: document.getElementById("radiusField"),
  restoreObjectButton: document.getElementById("restoreObjectButton"),
  recognitionCard: document.querySelector(".recognition-card"),
  recognitionStatus: document.getElementById("recognitionStatus"),
  markerPixelReadout: document.getElementById("markerPixelReadout"),
  warningList: document.getElementById("warningList"),
};

function objectData(id, type, xCm, yCm, angle, lengthCm, widthCm, radiusCm, shape, markerSizeCm, state) {
  return { id, type, xCm, yCm, angle, lengthCm, widthCm, radiusCm, shape, markerSizeCm, state };
}

const BOARD_PRESETS = {
  "80x60": {
    widthCm: 80,
    heightCm: 60,
    objects: [
      objectData("source", "source", 7, 48, 0, 8, 5, 0, "arrow", 3, "active"),
      objectData("mirror-a", "mirror", 25, 48, -45, 14, 4, 0, "rounded-rect", 3, "active"),
      objectData("mirror-b", "mirror", 40, 38, 18, 14, 4, 0, "rounded-rect", 3, "standby"),
      objectData("portal-blue", "portal-blue", 25, 20, 0, 14, 6, 0, "capsule", 2.5, "linked"),
      objectData("portal-orange", "portal-orange", 55, 23, 90, 14, 6, 0, "capsule", 2.5, "linked"),
      objectData("target", "target", 72, 23, 0, 0, 0, 3.5, "circle", 2.5, "idle"),
      objectData("wall", "wall", 58, 46, 0, 24, 5, 0, "rounded-rect", 3, "solid"),
    ],
  },
  "60x40": {
    widthCm: 60,
    heightCm: 40,
    objects: [
      objectData("source", "source", 5, 32, 0, 7, 5, 0, "arrow", 3, "active"),
      objectData("mirror-a", "mirror", 19, 32, -45, 12, 4, 0, "rounded-rect", 3, "active"),
      objectData("mirror-b", "mirror", 31, 25, 18, 12, 4, 0, "rounded-rect", 3, "standby"),
      objectData("portal-blue", "portal-blue", 19, 12, 0, 12, 6, 0, "capsule", 2.5, "linked"),
      objectData("portal-orange", "portal-orange", 43, 15, 90, 12, 6, 0, "capsule", 2.5, "linked"),
      objectData("target", "target", 55, 15, 0, 0, 0, 3.5, "circle", 2.5, "idle"),
      objectData("wall", "wall", 44, 32, 0, 20, 5, 0, "rounded-rect", 3, "solid"),
    ],
  },
};

const OBJECT_META = {
  source: ["发射源贴纸", "高对比箭头贴纸"],
  mirror: ["镜面", "圆角长方形板"],
  "portal-blue": ["蓝色 Portal", "椭圆胶囊板"],
  "portal-orange": ["橙色 Portal", "椭圆胶囊板"],
  target: ["圆形目标", "同心圆板"],
  wall: ["墙体", "圆角长条板"],
};

let boardKey = "80x60";
let board = BOARD_PRESETS[boardKey];
let scene = cloneScene(board.objects);
let mode = "ray";
let selectedId = "mirror-a";
let dragState = null;
let latestTrace = null;
let animationStart = performance.now();

function cloneScene(source) {
  return source.map((object) => ({ ...object }));
}

function centerOf(object) {
  return { x: object.xCm, y: object.yCm };
}

function add(a, b) {
  return { x: a.x + b.x, y: a.y + b.y };
}

function subtract(a, b) {
  return { x: a.x - b.x, y: a.y - b.y };
}

function scale(vector, amount) {
  return { x: vector.x * amount, y: vector.y * amount };
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y;
}

function cross(a, b) {
  return a.x * b.y - a.y * b.x;
}

function vectorLength(vector) {
  return Math.hypot(vector.x, vector.y);
}

function normalize(vector) {
  const magnitude = vectorLength(vector);
  return magnitude < EPSILON ? { x: 1, y: 0 } : scale(vector, 1 / magnitude);
}

function directionFromAngle(angle) {
  const radians = (angle * Math.PI) / 180;
  return { x: Math.cos(radians), y: Math.sin(radians) };
}

function normalFromTangent(tangent) {
  return { x: -tangent.y, y: tangent.x };
}

function currentTransform() {
  const scalePx = Math.min(
    (CANVAS_WIDTH - BOARD_PADDING * 2) / board.widthCm,
    (CANVAS_HEIGHT - BOARD_PADDING * 2) / board.heightCm
  );
  return {
    scale: scalePx,
    offsetX: (CANVAS_WIDTH - board.widthCm * scalePx) / 2,
    offsetY: (CANVAS_HEIGHT - board.heightCm * scalePx) / 2,
  };
}

function toCanvas(point) {
  const transform = currentTransform();
  return { x: transform.offsetX + point.x * transform.scale, y: transform.offsetY + point.y * transform.scale };
}

function toBoard(point) {
  const transform = currentTransform();
  return { x: (point.x - transform.offsetX) / transform.scale, y: (point.y - transform.offsetY) / transform.scale };
}

function cmToPx(value) {
  return value * currentTransform().scale;
}

function segmentEndpoints(object) {
  const tangent = directionFromAngle(object.angle);
  const half = scale(tangent, object.lengthCm / 2);
  const center = centerOf(object);
  return { a: subtract(center, half), b: add(center, half), tangent };
}

function raySegmentIntersection(origin, direction, a, b) {
  const segment = subtract(b, a);
  const denominator = cross(direction, segment);
  if (Math.abs(denominator) < EPSILON) return null;
  const delta = subtract(a, origin);
  const distance = cross(delta, segment) / denominator;
  const alongSegment = cross(delta, direction) / denominator;
  if (distance <= 0.12 || alongSegment < -EPSILON || alongSegment > 1 + EPSILON) return null;
  return { distance, point: add(origin, scale(direction, distance)), alongSegment };
}

function rayCircleIntersection(origin, direction, center, radius) {
  const relative = subtract(origin, center);
  const b = 2 * dot(relative, direction);
  const c = dot(relative, relative) - radius * radius;
  const discriminant = b * b - 4 * c;
  if (discriminant < 0) return null;
  const root = Math.sqrt(discriminant);
  const distances = [(-b - root) / 2, (-b + root) / 2].filter((value) => value > 0.12);
  if (!distances.length) return null;
  const distance = Math.min(...distances);
  return { distance, point: add(origin, scale(direction, distance)) };
}

function rayBoundaryIntersection(origin, direction) {
  const candidates = [];
  if (Math.abs(direction.x) > EPSILON) candidates.push(-origin.x / direction.x, (board.widthCm - origin.x) / direction.x);
  if (Math.abs(direction.y) > EPSILON) candidates.push(-origin.y / direction.y, (board.heightCm - origin.y) / direction.y);
  return candidates
    .filter((distance) => distance > 0.12)
    .map((distance) => ({ distance, point: add(origin, scale(direction, distance)) }))
    .filter(({ point }) => point.x >= -EPSILON && point.x <= board.widthCm + EPSILON && point.y >= -EPSILON && point.y <= board.heightCm + EPSILON)
    .sort((a, b) => a.distance - b.distance)[0];
}

function reflectDirection(direction, mirror) {
  const tangent = directionFromAngle(mirror.angle);
  return normalize(subtract(scale(tangent, 2 * dot(direction, tangent)), direction));
}

function mapThroughPortal(point, direction, entry, exit) {
  const entryTangent = directionFromAngle(entry.angle);
  const entryNormal = normalFromTangent(entryTangent);
  const exitTangent = directionFromAngle(exit.angle);
  const exitNormal = normalFromTangent(exitTangent);
  const relative = subtract(point, centerOf(entry));
  const tangentOffset = dot(relative, entryTangent);
  const mappedDirection = normalize(add(
    scale(exitTangent, dot(direction, entryTangent)),
    scale(exitNormal, dot(direction, entryNormal))
  ));
  const exitPoint = add(centerOf(exit), scale(exitTangent, tangentOffset));
  return { point: add(exitPoint, scale(mappedDirection, 0.3)), visualPoint: exitPoint, direction: mappedDirection };
}

function findNearestHit(origin, direction, ignoredId) {
  let nearest = null;
  for (const object of scene) {
    if (object.id === ignoredId || object.type === "source") continue;
    const hit = object.type === "target"
      ? rayCircleIntersection(origin, direction, centerOf(object), object.radiusCm)
      : raySegmentIntersection(origin, direction, segmentEndpoints(object).a, segmentEndpoints(object).b);
    if (hit && (!nearest || hit.distance < nearest.distance)) nearest = { ...hit, object };
  }
  return nearest;
}

function traceRay() {
  const source = scene.find((object) => object.type === "source");
  let origin = centerOf(source);
  let direction = directionFromAngle(source.angle);
  let ignoredId = source.id;
  const segments = [];
  const jumps = [];
  const visited = new Set();
  let reflections = 0;
  let portals = 0;
  let status = "miss";
  let detail = "光线离开有效区域";

  for (let index = 0; index < MAX_SEGMENTS; index += 1) {
    const signature = [Math.round(origin.x * 10), Math.round(origin.y * 10), Math.round(direction.x * 100), Math.round(direction.y * 100), ignoredId].join(":");
    if (visited.has(signature)) {
      status = "loop";
      detail = "检测到重复传播路径";
      break;
    }
    visited.add(signature);
    const hit = findNearestHit(origin, direction, ignoredId);
    const boundary = rayBoundaryIntersection(origin, direction);
    if (!hit || (boundary && boundary.distance < hit.distance)) {
      segments.push({ from: origin, to: boundary ? boundary.point : add(origin, scale(direction, 100)), event: "miss" });
      break;
    }
    segments.push({ from: origin, to: hit.point, event: hit.object.type, objectId: hit.object.id });
    if (hit.object.type === "target") {
      status = "hit";
      detail = "光路闭环有效";
      break;
    }
    if (hit.object.type === "wall") {
      status = "wall";
      detail = "传播被障碍物阻断";
      break;
    }
    if (hit.object.type === "mirror") {
      direction = reflectDirection(direction, hit.object);
      origin = add(hit.point, scale(direction, 0.2));
      ignoredId = hit.object.id;
      reflections += 1;
      continue;
    }
    if (hit.object.type.startsWith("portal-")) {
      const exitType = hit.object.type === "portal-blue" ? "portal-orange" : "portal-blue";
      const exit = scene.find((object) => object.type === exitType);
      if (!exit) {
        status = "unlinked";
        detail = "Portal 配对未建立";
        break;
      }
      const mapped = mapThroughPortal(hit.point, direction, hit.object, exit);
      jumps.push({ from: hit.point, to: mapped.visualPoint });
      origin = mapped.point;
      direction = mapped.direction;
      ignoredId = exit.id;
      portals += 1;
    }
  }

  if (segments.length >= MAX_SEGMENTS && status === "miss") {
    status = "limit";
    detail = `达到最大传播段数 ${MAX_SEGMENTS}`;
  }
  return { segments, jumps, reflections, portals, status, detail };
}

function updateTelemetry(trace) {
  const states = {
    hit: ["目标已命中", trace.detail, "路径有效"],
    wall: ["光路被阻断", trace.detail, "碰撞停止"],
    miss: ["目标未命中", trace.detail, "等待调整"],
    loop: ["检测到光路循环", trace.detail, "安全停止"],
    limit: ["达到传播上限", trace.detail, "安全停止"],
    unlinked: ["Portal 未配对", trace.detail, "配置异常"],
  };
  const [title, detail, system] = states[trace.status];
  const success = trace.status === "hit";
  ui.resultTitle.textContent = title;
  ui.resultDetail.textContent = detail;
  ui.systemState.textContent = system;
  ui.resultPanel.classList.toggle("fail", !success);
  ui.objectCount.textContent = String(scene.length);
  ui.reflectionCount.textContent = String(trace.reflections);
  ui.portalCount.textContent = String(trace.portals);
  ui.segmentCount.textContent = String(trace.segments.length);
  scene.find((object) => object.type === "target").state = success ? "hit" : "idle";
}

function drawBoardGrid() {
  const transform = currentTransform();
  ctx.fillStyle = "#03080d";
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  ctx.fillStyle = "#06111a";
  ctx.fillRect(transform.offsetX, transform.offsetY, board.widthCm * transform.scale, board.heightCm * transform.scale);
  ctx.save();
  ctx.beginPath();
  ctx.rect(transform.offsetX, transform.offsetY, board.widthCm * transform.scale, board.heightCm * transform.scale);
  ctx.clip();
  const step = mode === "planner" ? 1 : 5;
  for (let x = 0; x <= board.widthCm; x += step) {
    const canvasX = toCanvas({ x, y: 0 }).x;
    ctx.strokeStyle = x % 5 === 0 ? "rgba(71,170,211,.16)" : "rgba(71,170,211,.045)";
    ctx.lineWidth = x % 5 === 0 ? 1 : 0.6;
    ctx.beginPath();
    ctx.moveTo(canvasX, transform.offsetY);
    ctx.lineTo(canvasX, transform.offsetY + board.heightCm * transform.scale);
    ctx.stroke();
  }
  for (let y = 0; y <= board.heightCm; y += step) {
    const canvasY = toCanvas({ x: 0, y }).y;
    ctx.strokeStyle = y % 5 === 0 ? "rgba(71,170,211,.16)" : "rgba(71,170,211,.045)";
    ctx.lineWidth = y % 5 === 0 ? 1 : 0.6;
    ctx.beginPath();
    ctx.moveTo(transform.offsetX, canvasY);
    ctx.lineTo(transform.offsetX + board.widthCm * transform.scale, canvasY);
    ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = "rgba(82,216,255,.38)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(transform.offsetX, transform.offsetY, board.widthCm * transform.scale, board.heightCm * transform.scale);
  if (mode === "planner") drawRulers(transform);
}

function drawRulers(transform) {
  ctx.save();
  ctx.fillStyle = "rgba(158,211,232,.72)";
  ctx.font = "10px Cascadia Code, Consolas, monospace";
  ctx.textAlign = "center";
  for (let x = 0; x <= board.widthCm; x += 5) {
    const point = toCanvas({ x, y: 0 });
    ctx.fillText(String(x), point.x, transform.offsetY - 10);
  }
  ctx.textAlign = "right";
  for (let y = 0; y <= board.heightCm; y += 5) {
    const point = toCanvas({ x: 0, y });
    ctx.fillText(String(y), transform.offsetX - 9, point.y + 3);
  }
  ctx.textAlign = "left";
  ctx.fillText("cm", transform.offsetX + board.widthCm * transform.scale + 8, transform.offsetY - 10);
  ctx.restore();
}

function withObjectTransform(object, callback) {
  const center = toCanvas(centerOf(object));
  ctx.save();
  ctx.translate(center.x, center.y);
  ctx.rotate((object.angle * Math.PI) / 180);
  callback();
  ctx.restore();
}

function drawWall(object) {
  withObjectTransform(object, () => {
    const lengthPx = cmToPx(object.lengthCm);
    const widthPx = cmToPx(object.widthCm);
    ctx.fillStyle = "rgba(46,72,89,.95)";
    ctx.strokeStyle = "rgba(151,191,211,.48)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-lengthPx / 2, -widthPx / 2, lengthPx, widthPx, Math.min(widthPx / 2, 10));
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "rgba(160,205,226,.25)";
    for (let x = -lengthPx / 2 + 18; x < lengthPx / 2; x += 34) {
      ctx.beginPath();
      ctx.moveTo(x, -widthPx / 2 + 2);
      ctx.lineTo(x, widthPx / 2 - 2);
      ctx.stroke();
    }
  });
  drawLabel(object, "WALL");
}

function drawMirror(object) {
  const selected = object.id === selectedId;
  withObjectTransform(object, () => {
    const lengthPx = cmToPx(object.lengthCm);
    const widthPx = cmToPx(object.widthCm);
    ctx.shadowColor = selected ? "rgba(82,216,255,.75)" : "rgba(82,216,255,.25)";
    ctx.shadowBlur = selected ? 15 : 6;
    ctx.fillStyle = "#12394a";
    ctx.strokeStyle = "#b8efff";
    ctx.lineWidth = selected ? 3 : 2;
    ctx.beginPath();
    ctx.roundRect(-lengthPx / 2, -widthPx / 2, lengthPx, widthPx, Math.min(widthPx / 2, 10));
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    const markerRadius = cmToPx(object.markerSizeCm) / 2;
    ctx.fillStyle = "#00b8ff";
    ctx.beginPath();
    ctx.arc(-lengthPx / 2 + markerRadius, 0, markerRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffcf55";
    ctx.beginPath();
    ctx.arc(lengthPx / 2 - markerRadius, 0, markerRadius, 0, Math.PI * 2);
    ctx.fill();
  });
  drawLabel(object, object.id === "mirror-a" ? "MIRROR A" : "MIRROR B");
}

function portalColor(object) {
  return object.type === "portal-blue" ? "#00a8ff" : "#ff8a24";
}

function drawPortal(object, time) {
  const selected = object.id === selectedId;
  const color = portalColor(object);
  withObjectTransform(object, () => {
    const lengthPx = cmToPx(object.lengthCm);
    const widthPx = cmToPx(object.widthCm);
    ctx.shadowColor = color;
    ctx.shadowBlur = selected ? 24 : 12 + Math.sin(time / 380) * 3;
    ctx.fillStyle = "rgba(5,18,27,.94)";
    ctx.strokeStyle = color;
    ctx.lineWidth = selected ? 6 : 4;
    ctx.beginPath();
    ctx.ellipse(0, 0, lengthPx / 2, widthPx / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    const marker = cmToPx(object.markerSizeCm);
    ctx.fillStyle = "#f6fbff";
    ctx.fillRect(lengthPx / 2 - marker * 1.2, -marker / 2, marker, marker);
    ctx.fillStyle = "#071018";
    ctx.fillRect(lengthPx / 2 - marker * 1.2 + marker / 2, -marker / 2, marker / 2, marker);
  });
  drawLabel(object, object.type === "portal-blue" ? "PORTAL A" : "PORTAL B");
}

function drawSource(object) {
  withObjectTransform(object, () => {
    const lengthPx = cmToPx(object.lengthCm);
    const widthPx = cmToPx(object.widthCm);
    ctx.fillStyle = "#143448";
    ctx.strokeStyle = "#72d6ff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(lengthPx / 2, 0);
    ctx.lineTo(-lengthPx / 2, -widthPx / 2);
    ctx.lineTo(-lengthPx / 2, widthPx / 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  });
  drawLabel(object, "RAY SOURCE");
}

function drawTarget(object, time) {
  const center = toCanvas(centerOf(object));
  const radiusPx = cmToPx(object.radiusCm);
  const active = object.state === "hit" && mode === "ray";
  const pulse = active ? 1 + Math.sin(time / 210) * 0.08 : 1;
  ctx.save();
  ctx.translate(center.x, center.y);
  ctx.scale(pulse, pulse);
  ctx.shadowColor = active ? "#5dffb0" : "#ff6571";
  ctx.shadowBlur = active ? 25 : 9;
  ctx.fillStyle = "rgba(80,17,24,.7)";
  ctx.strokeStyle = active ? "#5dffb0" : "#ff6571";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, radiusPx, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#f4f7f8";
  ctx.beginPath();
  ctx.arc(0, 0, radiusPx * 0.58, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = active ? "#5dffb0" : "#ff6571";
  ctx.beginPath();
  ctx.arc(0, 0, radiusPx * 0.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  drawLabel(object, active ? "TARGET / ACTIVE" : "TARGET");
}

function drawLabel(object, text) {
  const center = toCanvas(centerOf(object));
  const offset = object.type === "target" ? cmToPx(object.radiusCm) : cmToPx(object.widthCm / 2);
  ctx.save();
  ctx.font = "600 11px Cascadia Code, Consolas, monospace";
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(190,222,237,.76)";
  ctx.fillText(text, center.x, center.y - offset - 12);
  ctx.restore();
}

function drawRay(trace, time) {
  const pulse = (time / 820) % 1;
  ctx.save();
  ctx.lineCap = "round";
  for (const segment of trace.segments) {
    const from = toCanvas(segment.from);
    const to = toCanvas(segment.to);
    ctx.strokeStyle = "rgba(255,218,77,.23)";
    ctx.lineWidth = 12;
    ctx.shadowColor = "#ffe359";
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#fff3a3";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(from.x + (to.x - from.x) * pulse, from.y + (to.y - from.y) * pulse, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawPortalJumps(jumps, time) {
  ctx.save();
  ctx.setLineDash([6, 10]);
  ctx.lineDashOffset = -(time / 30) % 16;
  ctx.lineWidth = 1.5;
  for (const jump of jumps) {
    const from = toCanvas(jump.from);
    const to = toCanvas(jump.to);
    const gradient = ctx.createLinearGradient(from.x, from.y, to.x, to.y);
    gradient.addColorStop(0, "rgba(0,168,255,.32)");
    gradient.addColorStop(1, "rgba(255,138,36,.32)");
    ctx.strokeStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.quadraticCurveTo((from.x + to.x) / 2, Math.min(from.y, to.y) - 55, to.x, to.y);
    ctx.stroke();
  }
  ctx.restore();
}

function isInteractive(object) {
  return mode === "planner" || object.type === "mirror" || object.type.startsWith("portal-");
}

function drawSelection(object) {
  if (!object || !isInteractive(object)) return;
  const center = toCanvas(centerOf(object));
  const tangent = directionFromAngle(object.angle);
  const reachCm = object.type === "target" ? object.radiusCm + 2.2 : object.lengthCm / 2 + 2.2;
  const handle = toCanvas(add(centerOf(object), scale(tangent, reachCm)));
  ctx.save();
  ctx.strokeStyle = "rgba(82,216,255,.62)";
  ctx.lineWidth = 1.2;
  ctx.setLineDash([4, 5]);
  ctx.beginPath();
  ctx.arc(center.x, center.y, 13, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(center.x, center.y);
  ctx.lineTo(handle.x, handle.y);
  ctx.stroke();
  ctx.fillStyle = "#061018";
  ctx.strokeStyle = object.type.startsWith("portal-") ? portalColor(object) : "#52d8ff";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(handle.x, handle.y, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  if (mode === "planner") drawDimensions(object);
}

function drawDimensions(object) {
  const center = toCanvas(centerOf(object));
  ctx.save();
  ctx.font = "600 12px Cascadia Code, Consolas, monospace";
  ctx.textAlign = "center";
  ctx.fillStyle = "#d9f5ff";
  ctx.strokeStyle = "rgba(82,216,255,.8)";
  ctx.lineWidth = 1;
  if (object.type === "target") {
    const radiusPx = cmToPx(object.radiusCm);
    ctx.beginPath();
    ctx.moveTo(center.x - radiusPx, center.y + radiusPx + 16);
    ctx.lineTo(center.x + radiusPx, center.y + radiusPx + 16);
    ctx.stroke();
    ctx.fillText(`Ø ${(object.radiusCm * 2).toFixed(1)} cm`, center.x, center.y + radiusPx + 32);
  } else {
    ctx.restore();
    withObjectTransform(object, () => {
      const lengthPx = cmToPx(object.lengthCm);
      const widthPx = cmToPx(object.widthCm);
      ctx.strokeStyle = "rgba(82,216,255,.8)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-lengthPx / 2, widthPx / 2 + 12);
      ctx.lineTo(lengthPx / 2, widthPx / 2 + 12);
      ctx.stroke();
      ctx.font = "600 12px Cascadia Code, Consolas, monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = "#d9f5ff";
      ctx.fillText(`${object.lengthCm.toFixed(1)} × ${object.widthCm.toFixed(1)} cm`, 0, widthPx / 2 + 29);
    });
    return;
  }
  ctx.restore();
}

function render(time) {
  latestTrace = traceRay();
  if (mode === "ray") updateTelemetry(latestTrace);
  drawBoardGrid();
  if (mode === "ray") {
    drawPortalJumps(latestTrace.jumps, time);
    drawRay(latestTrace, time);
  } else {
    scene.find((object) => object.type === "target").state = "idle";
  }
  for (const object of scene) {
    if (object.type === "wall") drawWall(object);
    if (object.type === "mirror") drawMirror(object);
    if (object.type.startsWith("portal-")) drawPortal(object, time);
    if (object.type === "source") drawSource(object);
    if (object.type === "target") drawTarget(object, time);
  }
  drawSelection(scene.find((object) => object.id === selectedId));
  requestAnimationFrame(render);
}

function pointerPosition(event) {
  const rect = canvas.getBoundingClientRect();
  return toBoard({
    x: ((event.clientX - rect.left) / rect.width) * CANVAS_WIDTH,
    y: ((event.clientY - rect.top) / rect.height) * CANVAS_HEIGHT,
  });
}

function localPoint(point, object) {
  const relative = subtract(point, centerOf(object));
  const tangent = directionFromAngle(object.angle);
  const normal = normalFromTangent(tangent);
  return { x: dot(relative, tangent), y: dot(relative, normal) };
}

function objectContainsPoint(object, point) {
  const local = localPoint(point, object);
  if (object.type === "target") return Math.hypot(local.x, local.y) <= object.radiusCm + 0.8;
  if (object.shape === "capsule") {
    const rx = Math.max(object.lengthCm / 2, EPSILON);
    const ry = Math.max(object.widthCm / 2, EPSILON);
    return (local.x * local.x) / (rx * rx) + (local.y * local.y) / (ry * ry) <= 1.25;
  }
  return Math.abs(local.x) <= object.lengthCm / 2 + 0.8 && Math.abs(local.y) <= object.widthCm / 2 + 0.8;
}

function findInteractiveObject(point) {
  const objects = scene.filter(isInteractive).reverse();
  for (const object of objects) {
    const tangent = directionFromAngle(object.angle);
    const reach = object.type === "target" ? object.radiusCm + 2.2 : object.lengthCm / 2 + 2.2;
    const handle = add(centerOf(object), scale(tangent, reach));
    if (vectorLength(subtract(point, handle)) <= 1.5) return { object, mode: "rotate" };
  }
  for (const object of objects) if (objectContainsPoint(object, point)) return { object, mode: "move" };
  return null;
}

function objectHalfExtent(object) {
  return object.type === "target" ? object.radiusCm : Math.hypot(object.lengthCm / 2, object.widthCm / 2);
}

function clampObject(object) {
  const half = objectHalfExtent(object);
  const slack = mode === "planner" ? half * 0.7 : 0;
  object.xCm = Math.max(half - slack, Math.min(board.widthCm - half + slack, object.xCm));
  object.yCm = Math.max(half - slack, Math.min(board.heightCm - half + slack, object.yCm));
}

function footprintPolygon(object) {
  const center = centerOf(object);
  if (object.type === "target") {
    return Array.from({ length: 16 }, (_, index) => {
      const angle = (index / 16) * Math.PI * 2;
      return { x: center.x + Math.cos(angle) * object.radiusCm, y: center.y + Math.sin(angle) * object.radiusCm };
    });
  }
  const tangent = directionFromAngle(object.angle);
  const normal = normalFromTangent(tangent);
  const halfLength = object.lengthCm / 2;
  const halfWidth = object.widthCm / 2;
  return [
    add(add(center, scale(tangent, halfLength)), scale(normal, halfWidth)),
    add(add(center, scale(tangent, halfLength)), scale(normal, -halfWidth)),
    add(add(center, scale(tangent, -halfLength)), scale(normal, -halfWidth)),
    add(add(center, scale(tangent, -halfLength)), scale(normal, halfWidth)),
  ];
}

function polygonsOverlap(a, b) {
  for (const polygon of [a, b]) {
    for (let index = 0; index < polygon.length; index += 1) {
      const edge = subtract(polygon[(index + 1) % polygon.length], polygon[index]);
      const axis = normalize(normalFromTangent(edge));
      const aProjection = a.map((point) => dot(point, axis));
      const bProjection = b.map((point) => dot(point, axis));
      if (Math.max(...aProjection) <= Math.min(...bProjection) || Math.max(...bProjection) <= Math.min(...aProjection)) return false;
    }
  }
  return true;
}

function displayName(object) {
  if (object.id === "mirror-a") return "镜面 A";
  if (object.id === "mirror-b") return "镜面 B";
  return OBJECT_META[object.type][0];
}

function analyzeScene() {
  const warnings = [];
  const polygons = scene.map((object) => ({ object, polygon: footprintPolygon(object) }));
  for (const { object, polygon } of polygons) {
    if (polygon.some((point) => point.x < 0 || point.y < 0 || point.x > board.widthCm || point.y > board.heightCm)) warnings.push(`${displayName(object)}超出实体区域`);
    const invalid = object.type === "target"
      ? object.radiusCm <= 0 || object.radiusCm * 2 > Math.min(board.widthCm, board.heightCm)
      : object.lengthCm <= 0 || object.widthCm <= 0 || object.lengthCm > board.widthCm || object.widthCm > board.heightCm;
    if (invalid) warnings.push(`${displayName(object)}尺寸超出合理范围`);
    if (object.markerSizeCm <= 0) warnings.push(`${displayName(object)}标记尺寸无效`);
  }
  for (let first = 0; first < polygons.length; first += 1) {
    for (let second = first + 1; second < polygons.length; second += 1) {
      if (polygonsOverlap(polygons[first].polygon, polygons[second].polygon)) warnings.push(`${displayName(polygons[first].object)}与${displayName(polygons[second].object)}发生重叠`);
    }
  }
  return [...new Set(warnings)];
}

function cameraScale() {
  return Math.min(640 / board.widthCm, 480 / board.heightCm);
}

function syncPlannerUI() {
  const object = scene.find((item) => item.id === selectedId) || scene[0];
  selectedId = object.id;
  const isCircle = object.type === "target";
  ui.selectedObjectName.textContent = displayName(object);
  ui.selectedObjectShape.textContent = OBJECT_META[object.type][1];
  ui.inputX.value = object.xCm.toFixed(1);
  ui.inputY.value = object.yCm.toFixed(1);
  ui.inputLength.value = object.lengthCm.toFixed(1);
  ui.inputWidth.value = object.widthCm.toFixed(1);
  ui.inputDiameter.value = (object.radiusCm * 2).toFixed(1);
  ui.inputAngle.value = Math.round(object.angle);
  ui.inputMarker.value = object.markerSizeCm.toFixed(1);
  ui.lengthField.hidden = isCircle;
  ui.widthField.hidden = isCircle;
  ui.radiusField.hidden = !isCircle;
  const pixels = object.markerSizeCm * cameraScale();
  ui.markerPixelReadout.textContent = `${pixels.toFixed(0)} px`;
  ui.recognitionCard.classList.remove("warning", "danger");
  if (pixels >= 24) ui.recognitionStatus.textContent = "尺寸充足";
  else if (pixels >= 16) {
    ui.recognitionStatus.textContent = "建议增大标记";
    ui.recognitionCard.classList.add("warning");
  } else {
    ui.recognitionStatus.textContent = "识别风险较高";
    ui.recognitionCard.classList.add("danger");
  }
  ui.scaleReadout.textContent = `640×480视野：${cameraScale().toFixed(1)} px/cm`;
  const warnings = analyzeScene();
  ui.warningList.replaceChildren();
  if (!warnings.length) {
    const item = document.createElement("li");
    item.className = "ok";
    item.textContent = "当前布局未发现尺寸、越界或重叠问题";
    ui.warningList.append(item);
  } else {
    for (const warning of warnings.slice(0, 6)) {
      const item = document.createElement("li");
      item.textContent = warning;
      ui.warningList.append(item);
    }
  }
}

function setMode(nextMode) {
  mode = nextMode;
  ui.modeButtons.forEach((button) => button.classList.toggle("active", button.dataset.mode === mode));
  ui.telemetryPanel.hidden = mode !== "ray";
  ui.plannerPanel.hidden = mode !== "planner";
  ui.sidePanelTitle.textContent = mode === "ray" ? "实时状态" : "实物尺寸规划";
  ui.systemState.textContent = mode === "ray" ? "计算中" : "厘米标尺";
  ui.interactionHint.textContent = mode === "ray" ? "拖动镜面与 Portal · 拖动端点旋转" : "选择任意元件 · 拖动主体或旋转端点";
  ui.canvasModeLabel.textContent = mode === "ray" ? "LIVE GEOMETRY" : "PHYSICAL SCALE / CM";
  if (mode === "planner") syncPlannerUI();
}

function loadBoardPreset(nextKey) {
  boardKey = nextKey;
  board = BOARD_PRESETS[boardKey];
  scene = cloneScene(board.objects);
  selectedId = "mirror-a";
  ui.boardSize.value = boardKey;
  ui.boardReadout.textContent = `${board.widthCm} × ${board.heightCm} cm 实体区域`;
  animationStart = performance.now();
  syncPlannerUI();
}

function updateSelectedFromInputs() {
  const object = scene.find((item) => item.id === selectedId);
  if (!object) return;
  const assignIfFinite = (key, value) => {
    const number = Number(value);
    if (Number.isFinite(number)) object[key] = number;
  };
  assignIfFinite("xCm", ui.inputX.value);
  assignIfFinite("yCm", ui.inputY.value);
  assignIfFinite("angle", ui.inputAngle.value);
  assignIfFinite("markerSizeCm", ui.inputMarker.value);
  if (object.type === "target") assignIfFinite("radiusCm", Number(ui.inputDiameter.value) / 2);
  else {
    assignIfFinite("lengthCm", ui.inputLength.value);
    assignIfFinite("widthCm", ui.inputWidth.value);
  }
  syncPlannerUI();
}

canvas.addEventListener("pointerdown", (event) => {
  const point = pointerPosition(event);
  const hit = findInteractiveObject(point);
  if (!hit) return;
  selectedId = hit.object.id;
  dragState = { id: hit.object.id, mode: hit.mode, offset: subtract(centerOf(hit.object), point) };
  canvas.setPointerCapture(event.pointerId);
  canvas.classList.add("dragging");
  canvas.focus({ preventScroll: true });
  if (mode === "planner") syncPlannerUI();
});

canvas.addEventListener("pointermove", (event) => {
  if (!dragState) return;
  const point = pointerPosition(event);
  const object = scene.find((item) => item.id === dragState.id);
  if (!object) return;
  if (dragState.mode === "rotate") object.angle = (Math.atan2(point.y - object.yCm, point.x - object.xCm) * 180) / Math.PI;
  else {
    object.xCm = point.x + dragState.offset.x;
    object.yCm = point.y + dragState.offset.y;
    clampObject(object);
  }
  if (mode === "planner") syncPlannerUI();
});

function releasePointer(event) {
  if (!dragState) return;
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  dragState = null;
  canvas.classList.remove("dragging");
}

canvas.addEventListener("pointerup", releasePointer);
canvas.addEventListener("pointercancel", releasePointer);

canvas.addEventListener("keydown", (event) => {
  const object = scene.find((item) => item.id === selectedId);
  if (!object || !isInteractive(object)) return;
  const amount = event.shiftKey ? 1 : 0.25;
  let handled = true;
  if (event.key === "ArrowLeft") object.xCm -= amount;
  else if (event.key === "ArrowRight") object.xCm += amount;
  else if (event.key === "ArrowUp") object.yCm -= amount;
  else if (event.key === "ArrowDown") object.yCm += amount;
  else if (event.key === "[") object.angle -= event.shiftKey ? 5 : 1;
  else if (event.key === "]") object.angle += event.shiftKey ? 5 : 1;
  else handled = false;
  if (handled) {
    event.preventDefault();
    clampObject(object);
    if (mode === "planner") syncPlannerUI();
  }
});

ui.modeButtons.forEach((button) => button.addEventListener("click", () => {
  setMode(button.dataset.mode);
  if (globalThis.history?.replaceState) history.replaceState(null, "", button.dataset.mode === "planner" ? "#planner" : location.pathname);
}));
ui.boardSize.addEventListener("change", () => loadBoardPreset(ui.boardSize.value));
[ui.inputX, ui.inputY, ui.inputLength, ui.inputWidth, ui.inputDiameter, ui.inputAngle, ui.inputMarker]
  .forEach((input) => input.addEventListener("input", updateSelectedFromInputs));

ui.restoreObjectButton.addEventListener("click", () => {
  const current = scene.find((object) => object.id === selectedId);
  const recommended = board.objects.find((object) => object.id === selectedId);
  if (!current || !recommended) return;
  current.lengthCm = recommended.lengthCm;
  current.widthCm = recommended.widthCm;
  current.radiusCm = recommended.radiusCm;
  current.markerSizeCm = recommended.markerSizeCm;
  syncPlannerUI();
});

ui.resetButton.addEventListener("click", () => {
  loadBoardPreset(boardKey);
  canvas.focus({ preventScroll: true });
});

ui.boardSize.value = boardKey;
ui.boardReadout.textContent = `${board.widthCm} × ${board.heightCm} cm 实体区域`;
setMode(globalThis.location?.hash === "#planner" ? "planner" : "ray");
requestAnimationFrame((time) => render(time - animationStart));
