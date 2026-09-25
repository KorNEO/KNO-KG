/* 그래프 페이지 휴대폰 화면 (2026-09-25) — index.html·entity/index.html 공용. graph-mobile.css 와 짝.
   필터·표시 시트(단추·배경·머리), 정보 패널 손잡이(누르거나 밀면 반/전체), 활성 탭을 보이게 스크롤. */
(function () {
  'use strict';
  var MQ = window.matchMedia('(max-width: 760px), (max-height: 500px)');
  window.KNO_MOBILE = function () { return MQ.matches; };
  var container = document.getElementById('graph-container');
  var ctrl = document.getElementById('graph-controls-left');
  var panel = document.getElementById('info-panel');
  if (!container) return;

  // ── 필터·표시 시트 ──
  if (ctrl) {
    var btn = document.createElement('button');
    btn.id = 'm-ctrl-btn'; btn.type = 'button'; btn.setAttribute('aria-controls', 'graph-controls-left'); btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M2 4h12M4.5 8h7M7 12h2"/></svg>필터·표시<i class="m-dot"></i>';
    container.appendChild(btn);
    var backdrop = document.createElement('div'); backdrop.id = 'm-backdrop'; document.body.appendChild(backdrop);
    var head = document.createElement('div'); head.id = 'm-sheet-head';
    head.innerHTML = '<span>필터·표시</span><button type="button" aria-label="닫기">&times;</button>';
    ctrl.insertBefore(head, ctrl.firstChild);
    function setOpen(open) {
      document.body.classList.toggle('m-ctrl-open', open);
      btn.setAttribute('aria-expanded', String(open));
      if (!open) syncDot();
    }
    function syncDot() {
      var n = ctrl.querySelectorAll('.facet[data-key] .facet-sum.filtered').length;   // 스키마 임곗값(기본 ≥3)은 필터로 치지 않음
      btn.classList.toggle('has-filter', n > 0);
    }
    btn.addEventListener('click', function (e) { e.stopPropagation(); setOpen(!document.body.classList.contains('m-ctrl-open')); });
    backdrop.addEventListener('click', function () { setOpen(false); });
    head.querySelector('button').addEventListener('click', function (e) { e.stopPropagation(); setOpen(false); });
    ctrl.addEventListener('change', function () { setTimeout(syncDot, 0); });
    ctrl.addEventListener('click', function () { setTimeout(syncDot, 0); });
    MQ.addEventListener ? MQ.addEventListener('change', function () { if (!MQ.matches) setOpen(false); }) : 0;
    // ?open=… 으로 필터를 열고 들어오면 시트도 연다
    setTimeout(function () { if (MQ.matches && ctrl.querySelector('.facet.open')) setOpen(true); syncDot(); }, 1500);
    window.KNO_closeSheet = function () { setOpen(false); };
  }

  // ── 정보 패널 손잡이 ──
  if (panel) {
    var h = document.createElement('div'); h.className = 'm-handle'; h.setAttribute('role', 'button'); h.setAttribute('aria-label', '패널 크기 바꾸기');
    h.innerHTML = '<span></span>';
    panel.insertBefore(h, panel.firstChild);
    h.addEventListener('click', function () { panel.classList.toggle('m-expanded'); });
    var y0 = null;
    function start(e) { y0 = (e.touches ? e.touches[0] : e).clientY; }
    function end(e) {
      if (y0 == null) return;
      var dy = (e.changedTouches ? e.changedTouches[0] : e).clientY - y0; y0 = null;
      if (dy < -30) panel.classList.add('m-expanded');
      else if (dy > 30) { if (panel.classList.contains('m-expanded')) panel.classList.remove('m-expanded'); else { var c = document.getElementById('ip-close'); if (c) c.click(); } }
    }
    [h, panel.querySelector('.ip-header')].forEach(function (el) {
      if (!el) return;
      el.addEventListener('touchstart', start, { passive: true });
      el.addEventListener('touchend', end);
    });
    // 패널이 닫히면 반 높이로 되돌림
    // (classList.remove 는 클래스가 없어도 속성 변경 기록을 남기므로, 있을 때만 지운다 — 안 그러면 관찰자가 끝없이 돈다)
    new MutationObserver(function () { if (!panel.classList.contains('open') && panel.classList.contains('m-expanded')) panel.classList.remove('m-expanded'); })
      .observe(panel, { attributes: true, attributeFilter: ['class'] });
  }

  // ── 좁은 화면에서는 검색 안내문을 짧게 ──
  var gs = document.getElementById('graphSearch');
  if (gs) { var ph = gs.getAttribute('placeholder'); var setPh = function () { gs.setAttribute('placeholder', MQ.matches ? '검색' : ph); }; setPh(); if (MQ.addEventListener) MQ.addEventListener('change', setPh); }

  // ── 활성 탭이 보이게 ──
  var act = document.querySelector('#header .graph-tab.is-active');
  if (act && MQ.matches && act.scrollIntoView) { try { act.scrollIntoView({ block: 'nearest', inline: 'center' }); } catch (e) {} window.scrollTo(0, 0); }
})();
