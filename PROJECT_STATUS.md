# 손짓 (SignBridge) — 기획 및 구현 현황

> 이 문서는 통합본(`DONRAJI/sign-language-translato`, main) 기준으로
> **원래 만들려던 것**과 **지금 실제로 있는 것**의 차이를 정리한 것입니다.
> 모든 항목은 저장소 코드를 직접 확인해 작성했으며, 근거 위치를 함께 적었습니다.
>
> 작성 시점: 2026-09-09 · 기준 커밋: `3c3ab59`

---

## 1. 원래 기획 (최종적으로 완성해야 하는 것)

**사용자가 웹캠 앞에서 수어를 하면, 실시간으로 인식해 한글 문장으로 번역해주는 웹서비스.**

| 항목 | 내용 |
|---|---|
| 인식 대상 | **단어 단위 한국수어** (지문자가 아님) |
| 학습 데이터 | **AI Hub 수어 영상 데이터셋** (NIA 제공) |
| 입력 | 브라우저 웹캠 실시간 영상 |
| 처리 | MediaPipe Holistic으로 키포인트 추출 → LSTM 계열 모델로 시퀀스 분류 |
| 출력 | 인식된 단어를 이어붙인 한글 자막 |
| 부가 기능 | 수어 학습 게임 (`/education`) — 예시 영상을 따라 하면 채점 |

AI Hub 데이터를 쓴 것은 저장소에 남은 흔적으로 확인됩니다.

- 예시 영상 파일명이 AI Hub 규격 그대로입니다 — `public/videos/NIA_SL_WORD1537_REAL01_D.mp4`
- 학습 노트북이 `dataset2.zip`을 Google Drive에서 받아 `Training`/`Validation`으로 나눕니다
- `label_map.json`에 실제 데이터셋 단어가 들어 있습니다 — 가래떡, 나사렛대학교, 된장찌개, 필기시험 …

### 최종 목표 대비 현재 위치

원래 목표는 **113단어 인식**이었고, 발표 시점에는 **5단어**로 축소됐으며,
현재 저장소에서 **실제로 동작하는 단어 인식은 0개**입니다. (근거는 3장)

---

## 2. 기능별 구현 현황

| # | 기능 | 상태 | 요약 |
|---|---|---|---|
| 1 | 랜딩 / 라우팅 / UI | ✅ **완성** | Splash·Home·Header·Hero·Features·Steps·FinalCTA 전부 JSX+CSS 완비 |
| 2 | 수어 학습 게임 화면 | ⚠️ **껍데기만** | 화면·영상·웹캠·모델 로딩까지는 되지만 **채점이 가짜** |
| 3 | 실시간 단어 번역 | ❌ **미구현** | 목표 기능. 어떤 경로로도 단어를 인식하지 못함 |
| 4 | 실시간 지문자 번역 | 🟡 **부분 동작** | 자음·모음 31자. 단어가 아니며 구조적 결함 있음 |
| 5 | 문장 조합 | ⚠️ **임시 구현** | 단어 3개를 공백으로 잇는 게 전부. 수어 문법 처리 없음 |
| 6 | 학습 파이프라인 | 🟡 **코드만 생존** | 노트북은 있으나 **학습 데이터가 전부 소실** |
| 7 | 배포 | ❌ **미구현** | README 기술스택의 "배포:" 항목이 비어 있음 |

---

## 3. 핵심 결함 3가지 (가장 먼저 알아야 할 것)

### 3-1. 학습 게임의 채점이 AI와 무관합니다 🔴

`/education`은 **사용자가 무엇을 하든 정답 처리**됩니다.
예시 영상이 2번 재생되면 그것만으로 정답이 됩니다. 카메라 앞에 아무도 없어도 통과합니다.

`src/pages/Education/Education.jsx:195` — `handleVideoEnded`

```js
} else if (newPlayCount >= 2) { // 두 번째 재생이 끝나면
  console.log("영상 2회 재생 완료. 정답 처리!");
  onCorrectAnswer(currentChallenge.word); // 정답 처리 함수 호출
}
```

`onCorrectAnswer`를 호출하는 곳은 이 한 군데뿐이며, 모델 출력과 연결된 지점이 없습니다.

더 정확히는 **추론 코드 자체가 제거돼 있습니다.** ONNX 모델을 로드하고, MediaPipe를 돌리고,
150프레임 시퀀스까지 모은 다음 — 아무것도 하지 않습니다.

`src/pages/Education/Education.jsx:181`

```js
if (sequence.current.length === 150) {
  // ... (기존 AI 추론 코드) ...
}
```

`onnxruntime-web`의 `Tensor`는 import만 되어 있고 쓰이지 않으며,
`session.run(...)` 호출은 파일 전체에 **0건**입니다.

