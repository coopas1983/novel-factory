# Browser Publisher v0.11
Purpose: verify that GitHub-hosted Chromium can reuse an authenticated session without the user's PC.

Secrets expected:
- NOVELPIA_STORAGE_STATE_B64
- QUARTERFULL_STORAGE_STATE_B64

Never commit raw storage-state JSON. It contains login cookies/tokens.
This version deliberately performs authentication smoke tests only; it does NOT click Publish.
Publishing selectors will be added only after authenticated CI access is proven.
