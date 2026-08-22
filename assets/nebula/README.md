# Nebula production asset intake

The approved brand reference is a 1254px square RGB PNG with a deep navy background and no alpha channel. It establishes the final visual direction, but it is not suitable as an adaptable production wordmark, light-surface logo, monochrome native mark, or app-icon source. Do not derive permanent vector or app-icon assets by automatically tracing it.

The final approved asset package should provide:

- `logo-horizontal-dark.svg` — mark and wordmark for dark surfaces;
- `logo-horizontal-light.svg` — mark and wordmark for light surfaces;
- `mark-color.svg` — transparent full-color standalone mark;
- `mark-monochrome.svg` — single-color mark for constrained native surfaces; and
- `app-icon-source.svg` — square-safe source artwork with documented padding for the existing icon export pipeline.

After approval, use the repository's existing icon export scripts to regenerate desktop, web, and mobile outputs. Until then, the product shell uses a temporary code-rendered mark and inherited generated app icons remain untouched.
