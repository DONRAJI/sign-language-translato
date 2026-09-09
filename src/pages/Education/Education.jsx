// 필요한 라이브러리들을 모두 import 합니다.
// npm install react-webcam @mediapipe/holistic @mediapipe/camera_utils @mediapipe/drawing_utils onnxruntime-web react-icons
import React, { useState, useEffect, useRef } from 'react';
import Webcam from 'react-webcam';
import { Holistic } from '@mediapipe/holistic';
import { Camera } from '@mediapipe/camera_utils';
import { InferenceSession, Tensor } from 'onnxruntime-web';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';
import { POSE_CONNECTIONS, HAND_CONNECTIONS } from '@mediapipe/holistic';

import Header from '../../components/Header/Header';
import { IoEyeOutline, IoHappyOutline, IoEnterOutline, IoHelpCircleOutline, IoCheckmarkCircle } from "react-icons/io5";
import './Education.css';

// 학습할 단어 데이터
const challenges = [
  { word: '감기', videoSrc: '/videos/NIA_SL_WORD1537_REAL01_D.mp4' },
  { word: '고민', videoSrc: '/videos/NIA_SL_WORD1501_REAL01_D.mp4' },
  { word: '라면', videoSrc: '/videos/NIA_SL_WORD1590_REAL01_D.mp4' },
  { word: '수어', videoSrc: '/videos/NIA_SL_WORD1503_REAL01_D.mp4' },
  { word: '슬프다', videoSrc: '/videos/NIA_SL_WORD1509_REAL01_D.mp4' }

];

// ==================================================================
// 키포인트 추출 (411차원)
//
// 학습 시 전처리와 반드시 일치해야 하므로 run_translator.py의
// extract_and_normalize_keypoints를 그대로 옮긴 것이다. 로직을 바꾸면
// 모델 입력 분포가 달라져 인식이 되지 않으니 원본과 함께 수정해야 한다.
//
// 구성: 포즈 25 + 얼굴 70 + 왼손 21 + 오른손 21 = 137개, 각 [x, y, c] → 411
// ==================================================================
const NUM_POSE = 25;
const NUM_FACE = 70;
const NUM_HAND = 21;
const NUM_KEYPOINTS = NUM_POSE + NUM_FACE + NUM_HAND * 2; // 137
const KEYPOINT_DIM = NUM_KEYPOINTS * 3;                   // 411
const SEQUENCE_LENGTH = 150;

// 학습 데이터가 OpenPose BODY_25 순서라서, MediaPipe Pose 인덱스로 바꿔 읽는다.
// 인덱스 1(목)은 MediaPipe에 없어 양 어깨의 중점으로 따로 만든다.
// 뒤쪽 0들은 BODY_25의 발 키포인트 자리인데 MediaPipe가 주지 않아 원본도 코(0)로 채운다.
const OP_FROM_MP_INDICES = [0, 0, 12, 14, 16, 11, 13, 15, 24, 26, 28, 23, 25, 27, 5, 2, 8, 1, 7, 0, 0, 0, 0, 0, 0];

