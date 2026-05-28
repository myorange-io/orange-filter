# 원격 stoplist (v1.5.6+)

이 디렉토리는 **확장 패키지에 포함되지 않습니다** — main 브랜치의 GitHub raw URL을 통해 사용자 확장이 직접 fetch합니다. CWS 검수 사이클을 거치지 않고 오탐 패턴을 핫픽스할 수 있게 하는 메커니즘입니다.

## URL

```
https://raw.githubusercontent.com/myorange-io/orange-filter/main/stoplists/remote-stoplist.json
```

## 새 오탐 보고가 왔을 때

1. `remote-stoplist.json` 열기
2. 해당 카테고리 배열에 단어 추가 (`stoplists.json`의 description 참고)
3. `version`을 `YYYY-MM-DD.N` 패턴으로 갱신 (그날의 N번째 갱신)
4. `updated`를 현재 ISO 8601 UTC로 갱신
5. main에 commit + push

사용자 확장은:
- 시작 시 fetch (12h cache 만료 후에만 재요청)
- 성공 시 `chrome.storage.local`에 캐싱 + 즉시 stoplist 적용
- 실패 시 캐시 사용 → 캐시 없으면 번들 default만 사용

## 카테고리 가이드

| 카테고리 | 매치 패턴 | 예시 |
|---|---|---|
| `name_bare` | 성(1자) + 이름(2자) = 3자 한국 이름 | `오렌지`, `이상한`(외래어/일반어 FP) |
| `name_2char` | 성(1자) + 이름(1자) = 2자, boundary 매치 | `김치`, `백서`(2자 일반어 FP, hintOnly 셀 한정) |
| `name_4char` | 성(1자) + 이름(3자) = 4자, 또는 복성(2자) + 이름(2자) = 4자 | `한국문화`, `남궁아무`(4자 일반어/조직 FP) |
| `dept_title` | 부서명·기능명 + 직책 lookahead → person_name 오탐 | `전략기획`(본부장 앞), `정보보안`(팀장 앞) |
| `roman_name` | 로마자 한국 성씨 + CamelCase | `KimUI`, `LeeAPI`(영문 약어 FP) |

## 검증

JSON 변경 후 로컬에서 검증:

```sh
# JSON 문법
node -e "JSON.parse(require('fs').readFileSync('stoplists/remote-stoplist.json','utf8'))"

# 스키마 검증 (옵션 — ajv-cli)
npx ajv-cli validate -s stoplists/schema.json -d stoplists/remote-stoplist.json
```

## 보안

- 변경은 PR + 리뷰 권장. main에 직접 push는 권한자만.
- v1에서는 SHA256 무결성 검증 없음. HTTPS + `myorange-io/orange-filter` repo 신뢰가 1차 방어.
- 악의적 stoplist 변조 → PII가 마스킹되지 않고 LLM에 전송될 위협. repo 권한 관리가 결정적.
- v2에서 서명 또는 release asset로 강화 가능.
