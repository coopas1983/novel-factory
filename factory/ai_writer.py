from __future__ import annotations
import json, os, urllib.request, urllib.error, time, random, socket
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
        return WriterConfig("gemini",os.getenv("GEMINI_MODEL","gemini-3.6-flash"),os.getenv("GOOGLE_API_KEY",""))
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

def _get_json(url):
    req=urllib.request.Request(url,method="GET")
    with urllib.request.urlopen(req,timeout=60) as r:
        return json.loads(r.read().decode())

def gemini_available_models(api_key):
    url=f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}"
    data=_get_json(url)
    out=[]
    for m in data.get("models",[]):
        methods=m.get("supportedGenerationMethods",[])
        if "generateContent" in methods:
            out.append(m.get("name","").replace("models/",""))
    return out

def choose_gemini_model(api_key, preferred):
    available=gemini_available_models(api_key)
    # Prefer explicit stable models, then latest alias, then any text Gemini model.
    candidates=[preferred,"gemini-3.8-flash","gemini-3.7-flash","gemini-3.6-flash",
                "gemini-3.5-flash","gemini-flash-latest"]
    for c in candidates:
        if c in available:
            return c, available
    fallback=next((m for m in available if m.startswith("gemini-") and not m.startswith("gemini-2.5")
                   and "image" not in m and "tts" not in m and "live" not in m
                   and "embedding" not in m),None)
    if fallback:
        return fallback, available
    raise RuntimeError("GEMINI_MODEL_BLOCKED: no generateContent Gemini model available for this API key")

def _gemini_call(api_key, model, prompt):
    url=f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
    return _post(url,{"Content-Type":"application/json"},
                 {"system_instruction":{"parts":[{"text":SYSTEM}]},
                  "contents":[{"parts":[{"text":prompt}]}]})

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
        preferred, available=choose_gemini_model(cfg.api_key,cfg.model)
        ordered=[preferred]+[m for m in available if m!=preferred and m.startswith("gemini-")
                             and "image" not in m and "tts" not in m and "live" not in m
                             and "embedding" not in m and not m.startswith("gemini-2.5")]
        # Avoid trying an excessive catalog; enough to survive transient capacity issues.
        ordered=ordered[:5]
        failures=[]
        for model in ordered:
            for attempt in range(1,4):
                try:
                    data=_gemini_call(cfg.api_key,model,prompt)
                    return data["candidates"][0]["content"]["parts"][0]["text"]
                except (TimeoutError, socket.timeout, urllib.error.URLError) as e:
                    failures.append({"model":model,"attempt":attempt,"code":"NETWORK_TIMEOUT","body":str(e)[:250]})
                    if attempt<3:
                        delay=(2**attempt)+random.uniform(0,1)
                        print(f"GEMINI_RETRY model={model} attempt={attempt} network_timeout wait={delay:.1f}s")
                        time.sleep(delay)
                        continue
                    print(f"GEMINI_FAILOVER model={model} after network timeout")
                    break
                except urllib.error.HTTPError as e:
                    body=e.read().decode("utf-8","replace")
                    failures.append({"model":model,"attempt":attempt,"code":e.code,"body":body[:250]})
                    # transient server/capacity/rate conditions: backoff, then model failover
                    if e.code == 404:
                        print(f"GEMINI_SKIP_UNAVAILABLE model={model} http=404")
                        break
                    if e.code in (429,500,502,503,504):
                        if attempt<3:
                            delay=(2**attempt)+random.uniform(0,1)
                            print(f"GEMINI_RETRY model={model} attempt={attempt} http={e.code} wait={delay:.1f}s")
                            time.sleep(delay)
                            continue
                        print(f"GEMINI_FAILOVER model={model} after transient HTTP {e.code}")
                        break
                    raise RuntimeError(f"GEMINI_HTTP_{e.code}: model={model}; {body[:700]}") from e
        raise RuntimeError("GEMINI_ALL_MODELS_BUSY: "+json.dumps(failures,ensure_ascii=False))
    raise RuntimeError("AI_WRITER_BLOCKED: set NOVEL_FACTORY_PROVIDER to openai, anthropic, or gemini")
