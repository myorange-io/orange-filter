# Button System Design Rules
> MyOrange Design System 기준으로 작성된 버튼 컴포넌트 완전 명세서입니다.

---

## 1. 핵심 원칙

- 버튼 내 텍스트는 **항상 가운데 정렬**
- Height / Width는 **가변** (고정 width 없음, 콘텐츠/레이아웃에 맞게 조정)
- 폼 필드와 나란히 배치 시, 필드와 **동일한 width + border 두께** 적용
- 모든 버튼의 border-radius는 **8px** 고정
- 폰트 패밀리: **Pretendard** 단일 사용

---

## 2. 버튼 타입 체계

```
Button
├── Solid/Primary       → 채워진 배경, 최우선 CTA
├── Outlined/Primary    → 테두리만, 주요 보조 액션
├── Outlined/Assistive  → 테두리만, 중립적 보조 액션
└── Text/Primary        → 배경·테두리 없음, 인라인 소형 액션
```

---

## 3. 타이포그래피 명세

버튼 사이즈별 폰트는 **Body** 스케일의 Medium weight를 사용합니다.

| 버튼 사이즈 | 타이포 토큰 | Font Size | Line Height | Weight |
|------------|------------|-----------|-------------|--------|
| Large      | Body/M/Medium | 16px   | 26px        | 500    |
| Medium     | Body/S/Medium | 14px   | 22px        | 500    |
| Small      | Body/XS/Medium | 12px  | 18px        | 500    |

> ⚠️ **이전 시스템과 line-height 변경됨**  
> Large: 24px → **26px** / Medium: 20px → **22px** / Small: 16px → **18px**  
> 이로 인해 동일 padding 기준 버튼 높이가 변경됩니다 (아래 사이즈 섹션 참고).

---

## 4. 사이즈 명세

> 높이 = 상하 padding × 2 + line-height

### 4-1. Solid/Primary

| 사이즈 | Height | Padding (상하 / 좌우) | 타이포 토큰 |
|--------|--------|-----------------------|------------|
| Large  | **50px** | 12px / 28px         | Body/M/Medium |
| Medium | **42px** | 10px / 28px         | Body/S/Medium |
| Small  | **34px** | 8px / 20px          | Body/XS/Medium |

### 4-2. Outlined/Primary

| 사이즈 | Height | Padding (상하 / 좌우) | 타이포 토큰 |
|--------|--------|-----------------------|------------|
| Large  | **50px** | 12px / 28px         | Body/M/Medium |
| Medium | **42px** | 10px / 28px         | Body/S/Medium |
| Small  | **38px** | 10px / 16px         | Body/XS/Medium |

> ⚠️ Outlined/Primary Small은 상하 패딩이 **10px**으로 다른 타입 Small(8px)과 다릅니다.

### 4-3. Outlined/Assistive

| 사이즈 | Height | Padding (상하 / 좌우) | 타이포 토큰 |
|--------|--------|-----------------------|------------|
| Large  | **50px** | 12px / 28px         | Body/M/Medium |
| Medium | **42px** | 10px / 28px         | Body/S/Medium |
| Small  | **34px** | 8px / 16px          | Body/XS/Medium |

### 4-4. Text/Primary

| Padding (상하 / 좌우) | 타이포 토큰 |
|-----------------------|------------|
| 4px / 8px             | Body/XS/Medium |

---

## 5. 인터랙션 상태 정의

| 상태 | 의미 | 지원 타입 |
|------|------|-----------|
| `Normal`   | 기본 활성 상태 | Solid, Outlined/Primary, Outlined/Assistive |
| `Hovered`  | 마우스 오버 상태 | Solid, Outlined/Primary, Outlined/Assistive, Text |
| `Default`  | 비활성/선택 해제 상태 | Solid, Outlined/Assistive, Text |
| `Disabled` | 비활성화, 클릭 불가 | Solid, Outlined/Primary, Outlined/Assistive |

---

## 6. 색상 명세 (새 디자인 토큰 기준)

### 6-1. Solid/Primary

