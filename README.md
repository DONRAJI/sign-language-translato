# ✋ 손짓 (SignBridge)

> 수어 사용자(청각·언어장애인)의 손동작을 실시간으로 인식해  
> 한글 텍스트로 변환하는 수어-문자 번역 웹서비스입니다.

📎 [Figma 디자인 와이어프레임 보기](https://www.figma.com/design/YCfeoVBwRcilLT5Wubera3/%EC%86%90%EC%A7%93-SignBridge-?node-id=0-1&t=DYa9aM1dBQGEZ7xP-1)

📋 **[프로젝트 기획 및 구현 현황 →](PROJECT_STATUS.md)** — 원래 목표 대비 무엇이 미구현이고 무엇이 소실됐는지 정리한 문서입니다.

---
## 👏 팀원 소개

> 김형욱
> 홍민기
> 이준서
> 이유빈
---

## 📌 한 줄 요약

손짓은 수어 사용자의 손동작을 실시간으로 인식하여 텍스트로 변환하는  
**수어-문자 번역 웹서비스**입니다.

이를 통해 수어 사용자도  
**정보에 접근하고, 정보를 생성하는 주체가 될 수 있습니다.**

---

## 🎯 서비스 목적

- 청각·언어장애인의 **의사 표현 수단 확보**
- **수어-비수어 사용자 간의 소통 문제 해결**
- 공공 정보에 대한 **실시간 접근성 향상**
- 수어 데이터를 디지털화 → **정보화된 사회 참여 기회 확대**

---

## 🧩 해결하고자 하는 사회문제

| ❗ 문제                           | 💡 손짓이 해결하는 방식                                           |
|----------------------------------|-------------------------------------------------------------------|
| 수어 사용자 의견 전달 어려움     | 수어 → 한글 번역으로 자유롭게 의사 표현 가능                      |
| 수어 비사용자와의 대화 단절     | 실시간 번역 자막으로 자연스러운 커뮤니케이션                     |
| 수어 통역사 부족                | 누구나 접근 가능한 웹 기반 번역 시스템                           |
| 정보 전달의 비대칭              | 수어 사용자도 **정보 제공자**가 될 수 있도록 지원                |

---

## 🔗 손짓과 "정보(Information)"의 연결성

> 우리는 단순히 수어를 번역하지 않습니다.  
> 우리는 **‘정보 전달 수단’을 새롭게 만들고 있습니다.**

- 수어 → 텍스트 = **정보의 디지털화**
- 자막은 단순 표현이 아닌 **“의미 있는 정보의 시작점”**
- 텍스트화된 수어는 이후 정보 검색, 정책 안내, 민원 처리 등 다양한 기능으로 확장 가능

📌 즉, 손짓은  
👉 **수어를 통해 정보를 ‘받기’도 하고, ‘보내기’도 가능하게 하는 통로**입니다.

---

## 💬 핵심 슬로건

> “당신의 손짓으로 세상을 잇다”

---

## ✅ MVP 기능 명세서

---

### 🧩 주요 목표

| 항목            | 내용                                         |
|-----------------|----------------------------------------------|
| MVP 핵심 기능   | 실시간 수어 → 텍스트 변환 시스템             |
| 사용자 대상     | 청각·언어장애인 (수어 사용자)                |
| 사용 플랫폼     | 웹                                           |
| 기술 목표       | 영상 입력 기반 수어 인식 → 한글 텍스트 출력 |

---

### ✨ 기능 구성

| 기능명            | 설명                                                                       |
|-------------------|----------------------------------------------------------------------------|
| ✋ 수어 인식       | 웹캠을 통해 사용자의 손동작 인식 (단어 또는 문장 단위)                    |
| 📄 텍스트 출력     | 인식된 수어를 실시간으로 반환                                               |
| 🖼 UI 구성         | 인식된 문장 출력창 + 카메라 영상 확인창                                     |
| 🧠 번역 처리       | 사전 학습된 수어 모델 기반 추론 or rule-based 매핑 (예: Mediapipe + LSTM) |

---

### 🔍 MVP 범위 제한

- **한글 자막 출력만 구현**
- 자동 정보 추천, 버튼 연동 등은 향후 확장 가능 기능으로 분리
- 실시간 처리 성능은 단순 문장/단어 기반 테스트용 수준

---

### 📦 기술 스택

- **Frontend:** React
- **수어 인식:** Mediapipe Hands, Tensorflow / PyTorch, LSTM (or rule-based)
- **배포:** 

---




---

## 📁 저장소 구성 (통합본)

흩어져 있던 브랜치 10개의 산출물을 하나로 모은 통합본입니다.
아래 표는 각 파일이 원래 어느 브랜치에 있었는지를 기록한 것입니다.

| 파일 | 출처 브랜치 | 용도 |
|---|---|---|
| `src/`, `public/`, `sing_lang_trans/*.py`, `test_api.py`, `react_example.js` | `edu` | React 프론트엔드 + 학습/전처리 스크립트 (최신) |
| `api_server.py`, `requirements.txt` | `final_ver` | Translator 페이지가 호출하는 Flask REST API |
| `models/multi_hand_gesture_classifier.tflite` | `main` | 지문자 31자 TFLite 분류 모델 |
| `sing_lang_trans/templates/index.html` | `main` | `web_app.py`(SocketIO 버전)용 템플릿 |
| `run_translator.py`, `label_map*.json`, `*.ipynb`, `sign_language_model.onnx` | `LSTM_attention` | 단어 단위 LSTM 인식 — **411차원 키포인트 추출 기준 구현** |
| `best_100class_model.pth`, `translate_pth.py`, `final_keypoint_data.pkl` | `feature/webcam` | 100단어 PyTorch 모델 + 모델 아키텍처 정의 + pth→onnx 변환 |
| `LICENSE` | `develop` | 라이선스 |
| `processed_data/label_mapping.json` | *(복원)* | 아래 "복원한 파일" 참고 |

### 🔄 통합 과정에서 변경한 것

- `processed_data/label_mapping.json` — **원본이 어느 브랜치에도 없어 복원했습니다.**
  `api_server.py`와 `webcam_word_sign_recognition.py`가 필수로 여는 파일입니다.
  학습 노트북 `train_hand_gesture.ipynb`가 `to_categorical(labels, num_classes=len(actions))`로
  클래스 인덱스를 만들고, 동일한 `actions` 리스트(31자, 순서까지 일치)가
  `web_app.py`·`webcam_test_model_tflite.py`에도 있는 것을 확인해
  그 순서를 그대로 `{문자: 인덱스}`로 재구성했습니다.
- `run_translator.py`의 `ONNX_MODEL_PATH` — 동일한 11.8MB ONNX 파일이
  `public/`에 이미 있어 중복 저장을 피하려고 경로만 `public/sign_language_model_5_words.onnx`로 수정했습니다.

그 외 파일은 원본 그대로이며, 경로도 각 스크립트가 기대하는 위치를 유지했습니다.

---

## ▶️ 실행 방법

### 1) 프론트엔드

```bash
npm install
npm start
```

`/education`(수어 학습 게임)은 브라우저에서 ONNX + MediaPipe로 **단독 동작**하므로
백엔드 없이도 실행됩니다.

### 2) 인식 API 서버 (`/translator` 페이지용)

```bash
pip install -r requirements.txt
python api_server.py
```

`http://localhost:5000`에서 뜨며, `/api/health`·`/api/predict`·`/api/characters`·`/api/model-info`를 제공합니다.
동작 확인은 `python test_api.py`로 할 수 있습니다.

---

## ⚠️ 알려진 미완성 사항

통합 시점에 확인된, 아직 해결되지 않은 문제들입니다.

1. **`Education.jsx`의 키포인트 전처리가 미완성입니다.**
   `extractKeypoints`가 258차원만 추출한 뒤 모델이 요구하는 411차원까지 0으로 패딩하고 있어
   인식 정확도가 정상일 수 없습니다. (코드 내 주석에도 명시되어 있음)
   → `run_translator.py`의 `extract_and_normalize_keypoints`가 올바른 411차원 구현입니다.
   pose 일부 + face 70개 + 양손 랜드마크를 목(neck) 기준으로 정규화합니다. 이식이 필요합니다.

2. **인식 스택이 두 갈래로 나뉘어 있습니다.**
   - 지문자 31자 · TFLite · 손 랜드마크 → `Translator` 페이지 / `api_server.py`
   - 단어 단위 · LSTM ONNX · 홀리스틱 → `Education` 페이지 / `run_translator.py`
   모델·라벨셋·전처리가 서로 달라 아직 하나로 합쳐지지 않았습니다.

3. **`Translator`는 단일 프레임을 전송하는데 서버 모델은 시퀀스 기반입니다.**
   `Translator.jsx`가 1초마다 정지 이미지 1장을 POST하지만
   TFLite 모델은 `seq_length=10` 시퀀스를 입력으로 받습니다. 구조적 불일치입니다.

4. **`label_map.json`(113개)과 `translate_pth.py`의 `NUM_CLASSES`(100)가 어긋납니다.**
   100단어 모델을 다시 쓰려면 어느 쪽이 맞는지 확인이 필요합니다.

5. **`sing_lang_trans/web_app.py`는 사실상 레거시입니다.**
   SocketIO 방식에 서버 측에서 직접 웹캠(`cv2.VideoCapture(0)`)을 여는 구조라
   React가 사용하는 REST API(`api_server.py`)와는 다른 물건입니다.

6. **`webcam_word_sign_recognition.py`는 `fonts/HMKMMAG.TTF`를 필요로 합니다.**
   상용 한글 폰트(휴먼매직체)라 저장소에 포함하지 않았습니다.
   해당 스크립트만 이 폰트에 의존하며, 나머지는 영향받지 않습니다.
   참고로 `run_translator.py`에는 나눔고딕을 자동으로 내려받는 `download_font()`가 있으니
   같은 방식으로 바꾸면 의존성을 없앨 수 있습니다.
