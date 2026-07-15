# SafeMind AI Security Agent Architecture

## Product boundary

SafeMind is an investigation workbench, not a chatbot. A user submits evidence and receives a case file containing a decision, confidence, evidence, additive risk score, investigation timeline, recommended actions, and provider status. The interface never presents unavailable external intelligence as fact.

## Investigation flow

1. **Coordinator** creates a case and executes agents in a controlled order.
2. **Input Agent** detects the selected input type, language, Unicode encoding, normalization, and document metadata.
3. **Threat Intelligence Agent** runs configured local reputation checks and reports whether live WHOIS or campaign providers are available.
4. **ML Agent** calls the model interface and exposes class, calibrated confidence, probability shape, features, and model identity.
5. **Evidence Agent** extracts URLs, email addresses, phone numbers, crypto wallets, credential requests, OTP requests, money requests, urgency, authority claims, and hidden Unicode.
6. **Reasoning Agent** converts observed evidence into additive score contributions. Contributions always sum to the final risk score.
7. **Decision Agent** maps the score to Safe, Suspicious, Likely Scam, High Risk, or Critical and supplies safe next actions.

The framework-neutral implementation is in `nlp_service/investigation`. `nlp_service/app.py` preserves the lightweight local HTTP adapter. `nlp_service/fastapi_app.py` provides typed HTTP and WebSocket adapters. `api/spam-check.js` provides the compatible serverless implementation.

## Stable API contract

`POST /api/investigate` and the backward-compatible `POST /api/spam-check` accept:

```json
{ "scan_type": "message", "content": "submitted evidence" }
```

The response retains `risk`, `risk_score`, `confidence`, `category`, `reason`, `indicators`, and recommendations. The `investigation` object adds:

- case ID and human-readable case number;
- status, threat type, confidence, duration, and evidence count;
- structured document metadata;
- threat-provider availability;
- model probabilities;
- evidence cards;
- additive score contributions;
- per-agent timeline;
- relationship graph nodes and edges;
- related-case and RAG availability with citations only when configured.

The `agent_run` object contains privacy-safe operational telemetry. Submitted content and content hashes are not persisted in observability tables.

## Model interface

`ModelAdapter.predict(text, input_type)` is the only contract used by the ML Agent. An adapter must return:

```text
class
confidence
probabilities
reasoning
features
model
```

New adapters can wrap scikit-learn pipelines, XGBoost, LightGBM, FastText, ONNX Runtime, PyTorch, TensorFlow, BERT, DistilBERT, RoBERTa, LSTM, or a hosted model without changing the coordinator or frontend. Model loading, versioning, calibration, and feature preprocessing belong inside the adapter.

## Threat intelligence providers

Provider interfaces should return signed or source-attributed observations with retrieval timestamps and TTLs. Recommended providers are:

- local Supabase threat directory and verified contacts;
- RDAP/WHOIS domain registration data;
- URL and sender reputation services;
- phone reputation feeds;
- government and vendor campaign alerts.

Providers must use timeouts, circuit breakers, cache TTLs, rate limits, and explicit `unavailable` results. Missing data must never be converted into a safe verdict.

## Similarity and vector search

`supabase-security-cases.sql` enables pgvector and creates 384-dimensional case and knowledge embeddings. A background worker should:

1. redact secrets and direct identifiers;
2. generate a versioned embedding;
3. insert `case_embeddings`;
4. query cosine distance with a minimum similarity threshold;
5. return only cases the requester may access through RLS.

No raw scan content is stored by the current browser workflow. Enabling semantic similarity therefore requires an explicit retention policy and consent decision, or embeddings generated before content is discarded.

## RAG

`knowledge_documents` is the retrieval store for scam education, verified government alerts, OWASP guidance, MITRE ATT&CK mappings, and vetted phishing techniques. The RAG pipeline must:

- ingest only approved sources;
- retain source URL, title, publication date, chunk identity, and embedding model;
- retrieve with vector and metadata filters;
- produce citations tied to retrieved chunks;
- distinguish sourced facts from model inference;
- return `available: false` instead of unsupported claims when retrieval is unavailable.

## Continuous learning

Users label cases as correct, incorrect, false positive, or false negative. `case_feedback` is the supervised-label source; it does not silently retrain production. A controlled training job should validate labels, remove duplicates, split data by campaign/time, measure calibration and class-specific recall, register a versioned artifact, and require approval before deployment.

## Performance and deployment

- In-process TTL caching accelerates duplicate investigations.
- FastAPI uses thread offloading for the synchronous model and provides WebSocket delivery of completed agent events.
- Production should move slow intelligence, OCR, embeddings, and model inference to workers behind a queue.
- Redis is recommended for distributed cache, rate limiting, progress, and idempotency.
- OpenTelemetry should export traces using `case_id` and `run_id`, never submitted content.
- CPU metrics report GPU throughput as unavailable. GPU workers should supply measured batch size, utilization, tokens/items per second, and model/device identity.

## Future inputs

Voice, screenshot OCR, QR, WhatsApp, Telegram, SMS, and exported email analyzers should produce the same structured document contract. They then reuse the Threat, ML, Evidence, Reasoning, and Decision agents unchanged.

## Security requirements

- Never log credentials, OTPs, recovery keys, full card numbers, or raw evidence.
- Keep service-role keys and intelligence-provider secrets server-side.
- Validate MIME type and decoded content for uploaded files.
- Apply RLS to cases, embeddings, feedback, reports, and telemetry.
- Treat all retrieved text and uploaded evidence as untrusted data, not instructions.
- Use explicit retention, deletion, and model-training consent policies before retaining content.
