import cv2
import mediapipe as mp
import numpy as np
import onnxruntime
import json
import time
import os
from collections import deque
from PIL import ImageFont, ImageDraw, Image
import requests
import sys
import traceback

# ==================================================================
# 1. 설정 및 파일 로드
# ==================================================================
ONNX_MODEL_PATH = 'public/sign_language_model_5_words.onnx'
LABEL_MAP_PATH = 'label_map_5_words.json'
FONT_NAME = 'NanumGothic-Regular.ttf'

SEQUENCE_LENGTH = 150
CONFIDENCE_THRESHOLD = 0.5
MOVEMENT_THRESHOLD = 0.008 

def download_font(font_name):
    if os.path.exists(font_name): return
    print(f"'{font_name}' 폰트를 다운로드합니다...")
    url = f"https://raw.githubusercontent.com/google/fonts/main/ofl/nanumgothic/{font_name}"
    try:
        response = requests.get(url, stream=True)
        response.raise_for_status()
        with open(font_name, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192): f.write(chunk)
        print("폰트 다운로드 완료.")
    except Exception as e:
        print(f"폰트 다운로드 실패: {e}")
        global FONT_NAME
        FONT_NAME = None

download_font(FONT_NAME)

try:
    ort_session = onnxruntime.InferenceSession(ONNX_MODEL_PATH)
    print("✅ ONNX 모델 로드 완료.")
except Exception as e:
    print(f"❌ ONNX 모델 로드 실패: {e}"); sys.exit()

try:
    with open(LABEL_MAP_PATH, 'r', encoding='utf-8') as f:
        label_map = json.load(f)
    CLASS_LABELS = {v: k for k, v in label_map.items()}
    print(f"✅ 라벨 맵 로드 완료. 총 {len(CLASS_LABELS)}개 클래스.")
except Exception as e:
    print(f"❌ 라벨 맵 로드 실패: {e}"); sys.exit()

mp_holistic_solution = mp.solutions.holistic
mp_holistic = mp_holistic_solution.Holistic(min_detection_confidence=0.5, min_tracking_confidence=0.5)
mp_drawing = mp.solutions.drawing_utils

# ==================================================================
# 2. 유틸리티 함수
# ==================================================================
def softmax(x):
    e_x = np.exp(x - np.max(x))
    return e_x / e_x.sum(axis=0)

def draw_text_hangul(img, text, pos, font_size, color, bg_color=(0, 0, 0)):
    try:
        font = ImageFont.truetype(FONT_NAME, font_size)
    except (IOError, TypeError):
        font = ImageFont.load_default()
    img_pil = Image.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
    draw = ImageDraw.Draw(img_pil)
    text_bbox = draw.textbbox(pos, text, font=font)
    draw.rectangle(text_bbox, fill=bg_color)
    draw.text(pos, text, font=font, fill=color)
    return cv2.cvtColor(np.array(img_pil), cv2.COLOR_RGB2BGR)

def extract_and_normalize_keypoints(results):
    mp_pose = results.pose_landmarks.landmark if results.pose_landmarks else [None] * 33
    mp_face = results.face_landmarks.landmark if results.face_landmarks else [None] * 468
    actual_left_hand = results.right_hand_landmarks
    actual_right_hand = results.left_hand_landmarks
    keypoints_list = []
    if mp_pose[11] and mp_pose[12]:
        neck_point_x = (mp_pose[11].x + mp_pose[12].x) / 2
        neck_point_y = (mp_pose[11].y + mp_pose[12].y) / 2
        op_from_mp_indices = [0, 0, 12, 14, 16, 11, 13, 15, 24, 26, 28, 23, 25, 27, 5, 2, 8, 1, 7, 0, 0, 0, 0, 0, 0]
        for i in range(25):
            if i == 1: keypoints_list.append([neck_point_x, neck_point_y, 0.9])
            else:
                idx = op_from_mp_indices[i]
                if mp_pose[idx]: keypoints_list.append([mp_pose[idx].x, mp_pose[idx].y, mp_pose[idx].visibility])
                else: keypoints_list.append([0, 0, 0])
    else: keypoints_list.extend([[0,0,0]] * 25)
    if mp_face: keypoints_list.extend([[lm.x, lm.y, 0] if lm else [0,0,0] for lm in mp_face[:70]])
    else: keypoints_list.extend([[0,0,0]] * 70)
    if actual_left_hand: keypoints_list.extend([[lm.x, lm.y, 0] if lm else [0,0,0] for lm in actual_left_hand.landmark])
    else: keypoints_list.extend([[0,0,0]] * 21)
    if actual_right_hand: keypoints_list.extend([[lm.x, lm.y, 0] if lm else [0,0,0] for lm in actual_right_hand.landmark])
    else: keypoints_list.extend([[0,0,0]] * 21)
    keypoints_2d = np.array(keypoints_list, dtype=np.float32)
    neck_point_ref = keypoints_2d[1, :2]
    if np.all(neck_point_ref == 0): return np.zeros(137 * 3, dtype=np.float32), False
    relative_keypoints = keypoints_2d[:, :2] - neck_point_ref
    left_shoulder_ref = keypoints_2d[5, :2]
    right_shoulder_ref = keypoints_2d[2, :2]
    if np.all(left_shoulder_ref != 0) and np.all(right_shoulder_ref != 0):
        shoulder_dist = np.linalg.norm(left_shoulder_ref - right_shoulder_ref)
        if shoulder_dist > 1e-4: relative_keypoints /= shoulder_dist
    normalized_frame = np.hstack((relative_keypoints, keypoints_2d[:, 2:3]))
    hands_detected = bool(actual_left_hand or actual_right_hand)
    return normalized_frame.flatten().astype(np.float32), hands_detected