> 즉 "5개 단어가 동작했다"기보다, **5개 단어짜리 시연 연출**에 가깝습니다.

### 3-2. 키포인트 차원이 애초에 맞지 않습니다 🔴

모델이 요구하는 입력은 **411차원**이고, 그 정체는 학습 노트북에 적혀 있습니다.

`handshack_ver4.ipynb` — `KEYPOINT_DIM = 411 # 137 keypoints * 3 (x, y, confidence)`

그런데 프론트엔드는 전혀 다른 스키마로 258개를 만든 뒤 0으로 채웁니다.

`src/pages/Education/Education.jsx:28` — `extractKeypoints`
- pose 33개 × 4(x,y,z,visibility) = 132
- 양손 21개 × 3 × 2 = 126
- 합 258 → 411까지 **0으로 패딩**

**단순히 개수가 모자란 게 아니라 좌표 구성 자체가 다릅니다.**
패딩으로는 절대 맞출 수 없고, 설령 추론을 연결해도 의미 있는 결과가 나오지 않습니다.

✅ **정답 구현이 저장소에 있습니다** — `run_translator.py:79` `extract_and_normalize_keypoints`
pose 일부 + face 70개 + 양손을 **목(neck) 기준으로 정규화**합니다. 이것을 JS로 이식해야 합니다.

### 3-3. 지문자 번역기는 "움직임"을 아예 보지 못합니다 🟠

`/translator`는 1초마다 **정지 이미지 1장**을 서버로 POST합니다.
`src/pages/Translator/Translator.jsx:131`

그런데 모델은 10프레임 시퀀스를 입력으로 받습니다. 서버는 이 간극을
**같은 프레임을 10번 복제**해서 메웁니다.

`api_server.py:109`

```python
# 시퀀스 생성 (단일 프레임을 10프레임으로 복제)
seq = [features] * 10
input_data = np.expand_dims(np.array(seq, dtype=np.float32), axis=0)
```

**모델은 완전히 정지한 10프레임을 받습니다.** 시간 축 정보가 0이 됩니다.
수어는 본질적으로 움직임의 언어인데, 이 구조에서는 **손 모양(정지 자세)만** 판별할 수 있습니다.

지문자 자모처럼 정지 자세로 구분되는 것은 어느 정도 맞힐 수 있지만,
움직임이 의미를 가르는 수어 단어는 원리적으로 인식이 불가능합니다.
목표인 단어 인식으로 가려면 **프레임 버퍼를 쌓아 시퀀스로 전송하는 구조**로 바꿔야 합니다.

## 4. 소실된 것 (저장소에 없음)

가장 치명적인 것은 **학습 데이터가 통째로 없다**는 점입니다.

| 소실물 | 원래 위치 | 영향 | 복구 |
|---|---|---|---|
| **AI Hub 키포인트 `.npy` 전체** | `/content/handshacke_dataset2/...` (Colab) | 🔴 재학습 불가 | AI Hub에서 재다운로드 후 전처리 재실행 |
| **`dataset2.zip`** | Google Drive `MyDrive/handshacke/` | 🔴 위와 동일 | 개인 드라이브 확인 |
| **지문자 학습 데이터 `dataset/seq_*.npy`** | 로컬 `dataset/` | 🟠 TFLite 재학습 불가 | `create_dataset_from_video.py` 재실행 |
| **`fonts/HMKMMAG.TTF`** | 로컬 `fonts/` | 🟢 표시용일 뿐 | 나눔고딕으로 대체 가능 |
| ~~`processed_data/label_mapping.json`~~ | — | — | ✅ **복원 완료** (학습 노트북 클래스 순서 기준) |

### `final_keypoint_data.pkl`은 데이터가 아닙니다

이름 때문에 오해하기 쉬운데, **실제 키포인트가 아니라 파일 경로 목록**입니다.

```
train 950건 / 103클래스,  val 500건 / 100클래스
경로 예시: /content/handshacke_dataset2/Training/keypoints_npy/NIA_SL_WORD0011_REAL01_R.npy
실제 존재 여부: 앞 50개 검사 → 0개 존재
```

Colab 세션이 끝나면서 사라진 경로만 남았습니다. 다만 **어떤 영상을 썼는지 목록은 살아있어서
AI Hub에서 같은 파일을 다시 받으면 동일한 구성을 재현할 수 있습니다.** 이 파일은 버리지 마세요.

### 클래스 수가 3중으로 어긋납니다 ⚠️

| 출처 | 클래스 수 |
|---|---|
| `label_map.json` | **113** |
| `final_keypoint_data.pkl` (실제 학습에 쓰인 라벨) | **103** |
| `translate_pth.py`의 `NUM_CLASSES` | **100** |

