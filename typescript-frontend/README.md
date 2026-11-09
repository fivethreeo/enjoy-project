# Rsbuild project

## Setup

Install the dependencies:

```bash
npm install
```

## Get started

Start the asset development server at [http://localhost:3000](http://localhost:3000).
Django serves the HTML shell; use `python run.py parallel` from the repository
root to start the complete development stack.

```bash
npm run dev
```

The single `index` entry imports Every Layout CSS and initializes its viewport
helper. It marks the body with `with-js` and supports an optional
`.docs-nav-toggle` button controlling `.docs-nav`. Give the button
`aria-expanded="false"`, `aria-controls` matching the navigation ID, and `hidden`
so navigation stays visible and the inactive button stays hidden without JS.

Center measures use the `measure:lg` (60ch), `measure:md` (45ch), and
`measure:sm` (30ch) classes, progressing from largest to smallest.

Grid minimums are `16rem`, `20rem`, `24rem`, `28rem`, and `32rem`.
Box modifiers use the scoped `box:invert` and `box:border` classes.

Build the app for production:

```bash
npm run build
```

Preview the production build locally:

```bash
npm run preview
```

## Learn more

To learn more about Rsbuild, check out the following resources:

- [Rsbuild documentation](https://rsbuild.rs) - explore Rsbuild features and APIs.
- [Rsbuild GitHub repository](https://github.com/web-infra-dev/rsbuild) - your feedback and contributions are welcome!
