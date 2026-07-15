# SafeMind

SafeMind is an AI-assisted security platform that helps people investigate suspicious phone numbers, messages, links, and email senders before taking action.

The product combines explainable classification, threat indicators, verified records, and practical safety guidance in a focused bilingual experience. It is designed to make scam analysis understandable without overwhelming the user with technical detail.

**Live application:** [safemind-tau.vercel.app](https://safemind-tau.vercel.app)

## Product vision

Online scams increasingly rely on urgency, impersonation, credential theft, malicious links, and payment pressure. SafeMind turns these signals into a clear investigation result: what looks suspicious, why it matters, and what the user should do next.

The experience is built around three principles:

- **Clarity** — concise results, readable risk levels, and direct recommendations.
- **Evidence** — classifications supported by visible warning signals and confidence values.
- **Safety** — privacy-aware handling, cautious language, and human review for uncertain cases.

## Core capabilities

### Multi-channel scam checking

SafeMind supports four focused investigation modes:

- Phone number checking
- Suspicious message analysis
- Link and domain inspection
- Email sender analysis

Each mode uses validation and threat signals appropriate to the submitted content instead of treating every input as generic text.

### AI security agent

The analysis engine behaves as a coordinated security agent rather than a simple keyword checker. It interprets intent, identifies relevant entities, selects analysis tools, evaluates evidence, and produces an actionable assessment.

An investigation can include:

- Risk score and confidence
- Scam category and likely intent
- Detected warning signals
- Explainable score contributions
- Recommended next actions
- Human-review guidance
- Structured case and investigation timeline data

### Multilingual experience

The interface supports English and Burmese across navigation, forms, scanner controls, analysis states, reports, education content, and safety recommendations. Typography and spacing are adapted for Burmese readability rather than relying on direct word replacement alone.

### Reporting and review

Users can submit suspicious activity for review and attach supporting screenshots. Upload validation limits accepted formats and file size, while report states support a clear review workflow.

### Security education

SafeMind includes educational material that helps users recognize common manipulation patterns such as urgency, impersonation, credential requests, remote-access scams, prize fraud, and payment pressure.

### Browser extension

The companion Manifest V3 extension provides a lightweight path into SafeMind from supported browsers. It uses a minimal-permission design and does not request access to browsing history, passwords, form data, or page content.

## Analysis approach

SafeMind uses a hybrid detection pipeline:

1. The input is normalized and validated for its selected checker type.
2. Deterministic security rules identify high-confidence indicators.
3. The NLP layer evaluates language, intent, urgency, impersonation, and social-engineering patterns.
4. Evidence is combined into an explainable risk assessment.
5. The decision layer produces a verdict, confidence level, and safe next steps.

The local NLP service uses spaCy-compatible multilingual processing, NLTK stemming, and a trained Naive Bayes classifier. The architecture is modular so additional threat-intelligence providers and model adapters can be introduced without redesigning the user experience.

## Experience and design

The interface uses a restrained security-focused visual system with:

- Accessible light and dark themes
- Responsive desktop and mobile navigation
- Wide, readable cards and comfortable text spacing
- Clear active, loading, success, warning, and error states
- Keyboard-visible focus treatment
- Reduced-motion support
- Compact controls for smaller screens

The scanner intentionally avoids a conventional chat layout. Results are presented as a structured investigation so users can quickly understand the evidence and act safely.

## Technical architecture

SafeMind is organized into distinct product and analysis layers:

| Layer | Responsibility |
| --- | --- |
| Web client | Responsive interface, localization, validation, and investigation views |
| Security API | Unified request validation and explainable analysis responses |
| NLP service | Classification, intent detection, entity extraction, and security heuristics |
| Agent runtime | Investigation coordination, evidence evaluation, and decision logic |
| Extension | Minimal-permission browser entry point |
| PWA layer | Installable application metadata and offline-ready assets |

The production web application is built with Vite and deployed through Vercel. The analysis API supports message, link, email, and phone inputs through a consistent contract.

## Repository map

```text
api/                 Production security API endpoints
docs/                Architecture and engineering documentation
extension/           Manifest V3 browser extension
nlp_service/         Python NLP and agent investigation services
public/              Brand, PWA, icon, and font assets
scripts/             Development and validation utilities
src/css/             Shared and page-level visual systems
src/js/              Application behavior and analysis experiences
src/pages/           Product pages and authenticated views
tests/               NLP and security-analysis tests
```

## Security and privacy

SafeMind follows conservative security defaults:

- Submitted content is treated as untrusted input.
- Browser code never requires privileged server credentials.
- API responses expose user-facing results rather than internal operational telemetry.
- Screenshot uploads are restricted by type and size.
- Security headers limit framing, content sources, browser permissions, and object execution.
- Automated results are presented as decision support, not a guarantee of safety.

Users should independently verify unexpected requests through an organization’s official application, website, or published phone number. Passwords, one-time codes, recovery keys, and payment credentials should never be submitted.

## Engineering quality

The project includes production build validation, NLP unit tests, browser-extension validation, health checks, responsive layouts, and explicit failure states. Core verification commands are available through the project scripts:

```bash
npm run test:nlp
npm run build:all
npm run test:extension
```

## Documentation

Detailed agent architecture, investigation contracts, model boundaries, evidence flow, and security considerations are documented in [AI_SECURITY_AGENT_ARCHITECTURE.md](docs/AI_SECURITY_AGENT_ARCHITECTURE.md).

---

SafeMind is built to help users pause, investigate, and make safer decisions before responding to suspicious digital content.