const extractAndNormalizeKeypoints = (results) => {
  const pose = results.poseLandmarks;
  const face = results.faceLandmarks;

  // 원본이 좌우를 바꿔 쓴다. 학습 데이터와 맞추기 위한 것이므로 그대로 둔다.
  const actualLeftHand = results.rightHandLandmarks;
  const actualRightHand = results.leftHandLandmarks;

  const pts = []; // [x, y, c] 137개

  if (pose && pose[11] && pose[12]) {
    const neckX = (pose[11].x + pose[12].x) / 2;
    const neckY = (pose[11].y + pose[12].y) / 2;
    for (let i = 0; i < NUM_POSE; i++) {
      if (i === 1) {
        pts.push([neckX, neckY, 0.9]); // 목은 합성한 점이라 신뢰도를 고정값으로 준다
        continue;
      }
      const lm = pose[OP_FROM_MP_INDICES[i]];
      pts.push(lm ? [lm.x, lm.y, lm.visibility ?? 0] : [0, 0, 0]);
    }
  } else {
    for (let i = 0; i < NUM_POSE; i++) pts.push([0, 0, 0]);
  }

  // 얼굴은 468개 중 앞 70개만 쓴다. 세 번째 값은 원본과 같이 0.
  for (let i = 0; i < NUM_FACE; i++) {
    const lm = face && face[i];
    pts.push(lm ? [lm.x, lm.y, 0] : [0, 0, 0]);
  }

  for (const hand of [actualLeftHand, actualRightHand]) {
    for (let i = 0; i < NUM_HAND; i++) {
      const lm = hand && hand[i];
      pts.push(lm ? [lm.x, lm.y, 0] : [0, 0, 0]);
    }
  }

  const keypoints = new Float32Array(KEYPOINT_DIM);

  // 목이 안 잡히면 정규화 기준이 없다. 원본과 동일하게 0 벡터를 돌려준다.
  const neck = pts[1];
  if (neck[0] === 0 && neck[1] === 0) {
    return { keypoints, handsDetected: false };
  }

  // 어깨 너비로 나눠 카메라와의 거리 차이를 없앤다.
  const leftShoulder = pts[5];
  const rightShoulder = pts[2];
  let scale = 1;
  if (
    leftShoulder[0] !== 0 && leftShoulder[1] !== 0 &&
    rightShoulder[0] !== 0 && rightShoulder[1] !== 0
  ) {
    const dist = Math.hypot(
      leftShoulder[0] - rightShoulder[0],
      leftShoulder[1] - rightShoulder[1]
    );
    if (dist > 1e-4) scale = dist;
  }

  for (let i = 0; i < NUM_KEYPOINTS; i++) {
    const [x, y, c] = pts[i];
    keypoints[i * 3] = (x - neck[0]) / scale;
    keypoints[i * 3 + 1] = (y - neck[1]) / scale;
    keypoints[i * 3 + 2] = c; // 신뢰도는 좌표가 아니므로 정규화하지 않는다
  }

  return { keypoints, handsDetected: Boolean(actualLeftHand || actualRightHand) };
};

// 1. 인트로 화면 컴포넌트 (변경 없음)
const IntroScreen = ({ onGameStart }) => (
  <div className="intro-container">
    <div className="intro-card">
      <h1>따라해요 손짓</h1>
      <p className="intro-paragraph">
        따라해요 손짓에 오신 것을 환영합니다!<br />
        수어 학습이 이렇게 재미있을 수 있을까요?<br />
        여러분의 수어 친구가 함께 할 '따라해요 손짓'에 오신 것을 환영해요!
      </p>

      <div className="intro-steps">
        <div className="intro-step-item">
          <IoEyeOutline className="step-icon" />
          <div className="step-description">
            <div className="step-number">1</div>
            <span>동작을 눈으로 익히고</span>
          </div>
        </div>
        <div className="intro-step-item">
          <IoHappyOutline className="step-icon" />
          <div className="step-description">
            <div className="step-number">2</div>
            <span>카메라를 보며 따라해주세요</span>
          </div>
        </div>
        <div className="intro-step-item">
          <IoEnterOutline className="step-icon" />
          <div className="step-description">
            <div className="step-number">3</div>
            <span>정답을 맞혔다면, 다음 단계로!</span>
          </div>
        </div>
      </div>

      <p className="intro-challenge-text">지금 바로 첫 번째 손짓에 도전해 볼까요?</p>
    </div>
    <button className="game-start-button" onClick={onGameStart}>
      <div className="character-avatar"></div>
      <span>Game Start!</span>
    </button>
  </div>
);

