ONE-TIME PATCH BRIDGE
저장소 루트에 .github 폴더를 한 번 덮어씌우면 됩니다.
이 workflow는 permissions: contents: write로 파일 단위 수정 후 commit/push합니다.
안전장치: 수동 dispatch, 경로 검증, UTF-8/base64 검증, git diff --check, 동시 실행 직렬화.
주의: 현재 ChatGPT GitHub 연결에는 workflow_dispatch 실행 기능이 노출되지 않아,
새 run 시작 자체는 여전히 사용자의 클릭이 필요할 수 있습니다.
