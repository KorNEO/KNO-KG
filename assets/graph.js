/* 스키마-사례 그래프 — canvas + d3 zoom. 좌표는 빌드 시 계산(graph-data.json). */
(function () {
  'use strict';

  // ── 설정 ────────────────────────────────────────────────────────────────
  var NODE_COLORS = { schema: '#1e3a8a', formative: '#475569', neologism: '#94a3b8' };
  var LABEL_COLORS = { schema: '#1e3a8a', formative: '#0f172a', neologism: '#475569' };
  var TYPE_KO = { schema: '스키마', formative: '형성소', neologism: '신어' };
  var LINK_STYLE = {
    '하위':   { color: '#1e3a8a', alpha: 0.35, width: 1.2 },
    '의미 조건': { color: '#1e3a8a', alpha: 0.35, width: 1.2, dash: [2, 3] },
    '병렬':   { color: '#1e3a8a', alpha: 0.3, width: 1.1, dash: [4, 3] },
    '고정항': { color: '#475569', alpha: 0.5, width: 1.1 },
    '사례화': { color: '#94a3b8', alpha: 0.55, width: 1.0 },
    '구성':   { color: '#94a3b8', alpha: 0.3, width: 0.8 }
  };
  var LINK_ORDER = ['구성', '사례화', '고정항', '병렬', '하위', '의미 조건'];
  var HOP_EDGE_COLORS = { 1: '#f2a48c', 2: '#82c4b5', 3: '#b7a6de' };
  var HOP_TEXT_COLORS = { 1: '#c9754f', 2: '#3e8f7e', 3: '#8a6fc0' };
  var ZOOM_LABEL_THRESHOLD = 3.0;
  // 군집 색 (v1.1 COMM_PALETTE)
  // 구역(군집) 바탕색 — 저채도 파스텔 8색 순환. 노드·글자에는 쓰지 않는다.
  var COMM_PALETTE = ['#8da2c0', '#9fb8a3', '#c9b58f', '#c39aa0', '#a89cc4', '#8fb6b8', '#b3a693', '#93a8b5'];
  function commColor(ci) { return (ci == null || ci < 0) ? '#94a3b8' : COMM_PALETTE[ci % COMM_PALETTE.length]; }
  // 초점 스키마에서 본 역할별 색: 하위 도식은 같은 계열의 파스텔, 병렬 도식은 다른 색
  var ROLE_PARALLEL = '#d4915e';
  function pastel(hex, t) { var r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16); r = Math.round(r + (255 - r) * t); g = Math.round(g + (255 - g) * t); b = Math.round(b + (255 - b) * t); return 'rgb(' + r + ',' + g + ',' + b + ')'; }
  function schemaFill(n) { var base = FM_COLORS[n.fm] || NODE_COLORS.schema; if (n._role === '하위') return pastel(base, 0.55); if (n._role === '병렬') return ROLE_PARALLEL; return base; }
  function hexA(hex, a) { var r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16); return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')'; }
  var communities = [], commMap = {};
  var showComm = false, showHull = true, showCName = true;
  var REG_KO = { '우리말샘': '우리말샘 등재', '미등재': '미등재' };
  var FM_COLORS = { '합성': '#1e3a8a', '파생': '#2e7fb8', '혼성': '#6d5aa8', '축약': '#a16207', '구': '#0f766e' };

  var USAS = window.USAS_TREE || { major: [], mid: [], minor: [] };
  var usasMajor = {}, usasMid = {}, usasMinor = {};
  USAS.major.forEach(function (m) { usasMajor[m.code] = m; });
  USAS.mid.forEach(function (m) { usasMid[m.code] = m; });
  USAS.minor.forEach(function (m) { usasMinor[m.code] = m; });
  function usasDesc(tag) {
    var mi = usasMinor[tag]; if (!mi) return '<code>' + tag + '</code>';
    var md = usasMid[mi.mid] || {}; var mj = usasMajor[md.major] || {};
    return '<code>' + tag + '</code> ' + (mi.en || '') +
      ' <span class="lv">‹ <code>' + mi.mid + '</code> ' + (md.en || '') + ' ‹ <code>' + (md.major || '') + '</code> ' + (mj.ko || mj.en || '') + '</span>';
  }
  // USAS 카드: 소범주 코드 · 영어 이름 · 대범주(한국어). 중범주가 소범주와 같으면 생략
  function usasRow(tag, extra) {
    var base = String(tag).replace(/[+-]+$/, ''), pol = String(tag).slice(base.length);
    var mi = usasMinor[base], md = mi ? (usasMid[mi.mid] || {}) : (usasMid[base] || {}), mj = usasMajor[(md.major || base.charAt(0))] || {};
    var en = mi ? (mi.en || '') : (md.en || '');
    var mid = mi && mi.mid !== base ? '<span class="u-mid">' + esc(md.en || mi.mid) + '</span>' : '';
    return '<div class="u-row"><code>' + esc(base) + (pol ? '<b>' + esc(pol) + '</b>' : '') + '</code><span class="u-en">' + esc(en) + '</span>' + mid +
      '<span class="u-maj">' + esc(mj.ko || mj.en || base.charAt(0)) + '</span>' + (extra || '') + '</div>';
  }
  function usasCard(title, rows) {
    return '<div class="u-card"><div class="u-h">' + title + '</div>' + (rows.length ? rows.join('') : '<div class="u-none">태그 없음</div>') + '</div>';
  }

  // ── 상태 ────────────────────────────────────────────────────────────────
  var layerActive = { formative: false, neologism: true };
  var facetSel = { year: null, ut: null, fm: null, cat: null, reg: null, usas: null, status: null, comm: null };
  var hopRange = 2;
  var minN = 3;   // 스키마 사례 수 임곗값
  var casesK = 0; // 스키마당 표시 사례 수 (0 = 전부)
  var casesOf = {}; // 스키마 id → 사례 id (빈도 내림차순)
  var sim = null;
  var allNodes = [], allLinks = [], allNodeMap = {};
  var nodes = [], links = [], nodeMap = {};
  var adj = {};           // id → [{other, link}] (전체 그래프)
  var navHistory = [], currentFocusNode = null;
  var _drawnLabels = [];

  // ── 캔버스 ──────────────────────────────────────────────────────────────
  var container = document.getElementById('graph-container');
  var canvas = document.getElementById('graph-canvas');
  var ctx = canvas.getContext('2d');
  var W, H, dpr;
  var transform = d3.zoomIdentity;
  // 휠 확대 속도: d3 기본값은 Ctrl+휠에서 10배로 튀므로 Ctrl 여부와 무관하게 같은 폭으로, 한 칸에 약 12%
  function wheelDelta(ev) { var d = -ev.deltaY * (ev.deltaMode === 1 ? 0.05 : ev.deltaMode ? 1 : 0.002); return Math.max(-0.12, Math.min(0.12, d)); }
  var zoom = d3.zoom().scaleExtent([0.03, 14]).wheelDelta(wheelDelta).on('zoom', function (ev) { transform = ev.transform; draw(); });
  d3.select(canvas).call(zoom);

  function resize() {
    dpr = window.devicePixelRatio || 1;
    W = container.clientWidth; H = container.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }
  window.addEventListener('resize', resize);

  function n2ok(nd, k) { return (nd.nn || 0) >= 2000 && k >= 0.35 || (nd.nn || 0) >= 20000; }
  function nodeRadius(n) {
    if (n.type === 'schema') return Math.min(34, 8 + Math.sqrt(n.n || 1) * 2.2);
    if (n.type === 'formative') return Math.min(20, 4 + Math.sqrt(n.n || 1) * 1.3);
    return 4.5 + Math.log10((n.nn || 0) + 1) * 1.6;
  }

  // ── 가시성 (필터·층) ─────────────────────────────────────────────────────
  function neoPass(n) {
    if (facetSel.year && !facetSel.year.has(n.year)) return false;
    if (facetSel.ut && !facetSel.ut.has(n.ut)) return false;
    if (facetSel.fm && (n.ut !== '단어' || !facetSel.fm.has(n.fm))) return false;
    if (facetSel.cat && !facetSel.cat.has(n.cat)) return false;
    if (facetSel.reg && !facetSel.reg.has(n.reg)) return false;
    if (facetSel.comm && !facetSel.comm.has(String(n.comm))) return false;
    if (facetSel.usas) {
      var ok = false;
      for (var i = 0; i < n.usas.length; i++) if (facetSel.usas.has(n.usas[i])) { ok = true; break; }
      if (!ok) return false;
    }
    return true;
  }
  function neoFilterActive() {
    return !!(facetSel.year || facetSel.ut || facetSel.fm || facetSel.cat || facetSel.reg || facetSel.usas || facetSel.comm);
  }

  function computeVisible() {
    var nf = neoFilterActive();
    var vis = {};
    // 1) 신어
    allNodes.forEach(function (n) { if (n.type === 'neologism') vis[n.id] = neoPass(n); });
    // 2) 스키마: 상태 필터 + (신어 필터 활성 시) 통과 신어의 사례화 대상만
    var schemaHasNeo = {};
    if (nf) allLinks.forEach(function (l) { if (l.type === '사례화' && vis[l.source]) schemaHasNeo[l.target] = true; });
    allNodes.forEach(function (n) {
      if (n.type !== 'schema') return;
      var ok = (n.n || 0) >= minN && (!facetSel.status || facetSel.status.has(n.status)) && (!facetSel.comm || facetSel.comm.has(String(n.comm)));
      if (ok && nf) ok = !!schemaHasNeo[n.id];
      vis[n.id] = ok;
    });
    if (minN > 1 || casesK > 0) {
      var neoOk = {};
      allNodes.forEach(function (n) {
        if (n.type !== 'schema' || !vis[n.id]) return;
        var list = casesOf[n.id] || [], taken = 0;
        for (var ci2 = 0; ci2 < list.length; ci2++) {
          if (!vis[list[ci2]]) continue;
          neoOk[list[ci2]] = true; taken++;
          if (casesK > 0 && taken >= casesK) break;
        }
      });
      allNodes.forEach(function (n) { if (n.type === 'neologism' && vis[n.id]) vis[n.id] = !!neoOk[n.id]; });
    }
    // 스키마 필터 활성 시: 신어는 보이는 스키마의 사례이거나(신어 필터 없으면) 그대로
    if (facetSel.status) {
      var neoHasSchema = {};
      allLinks.forEach(function (l) { if (l.type === '사례화' && vis[l.target]) neoHasSchema[l.source] = true; });
      allNodes.forEach(function (n) { if (n.type === 'neologism' && vis[n.id]) vis[n.id] = !!neoHasSchema[n.id]; });
    }
    // 3) 형성소: 층이 켜져 있고, (필터 활성 시) 보이는 신어의 성분이거나 보이는 스키마의 고정항
    var anyFilter = nf || !!facetSel.status || minN > 1 || casesK > 0;
    var formOk = {};
    allLinks.forEach(function (l) {
      if (l.type === '구성' && vis[l.source]) formOk[l.target] = true;
      if (l.type === '고정항' && vis[l.source]) formOk[l.target] = true;
    });
    allNodes.forEach(function (n) {
      if (n.type !== 'formative') return;
      vis[n.id] = layerActive.formative && (anyFilter ? !!formOk[n.id] : true) && (!facetSel.comm || facetSel.comm.has(String(n.comm)));
    });
    // 신어 층 꺼짐
    if (!layerActive.neologism) allNodes.forEach(function (n) { if (n.type === 'neologism') vis[n.id] = false; });
    // 4) 링크: 양 끝이 보일 때
    var visLinks = allLinks.filter(function (l) { return vis[l.source] && vis[l.target]; });
    // 5) 신어·형성소는 보이는 링크에 연결된 것만 (고립 신어는 캔버스에서 제외 — 하단 목록으로)
    var linked = {};
    visLinks.forEach(function (l) { linked[l.source] = true; linked[l.target] = true; });
    var visNodes = allNodes.filter(function (n) {
      if (!vis[n.id]) return false;
      if (n.type === 'schema') return true;
      return !!linked[n.id];
    });
    return { nodes: visNodes, links: visLinks };
  }

  function applyLayout(vn, vl) {
    var nm = {};
    vn.forEach(function (n) { nm[n.id] = n; n._visibleDegree = 0; });
    vl.forEach(function (l) {
      l.s = nm[l.source]; l.t = nm[l.target];
      l.s._visibleDegree++; l.t._visibleDegree++;
    });
    nodeMap = nm; nodes = vn; links = vl;
    document.getElementById('loading').style.display = 'none';
    runForce();
    draw();
  }

  // 보이는 노드가 적으면 d3-force 로 자연스럽게 펼친다 (사전 좌표에서 출발 → 군집 유지)
  function runForce() {
    if (sim) { sim.stop(); sim = null; }
    if (!nodes.length || nodes.length > 8000) return;
    var simLinks = links.map(function (l) { return { source: l.source, target: l.target, type: l.type }; });
    var dist = { '사례화': 58, '고정항': 70, '구성': 40, '하위': 170, '의미 조건': 150, '병렬': 150 };
    var strength = { '사례화': 0.9, '고정항': 0.6, '구성': 0.5, '하위': 0.25, '의미 조건': 0.3, '병렬': 0.2 };
    var cx = 0, cy = 0; nodes.forEach(function (n) { cx += n.x; cy += n.y; }); cx /= nodes.length; cy /= nodes.length;
    // 군집 중심으로 끄는 힘: 사전 배치(군집 메타 그래프)의 자리를 지켜 군집이 펼쳐진 채 남게 한다
    function commPull(d) { return commMap[d.comm] ? (d.type === 'schema' ? 0.16 : 0.10) : 0.03; }
    sim = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(simLinks).id(function (d) { return d.id; }).distance(function (l) { return (dist[l.type] || 60) * (l.source.comm === l.target.comm ? 1 : 1.6); })
        .strength(function (l) { return (strength[l.type] || 0.5) * (l.source.comm === l.target.comm ? 1 : 0.12); }))   // 군집을 가로지르는 링크는 약하게: 군집이 서로 끌려 뭉치지 않게
      .force('charge', d3.forceManyBody().strength(function (d) { return d.type === 'schema' ? -300 : -50; }).distanceMax(420))
      .force('collide', d3.forceCollide(function (d) { return nodeRadius(d) + (d.type === 'schema' ? 14 : 6); }).strength(0.9).iterations(2))
      .force('cx', d3.forceX(function (d) { var c = commMap[d.comm]; return c ? c.x : cx; }).strength(commPull))
      .force('cy', d3.forceY(function (d) { var c = commMap[d.comm]; return c ? c.y : cy; }).strength(commPull))
      .alpha(0.9).alphaDecay(0.035).velocityDecay(0.35)
      .on('tick', draw)
      .on('end', function () { draw(); if (pendingFocus) { var pf = pendingFocus; pendingFocus = null; centerOn(pf, true); } });
  }
  var pendingFocus = null;
  // 임곗값·사례 수 때문에 숨은 노드를 보이게: 전부 표시로 풀고 그 노드로 이동
  function showHidden(id) {
    if (!allNodeMap[id]) return;
    if (allNodeMap[id].type === 'formative' && !layerActive.formative) {
      layerActive.formative = true; var tf = document.getElementById('tog-formative'); if (tf) tf.checked = true;
      var v1 = computeVisible(); applyLayout(v1.nodes, v1.links); updateMinNHint();
      if (nodeMap[id]) { focusNode(nodeMap[id], true); return; }
    }
    minN = 1;
    var r1 = document.querySelector('#minn-control input[value="1"]'); if (r1) r1.checked = true;
    var ms = document.getElementById('minn-sum'); if (ms) { ms.textContent = '전체'; ms.classList.remove('filtered'); }
    var v2 = computeVisible(); applyLayout(v2.nodes, v2.links); updateMinNHint();
    if (nodeMap[id]) focusNode(nodeMap[id], true);
  }
  function centerOn(n, animate) {
    var tz = Math.max(transform.k, 1.6);
    var tr = d3.zoomIdentity.translate((W + 200) / 2 - n.x * tz, H / 2 - n.y * tz).scale(tz);
    if (animate) d3.select(canvas).transition().duration(700).call(zoom.transform, tr); else d3.select(canvas).call(zoom.transform, tr);
  }
  function focusNode(n, animate) {
    if (!n) return;
    navHistory = []; navigateTo(n);
    centerOn(n, animate);
    if (sim && sim.alpha() > sim.alphaMin()) pendingFocus = n;   // 배치가 끝나면 다시 중심으로
  }

  function centerGraph() {
    if (!nodes.length) return;
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    nodes.forEach(function (n) {
      if (n.x < minX) minX = n.x; if (n.x > maxX) maxX = n.x;
      if (n.y < minY) minY = n.y; if (n.y > maxY) maxY = n.y;
    });
    var gw = maxX - minX || 1, gh = maxY - minY || 1;
    var cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    var k = Math.min((W - 220) / (gw + 80), (H - 40) / (gh + 80));
    k = Math.max(0.03, Math.min(k, 2));
    transform = d3.zoomIdentity.translate((W + 200) / 2 - cx * k, H / 2 - cy * k).scale(k);
    d3.select(canvas).call(zoom.transform, transform);
  }

  function refresh(recenter) {
    if (!allNodes.length) return;
    var v = computeVisible();
    applyLayout(v.nodes, v.links);
    if (recenter) centerGraph();
    if (currentFocusNode && nodeMap[currentFocusNode.id]) navigateTo(currentFocusNode);
    else { currentFocusNode = null; nodes.forEach(function (n) { n._highlighted = false; n._role = undefined; }); draw(); }
    updateFacetCounts();
  }

  // ── 그리기 ──────────────────────────────────────────────────────────────
  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#f8f9fb'; ctx.fillRect(0, 0, W, H);
    if (!nodes.length) return;
    ctx.save();
    ctx.translate(transform.x, transform.y); ctx.scale(transform.k, transform.k);
    var k = transform.k;
    var anyHl = false;
    for (var i = 0; i < nodes.length; i++) if (nodes[i]._highlighted) { anyHl = true; break; }
    var vpL = -transform.x / k - 60 / k, vpR = (W - transform.x) / k + 60 / k;
    var vpT = -transform.y / k - 60 / k, vpB = (H - transform.y) / k + 60 / k;
    function inVp(x, y) { return x >= vpL && x <= vpR && y >= vpT && y <= vpB; }

    // 군집 영역 (옅은 원) + 이름 (멀리서 볼 때)
    if ((showHull || showCName) && communities.length) {
      var visComm = {};
      for (var vc = 0; vc < nodes.length; vc++) visComm[nodes[vc].comm] = true;
      ctx.save();
      if (showHull) {
        var pts = {};
        for (var pi = 0; pi < nodes.length; pi++) { var pn = nodes[pi]; if (pn.comm < 0 || !inVp(pn.x, pn.y)) continue; (pts[pn.comm] = pts[pn.comm] || []).push(pn); }
        Object.keys(pts).forEach(function (cid) {
          var arr = pts[cid]; if (arr.length < 3) return;
          ctx.fillStyle = hexA(commColor(+cid), 0.19);
          ctx.beginPath();
          for (var ai = 0; ai < arr.length; ai++) {   // 원들의 합집합을 한 번에 채움 (겹쳐도 진해지지 않음)
            var an = arr[ai], ar = nodeRadius(an) + (an.type === 'schema' ? 50 : 34);
            ctx.moveTo(an.x + ar, an.y); ctx.arc(an.x, an.y, ar, 0, 2 * Math.PI);
          }
          ctx.fill();
        });
      }
      // 군집 이름: 화면에서 충분히 큰 군집만, 큰 군집 우선, 겹치면 생략
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      var cl = [], drawnC = [], cen = {};
      for (var vn2 = 0; vn2 < nodes.length; vn2++) { var q2 = nodes[vn2]; if (q2.comm < 0) continue; var c0 = cen[q2.comm] = cen[q2.comm] || { x: 0, minY: Infinity, n: 0, s: 0 }; c0.x += q2.x; c0.n++; if (q2.y < c0.minY) c0.minY = q2.y; if (q2.type === 'schema') c0.s++; }
      for (var cj = 0; cj < communities.length; cj++) {
        var cm2 = communities[cj], c1 = cen[cm2.id];
        if (!c1 || c1.s < 2) continue;
        var cm3 = { id: cm2.id, n: c1.n, label: cm2.label, x: c1.x / c1.n, y: c1.minY - 30, r: 20 + 12 * Math.sqrt(c1.n) };
        if (cm3.r * k < 10 || !inVp(cm3.x, cm3.y)) continue;
        cl.push(cm3);
      }
      cl.sort(function (a, b) { return b.n - a.n; });
      for (var cl_i = 0; showCName && cl_i < cl.length; cl_i++) {
        var c3 = cl[cl_i];
        var fsz = Math.max(10, Math.min(12, 8 + c3.r * k * 0.04)) / k;
        ctx.font = '600 ' + fsz + 'px Noto Sans KR, Pretendard, sans-serif';
        var lbl = c3.label, tw = ctx.measureText(lbl).width;
        if (tw > c3.r * 2.6 + 160 / k) { lbl = c3.label.split(' · ')[0]; tw = ctx.measureText(lbl).width; }
        var lx = c3.x, ly = c3.y - c3.r - fsz * 0.7, hw = tw / 2 + 3 / k, hh = fsz * 0.6, clash = false;
        for (var dc = 0; dc < drawnC.length; dc++) { var q = drawnC[dc]; if (Math.abs(lx - q.x) < hw + q.hw && Math.abs(ly - q.y) < hh + q.hh) { clash = true; break; } }
        if (clash) continue;
        drawSubText(lbl, lx, ly, fsz, '600', 'rgba(100,116,139,0.75)', 'rgba(255,255,255,0.88)', 4 / k);
        drawnC.push({ x: lx, y: ly, hw: hw, hh: hh });
      }
      ctx.restore();
    }

    // 링크 (유형별 스타일, 강조 링크는 뒤로 미룸)
    var hlLinks = [];
    var groups = {};
    links.forEach(function (l) { (groups[l.type] = groups[l.type] || []).push(l); });
    LINK_ORDER.forEach(function (ty) {
      var grp = groups[ty]; if (!grp) return;
      var st = LINK_STYLE[ty];
      ctx.globalAlpha = anyHl ? st.alpha * 0.3 : st.alpha;
      ctx.strokeStyle = st.color; ctx.lineWidth = st.width / k;
      ctx.setLineDash(st.dash ? st.dash.map(function (d) { return d / k; }) : []);
      var cross = [];
      ctx.beginPath();
      for (var g = 0; g < grp.length; g++) {
        var l = grp[g];
        if (!inVp(l.s.x, l.s.y) && !inVp(l.t.x, l.t.y)) continue;
        if (anyHl && l.s._highlighted && l.t._highlighted) { hlLinks.push(l); continue; }
        ctx.moveTo(l.s.x, l.s.y); ctx.lineTo(l.t.x, l.t.y);
      }
      ctx.stroke();
      if (cross.length) {   // 군집을 가로지르는 선: 아주 옅고 가늘게
        ctx.globalAlpha = anyHl ? 0.03 : 0.07; ctx.strokeStyle = '#64748b'; ctx.lineWidth = 0.7 / k; ctx.setLineDash([]);
        ctx.beginPath();
        for (var cg = 0; cg < cross.length; cg++) { ctx.moveTo(cross[cg].s.x, cross[cg].s.y); ctx.lineTo(cross[cg].t.x, cross[cg].t.y); }
        ctx.stroke();
      }
    });
    ctx.setLineDash([]); ctx.globalAlpha = 1;

    function drawNode(n, isHl) {
      var r = nodeRadius(n);
      if (isHl && n._hopDepth === 0) r *= 1.35;
      var hlStroke = (isHl && n._hopDepth) ? (HOP_TEXT_COLORS[n._hopDepth] || '#c9754f') : null;
      ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, 2 * Math.PI);
      ctx.fillStyle = n.type === 'neologism' ? hexA(NODE_COLORS.neologism, 0.75) : n.type === 'schema' ? schemaFill(n) : NODE_COLORS[n.type];
      ctx.fill();
      ctx.strokeStyle = hlStroke || (n.type === 'schema' ? 'rgba(15,23,42,0.45)' : 'rgba(30,58,138,0.25)');
      ctx.lineWidth = (hlStroke ? 2.5 : (n.type === 'schema' ? 1.2 : 0.7)) / k;
      ctx.stroke();
    }
    // 비강조: 신어 → 형성소 → 스키마 순 (스키마가 위)
    if (anyHl) ctx.globalAlpha = 0.3;
    ['neologism', 'formative', 'schema'].forEach(function (ty) {
      for (var j = 0; j < nodes.length; j++) {
        var n = nodes[j];
        if (n.type === ty && !n._highlighted && inVp(n.x, n.y)) drawNode(n, false);
      }
    });
    ctx.globalAlpha = 1;
    // 강조 링크
    if (hlLinks.length) {
      ctx.save(); ctx.globalAlpha = 0.85; ctx.shadowColor = 'rgba(15,23,42,0.22)'; ctx.shadowBlur = 5;
      hlLinks.forEach(function (l) {
        var hd = Math.max(l.s._hopDepth || 0, l.t._hopDepth || 0);
        ctx.strokeStyle = HOP_EDGE_COLORS[hd] || '#f2a48c';
        ctx.lineWidth = (l.type === '구성' ? 1.2 : 1.8) / k;
        ctx.beginPath(); ctx.moveTo(l.s.x, l.s.y); ctx.lineTo(l.t.x, l.t.y); ctx.stroke();
      });
      ctx.restore();
    }
    // 강조 노드
    ctx.save(); ctx.shadowColor = 'rgba(15,23,42,0.28)'; ctx.shadowBlur = 9; ctx.shadowOffsetY = 3;
    for (var j2 = 0; j2 < nodes.length; j2++) if (nodes[j2]._highlighted) drawNode(nodes[j2], true);
    ctx.restore();
    // 탐색 경로
    if (navHistory.length && currentFocusNode) {
      var trail = navHistory.concat([currentFocusNode]);
      ctx.save(); ctx.strokeStyle = '#0891b2'; ctx.fillStyle = '#0891b2'; ctx.lineWidth = 2 / k;
      ctx.setLineDash([6 / k, 4 / k]); ctx.globalAlpha = 0.7;
      for (var ti = 0; ti < trail.length - 1; ti++) {
        var a = trail[ti], b = trail[ti + 1];
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      ctx.setLineDash([]); ctx.font = '700 ' + (10 / k) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (var ni = 0; ni < trail.length; ni++) {
        var tn = trail[ni]; var nr = nodeRadius(tn) + 6 / k;
        var bx = tn.x + nr * 0.7, by = tn.y - nr * 0.7;
        ctx.globalAlpha = 0.85; ctx.fillStyle = '#0891b2';
        ctx.beginPath(); ctx.arc(bx, by, 6 / k, 0, 2 * Math.PI); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.fillText('' + (ni + 1), bx, by);
      }
      ctx.restore();
    }

    // 라벨 (스키마 우선)
    var showAll = k >= ZOOM_LABEL_THRESHOLD;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    var cands = [];
    for (var m = 0; m < nodes.length; m++) {
      var nd = nodes[m];
      if (!inVp(nd.x, nd.y)) continue;
      if (anyHl && !nd._highlighted) continue;
      var show = false, pri = 0;
      if (nd._highlighted) { show = true; pri = nd._hopDepth === 0 ? 20000 : 10000 - nd._hopDepth * 1000 + (nd.n || nd.degree || 0); }
      else if (showAll || (nodes.length <= 8000 && (nd.type !== 'neologism' || k >= 0.9 || (nd.nn || 0) >= 5000))) { show = true; pri = nd.type === 'schema' ? 1000 + (nd.n || 0) : nd.type === 'formative' ? 100 + (nd.n || 0) : 10 + Math.log10((nd.nn || 0) + 1) * 10; }
      else if (nd.type === 'schema') { show = (nd.n || 0) >= 2 + 6 / k; pri = 1000 + (nd.n || 0); }
      else if (nd.type === 'formative') { show = (nd.n || 0) >= 5 + 8 / k && k >= 0.5; pri = 100 + (nd.n || 0); }
      else { show = k >= 1.1 || (n2ok(nd, k)); pri = 10 + Math.log10((nd.nn || 0) + 1) * 10; }
      if (show) cands.push({ nd: nd, pri: pri });
    }
    cands.sort(function (a, b) { return b.pri - a.pri; });
    _drawnLabels = [];
    function overlap(x, y, hw, hh) {
      for (var o = 0; o < _drawnLabels.length; o++) {
        var d = _drawnLabels[o];
        if (Math.abs(x - d.x) < hw + d.hw && Math.abs(y - d.y) < hh + d.hh) return true;
      }
      return false;
    }
    for (var c = 0; c < cands.length; c++) {
      var n2 = cands[c].nd, rr = nodeRadius(n2);
      var fs = n2.type === 'schema' ? Math.max(10, Math.min(15, rr * 0.9)) / k
             : n2.type === 'formative' ? Math.max(9, Math.min(13, rr * 1.4)) / k
             : Math.max(10, Math.min(13, rr * 1.6)) / k;
      if (n2._highlighted && n2._hopDepth === 0) { fs *= 1.2; rr = rr * 1.35 + 2 / k; }
      var txt = n2.type === 'schema' ? (n2.short || n2.label) : n2.label, cat = '', tail = '';
      var origin = (n2.type === 'neologism' && n2.origin && fs * k >= 8) ? originPlain(n2.origin) : '';
      if (n2.type === 'schema') { var sc = splitCat(txt); txt = sc[0]; cat = sc[1]; tail = sc[2]; }
      var mainFont = (n2.type === 'schema' ? '800 ' : '600 ') + fs + 'px Noto Sans KR, Pretendard, sans-serif';
      var subFont = '700 ' + (fs * 0.68) + 'px Noto Sans KR, Pretendard, sans-serif';
      ctx.font = mainFont;
      var tw = ctx.measureText(txt).width, cw = 0;
      if (cat) { ctx.font = subFont; cw = ctx.measureText(cat).width + 1 / k; ctx.font = mainFont; }
      var tailW = tail ? ctx.measureText(tail).width : 0; cw += tailW;
      var lx = n2.x, ly = n2.y - rr - 4 / k;
      var oFont = '500 ' + (fs * 0.76) + 'px Noto Sans KR, Pretendard, sans-serif', ow = 0;
      if (origin) { ctx.font = oFont; ow = ctx.measureText(origin).width; ctx.font = mainFont; }
      var lhw = Math.max(tw + cw, ow) / 2 + 2 / k, lhh = fs * (origin ? 1.05 : 0.65);
      if (!(n2._highlighted && n2._hopDepth === 0) && !showAll && overlap(lx, ly, lhw, lhh)) continue;
      var x0 = lx - (tw + cw) / 2;
      ctx.textAlign = 'left';
      ctx.strokeStyle = 'rgba(255,255,255,0.88)'; ctx.lineWidth = 3 / k; ctx.lineJoin = 'round';
      ctx.strokeText(txt, x0, ly);
      ctx.fillStyle = LABEL_COLORS[n2.type]; ctx.globalAlpha = 0.95; ctx.fillText(txt, x0, ly);
      if (cat) { ctx.font = subFont; ctx.strokeText(cat, x0 + tw + 1 / k, ly + fs * 0.28); ctx.fillText(cat, x0 + tw + 1 / k, ly + fs * 0.28); ctx.font = mainFont; }
      if (tail) { ctx.strokeText(tail, x0 + tw + cw - tailW, ly); ctx.fillText(tail, x0 + tw + cw - tailW, ly); }
      if (origin) { ctx.font = oFont; ctx.lineWidth = 2.5 / k; ctx.globalAlpha = 0.95; ctx.strokeText(origin, lx - ow / 2, ly + fs * 0.85); ctx.fillStyle = '#6b7684'; ctx.globalAlpha = 0.9; ctx.fillText(origin, lx - ow / 2, ly + fs * 0.88); ctx.font = mainFont; }
      ctx.globalAlpha = 1; ctx.textAlign = 'center';
      _drawnLabels.push({ x: lx, y: ly, hw: lhw, hh: lhh, node: n2 });
    }
    ctx.restore();
  }

  // ── 히트 테스트·툴팁 ─────────────────────────────────────────────────────
  var tooltip = document.getElementById('tooltip');
  var ttLabel = document.getElementById('tt-label'), ttMeta = document.getElementById('tt-meta');
  function screenToGraph(ex, ey) { return [(ex - transform.x) / transform.k, (ey - transform.y) / transform.k]; }
  function findNode(gx, gy) {
    for (var li = _drawnLabels.length - 1; li >= 0; li--) {
      var lb = _drawnLabels[li];
      if (Math.abs(gx - lb.x) <= lb.hw && Math.abs(gy - lb.y) <= lb.hh) return lb.node;
    }
    var best = null, bestD = Infinity, pad = 5 / transform.k;
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i], dx = n.x - gx, dy = n.y - gy, d = Math.sqrt(dx * dx + dy * dy);
      if (d <= nodeRadius(n) + pad) {
        var score = d - (n.type === 'schema' ? 100 : 0);  // 겹치면 스키마 우선
        if (n._highlighted) return n;
        if (score < bestD) { best = n; bestD = score; }
      }
    }
    return best;
  }
  function metaOf(n) {
    if (n.type === 'schema') return '스키마 · 유형 ' + n.n + (n.total > n.n ? ' · 총 ' + n.total : '') + (n.tokens ? ' · 신문 ' + n.tokens.toLocaleString() + '회' : '') + (n.Hn != null ? ' · H ' + n.Hn.toFixed(2) : '');
    if (n.type === 'formative') return '형성소 · ' + n.n + '개 신어' + (n.lex && n.lex !== n.label ? ' · 원형식 ' + n.lex : '') + ' · ' + (REG_KO[n.reg] || n.reg);
    return '신어 · ' + n.year + '년 · ' + (n.ut === '단어' ? n.fm || '단어' : '구') + (n.cat ? ' · ' + n.cat : '') + (n.nn ? ' · 신문 ' + n.nn.toLocaleString() + '회' : '');
  }
  var _mm = false;
  canvas.addEventListener('mousemove', function (e) {
    if (_mm) return; _mm = true;
    requestAnimationFrame(function () { _mm = false; onMove(e); });
  });
  function onMove(e) {
    var rect = canvas.getBoundingClientRect();
    var ex = e.clientX - rect.left, ey = e.clientY - rect.top;
    var gp = screenToGraph(ex, ey), n = findNode(gp[0], gp[1]);
    if (n) {
      ttLabel.innerHTML = n.type === 'schema' ? schemaHtml(n.label) : esc(n.label); ttLabel.style.color = LABEL_COLORS[n.type];
      var d0 = n.type === 'schema' ? n.meaning : n.def;
      ttMeta.innerHTML = esc(metaOf(n)) + (d0 ? '<div class="tt-def">' + esc(d0.length > 90 ? d0.slice(0, 90) + '…' : d0) + '</div>' : '');
      tooltip.style.display = 'block';
      var tx = ex + 14, ty = ey - 10;
      if (tx + 270 > W) tx = ex - 280; if (ty + 60 > H) ty = ey - 70;
      tooltip.style.left = tx + 'px'; tooltip.style.top = ty + 'px';
      canvas.style.cursor = 'pointer';
    } else { tooltip.style.display = 'none'; canvas.style.cursor = ''; }
  }
  canvas.addEventListener('mouseleave', function () { tooltip.style.display = 'none'; });

  // ── 강조·정보 패널 ───────────────────────────────────────────────────────
  var infoPanel = document.getElementById('info-panel');
  var ipTitle = document.getElementById('ip-title'), ipType = document.getElementById('ip-type'), ipList = document.getElementById('ip-list');
  document.querySelectorAll('#hop-control input[name="hop-range"]').forEach(function (r) {
    r.addEventListener('change', function () { hopRange = parseInt(this.value, 10); if (currentFocusNode) navigateTo(currentFocusNode); });
  });
  function clearFocus() {
    infoPanel.classList.remove('open'); navHistory = []; currentFocusNode = null;
    nodes.forEach(function (n) { n._highlighted = false; n._hopDepth = undefined; n._role = undefined; });
    draw();
  }
  document.getElementById('ip-close').addEventListener('click', clearFocus);

  function computeHops(target) {
    var depth = new Map(); depth.set(target.id, 0);
    var frontier = [target.id];
    for (var d = 1; d <= hopRange; d++) {
      var next = [];
      frontier.forEach(function (id) {
        (adj[id] || []).forEach(function (e) {
          if (!nodeMap[e.other] || depth.has(e.other)) return;
          if (!nodeMap[id]) return;
          depth.set(e.other, d); next.push(e.other);
        });
      });
      frontier = next;
    }
    return depth;
  }
  function navigateTo(target) {
    currentFocusNode = target;
    var depth = computeHops(target);
    nodes.forEach(function (n) { var d = depth.get(n.id); n._highlighted = d !== undefined; n._hopDepth = d; n._role = undefined; });
    if (target.type === 'schema') (adj[target.id] || []).forEach(function (e) {
      var o = nodeMap[e.other]; if (!o || o.type !== 'schema') return;
      if (e.link.type === '하위' || e.link.type === '의미 조건') o._role = e.link.source === target.id ? '상위' : '하위';
      else if (e.link.type === '병렬' && !o._role) o._role = '병렬';
    });
    draw(); showInfoPanel(target, depth);
  }

  function item(n, sub, extra) {
    return '<div class="ip-item ip-nav" data-nid="' + n.id + '" style="cursor:pointer;"><span>' + (n.type === 'schema' ? schemaHtml(n.label) : esc(n.label) + (n.origin ? '<span class="origin">' + originHtml(n.origin) + '</span>' : '')) + '</span>' +
      (extra || '') + '<span class="ip-item-sub">' + (sub || '') + '</span></div>';
  }
  function statCard(v, unit, label) { return '<div class="stat-card"><div class="stat-value">' + v + (unit ? '<span class="stat-unit"> ' + unit + '</span>' : '') + '</div><div class="stat-label">' + label + '</div></div>'; }
  function kv(k, v) { return '<div class="ip-kv"><span class="k">' + k + '</span><span class="v">' + v + '</span></div>'; }
  // '[X-족]N · [X-족]NP' 처럼 스키마 표기가 이어진 문자열을 범주 아래첨자로 그림 (가운데 정렬)
  function drawSubText(text, cx0, y, fs, weight, fill, stroke, lw) {
    var parts = text.split(' · '), segs = [], total = 0;
    var mainFont = weight + ' ' + fs + 'px Noto Sans KR, Pretendard, sans-serif', subFont = weight + ' ' + (fs * 0.68) + 'px Noto Sans KR, Pretendard, sans-serif';
    parts.forEach(function (p, i) {
      var sc = splitCat(p); ctx.font = mainFont; var w1 = ctx.measureText(sc[0] + (i < parts.length - 1 ? '' : '')).width;
      ctx.font = subFont; var w2 = sc[1] ? ctx.measureText(sc[1]).width : 0;
      ctx.font = mainFont; var w3 = i < parts.length - 1 ? ctx.measureText(' · ').width : 0;
      ctx.font = mainFont; var w4 = sc[2] ? ctx.measureText(sc[2]).width : 0;
      segs.push([sc[0], sc[1], w1, w2, w3, sc[2], w4]); total += w1 + w2 + w3 + w4;
    });
    var x = cx0 - total / 2; ctx.textAlign = 'left'; ctx.lineJoin = 'round';
    segs.forEach(function (sg) {
      ctx.font = mainFont; ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.strokeText(sg[0], x, y); ctx.fillStyle = fill; ctx.fillText(sg[0], x, y); x += sg[2];
      if (sg[1]) { ctx.font = subFont; ctx.strokeText(sg[1], x, y + fs * 0.28); ctx.fillText(sg[1], x, y + fs * 0.28); x += sg[3]; }
      if (sg[5]) { ctx.font = mainFont; ctx.strokeText(sg[5], x, y); ctx.fillText(sg[5], x, y); x += sg[6]; }
      if (sg[4]) { ctx.font = mainFont; ctx.strokeText(' · ', x, y); ctx.fillText(' · ', x, y); x += sg[4]; }
    });
    ctx.textAlign = 'center';
  }
  // 원어: <영> 같은 언어 표지는 작은 칩으로, 캔버스에서는 뺀다
  function originHtml(o) { return esc(o).replace(/&lt;([^&]{1,3})&gt;/g, '<i class="lang">$1</i>'); }
  function originPlain(o) { return String(o || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(); }
  function schemaHtml(label) { return esc(label).replace(/\]([A-Za-z\/·]+)( - X=[^ ·]+)?(?=$| · )/g, function (m, c, t) { return ']<sub>' + c + '</sub>' + (t ? '<span class="cond">' + t + '</span>' : ''); }); }
  function splitCat(label) { var m = /^(.*\])([A-Za-z\/·]+)( - X=.+)?$/.exec(label); return m ? [m[1], m[2], m[3] || ''] : [label, '', '']; }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function urimalBtn(n) {
    if (n.reg === '우리말샘') return '<a class="kb-btn kb-btn-on" href="' + (n.ulink || ('id/' + n.id + '.html#urimal')) + '" target="_blank" rel="noopener" onclick="event.stopPropagation();">우리말샘 등재</a>';
    return '<span class="kb-btn kb-btn-off">' + (REG_KO[n.reg] || n.reg) + '</span>';
  }
  // 신어 외부 연결 3종: 있으면 켜진 버튼(링크), 없으면 꺼진 버튼 — 세 자리가 늘 보이게
  function extBtn(label, url) {
    return url ? '<a class="kb-btn kb-btn-on" href="' + url + '" target="_blank" rel="noopener" onclick="event.stopPropagation();">' + label + ' ↗</a>'
               : '<span class="kb-btn kb-btn-off" title="연결 없음">' + label + '</span>';
  }
  function extBtns(n) {
    return '<div class="ip-item ip-ext">' + extBtn('우리말샘', n.reg === '우리말샘' ? (n.ulink || ('id/' + n.id + '.html#urimal')) : '') + extBtn('위키백과', n.wiki) + extBtn('최초 출현 기사', n.first_url) + '</div>';
  }
  function section(title, hop, count) {
    return '<div class="ip-section">' + title + (hop ? ' · <span style="color:' + HOP_TEXT_COLORS[hop] + ';">' + hop + '차 연결</span>' : '') + ' · ' + count + '</div>';
  }
  function byLabel(a, b) { return (a.label || '').localeCompare(b.label || '', 'ko'); }
  function byN(a, b) { return (b.n || b.degree || 0) - (a.n || a.degree || 0); }

  function showInfoPanel(n, depth) {
    ipTitle.innerHTML = n.type === 'schema' ? schemaHtml(n.label) : esc(n.label) + (n.origin ? '<span class="origin">' + originHtml(n.origin) + '</span>' : '');
    var ti = TYPE_KO[n.type];
    if (n.type === 'schema') ti += ' · ' + (n.fm || '') + ' · 산출 범주 ' + n.cat + ' · 유형 ' + n.n + (n.total > n.n ? ' · 하위 포함 ' + n.total : '') + ' · 미등재 ' + n.unreg;
    if (n.type === 'formative') ti += ' · ' + n.n + '개 신어' + (n.affix ? ' · ' + n.affix + ' 접사' : '') + (n.trunc ? ' · 절단' : '') + ' · ' + (REG_KO[n.reg] || n.reg);
    if (n.type === 'neologism') ti += ' · ' + n.year + '년 · ' + n.ut + (n.fm ? ' · ' + n.fm : '') + ' · ' + n.pos + (n.cat ? ' · ' + n.cat : '');
    ipType.textContent = ti;

    var html = '';
    if (navHistory.length) html += '<div class="ip-item" id="ip-back" style="cursor:pointer;color:#64748b;font-size:0.72rem;">← ' + esc(navHistory[navHistory.length - 1].label) + ' 으로 돌아가기</div>';
    html += '<a class="ip-item" href="id/' + n.id + '.html" style="color:#1e3a8a;font-weight:700;">페이지 보기 →</a>';
    if (commMap[n.comm]) html += kv('군집', commMap[n.comm].label.split(' · ').map(schemaHtml).join(' · ') + ' <span style="color:#94a3b8;">· ' + commMap[n.comm].n + ' 노드</span>');
    if (n.type === 'schema') {
      if (n.meaning) html += '<div class="ip-def ip-cx">' + schemaHtml(n.label) + ' <span class="cx-arrow">↔</span> ' + esc(n.meaning) + '</div>';
      html += kv('층위', esc(n.level));
      if (n.tokens) {
        html += '<div class="ip-stats">'
          + statCard(n.tokens.toLocaleString(), '회', '절대빈도')
          + statCard(n.vc + '<span class="stat-unit"> / ' + n.n + '</span>', '', '출현 유형 수')
          + statCard(n.ttr != null ? n.ttr.toFixed(3) : '–', '', '유형-토큰 비')
          + statCard(n.H != null ? n.H.toFixed(2) : '–', 'bit', '엔트로피')
          + statCard(n.Hn != null ? n.Hn.toFixed(2) : '–', '', '정규화 엔트로피')
          + (n.regr != null ? statCard(Math.round(n.regr * 100), '%', '우리말샘 등재율') : '')
          + (n.t3 ? statCard(n.t3.replace('-', '.') + '.', '', '타입 빈도 3 도달 · 첫 사례 후 ' + n.m3 + '개월') : '')
          + '</div>';
        html += '<div class="ip-note">* 신문 말뭉치(네이버 뉴스 2012–2025, 약 250억 어절) 기준</div>' + (n.Hn != null ? '<div class="ip-note">* 정규화 H(정규화 엔트로피): 스키마 사례들에 토큰이 얼마나 고르게 퍼져 있는지. 0에 가까울수록 한두 사례에 토큰이 몰려 있고, 1에 가까울수록 여러 사례에 고르게 퍼져 있다.</div>' : '');
      }
      var fx = []; (n.usas_f || []).forEach(function (t) { t.split('/').forEach(function (u) { if (u && fx.indexOf(u) < 0) fx.push(u); }); });
      var xs = (n.usas_x || []).slice(0, 6), xt = 0; (n.usas_x || []).forEach(function (t) { xt += t[1]; });
      html += '<div class="u-cards">'
        + usasCard('USAS · 스키마', n.usas.map(function (t) { return usasRow(t); }))
        + usasCard('USAS · 고정항', fx.map(function (t) { return usasRow(t); }))
        + usasCard('USAS · 변항 X', xs.map(function (t) { return usasRow(t[0], '<span class="u-cnt">' + t[1] + '<i style="width:' + Math.round(100 * t[1] / (xt || 1)) + '%"></i></span>'); }))
        + '</div>';
    }
    if (n.type === 'formative') {
      if (n.udef) html += '<div class="ip-def">' + esc(n.udef) + (n.ulink ? ' <a class="ip-src" href="' + n.ulink + '" target="_blank" rel="noopener">우리말샘 ↗</a>' : '') + '</div>';
      if (n.origin) html += kv('원어', esc(n.origin));
      if (n.lex && n.lex !== n.label) html += kv('원형식', esc(n.lex));
      html += '<div class="ip-item">' + urimalBtn(n) + (n.wiki ? ' <a class="kb-btn kb-btn-on" href="' + n.wiki + '" target="_blank" rel="noopener">위키백과</a>' : '') + (n.qid ? ' <a class="kb-btn kb-btn-on" href="http://www.wikidata.org/entity/' + n.qid + '" target="_blank" rel="noopener">위키데이터</a>' : '') + '</div>';
      if (n.usas.length) html += '<div class="u-cards">' + usasCard('USAS', n.usas.map(function (t) { return usasRow(t); })) + '</div>';
    }
    if (n.type === 'neologism') {
      if (n.def) html += '<div class="ip-def">' + esc(n.def) + '</div>';
      if (n.ex) html += '<div class="ip-ex">' + esc(n.ex) + '</div>';
      html += extBtns(n);
      if (n.nn) {
        html += '<div class="ip-stats">' + statCard(n.nn.toLocaleString(), '회', '절대빈도') + statCard(n.nndoc.toLocaleString(), '건', '출현 문서 수')
          + (n.first ? statCard(n.first.slice(0, 7).replace('-', '.') + '.', '', '최초 출현 시점') : '') + '</div>' + '<div class="ip-note">* 신문 말뭉치(네이버 뉴스 2012–2025, 약 250억 어절) 기준</div>';
      }
      if (n.usas.length) html += '<div class="u-cards">' + usasCard('USAS · 구성 성분', n.usas.map(function (t) { return usasRow(t); })) + '</div>';
    }

    // 1차 연결: 관계 유형별
    var groups = {};
    (adj[n.id] || []).forEach(function (e) {
      var o = allNodeMap[e.other]; if (!o) return;
      var key;
      if (e.link.type === '사례화') key = n.type === 'schema' ? '사례 (신어)' : '사례화 스키마';
      else if (e.link.type === '고정항') key = n.type === 'schema' ? '고정항 형성소' : '고정항으로 참여하는 스키마';
      else if (e.link.type === '구성') key = n.type === 'neologism' ? '구성 성분 (형성소)' : '구성 성분으로 쓰인 신어';
      else if (e.link.type === '하위') key = e.link.source === n.id ? '상위 스키마' : '하위 스키마';
      else if (e.link.type === '의미 조건') key = e.link.source === n.id ? '상위 스키마' : '의미 조건 스키마';
      else key = '병렬 스키마 (' + (e.link.sub || '') + ')';
      (groups[key] = groups[key] || []).push({ node: o, link: e.link });
    });
    var order = ['고정항 형성소', '하위 스키마', '의미 조건 스키마', '상위 스키마', '병렬 스키마 (층위)', '병렬 스키마 (대립)', '병렬 스키마 (원형식)', '사례 (신어)',
                 '사례화 스키마', '구성 성분 (형성소)', '고정항으로 참여하는 스키마', '구성 성분으로 쓰인 신어'];
    Object.keys(groups).forEach(function (k) { if (order.indexOf(k) < 0) order.push(k); });
    order.forEach(function (key) {
      var g = groups[key]; if (!g) return;
      html += section(key, 1, g.length);
      if (key === '구성 성분 (형성소)') g.sort(function (a, b) { return (a.link.pos || 0) - (b.link.pos || 0); });
      else g.sort(function (a, b) { return byN(a.node, b.node) || byLabel(a.node, b.node); });
      g.forEach(function (x) {
        var o = x.node, sub = '';
        if (o.type === 'neologism') sub = o.year + '년' + (o.fm ? ' · ' + o.fm : '') + (o.nn ? ' · ' + o.nn.toLocaleString() + '회' : '');
        else if (o.type === 'schema') sub = '유형 ' + o.n;
        else sub = o.n + '개 신어' + (x.link.role && x.link.role !== '성분' ? ' · ' + x.link.role : '');
        var dot = (o.type === 'schema' && o._role && o._role !== '상위') ? '<i class="role-dot" style="background:' + schemaFill(o) + '"></i>' : '';
        html += item(o, sub, dot);
      });
    });
    // 2·3차
    var hop2 = [], hop3 = [];
    depth.forEach(function (d, id) {
      if (d === 2) hop2.push(allNodeMap[id]); if (d === 3) hop3.push(allNodeMap[id]);
    });
    [[hop2, 2], [hop3, 3]].forEach(function (pair) {
      var list = pair[0], hop = pair[1]; if (!list.length) return;
      var byType = {};
      list.forEach(function (o) { (byType[o.type] = byType[o.type] || []).push(o); });
      ['schema', 'formative', 'neologism'].forEach(function (ty) {
        var arr = byType[ty]; if (!arr) return;
        html += section(TYPE_KO[ty], hop, arr.length);
        arr.sort(function (a, b) { return byN(a, b) || byLabel(a, b); });
        arr.slice(0, 200).forEach(function (o) {
          var sub = o.type === 'neologism' ? o.year + '년' : o.type === 'schema' ? '유형 ' + o.n : o.n + '개 신어';
          html += item(o, sub);
        });
        if (arr.length > 200) html += '<div class="ip-item" style="color:#94a3b8;">… 외 ' + (arr.length - 200) + '개</div>';
      });
    });
    ipList.innerHTML = html;
    var back = document.getElementById('ip-back');
    if (back) back.addEventListener('click', function () { var p = navHistory.pop(); if (p) navigateTo(p); });
    ipList.querySelectorAll('.ip-nav[data-nid]').forEach(function (el) {
      el.addEventListener('click', function () {
        var t = nodeMap[el.getAttribute('data-nid')];
        if (!t) { showHidden(el.getAttribute('data-nid')); return; }
        navHistory.push(currentFocusNode); navigateTo(t);
      });
    });
    infoPanel.classList.add('open');
  }

  var _lastClick = 0;
  canvas.addEventListener('click', function (e) {
    var now = Date.now(); if (now - _lastClick < 300) return; _lastClick = now;
    var rect = canvas.getBoundingClientRect();
    var gp = screenToGraph(e.clientX - rect.left, e.clientY - rect.top);
    var n = findNode(gp[0], gp[1]);
    if (!n) { clearFocus(); tooltip.style.display = 'none'; return; }
    navHistory = []; navigateTo(n);
  });

  // ── 검색 ────────────────────────────────────────────────────────────────
  var searchInput = document.getElementById('graphSearch'), _st = null;
  searchInput.addEventListener('input', function () {
    clearTimeout(_st); var q = this.value.trim();
    _st = setTimeout(function () { doSearch(q); }, 250);
  });
  function doSearch(q) {
    if (!q) { nodes.forEach(function (n) { n._highlighted = false; n._hopDepth = undefined; }); draw(); return; }
    var ql = q.toLowerCase(), found = null;
    nodes.forEach(function (n) {
      var m = n.label.toLowerCase().indexOf(ql) >= 0 || (n.short && n.short.toLowerCase().indexOf(ql) >= 0);
      n._highlighted = m; n._hopDepth = undefined;
      if (m && (!found || (n.type === 'schema' && found.type !== 'schema'))) found = n;
    });
    draw();
    if (found) {
      var tz = Math.max(transform.k, 2.5);
      d3.select(canvas).transition().duration(600).call(zoom.transform, d3.zoomIdentity.translate(W / 2 - found.x * tz, H / 2 - found.y * tz).scale(tz));
    }
  }

  // ── 층 토글 ─────────────────────────────────────────────────────────────
  (function initMinN() {
    var box = document.getElementById('minn-control'); if (!box) return;
    var head = box.querySelector('.facet-head'), sum = document.getElementById('minn-sum');
    head.addEventListener('click', function (e) { e.stopPropagation(); var was = box.classList.contains('open'); closeFacets(); if (!was) box.classList.add('open'); });
    box.querySelector('.facet-list').addEventListener('click', function (e) { e.stopPropagation(); });
    var inp = document.getElementById('minn-input');
    box.querySelectorAll('input[name="min-n"]').forEach(function (r) { r.addEventListener('change', function () { inp.value = ''; }); });
    inp.addEventListener('input', function () { box.querySelectorAll('input[name="min-n"]').forEach(function (r) { r.checked = false; }); });
    function syncMinN() {
      var v = parseInt(inp.value, 10);
      if (!(v >= 1)) { var chk = box.querySelector('input[name="min-n"]:checked'); inp.value = ''; if (!chk) { chk = box.querySelector('input[name="min-n"][value="' + minN + '"]'); if (chk) chk.checked = true; } }
    }
    document.getElementById('minn-apply').addEventListener('click', function () {
      var v = parseInt(inp.value, 10);
      if (!(v >= 1)) { var chk = box.querySelector('input[name="min-n"]:checked'); v = chk ? parseInt(chk.value, 10) : minN; }
      minN = v; sum.textContent = v === 1 ? '전체' : '≥ ' + v; sum.classList.toggle('filtered', v > 1);
      box.classList.remove('open'); refresh(true); updateMinNHint();
    });
    document.getElementById('minn-cancel').addEventListener('click', function () {
      box.querySelectorAll('input[name="min-n"]').forEach(function (r) { r.checked = parseInt(r.value, 10) === minN; });
      inp.value = box.querySelector('input[name="min-n"]:checked') ? '' : String(minN);
      box.classList.remove('open');
    });
  })();
  function updateMinNHint() {
    var el = document.getElementById('minn-hint'); if (!el) return;
    var ns = 0, nn = 0;
    nodes.forEach(function (n) { if (n.type === 'schema') ns++; else if (n.type === 'neologism') nn++; });
    el.textContent = '스키마 ' + ns.toLocaleString() + ' · 신어 ' + nn.toLocaleString();
  }
  var togComm = document.getElementById('tog-comm'), togHull = document.getElementById('tog-hull');

  if (togHull) togHull.addEventListener('change', function () { showHull = togHull.checked; draw(); });
  var togCName = document.getElementById('tog-cname');
  if (togCName) togCName.addEventListener('change', function () { showCName = togCName.checked; draw(); });
  ['formative', 'neologism'].forEach(function (layer) {
    var cb = document.getElementById('tog-' + layer);
    cb.addEventListener('change', function () { layerActive[layer] = cb.checked; refresh(false); });
  });

  // ── 필터 ────────────────────────────────────────────────────────────────
  var FACET_KEYS = ['year', 'ut', 'fm', 'cat', 'reg', 'status', 'comm'];
  var facetUI = {};
  function facetVal(n, key) { return key === 'comm' ? String(n.comm) : n[key]; }
  function facetTarget(key) { return key === 'status' ? 'schema' : 'neologism'; }

  function updateFacetCounts() {
    FACET_KEYS.forEach(function (key) {
      var ui = facetUI[key]; if (!ui) return;
      var counts = {};
      var target = facetTarget(key);
      allNodes.forEach(function (n) {
        if (n.type !== target) return;
        if (key === 'fm' && n.ut !== '단어') return;
        if (target === 'neologism') {
          for (var i = 0; i < FACET_KEYS.length; i++) {
            var k = FACET_KEYS[i]; if (k === key || k === 'status' || !facetSel[k]) continue;
            if (k === 'comm') { if (!facetSel.comm.has(String(n.comm))) return; continue; }
            if (k === 'fm') { if (n.ut !== '단어' || !facetSel.fm.has(n.fm)) return; }
            else if (!facetSel[k].has(facetVal(n, k))) return;
          }
          if (facetSel.usas) { var ok = false; for (var u = 0; u < n.usas.length; u++) if (facetSel.usas.has(n.usas[u])) { ok = true; break; } if (!ok) return; }
        }
        var v = facetVal(n, key); counts[v] = (counts[v] || 0) + 1;
      });
      ui.items.forEach(function (it) {
        var c = counts[it.cb.value] || 0;
        it.nEl.textContent = c.toLocaleString();
        it.label.style.display = c === 0 ? 'none' : '';
      });
    });
  }

  function closeFacets() { document.querySelectorAll('.facet.open').forEach(function (f) { f.classList.remove('open'); }); }
  document.addEventListener('click', closeFacets);

  document.querySelectorAll('.facet[data-key]:not(.facet-tree)').forEach(function (facet) {
    var key = facet.getAttribute('data-key');
    var head = facet.querySelector('.facet-head'), sum = facet.querySelector('.facet-sum');
    var allCb = facet.querySelector('.facet-all input');
    var items = Array.prototype.map.call(facet.querySelectorAll('.facet-list label:not(.facet-all)'), function (label) {
      return { label: label, cb: label.querySelector('input'), nEl: label.querySelector('.fc-n') };
    });
    var cbs = items.map(function (it) { return it.cb; });
    facetUI[key] = { items: items };
    head.addEventListener('click', function (e) { e.stopPropagation(); var was = facet.classList.contains('open'); closeFacets(); if (!was) facet.classList.add('open'); });
    facet.querySelector('.facet-list').addEventListener('click', function (e) { e.stopPropagation(); });
    function sync() {
      var checked = cbs.filter(function (cb) { return cb.checked; });
      allCb.checked = checked.length === cbs.length;
      allCb.indeterminate = checked.length > 0 && checked.length < cbs.length;
      if (checked.length === cbs.length) { facetSel[key] = null; sum.textContent = '전체'; sum.classList.remove('filtered'); }
      else {
        facetSel[key] = new Set(checked.map(function (cb) { return cb.value; }));
        sum.textContent = checked.length === 0 ? '없음' : (key === 'comm' ? checked.length + '개' : (checked.length <= 2 ? checked.map(function (cb) { return cb.value; }).join('·') : checked.length + '개'));
        sum.classList.add('filtered');
      }
      refresh(true);
    }
    allCb.addEventListener('change', function () { items.forEach(function (it) { if (it.label.style.display !== 'none') it.cb.checked = allCb.checked; }); sync(); });
    cbs.forEach(function (cb) { cb.addEventListener('change', sync); });
  });

  // USAS 트리 필터 (대→중→소; 선택 상태는 소범주 집합)
  (function initTree() {
    var facet = document.querySelector('.facet-tree[data-key="usas"]'); if (!facet) return;
    var head = facet.querySelector('.facet-head'), sum = facet.querySelector('.facet-sum');
    var allCb = facet.querySelector('.facet-all input');
    var leaves = Array.prototype.slice.call(facet.querySelectorAll('input.ft-leaf'));
    var majorCbs = Array.prototype.slice.call(facet.querySelectorAll('input.ft-cb[data-lv="major"]'));
    var midCbs = Array.prototype.slice.call(facet.querySelectorAll('input.ft-cb[data-lv="mid"]'));
    head.addEventListener('click', function (e) { e.stopPropagation(); var was = facet.classList.contains('open'); closeFacets(); if (!was) facet.classList.add('open'); });
    facet.querySelector('.facet-list').addEventListener('click', function (e) { e.stopPropagation(); });
    facet.querySelectorAll('.ft-tab').forEach(function (tab) {
      tab.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation();
        facet.querySelectorAll('.ft-tab').forEach(function (x) { x.classList.toggle('active', x === tab); });
        facet.querySelectorAll('.ft-pane').forEach(function (pn) { pn.classList.toggle('active', pn.getAttribute('data-lv') === tab.getAttribute('data-lv')); });
      });
    });
    function leavesUnder(cb) {
      var lv = cb.getAttribute('data-lv'), code = cb.value;
      return leaves.filter(function (l) { return lv === 'major' ? l.getAttribute('data-major') === code : l.getAttribute('data-mid') === code; });
    }
    function syncParents() {
      majorCbs.concat(midCbs).forEach(function (cb) {
        var ls = leavesUnder(cb), on = ls.filter(function (l) { return l.checked; }).length;
        cb.checked = ls.length > 0 && on === ls.length; cb.indeterminate = on > 0 && on < ls.length;
      });
      var on = leaves.filter(function (l) { return l.checked; }).length;
      allCb.checked = on === leaves.length; allCb.indeterminate = on > 0 && on < leaves.length;
      if (on === leaves.length) { facetSel.usas = null; sum.textContent = '전체'; sum.classList.remove('filtered'); }
      else {
        facetSel.usas = new Set(leaves.filter(function (l) { return l.checked; }).map(function (l) { return l.value; }));
        var majors = majorCbs.filter(function (c) { return c.checked || c.indeterminate; }).map(function (c) { return c.value; });
        sum.textContent = on === 0 ? '없음' : majors.length <= 3 ? majors.join('·') : on + '개';
        sum.classList.add('filtered');
      }
      refresh(true);
    }
    majorCbs.concat(midCbs).forEach(function (cb) {
      cb.addEventListener('change', function () { leavesUnder(cb).forEach(function (l) { l.checked = cb.checked; }); syncParents(); });
    });
    leaves.forEach(function (l) { l.addEventListener('change', syncParents); });
    allCb.addEventListener('change', function () { leaves.forEach(function (l) { l.checked = allCb.checked; }); syncParents(); });
  })();

  // ── 하단 바 ─────────────────────────────────────────────────────────────
  var bbContent = document.getElementById('bb-content');
  function renderBB(tab) {
    var items;
    if (tab === 'comm') {
      var h = '<div class="bb-list">';
      communities.slice().sort(function (a, b) { return b.n - a.n; }).forEach(function (cm) {
        h += '<span class="bb-item" data-cid="' + cm.id + '">' + cm.label.split(' · ').map(schemaHtml).join(' · ') + '<span class="bb-deg">' + cm.schemas + '·' + cm.neologisms + '</span></span>';
      });
      bbContent.innerHTML = h + '</div>';
      bbContent.querySelectorAll('.bb-item').forEach(function (el) {
        el.addEventListener('click', function () {
          var cm = commMap[el.getAttribute('data-cid')]; if (!cm) return;
          var tz = Math.min(3, Math.max(0.5, (Math.min(W, H) * 0.8) / (cm.r * 2.2)));
          d3.select(canvas).transition().duration(600).call(zoom.transform, d3.zoomIdentity.translate(W / 2 - cm.x * tz, H / 2 - cm.y * tz).scale(tz));
        });
      });
      return;
    }
    var groups = [], html = '';
    if (tab === 'schema') {
      items = allNodes.filter(function (n) { return n.type === 'schema'; }).sort(byN);
      var FMS = ['합성', '파생', '혼성', '축약', '구'];
      FMS.forEach(function (fm) { var g = items.filter(function (n) { return (n.fm || '합성') === fm; }); if (g.length) groups.push({ key: fm, color: FM_COLORS[fm], items: g }); });
    } else {
      items = allNodes.filter(function (n) { return n.type === 'neologism' && !n.schemas.length; });
      var years = {}; items.forEach(function (n) { (years[n.year] = years[n.year] || []).push(n); });
      Object.keys(years).sort().reverse().forEach(function (y) { groups.push({ key: y + '년', color: null, items: years[y].sort(byLabel) }); });
    }
    groups.forEach(function (g) {
      html += '<div class="bb-group"><div class="bb-group-h">' + (g.color ? '<i style="background:' + g.color + '"></i>' : '') + esc(g.key) + '<span class="bb-group-n">' + g.items.length + '</span></div><div class="bb-cols">';
      g.items.forEach(function (n) {
        html += '<div class="bb-item" data-nid="' + n.id + '"><span class="bb-lab">' + (tab === 'schema' ? schemaHtml(n.short || n.label) : esc(n.label) + (n.origin ? '<span class="origin">' + originHtml(n.origin) + '</span>' : '')) + '</span>' +
          (tab === 'schema' ? '<span class="bb-deg">' + (n.n || 0) + '</span>' : '') + '</div>';
      });
      html += '</div></div>';
    });
    bbContent.innerHTML = html;
    bbContent.querySelectorAll('.bb-item').forEach(function (el) {
      el.addEventListener('click', function () {
        var id = el.getAttribute('data-nid'), t = nodeMap[id];
        if (!t) { showHidden(id); return; }
        focusNode(t, true);
      });
    });
  }
  (function initBB() {
    var bar = document.getElementById('bottom-bar'), tg = document.getElementById('bb-toggle');
    document.getElementById('bb-header').addEventListener('click', function () { bar.classList.toggle('collapsed'); tg.textContent = bar.classList.contains('collapsed') ? '▲' : '▼'; });
    document.querySelectorAll('#bb-tabs .bb-tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        document.querySelectorAll('#bb-tabs .bb-tab').forEach(function (t) { t.classList.remove('active'); });
        tab.classList.add('active'); renderBB(tab.getAttribute('data-tab'));
      });
    });
  })();

  // ── 로드 ────────────────────────────────────────────────────────────────
  resize();
  fetch('graph-data.json').then(function (r) { return r.json(); }).then(function (data) {
    allNodes = data.nodes; allLinks = data.links; communities = data.communities || []; communities.forEach(function (c) { commMap[c.id] = c; });
    allNodes.forEach(function (n) { allNodeMap[n.id] = n; adj[n.id] = []; });
    allLinks.forEach(function (l) { adj[l.source].push({ other: l.target, link: l }); adj[l.target].push({ other: l.source, link: l }); });
    allLinks.forEach(function (l) { if (l.type === '사례화') (casesOf[l.target] = casesOf[l.target] || []).push(l.source); });
    Object.keys(casesOf).forEach(function (sid) { casesOf[sid].sort(function (a, b) { return (allNodeMap[b].nn || 0) - (allNodeMap[a].nn || 0); }); });
    updateFacetCounts();
    var v = computeVisible(); applyLayout(v.nodes, v.links); centerGraph(); draw();
    renderBB('schema'); updateMinNHint();
    var op = new URLSearchParams(location.search).get('open');
    if (op) { var fb = document.querySelector('.facet[data-key="' + op + '"]') || document.getElementById(op); if (fb) fb.classList.add('open'); }
    var q = new URLSearchParams(location.search).get('node');
    if (q && allNodeMap[q]) { if (nodeMap[q]) focusNode(nodeMap[q], false); else showHidden(q); }
  }).catch(function (err) { document.getElementById('loading').textContent = '데이터 로드 실패: ' + err.message; });

  // 검토·자동화용 훅 (화면 동작에는 영향 없음)
  window.__kno = {
    nodes: function () { return nodes; }, links: function () { return links; }, all: function () { return allNodes; },
    nodeMap: function () { return nodeMap; }, transform: function () { return transform; },
    focus: function (id, animate) { if (nodeMap[id]) focusNode(nodeMap[id], !!animate); else showHidden(id); return !!nodeMap[id]; },
    screen: function (id) { var n = nodeMap[id]; if (!n) return null; return { x: transform.applyX(n.x), y: transform.applyY(n.y), r: nodeRadius(n) * transform.k }; },
    setMinN: function (v) { minN = v; refresh(true); updateMinNHint(); },
    state: function () { return { minN: minN, hop: hopRange, layers: layerActive, facets: Object.keys(facetSel).filter(function (k) { return facetSel[k]; }), visible: nodes.length, links: links.length, focus: currentFocusNode ? currentFocusNode.id : null, simAlpha: sim ? sim.alpha() : 0 }; },
    settled: function () { return !sim || sim.alpha() <= sim.alphaMin(); }
  };
})();
