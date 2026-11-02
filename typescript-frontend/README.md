# Rsbuild project

## Setup

Install the dependencies:

```bash
npm install
```

## Get started

Start the dev server, and the app will be available at [http://localhost:3000](http://localhost:3000).

```bash
npm run dev
```

The standalone Every Layout editor playground is available at
[http://localhost:3000/playground/playground](http://localhost:3000/playground/playground).
It runs entirely in Rsbuild and does not need Django.

Center measures use the `measure:lg` (60ch), `measure:md` (45ch), and
`measure:sm` (30ch) classes, progressing from largest to smallest.

Grid minimums are `16rem`, `20rem`, `24rem`, `28rem`, and `32rem`. Stored
documents using the retired `gridMin: 12` value are normalized to `16`.

When a Base Block has the Box component, its modifier row can invert the
Box's foreground/background or add its border. These persist as `boxInvert`
and `boxBorder` and emit the scoped `box:invert` and `box:border` classes.

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
