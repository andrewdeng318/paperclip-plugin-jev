# Changelog

All notable changes to this project are documented in this file.

## 0.3.2 - 2026-09-21

- Increase the TypeSafe request timeout and bounded retry budget for automatic issue triage.
- Allow failed automatic analyses to be retried when an event is redelivered.
- Record automatic triage failures in the issue activity log.

## 0.3.1 - 2026-09-21

- Connect directly to the official TypeSafe API.
- Rename API key guidance to distinguish TypeSafe credentials from third-party Jev AI credentials.
- Keep the existing secret-reference field compatible with installed configurations.

## 0.3.0 - 2026-09-21

- Add a Jev-powered browser decision agent tool.
- Add Observe only, Confirm mutations, and Auto safe actions policies.
- Restrict browser analysis to an exact-origin allowlist.
- Require snapshot identifiers so executors can reject stale decisions.
- Make visible page text disclosure opt-in and disabled by default.
- Use indexed observed targets instead of selectors, coordinates, or executable code.
- Exclude screenshots and input values from browser disclosures.
- Require independent outcome verification and confirmation for sensitive controls.
- Add browser decision unit and integration coverage.

## 0.2.0 - 2026-09-20

- Add Advisory, Auto when confident, and Always auto modes.
- Add confidence thresholds and missing-context protection.
- Add issue-created event automation with idempotency protection.
- Add automatic owner and priority updates.
- Use a fixed Jev AI API endpoint.
- Add eight automated tests.

## 0.1.0 - 2026-09-20

- Add manual advisory analysis for Paperclip issues.