`best_100class_model.pth`를 다시 쓰려면 어느 것이 맞는지 먼저 확정해야 합니다.
셋이 다르면 인덱스가 밀려서 **엉뚱한 단어가 나옵니다.**

참고로 `label_map.json`에는 오타 중복도 있습니다 — `꽈배기`/`꽈베기`, `된장찌개`/`된장찌게`.

### 데이터 자체가 부족했습니다

`950건 ÷ 103클래스 ≈ 클래스당 9개`.
딥러닝 시퀀스 분류로는 현저히 부족한 양입니다.
**발표 때 5단어로 축소한 근본 원인이 여기 있을 가능성이 높습니다.**
재학습 시 데이터 확보량을 먼저 늘리는 게 순서입니다.

---

## 5. 미구현 (만들어야 하는 것)

| 우선순위 | 항목 | 내용 |
|---|---|---|
| 🔴 P0 | 학습 데이터 재확보 | AI Hub 재다운로드 → 키포인트 추출 → `.npy` 재생성 |
| 🔴 P0 | 단어 인식 모델 재학습 | 목표 클래스 수 확정 후 `handshack_ver4.ipynb` 기준 재학습 |
| 🔴 P0 | 411차원 전처리 JS 이식 | `run_translator.py`의 정규화 로직을 `Education.jsx`로 |
| 🔴 P1 | 실제 추론 연결 | `session.run()` 호출 복구 + 진짜 채점 로직 |
| 🟠 P1 | 인식 스택 일원화 | 지문자(TFLite) / 단어(ONNX) 두 갈래를 하나로 |
| 🟠 P1 | 시퀀스 전송 구조로 변경 | 단일 프레임 → 프레임 버퍼 전송 |
| 🟡 P2 | 문장 조합 로직 | 단어 나열 → 수어 문법 반영 |
| 🟡 P2 | 배포 | 미착수 |

---

## 6. 지금 실행하면 되는 것 / 안 되는 것

| 대상 | 결과 |
|---|---|
| `npm start` → `/`, `/home` | ✅ 정상 |
| `npm start` → `/education` | ⚠️ 화면은 뜨고 게임 진행되나 **채점이 가짜** |
| `python api_server.py` → `/translator` | 🟡 지문자 31자 한정, 정확도 불안정 |
| `python run_translator.py` | 🟡 5단어 ONNX. 파이썬 단독 실행이며 웹과 무관 |
| `python webcam_word_sign_recognition.py` | ❌ `fonts/HMKMMAG.TTF` 없어 실행 불가 |
| 노트북으로 재학습 | ❌ 학습 데이터 소실로 불가 |

---

## 7. 권장 진행 순서

1. **클래스 수 확정** — 113/103/100 중 무엇을 목표로 할지 결정 (`final_keypoint_data.pkl` 목록이 기준선)
2. **AI Hub 데이터 재확보** — pkl의 파일 목록으로 필요한 영상 특정
3. **키포인트 재추출** — 137개 × 3(x, y, confidence) = 411 스키마 유지
4. **재학습** — `handshack_ver4.ipynb` (LSTM + Attention, seq 150)
5. **ONNX 내보내기** — `translate_pth.py` 활용 (`NUM_CLASSES` 수정 필수)
6. **프론트 전처리 이식** — `run_translator.py:79` → `Education.jsx`의 `extractKeypoints` 교체
7. **추론·채점 연결** — 가짜 정답 처리 제거
8. **Translator 통합** — 지문자 대신 단어 모델로 전환, 시퀀스 전송 구조로 변경

---

## 부록 · 근거 위치

| 주장 | 확인 위치 |
|---|---|
| 채점이 가짜 | `src/pages/Education/Education.jsx:195` |
| 추론 코드 없음 | `src/pages/Education/Education.jsx:181` (빈 블록), `session.run` 0건 |
| 411 = 137×3 | `handshack_ver4.ipynb` `KEYPOINT_DIM` |
| 258차원 패딩 | `src/pages/Education/Education.jsx:28` |
| 411 정답 구현 | `run_translator.py:79` |
| 단일 프레임 전송 | `src/pages/Translator/Translator.jsx:131` |
| 프레임 복제로 가짜 시퀀스 | `api_server.py:109` (`seq = [features] * 10`) |
| 학습 데이터 소실 | `final_keypoint_data.pkl` (경로만, 실존 0건) |
| 클래스 수 불일치 | `label_map.json`(113) / pkl(103) / `translate_pth.py`(100) |
| AI Hub 출처 | `public/videos/NIA_SL_WORD*.mp4`, 노트북의 `dataset2.zip` |
| 5단어 축소본 | `final_handshake.ipynb` → `best_model_5_words_high_quality.pth` |
| 113단어 본체 | `handshack_ver4.ipynb` → `label_map.json` |