// 2. 게임 진행 화면 컴포넌트 (수정된 전체 코드)
const GameScreen = ({ onCorrectAnswer, currentChallengeIndex }) => {
  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const videoRef = useRef(null); // ✅ 비디오 요소를 위한 ref 추가

  const onnxSession = useRef(null);
  const sequence = useRef([]);
  const cameraRef = useRef(null);

  // ✅ 영상 재생 횟수를 추적하는 state 추가
  const [playCount, setPlayCount] = useState(0);

  const classLabels = ['감기', '고민', '라면', '수어', '슬프다'];
  const currentChallenge = challenges[currentChallengeIndex];

  // AI 모델 로드 및 MediaPipe Holistic 설정 (카메라 시작 로직은 분리)
  useEffect(() => {
    const setupModelAndHolistic = async () => {
      // 1. ONNX 모델 로드
      try {
        const session = await InferenceSession.create('/sign_language_model_5_words.onnx', {
          executionProviders: ['wasm'],
          graphOptimizationLevel: 'all',
        });
        onnxSession.current = session;
        console.log("ONNX Model loaded.");
      } catch (e) {
        console.error("ONNX 모델 로딩 실패.", e);
      }
    };

    setupModelAndHolistic();
  }, []); // 최초 1회만 실행

  // ✅ 문제가 바뀌면 재생 횟수를 리셋
  useEffect(() => {
    setPlayCount(0);
  }, [currentChallengeIndex]);


  // ✅ 웹캠이 성공적으로 켜졌을 때 MediaPipe 카메라를 시작하는 함수
  const startMediaPipeCamera = () => {
    const holistic = new Holistic({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`
    });

    holistic.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });

    holistic.onResults(onResults);

    if (webcamRef.current && webcamRef.current.video) {
      cameraRef.current = new Camera(webcamRef.current.video, {
        onFrame: async () => {
          if (webcamRef.current && webcamRef.current.video) {
            await holistic.send({ image: webcamRef.current.video });
          }
        },
        width: 640,
        height: 480
      });
      cameraRef.current.start();
      console.log("MediaPipe Camera started.");
    }
  };


  const onResults = async (results) => {
    // AI 추론 로직은 그대로 유지 (필요 시 주석 처리 또는 삭제)
    // 현재 요구사항은 영상 2회 재생 후 정답 처리이므로, 이 부분의 중요도는 낮아짐
    if (!webcamRef.current || !canvasRef.current || !onnxSession.current) {
      return;
    }
    const canvasCtx = canvasRef.current.getContext("2d");
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    // 랜드마크 그리기 등 시각적 피드백이 필요하면 여기에 코드 추가
    canvasCtx.restore();

    // 학습 때와 동일한 411차원 벡터를 만들어 최근 150프레임을 유지한다.
    const { keypoints } = extractAndNormalizeKeypoints(results);
    sequence.current.push(keypoints);
    if (sequence.current.length > SEQUENCE_LENGTH) {
      sequence.current = sequence.current.slice(-SEQUENCE_LENGTH);
    }

    // TODO: 여기서 onnxSession.current.run()을 호출해 실제 추론을 연결해야 한다.
    // 현재 채점은 handleVideoEnded의 영상 재생 횟수로만 이뤄지며 모델과 무관하다.
    // 입력 텐서는 [1, SEQUENCE_LENGTH, KEYPOINT_DIM] 형태로 만들면 된다.
  };

  // ✅ 영상 재생이 끝날 때마다 호출되는 함수
  const handleVideoEnded = () => {
    const newPlayCount = playCount + 1;
    setPlayCount(newPlayCount);

    if (newPlayCount === 1) { // 첫 번째 재생이 끝나면
      videoRef.current.play(); // 다시 재생
    } else if (newPlayCount >= 2) { // 두 번째 재생이 끝나면
      console.log("영상 2회 재생 완료. 정답 처리!");
      onCorrectAnswer(currentChallenge.word); // 정답 처리 함수 호출
    }
  };

  return (
    <div className="game-container">
      <div className="game-header">
        <div className="character-avatar"></div>
        <p>자, 게임 시작! 화면에 나타나는 캐릭터의 손짓을 잘 보고 그대로 따라 해보세요.</p>
      </div>
      <div className="game-grid">
        <div className="video-panel">
          {/* ✅ loop 속성 제거, ref와 onEnded 이벤트 핸들러 추가 */}
          <video
            ref={videoRef}
            key={currentChallenge.videoSrc}
            width="100%"
            autoPlay
            muted
            playsInline
            onEnded={handleVideoEnded}
          >
            <source src={currentChallenge.videoSrc} type="video/mp4" />
          </video>
        </div>
        <div className="webcam-panel">
          <div className="webcam-header">
            <span>카메라 {cameraRef.current ? "✅" : "⏳"}</span>
            <input type="checkbox" defaultChecked readOnly />
          </div>
          <div className="webcam-view" style={{ position: 'relative' }}>
            {/* ✅ onUserMedia를 사용해 카메라가 켜진 직후 콜백 함수 실행 */}
            <Webcam
              ref={webcamRef}
              audio={false}
              mirrored={true}
              onUserMedia={startMediaPipeCamera}
              style={{
                position: 'absolute', left: 0, top: 0,
                width: '100%', height: '100%', zIndex: 1,
              }}
            />
            <canvas
              ref={canvasRef}
              style={{
                position: 'absolute', left: 0, top: 0,
                width: '100%', height: '100%', zIndex: 2,
              }}
            ></canvas>
          </div>
        </div>
      </div>
    </div>
  );
};

// 3. 정답 화면 컴포넌트 (변경 없음)
const CorrectScreen = ({ word, onNextChallenge }) => (
  <div className="game-container">
    <div className="game-header">
      <img src="/character.png" alt="캐릭터" />
      <p>정확히 따라했어요!</p>
    </div>
    <div className="game-grid correct-grid">
        <div className="video-panel">
            <img src="/correct_example.png" alt="정답 예시" />
        </div>
        <div className="webcam-panel">
            <div className="webcam-header">
                <span>카메라</span>
                <input type="checkbox" defaultChecked readOnly />
            </div>
            <div className="webcam-view">
              <Webcam audio={false} mirrored={true} />
            </div>
        </div>
    </div>
    <div className="correct-feedback">
      <div className="answer-box">
        <IoCheckmarkCircle /> {word}!
      </div>
      <button className="next-challenge-button" onClick={onNextChallenge}>
        다음
      </button>
    </div>
  </div>
);

// 메인 Education 컴포넌트 (변경 없음)
const Education = () => {
  const [gameState, setGameState] = useState('intro'); // 'intro', 'playing', 'correct'
  const [correctWord, setCorrectWord] = useState('');
  const [currentChallengeIndex, setCurrentChallengeIndex] = useState(0);

  useEffect(() => {
    document.body.style.background = 'linear-gradient(180deg, #FFBCB7 0%, #DDA9D9 100%)';
    return () => { document.body.style.background = ''; };
  }, []);

  const handleGameStart = () => {
    // 게임 시작 시 첫 번째 챌린지를 랜덤으로 선택
    const firstIndex = Math.floor(Math.random() * challenges.length);
    setCurrentChallengeIndex(firstIndex);
    setGameState('playing');
  };

  const handleCorrectAnswer = (word) => {
    setCorrectWord(word);
    setGameState('correct');
  };

  // ✅ 다음 챌린지를 랜덤으로 선택하도록 수정된 함수
  const handleNextChallenge = () => {
    let nextIndex;
    // 현재 챌린지와 다른 챌린지가 선택될 때까지 반복
    do {
      nextIndex = Math.floor(Math.random() * challenges.length);
    } while (challenges.length > 1 && nextIndex === currentChallengeIndex);

    setCurrentChallengeIndex(nextIndex);
    setGameState('playing');
  };


  return (
    <div className="education-container">
      <Header />
      <div className="help-tooltip-wrapper">
        <IoHelpCircleOutline className="help-icon" />
        <div className="tooltip-box">
          <ul>
            <li>카메라와 1-2미터 거리를 유지해주세요.</li>
            <li>충분한 조명이 있는 곳에서 사용해주세요.</li>
            <li>손과 팔이 화면에 잘 보이도록 해주세요.</li>
            <li>천천히 수어해주세요.</li>
          </ul>
        </div>
      </div>

      {gameState === 'intro' && <IntroScreen onGameStart={handleGameStart} />}
      {gameState === 'playing' && <GameScreen onCorrectAnswer={handleCorrectAnswer} currentChallengeIndex={currentChallengeIndex} />}
      {gameState === 'correct' && <CorrectScreen word={correctWord} onNextChallenge={handleNextChallenge} />}
    </div>
  );
};

export default Education;