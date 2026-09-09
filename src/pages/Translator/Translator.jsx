import React, { useState, useRef, useEffect } from 'react';
import Webcam from 'react-webcam'; // ✅ react-webcam 임포트
import Header from '../../components/Header/Header';
import { IoClose } from 'react-icons/io5';
import './Translator.css';

const Translator = () => {
  const [isWebcamOn, setIsWebcamOn] = useState(false);
  const [isModelLoading] = useState(false);
  const [currentWord] = useState('');
  const [translatedSentences] = useState([]);
  
  const webcamRef = useRef(null);
  
  useEffect(() => {
    // Translator 페이지가 마운트될 때 body 배경을 그라데이션으로 설정
    document.body.style.background = 'linear-gradient(180deg, #FFBCB7 0%, #DDA9D9 100%)';

    // 컴포넌트가 언마운트(사라질 때)될 때 실행될 클린업 함수
    return () => {
      // 다른 페이지에 영향을 주지 않도록 body 배경을 원래대로 복구
      document.body.style.background = ''; 
    };
  }, []); // []를 비워두면 컴포넌트가 처음 마운트될 때 딱 한 번만 실행됩니다.

  // TODO(Phase 1): 지문자 인식을 브라우저에서 수행한다.
  // 프레임을 서버로 보내던 구조는 제거했다. 전송 비용 때문에 프레임 레이트를
  // 낮출 수밖에 없어 궤적이 사라지고, 서버 추론은 동시 사용자에서 병목이 된다.
  // 자세한 배경은 ARCHITECTURE.md "7. 추론은 브라우저에서 한다" 참고.

  return (
    <div className="translator-container">
      <Header />
      <div className="content-wrapper">
        <h1 className="page-title">실시간 수어 통역</h1>
        <div className="grid-container">
          <div className="grid-item webcam-card">
            <div className="card-header">
              <h3>웹캠 화면</h3>
              <div className="camera-toggle">
                <span>카메라</span>
                <input type="checkbox" checked={isWebcamOn} readOnly onClick={() => setIsWebcamOn(!isWebcamOn)} />
              </div>
            </div>
            <div className="webcam-body">
              <Webcam
                audio={false}
                ref={webcamRef}
                screenshotFormat="image/jpeg"
                className="webcam-video"
                hidden={!isWebcamOn} // 웹캠이 꺼져있을 땐 숨김
              />
              {isModelLoading && <div className="loading-overlay">AI 모델을 불러오는 중...</div>}
              {!isWebcamOn && (
                <div className="webcam-placeholder" onClick={() => setIsWebcamOn(true)}>
                  카메라 버튼을 눌러주세요
                </div>
              )}
            </div>
          </div>
          
          <div className="grid-item translated-card">
            <h3>번역된 문장</h3>
            <div className="translated-list">
              {translatedSentences.map(sentence => (
                <div key={sentence.id} className="translated-item">
                  <div className="item-header"><span>{sentence.title}</span><button className="close-btn"><IoClose /></button></div>
                  <p>{sentence.text}</p>
                </div>
              ))}
            </div>
          </div>
          
          <div className="grid-item recognized-card">
            <h3>현재 인식된 단어</h3>
            <div className="recognized-content">
              <span>{isWebcamOn ? (currentWord || '...') : ''}</span>
              <p>{isWebcamOn ? (currentWord ? '단어가 인식되었습니다' : '인식 대기 중...') : ''}</p>
            </div>
          </div>
          
          <div className="grid-item tips-card">
            <h3>사용 팁</h3>
            <ul>
              <li>카메라와 1-2미터 거리를 유지해주세요.</li>
              <li>충분한 조명이 있는 곳에서 사용해주세요.</li>
              <li>손과 팔이 화면에 잘 보이도록 찍주세요.</li>
              <li>천천히 수어해주세요.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Translator;