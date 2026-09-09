from flask import Flask, request, jsonify
from flask_cors import CORS
import cv2
import numpy as np
import tensorflow as tf
import json
import base64
from sing_lang_trans.modules.holistic_module import HolisticDetector
from sing_lang_trans.modules.utils import Vector_Normalization
import os
import threading
import queue
import time

app = Flask(__name__)
CORS(app)  # React에서 API 호출 허용

# 전역 변수로 모델과 매핑 로드
interpreter = None
idx_to_word = None
detector = None

# MediaPipe 동시성 문제 해결을 위한 락과 큐
detector_lock = threading.Lock()
request_queue = queue.Queue()
processing_thread = None
stop_processing = False

def load_model_and_mapping():
    """모델과 라벨 매핑 로드"""
    global interpreter, idx_to_word, detector, processing_thread
    
    # 라벨 매핑 로드
    with open('processed_data/label_mapping.json', 'r', encoding='utf-8') as f:
        label_mapping = json.load(f)
    
    idx_to_word = {v: k for k, v in label_mapping.items()}
    
    # TensorFlow Lite 모델 로드
    interpreter = tf.lite.Interpreter(model_path="models/multi_hand_gesture_classifier.tflite")
    interpreter.allocate_tensors()
    
    # MediaPipe Holistic Detector 초기화
    detector = HolisticDetector(min_detection_confidence=0.1, min_tracking_confidence=0.1)
    
    # 요청 처리 스레드 시작
    processing_thread = threading.Thread(target=process_request_queue, daemon=True)
    processing_thread.start()
    
    print("모델 로딩 완료!")

def process_hand_landmarks(right_hand_lmList):
    """손 랜드마크 처리 및 벡터 정규화"""
    joint = np.zeros((42, 2))
    for j, lm in enumerate(right_hand_lmList.landmark):
        joint[j] = [lm.x, lm.y]
    vector, angle_label = Vector_Normalization(joint)
    features = np.concatenate([vector.flatten(), angle_label.flatten()])
    
    # 55차원으로 맞추기
    if len(features) > 55:
        features = features[:55]
    elif len(features) < 55:
        features = np.pad(features, (0, 55 - len(features)), 'constant')
    
    return features

def process_request_queue():
    """요청 큐 처리 스레드"""
    global stop_processing
    while not stop_processing:
        try:
            # 큐에서 요청 가져오기 (1초 타임아웃)
            request_data = request_queue.get(timeout=1)
            if request_data is None:
                continue
                
            img, result_queue = request_data
            
            try:
                # MediaPipe 락으로 동시성 제어
                with detector_lock:
                    # 이미지 처리
                    img = cv2.flip(img, 1)  # 좌우 반전
                    img = detector.findHolistic(img, draw=False)
                    _, right_hand_lmList = detector.findRighthandLandmark(img)
                    _, left_hand_lmList = detector.findLefthandLandmark(img)
                
                # 오른손 또는 왼손 중 하나라도 감지되면 처리
                hand_lmList = None
                if right_hand_lmList is not None:
                    hand_lmList = right_hand_lmList
                elif left_hand_lmList is not None:
                    hand_lmList = left_hand_lmList
                
                if hand_lmList is None:
                    result_queue.put({
                        'success': False,
                        'message': '손이 감지되지 않습니다.',
                        'prediction': None,
                        'confidence': 0.0
                    })
                    continue
                
                # 특징 추출
                features = process_hand_landmarks(hand_lmList)
                
                # 시퀀스 생성 (단일 프레임을 10프레임으로 복제)
                seq = [features] * 10
                input_data = np.expand_dims(np.array(seq, dtype=np.float32), axis=0)
                
                # 예측
                y_pred = predict_gesture(input_data)
                
                # y_pred가 2차원인지 1차원인지 확인
                if len(y_pred.shape) == 2:
                    y_pred = y_pred[0]  # 첫 번째 차원 제거
                
                predicted_idx = int(np.argmax(y_pred))
                predicted_gesture = idx_to_word[predicted_idx]
                confidence = float(y_pred[predicted_idx])
                
                # Top 3 예측 결과
                top3_indices = np.argsort(y_pred)[-3:][::-1]
                top3_predictions = []
                for idx in top3_indices:
                    top3_predictions.append({
                        'character': idx_to_word[idx],
                        'confidence': float(y_pred[idx])
                    })
                
                result_queue.put({
                    'success': True,
                    'prediction': predicted_gesture,
                    'confidence': confidence,
                    'top3': top3_predictions,
                    'message': f'인식된 문자: {predicted_gesture} (신뢰도: {confidence:.3f})'
                })
                
            except Exception as e:
                result_queue.put({
                    'success': False,
                    'error': str(e),
                    'message': '처리 중 오류가 발생했습니다.'
                })
                
        except queue.Empty:
            continue
        except Exception as e:
            print(f"요청 처리 스레드 오류: {e}")
            continue

