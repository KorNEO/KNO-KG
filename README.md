# 스키마-사례 그래프 사이트 (KNO-KG_v1.2/site)

한국어 신어 2012-2025의 스키마 단위 지식 그래프를 v1.1 구성 성분 그래프 디자인으로 만든 정적 사이트. 이 폴더가 배포 단위(GitHub Pages)다.

- `index.html` — 스키마-사례 그래프 (canvas + D3 zoom). 노드 3종(스키마·형성소·신어), 링크 5종(사례화·고정항·구성·하위·병렬). 왼쪽 필터(수집 연도·단어/구·조어법·의미 범주·USAS 대/중/소·스키마 상태·우리말샘 등재), 표시 층 토글(형성소·신어), 연결 단계 1·2·3차, 오른쪽 정보 패널, 하단 목록(스키마·형성소·미귀속 신어). `?node=S000001` 로 열면 그 노드가 선택된다.
- `list.html` — 스키마·신어·형성소 목록(탭·검색). `?tab=neologism&filter=고립` 은 스키마 미귀속 신어만.
- `id/{KN…,S…,F…}.html` — 항목 페이지 + `.ttl`(kno-components.ttl 발췌). JSON-LD 파일은 두지 않는다(2026-09-24).
- `dashboard.html` — 정량 요약 대시보드(`tools/build_dashboard.py`, 표는 `master/논문_표/*.tsv`).
- `graph-data.json` — 노드·링크·필터·좌표. `assets/` — graph.css·graph.js·style.css.

## 빌드

```
cd KNO-KG_v1.2
python -X utf8 tools/build_schema_site.py            # 전체 (레이아웃 ~2분 + 페이지 ~15,000개)
python -X utf8 tools/build_schema_site.py --no-pages # 그래프·목록만
python -X utf8 tools/build_schema_site.py --no-layout --only=KN2012-0001,S000001   # 좌표 유지, 일부 페이지만
python -X utf8 -m pytest tests/test_schema_site.py -q
python -m http.server 8765 --directory site          # 로컬 확인 (fetch 때문에 file:// 로는 안 열림)

# 분석 → 그림 → 대시보드 (마스터에 열 추가)
python -X utf8 schema/freq/count_from_cache.py && python -X utf8 schema/productivity.py
python -X utf8 schema/analysis.py && python -X utf8 schema/urimal_defs.py && python -X utf8 schema/build_v18.py
python -X utf8 schema/build_graph.py && python -X utf8 tools/figures.py && python -X utf8 tools/build_dashboard.py
```

입력: `master/KNO_DATASET_2012-2025_v1.8.xlsx`(v1.7 = 도식 귀납, v1.8 = + 말뭉치·분석), `graphs/kno-components.ttl`, `master/USAS_태그_체계.md`, `tools/schema_site/usas_ko.json`.
코드: `tools/build_schema_site.py`(데이터·레이아웃), `tools/render_schema_site.py`(HTML·TTL), `tools/schema_site/`(템플릿·CSS·JS).

레이아웃: 스키마 + 고정항 형성소 + 하위·병렬·고정항 링크로 핵 그래프를 spring 배치 → 신어는 귀속 스키마 주위 원반 → 슬롯 채움 형성소는 자기 신어 무게중심 → 스키마 없는 덩어리는 오른쪽 아래 별도 배치 → 겹침 해소.

말뭉치 빈도는 마스터에 `corpus_freq` 시트(IDX·말뭉치·연도·token·document)가 생기면 신어 페이지 "말뭉치 빈도" 카드에 자동으로 실린다.

## 배포

`site/` 를 GitHub Pages 저장소로 push (v1.1 처럼 `.nojekyll` 포함). v1.1 사이트(korneo.github.io/KNO-KG)와의 탭 통합은 아직 하지 않았다.


## 배포 (2026-09-24)

- 배포 저장소 = `KNO-KG_v1.1/site` (github.com/KorNEO/KNO-KG). 루트가 이 사이트, `entity/`가 이전 v1.1 그래프(개체명 공동 출현·감정 용언 공기).
- `python -X utf8 tools/rebuild.py deploy --only` 또는 `python -X utf8 tools/deploy_to_kg.py` 로 이 폴더를 저장소 루트에 동기화한 뒤, 저장소에서 `git add -A && git commit && git push`.
- 백업: 브랜치 `backup/v1.1-2026-09-24`, 태그 `before-schema-2026-09-24`.


## 휴대폰 화면 (2026-09-25)

- 그래프 페이지: `assets/graph-mobile.{css,js}` (폭 760px 이하·높이 500px 이하). 헤더 2줄(로고+검색 / 탭 가로 밀기), 필터·표시는 아래 시트(「필터·표시」 단추), 정보 패널은 아래 시트(손잡이를 누르거나 밀면 반↔전체, 아래로 밀면 닫힘), 휴대폰 가로에서는 옆 패널. 캔버스는 2배 해상도까지만, 터치는 넓게 판정, 툴팁 대신 패널.
- 이전 v1.1 그래프(`entity/index.html`)도 같은 파일을 쓴다: `tools/deploy_to_kg.py` 가 `tools/entity_mobile.py` 로 태그 두 줄을 넣는다.
- 항목 페이지: 연결 그래프는 휴대폰에서 세로형 그림(`svg.g-tall`), 여러 열 표는 가로로 밀기(가장자리 그림자), 속성 표는 이름 위·값 아래, 한자 원어처럼 긴 낱말은 줄 바꿈.
- 목록: 휴대폰에서 카드(첫 칸 제목 + '이름 값'), 정렬은 선택 상자.
- 자산 링크에 내용 해시(`?v=`)를 붙여 바뀐 파일만 캐시를 새로 받는다. TTL 은 트리플 순서를 고정해 빌드마다 바뀌지 않는다.

점검:
```
python -X utf8 tools/preview_server.py 8765                # 배포 구조 그대로(entity/ 포함) 미리 보기; 휴대폰 실기기는 --host=0.0.0.0
python -X utf8 tools/site_qa.py --out=DIR                   # 기기 7종 × Chrome·WebKit 스크린샷 + 자동 검사(가로 넘침·잘림·어절 쪼개짐·작은 글자·작은 터치)
python -X utf8 tools/site_qa_flow.py --out=DIR              # 휴대폰·WebKit·가로·데스크톱에서 단추·필터·노드·패널·목록·검색·탭을 차례로 눌러 봄
```
(Playwright 필요: `pip install playwright && python -m playwright install webkit`. Windows 용 WebKit 은 가변 글꼴 굵기를 적용하지 않아 굵은 글자가 가늘게 보이는데, 실제 iOS Safari 에서는 정상이다.)
