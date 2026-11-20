# Privacy and security

- **Nothing leaves your Home Assistant.** The panel talks only to Home Assistant's own WebSocket,
  loads nothing from a CDN, and has no runtime dependencies. CI fails if the frontend ever gains a
  network call or an outside URL.
- **Admin only.** The panel is registered for administrators. Automation and script
  configurations, traces and blueprints come from commands Home Assistant restricts to
  administrators.
- **Read-only unless allowed.** No services are called until
  [Allow controls](options.md#allow-controls) is on, and **Run actions** asks first.
- **Text stays text.** Names and descriptions are never parsed as HTML. CI renders a house of
  hostile names in headless Chrome and fails if any becomes an element or a script.
- **Light on Home Assistant.** At most 50 live template subscriptions, none while the tab is in
  the background; history and logbook queries are bounded and time out.
- **Diagnostics** contain versions, options and counts, never names.

Report a security problem privately through GitHub's private vulnerability reporting on the
repository.
