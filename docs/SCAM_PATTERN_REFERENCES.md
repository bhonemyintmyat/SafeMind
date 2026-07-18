# Scam pattern references

SafeMind uses public scam-awareness material to identify reusable behavioral signals. Reference material informs categories, training paraphrases, rule combinations, and safe counterexamples; it is not used as an exact-match verdict list.

## Panda Security text-message examples

- Source: https://www.pandasecurity.com/en/mediacenter/spam-text-message-examples/
- Reviewed: 2026-07-18
- Derived pattern families: fake delivery and toll charges, fake task jobs, account and bank alerts, impersonation, prizes, subscription and refund lures, debt or utility threats, credential requests, urgency, payment requests, and suspicious links.

Implementation rules:

- Training messages are newly written paraphrases, not copied examples.
- A category requires behavioral combinations where practical; isolated words such as “hotel,” “package,” or “review” are not enough.
- Safe counterexamples are included for each high-risk family to reduce false positives.
- Unseen paraphrases must pass regression tests before release.
