# Security

## Reporting a problem

Please report security problems privately, through
[GitHub's private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
on this repository, rather than in a public issue. Include what you found, how to reproduce
it, and the Home Assistant and HomeNodes versions. You should hear back within a week.

## What HomeNodes promises

- **No outside requests.** The panel talks only to Home Assistant's own WebSocket, through the
  connection Home Assistant gives it. It loads no code or data from anywhere else.
- **Admin only.** The panel is registered for administrators. What it reads beyond what any
  signed-in user can already see (automation and script configurations, traces, blueprints)
  comes from commands Home Assistant restricts to administrators. If an administrator opens
  the panel to other users from the sidebar editor, they see automation names and history but
  not how the automations work.
- **Read-only unless allowed.** The panel calls no services until **Allow controls** is turned
  on in the integration's options.
- **Hidden means unread.** Automations and scripts with a hidden label are skipped before their
  configuration is requested.
- **Text stays text.** Entity names, automation aliases and descriptions come from your Home
  Assistant and are inserted as text nodes, never parsed as HTML.
- **No string evaluation.** No `eval`, `new Function` or string timers.
- **What you install is what's here.** The frontend has no build step, bundler or runtime
  dependency.

`scripts/check.mjs` enforces the first, third and fourth points on every change in CI, and
`scripts/browser-check.mjs` renders a house of hostile names in headless Chrome and fails if any
of them becomes an element, an attribute or a script.

## Load on Home Assistant

- At most 50 live template subscriptions, each limited by Home Assistant to 3 seconds of
  rendering, and none while the tab is in the background.
- History and logbook queries cover at most 3 days (history) or 30 days (activity heat), and
  the panel stops waiting after 60 seconds.

## In scope

Anything that breaks those promises, lets a non-admin reach the panel's data or actions, or
lets content from Home Assistant (a name, a description, a template) run as code in the
browser.
