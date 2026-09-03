from __future__ import annotations
import json, os, urllib.request, urllib.error
from dataclasses import dataclass

SYSTEM = """당신은 한국 상업 장르소설 전문 작가다.
설정집과 회차 설계를 엄격히 지키되, 이전 회차 문장을 재사용하지 않는다.
설명보다 장면/행동/대화로 전개한다. 매 회차에는 새로운 정보 또는 상태 변화가 있어야 한다.
유명 작가의 문체를 모사하지 말고 독자적인 현대 한국어 문장으로 쓴다."""

@dataclass
class WriterConfig:
    provider:str
    model:str
    api_key:str

def config_from_env():
    provider=os.getenv("NOVEL_FACTORY_PROVIDER","").lower()
    if provider=="openai":
        return WriterConfig("openai",os.getenv("OPENAI_MODEL","gpt-5-mini"),os.getenv("OPENAI_API_KEY",""))
    if provider=="anthropic":
        return WriterConfig("anthropic",os.getenv("ANTHROPIC_MODEL","claude-sonnet-4-20250514"),os.getenv("ANTHROPIC_API_KEY",""))
    if provider=="gemini":
        return WriterConfig("gemini",os.getenv("GEMINI_MODEL","gemini-2.5-flash"),os.getenv("GOOGLE_API_KEY",""))
    return WriterConfig("none","","")

def build_prompt(bible, beat, memory):
    recent=memory.get("chapter_summaries",[])[-3:]
    return f"""[작품 설정]
{json.dumps(bible,ensure_ascii=False)}

[이번 회차 설계]
{json.dumps(beat,ensure_ascii=False)}

[최근 회차 요약]
{json.dumps(recent,ensure_ascii=False)}

[열린 떡밥]
{json.dumps(memory.get('open_hooks',[]),ensure_ascii=False)}

1800~2600자 분량의 이번 회차 본문만 작성하라.
필수: 회차 목표를 장면으로 달성, 이전 회차와 다른 시작 장면, 최소 1개 관계/정보 변화,
마지막 15% 안에 다음 회차를 읽게 만드는 구체적 사건.
금지: '이전까지의 변화:' 같은 메타문구, 같은 문단 반복, 설정집 설명식 복사."""

def _post(url, headers, payload):
    req=urllib.request.Request(url,data=json.dumps(payload).encode(),headers=headers,method="POST")
    with urllib.request.urlopen(req,timeout=120) as r:
        return json.loads(r.read().decode())

def generate(cfg, prompt):
    if not cfg.api_key:
        raise RuntimeError(f"AI_WRITER_BLOCKED: {cfg.provider} API key is missing")
    if cfg.provider=="openai":
        data=_post("https://api.openai.com/v1/responses",
                   {"Authorization":f"Bearer {cfg.api_key}","Content-Type":"application/json"},
                   {"model":cfg.model,"instructions":SYSTEM,"input":prompt})
        return data["output"][0]["content"][0]["text"]
    if cfg.provider=="anthropic":
        data=_post("https://api.anthropic.com/v1/messages",
                   {"x-api-key":cfg.api_key,"anthropic-version":"2023-06-01","content-type":"application/json"},
                   {"model":cfg.model,"max_tokens":5000,"system":SYSTEM,
                    "messages":[{"role":"user","content":prompt}]})
        return data["content"][0]["text"]
    if cfg.provider=="gemini":
        url=f"https://generativelanguage.googleapis.com/v1beta/models/{cfg.model}:generateContent?key={cfg.api_key}"
        data=_post(url,{"Content-Type":"application/json"},
                   {"system_instruction":{"parts":[{"text":SYSTEM}]},
                    "contents":[{"parts":[{"text":prompt}]}]})
        return data["candidates"][0]["content"]["parts"][0]["text"]
    raise RuntimeError("AI_WRITER_BLOCKED: set NOVEL_FACTORY_PROVIDER to openai, anthropic, or gemini")
