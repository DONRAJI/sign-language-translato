import React, { useState, useEffect, useRef } from 'react';
import Webcam from 'react-webcam';
import { Holistic } from '@mediapipe/holistic';
import { Camera } from '@mediapipe/camera_utils';

import Header from '../../components/Header/Header';
import { IoEyeOutline, IoHappyOutline, IoEnterOutline, IoHelpCircleOutline, IoCheckmarkCircle } from "react-icons/io5";
import './Education.css';
import {
  MIRROR_MODEL_INPUT, MIRROR_PREVIEW, HOLISTIC_OPTIONS,
  CAPTURE_WIDTH, CAPTURE_HEIGHT, resolveMediaPipeFile,
} from '../../lib/signConfig';

// 학습할 단어 데이터
const challenges = [
  { word: '감기', videoSrc: '/videos/NIA_SL_WORD1537_REAL01_D.mp4' },
  { word: '고민', videoSrc: '/videos/NIA_SL_WORD1501_REAL01_D.mp4' },
  { word: '라면', videoSrc: '/videos/NIA_SL_WORD1590_REAL01_D.mp4' },
  { word: '수어', videoSrc: '/videos/NIA_SL_WORD1503_REAL01_D.mp4' },
  { word: '슬프다', videoSrc: '/videos/NIA_SL_WORD1509_REAL01_D.mp4' }

];

// 특징 스키마와 추론은 Phase 1에서 새로 정의한다. (ARCHITECTURE.md 참고)
// 구 411차원 구현은 OpenPose 기반 모델 전용이라 제거했다.

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

  const cameraRef = useRef(null);

  // ✅ 영상 재생 횟수를 추적하는 state 추가
  const [playCount, setPlayCount] = useState(0);

  const currentChallenge = challenges[currentChallengeIndex];

  // Phase 1에서 지문자 모델 로딩이 여기에 들어간다.

  // ✅ 문제가 바뀌면 재생 횟수를 리셋
  useEffect(() => {
    setPlayCount(0);
  }, [currentChallengeIndex]);


  // ✅ 웹캠이 성공적으로 켜졌을 때 MediaPipe 카메라를 시작하는 함수
  const startMediaPipeCamera = () => {
    const holistic = new Holistic({ locateFile: resolveMediaPipeFile('holistic') });
    holistic.setOptions(HOLISTIC_OPTIONS);
    holistic.onResults(onResults);

    if (!webcamRef.current || !webcamRef.current.video) return;
    const video = webcamRef.current.video;

    // 모델에 넣는 영상의 좌우 반전 여부는 signConfig 한 곳에서만 정한다.
    // <Webcam mirrored>는 CSS라 표시만 바꾸고 실제 픽셀은 그대로이므로,
    // 반전이 필요하면 캔버스에 직접 그려야 한다.
    const mirrorCanvas = MIRROR_MODEL_INPUT ? document.createElement('canvas') : null;
    const mirrorCtx = mirrorCanvas ? mirrorCanvas.getContext('2d') : null;

    const toModelInput = () => {
      if (!MIRROR_MODEL_INPUT) return video;

      const w = video.videoWidth;
      const h = video.videoHeight;
      if (!w || !h) return null; // 첫 프레임 전에는 크기가 0이다

      if (mirrorCanvas.width !== w || mirrorCanvas.height !== h) {
        mirrorCanvas.width = w;
        mirrorCanvas.height = h;
      }
      // setTransform(-1, 0, 0, 1, w, 0) → x' = w - x (좌우 반전)
      mirrorCtx.setTransform(-1, 0, 0, 1, w, 0);
      mirrorCtx.drawImage(video, 0, 0, w, h);
      mirrorCtx.setTransform(1, 0, 0, 1, 0, 0);
      return mirrorCanvas;
    };

    cameraRef.current = new Camera(video, {
      onFrame: async () => {
        if (!webcamRef.current || !webcamRef.current.video) return;
        const image = toModelInput();
        if (image) await holistic.send({ image });
      },
      width: CAPTURE_WIDTH,
      height: CAPTURE_HEIGHT,
    });
    cameraRef.current.start();
  };

  const onResults = (results) => {
    if (!webcamRef.current || !canvasRef.current) return;

    const canvasCtx = canvasRef.current.getContext("2d");
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    // 랜드마크 시각화가 필요하면 여기에 그린다.
    canvasCtx.restore();

    // TODO(Phase 1): 여기서 특징을 추출해 지문자 모델에 넘긴다.
    // 현재 채점은 handleVideoEnded의 영상 재생 횟수로만 이뤄지며 모델과 무관하다.
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
              mirrored={MIRROR_PREVIEW}
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