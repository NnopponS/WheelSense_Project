import httpx, time, json
t0 = time.perf_counter()
r = httpx.post('http://host.docker.internal:11434/v1/chat/completions', json={
    'model': 'qwen2.5:7b',
    'messages': [
        {'role': 'system', 'content': 'You are a helpful assistant. Summarize data concisely.'},
        {'role': 'user', 'content': 'Summarize: There are 2 active fall alerts for patient ID 70, acknowledged. Answer in 1-2 sentences.'}
    ],
    'max_tokens': 200,
    'stream': False
}, timeout=60.0)
print(f'status={r.status_code} latency={time.perf_counter()-t0:.2f}s')
d = r.json()
c = d['choices'][0]['message']['content']
print(f'reply: {c[:200]}')