def predict_gesture(input_data):
    """제스처 예측"""
    input_details = interpreter.get_input_details()
    output_details = interpreter.get_output_details()
    
    interpreter.set_tensor(input_details[0]['index'], input_data)
    interpreter.invoke()
    y_pred = interpreter.get_tensor(output_details[0]['index'])
    return y_pred[0]

def base64_to_image(base64_string):
    """Base64 문자열을 이미지로 변환"""
    # Base64 디코딩
    img_data = base64.b64decode(base64_string.split(',')[1])
    nparr = np.frombuffer(img_data, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    return img

@app.route('/api/health', methods=['GET'])
def health_check():
    """서버 상태 확인"""
    return jsonify({
        'status': 'healthy',
        'message': 'Sign Language Recognition API is running'
    })

@app.route('/api/predict', methods=['POST'])
def predict_sign():
    """수화 인식 API"""
    try:
        # JSON 데이터 받기
        data = request.get_json()
        
        if not data or 'image' not in data:
            return jsonify({'error': '이미지 데이터가 필요합니다.'}), 400
        
        # Base64 이미지를 OpenCV 이미지로 변환
        base64_image = data['image']
        img = base64_to_image(base64_image)
        
        # 결과를 받을 큐 생성
        result_queue = queue.Queue()
        
        # 요청을 큐에 추가
        request_queue.put((img, result_queue))
        
        # 결과 대기 (최대 5초)
        try:
            result = result_queue.get(timeout=5)
            return jsonify(result)
        except queue.Empty:
            return jsonify({
                'success': False,
                'error': '요청 처리 시간 초과',
                'message': '서버가 혼잡합니다. 잠시 후 다시 시도해주세요.'
            }), 408
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e),
            'message': '처리 중 오류가 발생했습니다.'
        }), 500

@app.route('/api/characters', methods=['GET'])
def get_characters():
    """인식 가능한 문자 목록 반환"""
    try:
        characters = list(idx_to_word.values())
        return jsonify({
            'success': True,
            'characters': characters,
            'count': len(characters)
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/model-info', methods=['GET'])
def get_model_info():
    """모델 정보 반환"""
    try:
        input_details = interpreter.get_input_details()
        output_details = interpreter.get_output_details()
        
        return jsonify({
            'success': True,
            'input_shape': input_details[0]['shape'].tolist(),
            'output_shape': output_details[0]['shape'].tolist(),
            'num_classes': len(idx_to_word),
            'model_type': 'TensorFlow Lite'
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

if __name__ == '__main__':
    # 모델 로드
    load_model_and_mapping()
    
    # 서버 시작
    print("Flask API 서버 시작...")
    print("React에서 http://localhost:5000/api/predict 로 POST 요청을 보내세요.")
    print("예시:")
    print("fetch('http://localhost:5000/api/predict', {")
    print("  method: 'POST',")
    print("  headers: { 'Content-Type': 'application/json' },")
    print("  body: JSON.stringify({ image: base64Image })")
    print("})")
    
    try:
        app.run(host='0.0.0.0', port=5000, debug=True)
    except KeyboardInterrupt:
        print("\n서버 종료 중...")
        stop_processing = True
        if processing_thread:
            processing_thread.join(timeout=2)
        print("서버가 안전하게 종료되었습니다.") 