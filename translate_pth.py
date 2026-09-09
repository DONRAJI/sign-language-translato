import torch
import torch.nn as nn
import torch.nn.functional as F


# --- 1. 변환하려는 모델의 클래스 정의 ---
# .pth 파일은 모델의 '설계도'가 아닌 '가중치'만 담고 있으므로,
# 반드시 모델의 설계도(클래스)를 먼저 정의해야 합니다.

class Attention(nn.Module):
    def __init__(self, hidden_size):
        super(Attention, self).__init__()
        self.attention = nn.Linear(hidden_size, 1)

    def forward(self, lstm_outputs):
        scores = self.attention(lstm_outputs).squeeze(2)
        weights = F.softmax(scores, dim=1)
        return torch.bmm(weights.unsqueeze(1), lstm_outputs).squeeze(1)


class KeypointLSTM_Attention(nn.Module):
    def __init__(self, num_classes, input_size, hidden_size=128, num_layers=1, dropout=0.5):
        super(KeypointLSTM_Attention, self).__init__()
        self.lstm = nn.LSTM(input_size, hidden_size, num_layers, batch_first=True, bidirectional=True)
        self.attention = Attention(hidden_size * 2)
        self.fc = nn.Linear(hidden_size * 2, num_classes)
        self.dropout = nn.Dropout(dropout)

    def forward(self, x):
        lstm_out, _ = self.lstm(x)
        context_vector = self.attention(lstm_out)
        return self.fc(self.dropout(context_vector))


# --- 2. 변환 설정 ---
# ※ 아래 값들은 자신의 환경에 맞게 수정해주세요.

# 불러올 .pth 파일 경로
pth_file_path = 'best_100class_model.pth'

# 저장할 .onnx 파일 경로
onnx_file_path = 'sign_language_model_ver1.onnx'

# 모델 생성 시 사용했던 파라미터
NUM_CLASSES = 100  # 총 클래스(단어) 수
KEYPOINT_DIM = 411  # 키포인트 특징의 차원
SEQUENCE_LENGTH = 150  # 시퀀스 길이

# --- 3. 모델 로드 및 가중치 불러오기 ---
print(f"'{pth_file_path}' 파일에서 가중치를 로드합니다...")

# 모델 인스턴스 생성
model = KeypointLSTM_Attention(num_classes=NUM_CLASSES, input_size=KEYPOINT_DIM)

# .pth 파일에서 가중치(state_dict) 불러오기
model.load_state_dict(torch.load(pth_file_path, map_location=torch.device('cpu')))
# 모델을 추론 모드로 설정 (매우 중요)
model.eval()

print("모델 로드 완료.")

# --- 4. 더미 입력(Dummy Input) 생성 ---
# ONNX 변환은 모델에 가상의 데이터를 한번 통과시켜 연산 그래프를 추적하는 방식으로 이루어집니다.
# 배치 크기는 1로 설정하고, 나머지 차원은 모델의 입력과 동일하게 맞춥니다.
batch_size = 1
dummy_input = torch.randn(batch_size, SEQUENCE_LENGTH, KEYPOINT_DIM)

# --- 5. ONNX로 내보내기 (Export) ---
print(f"모델을 '{onnx_file_path}' 파일로 변환합니다...")

try:
    torch.onnx.export(
        model,  # 변환할 모델
        dummy_input,  # 모델에 입력할 더미 데이터
        onnx_file_path,  # 저장될 ONNX 파일 이름
        input_names=['input'],  # ONNX 모델의 입력 레이어 이름
        output_names=['output'],  # ONNX 모델의 출력 레이어 이름
        opset_version=11,  # ONNX 버전
        dynamic_axes={  # 동적 축 설정 (배치 크기나 시퀀스 길이를 가변적으로 만듦)
            'input': {0: 'batch_size', 1: 'sequence_length'},
            'output': {0: 'batch_size'}
        }
    )
    print("ONNX 변환 성공")

except Exception as e:
    print(f"ONNX 변환 실패: {e}")