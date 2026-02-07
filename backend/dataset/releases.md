# Release Notes

## v2.5 – Released Sep 20, 2025

Security hardening applied. Auth timeout enforced to 45s max per policy.

## v2.4 – Released Sep 15, 2025

- **Staging auth fixes.** Temporary timeout increase for debugging.
- Resolves staging login latency (AUTH-101).
- Note: Release was cut from main branch; config change from commit 8a2f4c9 (AUTH_TIMEOUT = 90) is included in this release.
