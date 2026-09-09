import React from 'react';
import { IoCameraOutline, IoPeopleOutline, IoCreateOutline } from "react-icons/io5";
import './Steps.css';

// 각 스텝을 별도의 컴포넌트로 만들어 코드의 가독성을 높입니다.
const Step = ({ number, icon, title, description }) => (
  <div className="step-column">
    <div className="step-visuals">
      <div className="step-number-wrapper">
        <div className="step-number">{number}</div>
      </div>
      <div className="step-icon-wrapper">
        {icon}
      </div>
    </div>
    <div className="step-text">
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  </div>
);

const Steps = () => {
  return (
    <section id="steps" className="steps-section">
      {/* ✅ 제목 블록을 Steps 컴포넌트 내부로 다시 이동 */}
      <div className="steps-title-block">
        <h2>간단한 3단계로 시작하세요</h2>
        <p>복잡한 설정 없이 바로 사용할 수 있습니다.</p>
      </div>
      <div className="steps-grid">
        <Step 
          number="1" 
          icon={<IoCameraOutline />} 
          title="웹캠 켜기" 
          description="브라우저에서 카메라 권한을 허용하고 웹캠을 활성화하세요." 
        />
        <div className="arrow"></div>
        <Step 
          number="2" 
          icon={<IoPeopleOutline />} 
          title="수어하기" 
          description="카메라 앞에서 자연스럽게 수어로 대화하세요." 
        />
        <div className="arrow"></div>
        <Step 
          number="3" 
          icon={<IoCreateOutline />} 
          title="대화 확인하기" 
          description="실시간으로 번역된 텍스트와 음성을 확인하세요." 
        />
      </div>
      
      <div className="testimonials">
        <h2>사용자들의 따뜻한 이야기</h2>
        <div className="testimonial-grid">
          <div className="testimonial-item">
            <p>“지하철에서 청각장애인 분과 소통할 수 있었어요. <br />정말 신기하고 감동적인 경험이었습니다.”</p>
            <div className="author">
              <img src="/girl.png" width={40} height={40} alt="대학생님" />
              <span>권ㅇㅇ님 <small>대학생</small></span>
            </div>
          </div>
          
          <div className="testimonial-item">
            <p>“병원에서 의료진과 소통하는데 정말 도움이 되었어요.<br />빠르고 정확한 번역에 감사드립니다.”</p>
            <div className="author">
              <img src="/hongminki.png" width={40} height={40} alt="홍민기님" />
              <span>홍민기님 <small>직장인</small></span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Steps;