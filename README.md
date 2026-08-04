# cards — 멀티 토픽 카드뉴스 자동화

하나의 엔진으로 **3개의 인스타그램 계정**을 매일 자동 운영하는 파이프라인.

| 토픽 | 내용 | 테마 | 외부 이미지 |
|---|---|---|---|
| `ani` | 애니 최신·명작 정보 | 바이올렛 | 공식 커버 아트 + 출처 표기 |
| `tech` | 개발·AI 뉴스, 리포, 개념 | 시안 | 없음 (타이포 중심) |
| `growth` | 명언·책·습관·마인드셋 | 앰버 | 없음 (타이포 중심) |

```
plan(요일→타입) → fetch(토픽별 소스) → write(Claude→슬라이드 JSON)
→ render(Playwright→1080x1350, 토픽 테마) → deliver(review: GitHub Issue │ auto: IG API)
→ ledger(토픽별 posts.json)
```

- **인프라 $0**: GitHub Actions 크론 + public repo raw URL = IG 이미지 호스팅
- **비용**: Claude API 토픽당 일 1회 ≈ $0.07 → 3토픽 월 $5~6
- **모드**: 토픽별로 `review`(초안 이슈 → 사람이 업로드) / `auto`(IG API 자동 발행) 독립 설정

## 주간 캘린더

| | 월 | 화 | 수 | 목 | 금 | 토 | 일 |
|---|---|---|---|---|---|---|---|
| **ani** | 주간 인기 | 명작 추천 | 뉴스¹ | 명대사 | 신작² | 정주행 | 방영 일정 |
| **tech** | 주간 HN¹ | 깃허브 리포 | AI 뉴스¹ | 개념 정리 | 개발 도구 | 깃허브 리포 | 개발자 명언 |
| **growth** | 명언 | 책 소개 | 습관 | 마인드셋 | 명언 | 책 소개 | 습관 |

¹ 뉴스류는 오보 리스크 때문에 auto 모드에서도 항상 리뷰. ² 1/4/7/10월 첫 금요일은 분기 라인업 스페셜.

## 로컬 사용법

```bash
npm install && npx playwright install chromium

npx tsx src/run.ts --topic ani                          # 오늘자 생성 (ANTHROPIC_API_KEY 필요)
npx tsx src/run.ts --topic tech --type repos --fixture  # Claude 없이 파이프라인 테스트
npx tsx src/run.ts --topic growth --sample              # 샘플 렌더 (growth 테마 확인)
npx tsx src/run.ts --publish --topic ani --dry-run      # 발행 리허설
```

디자인 확인: `template/card.html?demo=item&theme=tech`를 브라우저로 직접 열기
(`demo`: cover/item/quote/news/schedule/outro, `theme`: 생략=ani, tech, growth)

## 일회성 설정 체크리스트

### 1단계 — 리뷰 모드 운영 (계정 오픈, 토픽별로 진행 가능)

