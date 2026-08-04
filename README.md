# ani-cards

애니 최신 정보·명작 정보를 매일 카드뉴스로 만들어 인스타그램에 발행하는 자동화 파이프라인.

```
plan(요일→타입) → fetch(AniList/ANN RSS/소재뱅크) → write(Claude→슬라이드 JSON)
→ render(Playwright→1080x1350 JPEG) → deliver(review: GitHub Issue │ auto: IG API)
→ ledger(posts.json)
```

- **인프라 $0**: GitHub Actions 크론 + public repo raw URL을 IG 이미지 호스팅으로 사용
- **비용**: Claude API 일 1회 ≈ $0.07 (월 $1~2)
- **모드 2가지**: `review`(초안 이슈 생성 → 사람이 업로드) / `auto`(IG API 완전 자동 발행)

## 주간 캘린더

| 월 | 화 | 수 | 목 | 금 | 토 | 일 |
|---|---|---|---|---|---|---|
| 주간 인기 TOP5 | 명작 추천 | 뉴스 다이제스트 | 명대사 | 신작 스포트라이트¹ | 정주행 추천 | 방영 일정 |

¹ 1/4/7/10월 첫 금요일은 분기 신작 라인업 스페셜.
**news는 오보 리스크 때문에 auto 모드에서도 항상 리뷰**(`TYPE_MODE_OVERRIDES`).

## 로컬 사용법

```bash
npm install && npx playwright install chromium

npm run render                                # 샘플 4장 렌더 → out/sample/
npx tsx src/run.ts                            # 오늘자 생성 (ANTHROPIC_API_KEY 필요)
npx tsx src/run.ts --type quote --fixture     # Claude 없이 픽스처로 파이프라인 테스트
npx tsx src/run.ts --publish --date 2026-08-05 --dry-run   # 발행 리허설
```

디자인 수정: `template/card.html?demo=item` 처럼 브라우저로 직접 열어 확인
(`demo` 값: cover / item / quote / news / schedule / outro)

## 일회성 설정 체크리스트

### 1단계 — 리뷰 모드 운영 (계정 오픈)

1. **GitHub public repo 생성 후 push** (public이어야 raw URL이 IG 이미지 호스팅으로 동작)
2. repo **Secrets**: `ANTHROPIC_API_KEY` — [console.anthropic.com](https://console.anthropic.com)에서 발급, 크레딧 $5 충전 (**Claude 구독과 별개**)
3. repo **Variables**(선택): `BRAND`(기본 ANI·CARDS), `PUBLISH_MODE`(기본 review)
4. **quotes 검수**: [data/quotes.json](data/quotes.json)의 대사 원문·화자·표기를 확인하고 맞는 항목만 `"verified": true`로 변경 — 오인용 방지의 핵심 관문. 미검수 인용이 걸린 날은 자동으로 리뷰 모드가 됩니다.
5. GitHub 모바일 앱 설치 + 이 repo 이슈 알림 켜기
6. Actions 탭에서 `daily-post` → **Run workflow**로 첫 실행 → 이슈로 온 초안을 확인하고 수동 업로드

### 2단계 — 자동 발행 전환

1. 인스타그램 계정을 **프로페셔널(크리에이터)** 로 전환 (IG 앱 설정)
2. [developers.facebook.com](https://developers.facebook.com) → 앱 생성 → **"Instagram API with Instagram Login"** 제품 추가 (Facebook 페이지 불필요)
3. 앱 대시보드에서 본인 IG 계정을 **Instagram Tester**로 추가 → IG 앱 설정(앱 및 웹사이트)에서 초대 수락. 본인 계정만 쓰므로 앱 심사 불필요
4. API setup 화면에서 **장기 액세스 토큰(60일)** 발급 + **IG User ID** 확인
5. repo Secrets: `IG_ACCESS_TOKEN`, `IG_USER_ID`
6. **fine-grained PAT** 생성(이 repo 한정, Repository permissions → Secrets: Read and write) → Secret `GH_PAT` 등록. PAT 만료일(최대 1년)을 캘린더에 리마인더로
7. repo Variables: `PUBLISH_MODE=auto`
8. 검증 순서: `--dry-run` 로그 확인 → 정규 포스트 1건 발행 → 같은 날 재실행 시 skip 확인

> 권장: auto 전환 후에도 첫 2주는 `PUBLISH_MODE=review`로 두고 한국어 제목·카피 품질을 확인한 뒤 전환하세요.

## 운영

- **초안 반려**: 이슈만 닫으면 됩니다. 소재는 이미 ledger에 기록되어 재등장하지 않습니다.
- **하루 재실행**: `workflow_dispatch` — 이미 생성된 날은 자동 skip(멱등). 발행 실패 시 재실행하면 발행 단계만 다시 시도합니다.
- **토큰**: `refresh-token.yml`이 매주 월요일 자동 갱신(60일 토큰 × 주 1회 = 8주 버퍼). 실패 시 Actions 실패 메일이 옵니다. 완전 만료 시 2단계-4를 다시 수행하세요.
- **writer 실패**: 자동으로 픽스처 초안 + 리뷰 모드로 강등되어 하루가 비지 않습니다.
- **AniList 장애**: quote 타입은 로컬 뱅크만 사용하므로, 필요 시 `--type quote`로 수동 실행해 하루를 채울 수 있습니다.

## 저작권 정책

- 카드에는 **각 작품의 공식 커버 아트**(AniList 제공)만 사용하고, 모든 캡션에 출처 문구를 코드 레벨에서 강제로 붙입니다(`ATTRIBUTION_FOOTER`).
- 본편 프레임 캡처는 사용하지 않습니다(명대사 카드는 타이포그래피 중심).
- **권리자 삭제 요청 시 즉시 삭제합니다.** 해당 게시물 삭제 + repo에서 `git rm` 후, 필요하면 히스토리 재작성(`git filter-repo`)으로 완전 제거합니다.
- 홍보 인용 관행에 기대는 그레이존임을 인지하고 운영합니다. 신고가 누적되면 계정 제재 가능성이 있습니다.

## 구조

```
src/
  run.ts      엔트리 (generate │ --publish │ --review │ --sample)
  config.ts   캘린더·라벨·모드 오버라이드·출처 문구
  plan.ts     KST 날짜→타입, 분기 스페셜, 시즌 계산
  fetch.ts    타입별 데이터 준비 (payload + 이미지 + dedup 기록)
  anilist.ts  GraphQL 5종 + 커버 다운로드(base64) + 429 재시도
  news.ts     ANN RSS (Anime/Korean 카테고리, 최근 7일)
  quotes.ts   명대사/명작 뱅크 로더·선택
  write.ts    Claude structured outputs writer (+원문 강제·imageKey 검증)
  fixture.ts  Claude 없이 결정적 초안 (테스트/장애 대체)
  render.ts   Playwright → JPEG
  publish.ts  IG Graph API (컨테이너→폴링→캐러셀→발행, 멱등)
  review.ts   초안 GitHub Issue 생성 (중복 방지)
  ledger.ts   posts.json (dedup·발행 기록)
template/card.html   카드 디자인 전부 (?demo=<kind>로 미리보기)
data/                quotes.json · classics.json · posts.json
out/YYYY-MM-DD/      01..NN.jpg · draft.json · caption.txt (커밋됨 = IG 이미지 호스팅)
```
