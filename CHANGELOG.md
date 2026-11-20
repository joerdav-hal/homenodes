# Changelog

## Unreleased

- Moved out of a homelab repository into its own project, as ES modules with JSDoc types,
  tests, a made-up house for development, and CI. Behaviour is unchanged: the old file and
  the new modules render identical output for the same house.
- The panel's custom element is now `homenodes-panel`, and layouts are saved under
  `homenodes`. A layout saved under the old `automap` key is picked up once.