1. **GitHub public repo 생성 후 push** (public이어야 raw URL이 IG 이미지 호스팅으로 동작)
2. Secrets: `ANTHROPIC_API_KEY` — [console.anthropic.com](https://console.anthropic.com), 크레딧 충전 (**Claude 구독과 별개**)
3. Variables(선택): `BRAND_ANI`/`BRAND_TECH`/`BRAND_GROWTH` (계정명), `PUBLISH_MODE_<토픽>`(기본 review)
4. **인용 뱅크 검수** — 오인용 방지의 핵심 관문. 원문 확인 후 맞는 항목만 `"verified": true`:
   - [data/ani/quotes.json](data/ani/quotes.json) 애니 명대사 40개
   - [data/tech/devquotes.json](data/tech/devquotes.json) 개발자 명언 18개
   - [data/growth/quotes.json](data/growth/quotes.json) 동기부여 명언 27개
   - 미검수 인용이 걸린 날은 자동으로 리뷰 모드가 됩니다.
5. GitHub 모바일 앱 + 이슈 알림 켜기
6. Actions → `daily-post` → Run workflow → 토픽별 초안 이슈 확인 → 수동 업로드로 계정 오픈

### 2단계 — 자동 발행 전환 (토픽별 독립)

1. 해당 인스타 계정을 **프로페셔널(크리에이터)** 로 전환
2. [developers.facebook.com](https://developers.facebook.com) → 앱 생성 → **"Instagram API with Instagram Login"** 제품 추가 (Facebook 페이지 불필요). 계정 3개면 앱 하나에 테스터 3계정 등록
3. 각 계정을 **Instagram Tester**로 추가 → IG 앱에서 초대 수락 (본인 계정이므로 앱 심사 불필요)
4. 계정별 **장기 토큰(60일)** + **User ID** 발급
5. Secrets: `IG_ACCESS_TOKEN_ANI`/`IG_USER_ID_ANI` (tech·growth 동일 패턴)
6. **fine-grained PAT**(이 repo, Secrets R/W) → `GH_PAT` + PAT 만료 캘린더 리마인더
7. Variables: `PUBLISH_MODE_ANI=auto` 등 토픽별 전환
8. 검증: `--dry-run` → 실발행 1건 → 재실행 skip 확인

> 권장: 각 토픽 auto 전환 전 2주는 review로 운영하며 카피 품질 확인.

## 운영

- **초안 반려**: 이슈만 닫으면 끝. 소재는 ledger에 기록되어 재등장하지 않습니다.
- **재실행**: Run workflow — 세 토픽 모두 돌지만 이미 생성된 토픽은 즉시 skip(멱등). 특정 토픽에 type/mode를 강제하려면 `topic` 입력 지정.
- **토큰**: `refresh-ig-tokens`가 매주 월요일 설정된 토큰만 갱신(미설정 토픽은 무해 skip).
- **writer 실패**: 픽스처 초안 + 리뷰 강등으로 하루가 비지 않습니다.
- **소재 뱅크 보충**: tech/growth 뱅크(concepts·tools·books·habits·mindsets)는 소진되면 재순환합니다. 새 항목은 JSON에 추가만 하면 됩니다.

## 저작권 정책

- **ani**: 각 작품 공식 커버 아트만 사용(본편 프레임 캡처 금지), 전 캡션 출처 문구 코드 강제, **권리자 요청 시 즉시 삭제**(게시물 + `git rm`, 필요시 히스토리 재작성). 홍보 인용 관행의 그레이존임을 인지하고 운영.
- **tech/growth**: 외부 이미지 미사용, 뉴스는 헤드라인·요약 수준 인용 + 출처 표기. 책 표지 미사용(알라딘 API 연동은 v2 옵션).
- 인용문은 `verified` 검수 체계로 오인용 방지.

## 구조

```
src/
  run.ts            엔트리 (--topic ani|tech|growth, generate│--publish│--review│--sample)
  topics/
    types.ts        Topic 인터페이스 (calendar·guides·prepare·fixture·theme)
    ani.ts          AniList·ANN 기반 애니 팩
    tech.ts         HN·GitHub·RSS 기반 테크 팩
    growth.ts       로컬 뱅크 기반 자기계발 팩
  write.ts          공통 writer (Claude structured outputs + 원문 강제·imageKey 검증)
  render.ts         Playwright → JPEG (토픽 테마 주입)
  publish.ts        IG Graph API (토픽별 토큰, 멱등)
  review.ts         초안 이슈 생성 ([초안][토픽] 중복 방지)
  ledger.ts         data/<topic>/posts.json (recent30·전체 dedup 뷰)
  banks.ts          범용 뱅크 로더 + verified 인용 선택
  anilist.ts / news.ts / hn.ts / github-api.ts / rss.ts   데이터 소스
template/card.html  카드 디자인 전부 (?demo=<kind>&theme=<topic>)
data/<topic>/       소재 뱅크 + posts.json ledger
out/<topic>/<날짜>/ 01..NN.jpg · draft.json · caption.txt (커밋됨 = 이미지 호스팅)
```
