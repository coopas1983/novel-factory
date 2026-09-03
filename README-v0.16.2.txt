# v0.16.2 Hygiene Gate overlay

덮어쓸 파일:
- factory/text_hygiene.py
- factory/commercial_episode.py
- tests/test_text_hygiene.py

효과:
- U+FFFD 깨진 문자 차단
- 태국 문자 차단
- NUL/control 문자 차단
- 현재 파일에서 확인된 의심 표현(시커룝게 / 푸른 청색광 / 거센 거친) 차단
- Commercial Episode Gate가 이 검사를 통과해야 PASS

주의: 현재 1화 자체를 임의 치환하지 않습니다. 다음 Commercial Episode Gate 재생성에서 깨끗한 원고만 커밋되도록 fail-closed 합니다.