# ==================================================================
# 3. 실시간 추론 루프 (이전에 성공했던 안정적인 구조 사용)
# ==================================================================
cap = cv2.VideoCapture(0)
if not cap.isOpened():
    print("❌ 치명적 오류: 웹캠을 열 수 없습니다."); sys.exit()

sequence_buffer = deque(maxlen=SEQUENCE_LENGTH)
last_prediction = "대기 중"
is_ready = False
ready_countdown = -1
last_inference_time = 0.0

print("\n🚀 양손을 들어 '준비' 상태를 만드세요. (종료: ESC)")

try:
    while True:
        ret, frame = cap.read()
        if not ret:
            print("⚠️ 경고: 카메라에서 프레임을 읽을 수 없습니다.")
            break
        
        frame = cv2.flip(frame, 1)
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = mp_holistic.process(rgb_frame)

        if results.pose_landmarks: mp_drawing.draw_landmarks(frame, results.pose_landmarks, mp_holistic_solution.POSE_CONNECTIONS)
        if results.left_hand_landmarks: mp_drawing.draw_landmarks(frame, results.left_hand_landmarks, mp_holistic_solution.HAND_CONNECTIONS)
        if results.right_hand_landmarks: mp_drawing.draw_landmarks(frame, results.right_hand_landmarks, mp_holistic_solution.HAND_CONNECTIONS)

        keypoints, hands_detected = extract_and_normalize_keypoints(results)
        
        if not is_ready:
            if hands_detected and results.left_hand_landmarks and results.right_hand_landmarks and results.pose_landmarks:
                nose_y = results.pose_landmarks.landmark[0].y
                left_hand_y = np.mean([lm.y for lm in results.left_hand_landmarks.landmark])
                right_hand_y = np.mean([lm.y for lm in results.right_hand_landmarks.landmark])
                if left_hand_y < nose_y and right_hand_y < nose_y:
                    if ready_countdown == -1:
                        ready_countdown = 2
                        countdown_start_time = time.time()
                else: ready_countdown = -1
            else: ready_countdown = -1

            if ready_countdown > 0:
                elapsed = time.time() - countdown_start_time
                current_countdown = ready_countdown - int(elapsed)
                if current_countdown <= 0:
                    is_ready = True
                    sequence_buffer.clear()
                    last_prediction = "인식 시작!"
                    print("\n✅ 인식 시작!")
                else: last_prediction = f"준비... {current_countdown}"
            else: last_prediction = "양손을 드세요"
        
        if is_ready:
            sequence_buffer.append(keypoints)
            if len(sequence_buffer) == SEQUENCE_LENGTH:
                try:
                    input_data = np.expand_dims(np.array(sequence_buffer, dtype=np.float32), axis=0)
                    input_name = ort_session.get_inputs()[0].name
                    start_time = time.time()
                    ort_outs = ort_session.run(None, {input_name: input_data})
                    last_inference_time = (time.time() - start_time) * 1000
                    logits = ort_outs[0][0]
                    probabilities = softmax(logits)
                    top3_indices = np.argsort(probabilities)[::-1][:3]
                    print("\n--- Top 3 Predictions ---")
                    for i in top3_indices:
                        word = CLASS_LABELS.get(i, "알 수 없음")
                        prob = probabilities[i]
                        print(f"  - {word}: {prob*100:.2f}%")
                    motion = np.mean(np.std(np.array(sequence_buffer)[-10:, :30], axis=0))
                    confidence = np.max(probabilities)
                    if motion > MOVEMENT_THRESHOLD and confidence >= CONFIDENCE_THRESHOLD:
                        predicted_index = np.argmax(probabilities)
                        predicted_word = CLASS_LABELS.get(predicted_index, "알 수 없음")
                        last_prediction = f"{predicted_word} ({confidence*100:.1f}%)"
                    elif motion <= MOVEMENT_THRESHOLD:
                        last_prediction = "움직임 감지 중..."
                    else:
                        last_prediction = "인식 중..."
                except Exception as e:
                    print(f"추론 중 오류 발생: {e}")

        frame = draw_text_hangul(frame, f"Prediction: {last_prediction}", (30, 60), 40, (57, 255, 20))
        frame = draw_text_hangul(frame, f"Inference: {last_inference_time:.2f} ms", (30, 110), 20, (0, 255, 255))
        cv2.imshow('Sign Language Translator', frame)

        if cv2.waitKey(1) & 0xFF == 27: break
finally:
    print("프로그램을 종료합니다.")
    if cap:
        cap.release()
    cv2.destroyAllWindows()
    if 'mp_holistic' in locals():
        mp_holistic.close()