| 상태     | background                        | text                              |
|----------|-----------------------------------|-----------------------------------|
| Normal   | `Primary_Orange/700` **#FF6F1F**  | `Text/Inverse/Normal` **#FAFAFA** |
| Hovered  | `Primary_Orange/900` **#E65317**  | `Text/Inverse/Normal` **#FAFAFA** |
| Default  | `neutral_gray/300` **#D4D4D4**    | `Text/Inverse/Normal` **#FAFAFA** |
| Disabled | `neutral_gray/200` **#E5E5E5**    | `Text/Neutral/Disabled` **#A3A3A3** |

> Default 상태: 배경은 회색이지만 텍스트는 **여전히 Inverse/Normal(#FAFAFA)** 사용.

### 6-2. Outlined/Primary

| 상태     | background                              | border                             | text                              |
|----------|-----------------------------------------|------------------------------------|-----------------------------------|
| Normal   | `neutral_gray/50` **#FAFAFA**           | `Primary_Orange/700` **#FF6F1F**   | `Text/Accent/Orange` **#FF5F1A**  |
| Hovered  | `Primary_Orange/100` **#FFF2E7**        | `Primary_Orange/700` **#FF6F1F**   | `Text/Accent/Orange` **#FF5F1A**  |
| Disabled | `neutral_gray/100` **#F0F0F0**          | `neutral_gray/200` **#E5E5E5**     | `Text/Neutral/Disabled` **#A3A3A3** |

> Outlined/Primary에는 `Default` 상태가 **없습니다**.

### 6-3. Outlined/Assistive

| 상태     | background                    | border                              | text                                |
|----------|-------------------------------|-------------------------------------|-------------------------------------|
| Normal   | `neutral_gray/50` **#FAFAFA** | `neutral_gray/300` **#D4D4D4**      | `Text/Neutral/Alternative` **#404040** |
| Hovered  | `neutral_gray/50` **#FAFAFA** | `neutral_gray/700` **#404040**      | `Text/Neutral/Alternative` **#404040** |
| Default  | `neutral_gray/50` **#FAFAFA** | `neutral_gray/300` **#D4D4D4**      | `Text/Neutral/Assistive` **#737373**   |
| Disabled | `neutral_gray/50` **#FAFAFA** | `neutral_gray/200` **#E5E5E5**      | `Text/Neutral/Disabled` **#A3A3A3**    |

> Hovered 상태: 배경은 그대로, **border만 진해집니다** (#D4D4D4 → #404040).

### 6-4. Text/Primary

| 상태    | background                          | text                                   |
|---------|-------------------------------------|----------------------------------------|
| Default | transparent                         | `Text/Neutral/Disabled` **#A3A3A3**    |
| Hover   | `neutral_gray/100` **#F0F0F0**      | `Text/Neutral/Alternative` **#404040** |

---

## 7. 아이콘 버튼 변형 (Icon variant)

### Solid/Primary + Icon (Large only)

```
레이아웃: [텍스트] [→ 아이콘]
gap: 4px
아이콘 크기: 20 × 20px
아이콘 위치: 텍스트 오른쪽
회전: rotate(180deg) 적용
배경/패딩: Normal 상태와 동일
```

### Outlined/Primary + Icon (Large only)

```
레이아웃: [텍스트] [↓ 아이콘]
gap: 8px
아이콘 크기: 24 × 24px (다운로드 아이콘)
아이콘 위치: 텍스트 오른쪽
회전: rotate(180deg) 적용
배경/패딩: Normal 상태와 동일
```

> 아이콘 변형은 두 타입 모두 **Large 사이즈 + Normal 상태**에만 존재합니다.

---

## 8. 디자인 토큰 참조표 (버튼 전용)

### 사용된 Color Primitives

| 토큰 | Hex | 사용처 |
|------|-----|--------|
| `Primary_Orange/700` | #FF6F1F | Solid Normal bg, Outlined/Primary border |
| `Primary_Orange/800` | #FF5F1A | Outlined/Primary text (Text/Accent/Orange) |
| `Primary_Orange/900` | #E65317 | Solid Hovered bg |
| `Primary_Orange/100` | #FFF2E7 | Outlined/Primary Hovered bg |
| `neutral_gray/50`    | #FAFAFA | 버튼 기본 배경, Inverse text |
| `neutral_gray/100`   | #F0F0F0 | Outlined Disabled bg, Text Hover bg |
| `neutral_gray/200`   | #E5E5E5 | Solid Disabled bg, Disabled border |
| `neutral_gray/300`   | #D4D4D4 | Solid Default bg, Assistive border |
| `neutral_gray/400`   | #A3A3A3 | Disabled text (Text/Neutral/Disabled) |
| `neutral_gray/500`   | #737373 | Assistive Default text (Text/Neutral/Assistive) |
| `neutral_gray/700`   | #404040 | Assistive Normal/Hovered text & border |

### 사용된 Semantic Tokens

| Semantic Token | Primitive | Hex | 사용처 |
|----------------|-----------|-----|--------|
| `Text/Inverse/Normal` | neutral_gray/50 | #FAFAFA | Solid 버튼 텍스트 (활성) |
| `Text/Neutral/Disabled` | neutral_gray/400 | #A3A3A3 | 모든 Disabled 텍스트 |
| `Text/Neutral/Assistive` | neutral_gray/500 | #737373 | Assistive Default 텍스트 |
| `Text/Neutral/Alternative` | neutral_gray/700 | #404040 | Assistive Normal/Hover 텍스트 |
| `Text/Accent/Orange` | Primary_Orange/800 | #FF5F1A | Outlined/Primary 텍스트 |

---

## 9. 타입 × 사이즈 × 상태 지원 매트릭스

|                    | Large | Medium | Small | Normal | Hovered | Default | Disabled | Icon |
|--------------------|:-----:|:------:|:-----:|:------:|:-------:|:-------:|:--------:|:----:|
| Solid/Primary      |  ✓   |   ✓   |  ✓   |   ✓   |    ✓   |    ✓   |    ✓    | ✓ (Large only) |
| Outlined/Primary   |  ✓   |   ✓   |  ✓   |   ✓   |    ✓   |    —   |    ✓    | ✓ (Large only) |
| Outlined/Assistive |  ✓   |   ✓   |  ✓   |   ✓   |    ✓   |    ✓   |    ✓    |  —  |
| Text/Primary       |  —   |   —   |  ✓   |   —   |    ✓   |    ✓   |    —    |  —  |

---

## 10. 컴포넌트 Props 구조 (프레임워크 무관 추상 명세)

```typescript
type SolidPrimaryButton = {
  size: 'large' | 'medium' | 'small'
  interaction: 'normal' | 'hovered' | 'default' | 'disabled'
  style: 'filled' | 'icon'
  label: string
  icon?: ReactNode  // style='icon'일 때만
}

type OutlinedPrimaryButton = {
  size: 'large' | 'medium' | 'small'
  interaction: 'normal' | 'hovered' | 'disabled'  // default 없음
  style: 'outlined' | 'icon'
  label: string
  icon?: ReactNode  // style='icon'일 때만
}

type OutlinedAssistiveButton = {
  size: 'large' | 'medium' | 'small'
  interaction: 'normal' | 'hovered' | 'default' | 'disabled'
  label: string
}

type TextPrimaryButton = {
  interaction: 'default' | 'hover'
  label: string
}
```

---

## 11. 엣지 케이스 & 주의사항

1. **Hovered 색상이 토큰화됨**: 이전 시스템에서 하드코딩(#e56b00)이었던 Solid Hovered 배경색이 `Primary_Orange/900 #E65317`로 토큰 체계에 편입됩니다.

2. **Outlined/Primary Small 높이 예외**: 상하 패딩이 **10px**으로 다른 타입의 Small(8px)과 달라 높이가 38px입니다 (다른 Small은 34px).

3. **Inverse 텍스트 색이 순백색이 아님**: `Text/Inverse/Normal`은 `#FAFAFA`(neutral_gray/50)로 순백색(#ffffff)과 미세하게 다릅니다.

4. **Default vs Disabled 의미 구분**:
   - `Default`: 아직 인터랙션이 발생하지 않은 초기 비활성 상태. 클릭 가능할 수 있음.
   - `Disabled`: 조건 미충족으로 클릭 자체가 불가한 상태. `pointer-events: none` 처리 필요.

5. **width는 가변**: 피그마 예시 width(320px)는 시연용이며 실제 구현 시 `width: fit-content` 또는 부모에 맞게 stretch.

6. **Outlined/Assistive 이전 시스템 불일치 해소**: 이전 Large Disabled 텍스트만 `#c4c4c4`(gray/550)으로 다른 사이즈와 달랐던 문제가 새 시스템에서 `Text/Neutral/Disabled #A3A3A3`으로 통일됩니다.
