// ==================================================================
// 수어 인식 파이프라인 공통 설정
//
// 학습과 추론이 어긋나면 인식률이 조용히 무너진다. 그런 불일치가
// 생기지 않도록 파이프라인 전체가 참조하는 값을 여기 한 곳에만 둔다.
// 이 파일의 값을 바꾸면 학습 데이터도 같은 설정으로 다시 만들어야 한다.
//
// 배경은 ARCHITECTURE.md의 "6. 좌우 반전은 버그가 아니라 정책이다" 참고.
// ==================================================================

/**
 * 모델에 넣는 영상을 좌우 반전할지 여부.
 *
 * 주의: 화면에 보여주는 미러링(거울 모드 UX)과는 별개다.
 * <Webcam mirrored>는 CSS transform이라 표시만 바꾸고 실제 픽셀은 그대로다.
 * 모델 입력을 뒤집으려면 캔버스에 직접 그려야 한다.
 *
 * 현재 정책: 반전하지 않는다.
 * 카메라 원본 방향을 그대로 쓰고, 좌우 대응은 학습 시
 * 좌우 반전 증강으로 해결한다. 그래야 왼손잡이 사용자도 인식된다.
 */
export const MIRROR_MODEL_INPUT = false;

/** 화면에 보여줄 때 거울처럼 뒤집을지 (UX 전용, 모델과 무관) */
export const MIRROR_PREVIEW = true;

/** MediaPipe 자산을 어디서 불러올지. 'cdn' 또는 'local' */
export const MEDIAPIPE_SOURCE = 'cdn';

/** MEDIAPIPE_SOURCE 에 따른 파일 경로 해석기 */
export const resolveMediaPipeFile = (pkg) => (file) =>
  MEDIAPIPE_SOURCE === 'local'
    ? `/mediapipe/${pkg}/${file}`
    : `https://cdn.jsdelivr.net/npm/@mediapipe/${pkg}/${file}`;

/** MediaPipe Holistic 공통 옵션 */
export const HOLISTIC_OPTIONS = {
  modelComplexity: 1,
  smoothLandmarks: true,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5,
};

/** 웹캠 입력 해상도 */
export const CAPTURE_WIDTH = 640;
export const CAPTURE_HEIGHT = 480;

// ==================================================================
// 특징 스키마
//
// Phase 1(지문자)에서 확정한다. MediaPipe 3D 좌표를 기준으로 하며,
// 확정되면 이 파일에 차원·순서·좌표계를 명시하고
// 학습 스크립트가 같은 정의를 참조하도록 한다.
//
// 확정 전까지는 어떤 코드도 자체적인 특징 스키마를 정의하지 않는다.
// ==================================================================
