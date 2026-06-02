# Security Policy

## Reporting A Vulnerability

Do not publish suspected vulnerabilities, access codes, tokens or personal data
in a public issue. Use GitHub private vulnerability reporting when available,
or contact the repository maintainer privately.

Include:

- affected endpoint or file;
- reproduction steps using non-destructive requests;
- expected and actual behavior;
- suggested mitigation, if known.

## Security Model

The maintained threat model, automated gates and operational checklist live in
[`docs/security-model.md`](./docs/security-model.md). Run the security section of
[`docs/smoke-test.md`](./docs/smoke-test.md) after backend deployments.
