# Security

## Reporting a problem

Please report security problems privately, through
[GitHub's private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
on this repository, rather than in a public issue. Include what you found, how to reproduce
it, and the Home Assistant and HomeNodes versions. You should hear back within a week.

## What HomeNodes promises

- **No outside requests.** The panel talks only to Home Assistant's own WebSocket, through the
  connection Home Assistant gives it. It loads no code or data from anywhere else.
- **Admin only.** The panel is registered for administrators, and every command it sends is
  one Home Assistant already restricts to administrators.
- **Text stays text.** Entity names, automation aliases and descriptions come from your Home
  Assistant and are inserted as text nodes, never parsed as HTML.
- **No string evaluation.** No `eval`, `new Function` or string timers.
- **What you install is what's here.** The frontend has no build step, bundler or runtime
  dependency.

`scripts/check.mjs` enforces the first, third and fourth points on every change in CI.

## In scope

Anything that breaks those promises, lets a non-admin reach the panel's data or actions, or
lets content from Home Assistant (a name, a description, a template) run as code in the
browser.
