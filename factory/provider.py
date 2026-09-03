from __future__ import annotations
from typing import Protocol

class Provider(Protocol):
    def generate_json(self, task: str, payload: dict) -> dict | list:
        """Return structured model output."""
        ...

class OfflineValidationProvider:
    """Zero-cost deterministic provider used only to validate the pipeline plumbing."""
    def generate_json(self, task: str, payload: dict):
        if task == "market_discovery":
            return {
                "signals": [
                    {"genre":"현대판타지","signal":"일상 공간 + 단일 초현실 규칙","strength":82},
                    {"genre":"미스터리","signal":"생활밀착형 비밀과 짧은 회차 훅","strength":86},
                    {"genre":"휴먼드라마","signal":"가족·관계 갈등에 장르 장치 결합","strength":80}
                ],
                "avoid":["특정 인기작의 고유 설정 복제","유명 캐릭터/세계관 차용"]
            }
        if task == "concept_generation":
            return [
                {"title":"야간 분실물 보관소","genre":"현대판타지/미스터리","hook":"마지막 지하철 뒤 분실물 센터에는 사람들이 잃어버린 물건이 아니라 잃어버린 선택이 들어온다.","market_fit":86,"originality":88,"series_potential":89,"emotion":87},
                {"title":"벽 너머의 관리사무소","genre":"생활미스터리","hook":"신축 아파트 관리소 직원이 도면에 없는 세대들의 민원을 받기 시작한다.","market_fit":88,"originality":87,"series_potential":91,"emotion":82},
                {"title":"오늘만 가족입니다","genre":"휴먼드라마/미스터리","hook":"가족 역할을 하루 대신해주는 대행업체에 존재하지 않는 의뢰인의 예약이 접수된다.","market_fit":84,"originality":90,"series_potential":86,"emotion":93},
                {"title":"퇴사자는 출입할 수 없습니다","genre":"오피스 판타지","hook":"퇴사한 회사에 매일 밤 자신의 사원증 출입기록이 찍히는 남자가 사라진 동료들의 흔적을 쫓는다.","market_fit":90,"originality":85,"series_potential":88,"emotion":84},
                {"title":"비 오는 날만 열리는 세탁소","genre":"감성판타지/미스터리","hook":"비 오는 밤 옷의 얼룩과 함께 그날의 후회까지 지워주는 세탁소에서 지울 수 없는 한 벌이 발견된다.","market_fit":85,"originality":86,"series_potential":83,"emotion":94}
            ]
        raise ValueError(task)
