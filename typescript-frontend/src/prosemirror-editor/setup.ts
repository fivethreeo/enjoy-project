import { buildInputRules, buildKeymap } from 'prosemirror-example-setup';
import { baseKeymap } from 'prosemirror-commands';
import { dropCursor } from 'prosemirror-dropcursor';
import { gapCursor } from 'prosemirror-gapcursor';
import { history } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import {
  DOMSerializer,
  Schema,
  Slice,
  type Fragment,
  type DOMOutputSpec,
  type Mark,
  type Node as ProseMirrorNode,
  type NodeSpec,
  type MarkSpec,
} from 'prosemirror-model';
import { schema as basicSchema } from 'prosemirror-schema-basic';
import { addListNodes } from 'prosemirror-schema-list';
import {
  NodeSelection,
  Plugin,
  PluginKey,
  Selection,
  TextSelection,
  type EditorState,
  type Transaction,
} from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
import { breadcrumbPlugin } from '../../prosemirror-breadcrumbs/src/index';
import { modalPopupPlugin } from './modal-popup';
import { customStylingClasses } from './custom-styling';
import { icons } from '../icons';

const richTextNodes = addListNodes(
  basicSchema.spec.nodes.remove('image'),
  'paragraph block*',
  'block',
);

function standardEditorPlugins(schema: Schema): Plugin[] {
  return [
    buildInputRules(schema),
    keymap(buildKeymap(schema)),
    keymap(baseKeymap),
    dropCursor(),
    gapCursor(),
    history(),
    new Plugin({
      props: {
        attributes: { class: 'ProseMirror-example-setup-style' },
      },
    }),
  ];
}
const everyLayoutBlockClipboardMarker = 'data-everylayout-block';
export type CopiedId = readonly [id: string, text: string];
export const copiedIdPluginKey = new PluginKey<CopiedId | null>('copied-id');
export const blockSizeClasses = [
  'block-size:50vb',
  'block-size:40vb',
  'block-size:30vb',
  'block-size:20vb',
] as const;

export const customStylingNodeAttrs = {
  customClasses: { default: [] as string[] },
  hidden: { default: false },
  visuallyHidden: { default: false },
  ariaHidden: { default: false },
};

function normalizedCustomClasses(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return [...new Set(value.filter(
    (className): className is string => (
      typeof className === 'string' && (
        blockSizeClasses.includes(className as typeof blockSizeClasses[number])
        || customStylingClasses.includes(className)
      )
    ),
  ))];
}

function customClassesFromElement(element: Element | string): string[] {
  return element instanceof HTMLElement
    ? normalizedCustomClasses([...element.classList])
    : [];
}

function addCustomClassesToDOMOutput(
  output: ReturnType<NonNullable<NodeSpec['toDOM']>>,
  customClasses: readonly string[],
  hidden: boolean,
  visuallyHidden: boolean,
  ariaHidden: boolean,
): DOMOutputSpec {
  if ((customClasses.length === 0 && !hidden && !visuallyHidden && !ariaHidden) || !Array.isArray(output)) {
    return output;
  }

  const [tag, firstChild, ...children] = output;
  const attrs = firstChild !== null
    && typeof firstChild === 'object'
    && !Array.isArray(firstChild)
    ? firstChild as Record<string, unknown>
    : null;
  const className = [
    attrs?.class,
    ...customClasses,
    ...(visuallyHidden ? ['vh'] : []),
  ].filter(Boolean).join(' ');
  const visibilityAttrs = {
    ...(hidden ? { hidden: '' } : {}),
    ...(ariaHidden ? { 'aria-hidden': 'true' } : {}),
  };
  return attrs
    ? [tag, { ...attrs, ...visibilityAttrs, class: className }, ...children] as DOMOutputSpec
    : [tag, { ...visibilityAttrs, class: className }, firstChild, ...children] as DOMOutputSpec;
}

export function withCustomStylingNodeSpec(spec: NodeSpec): NodeSpec {
  if (!spec.toDOM) {
    return spec;
  }

  const toDOM = spec.toDOM;
  return {
    ...spec,
    attrs: {
      ...spec.attrs,
      ...customStylingNodeAttrs,
    },
    toDOM: (node) => addCustomClassesToDOMOutput(
      toDOM(node),
      normalizedCustomClasses(node.attrs.customClasses),
      node.attrs.hidden === true,
      node.attrs.visuallyHidden === true,
      node.attrs.ariaHidden === true,
    ),
    parseDOM: spec.parseDOM?.map((rule) => ({
      ...rule,
      getAttrs: (element) => {
        const attrs = rule.getAttrs?.(element) ?? rule.attrs ?? {};
        if (attrs === false) {
          return false;
        }
        return {
          ...attrs,
          customClasses: customClassesFromElement(element),
          hidden: element instanceof HTMLElement && element.hidden,
          visuallyHidden: element instanceof HTMLElement && element.classList.contains('vh'),
          ariaHidden: element instanceof HTMLElement && element.getAttribute('aria-hidden') === 'true',
        };
      },
    })),
  };
}

type VisibilityMarkerState = 'hidden' | 'visuallyhidden' | 'ariahidden';

function visibilityMarkerAttrs(state: VisibilityMarkerState, inline = false) {
  return {
    class: inline
      ? `prosemirror-visibility-marked prosemirror-visibility-marked--${state} prosemirror-visibility-marked--inline`
      : `prosemirror-visibility-marked prosemirror-visibility-marked--${state}`,
  };
}

function visibilityMarkerIconUrl(state: VisibilityMarkerState) {
  const icon = icons[state === 'ariahidden' ? 'setarialabeledby' : state];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${icon.width} ${icon.height}"><path d="${icon.path}"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

function visibilityMarkerPlugin() {
  return new Plugin({
    view: (view) => {
      const states = ['hidden', 'visuallyhidden', 'ariahidden'] as const;
      states.forEach((state) => {
        view.dom.style.setProperty(
          `--prosemirror-visibility-icon-${state}`,
          visibilityMarkerIconUrl(state),
        );
      });
      return {
        destroy: () => states.forEach((state) => {
          view.dom.style.removeProperty(`--prosemirror-visibility-icon-${state}`);
        }),
      };
    },
  });
}

function copiedIdPlugin() {
  return new Plugin<CopiedId | null>({
    key: copiedIdPluginKey,
    state: {
      init: () => null,
      apply(transaction, copiedId) {
        return transaction.getMeta(copiedIdPluginKey) as CopiedId | undefined
          ?? copiedId;
      },
    },
  });
}

function removeEditorVisibilityAttributes(dom: Node) {
  if (dom instanceof HTMLElement) {
    dom.removeAttribute('hidden');
    dom.classList.remove('vh');
  }
}

function nodeVisibilityMarkerState(node: ProseMirrorNode): VisibilityMarkerState | null {
  if (node.attrs.hidden === true) {
    return 'hidden';
  }
  if (node.attrs.visuallyHidden === true) {
    return 'visuallyhidden';
  }
  return node.attrs.ariaHidden === true ? 'ariahidden' : null;
}

function addEditorVisibilityMarkerClass(dom: Node, node: ProseMirrorNode) {
  const state = nodeVisibilityMarkerState(node);
  if (state && dom instanceof HTMLElement) {
    applyEditorVisibilityData(dom, state);
    dom.classList.add(...visibilityMarkerAttrs(state).class.split(' '));
  }
}

function markVisibilityMarkerState(mark: Mark): VisibilityMarkerState | null {
  const state = mark.type.name === 'visibility'
    ? mark.attrs.state
    : ['link', 'strong', 'em', 'code'].includes(mark.type.name)
      ? mark.attrs.visibilityState
      : null;
  return ['hidden', 'visuallyhidden', 'ariahidden'].includes(state)
    ? state as VisibilityMarkerState
    : null;
}

function applyEditorVisibilityData(dom: HTMLElement, state: VisibilityMarkerState) {
  if (state === 'hidden') {
    dom.setAttribute('data-hidden', '');
  } else if (state === 'visuallyhidden') {
    dom.setAttribute('data-vh', '');
  }
}

function addEditorVisibilityMarkClass(dom: Node, mark: Mark) {
  const state = markVisibilityMarkerState(mark);
  if (state && dom instanceof HTMLElement) {
    applyEditorVisibilityData(dom, state);
    dom.classList.add(...visibilityMarkerAttrs(state, true).class.split(' '));
  }
}

function editorVisibilityNodeViewsPlugin(schema: Schema) {
  const nodeViews = Object.fromEntries(
    Object.entries(schema.nodes)
      .filter(([, type]) => type.spec.toDOM && 'customClasses' in (type.spec.attrs ?? {}))
      .map(([name, type]) => [name, (node: ProseMirrorNode) => {
        const rendered = DOMSerializer.renderSpec(document, type.spec.toDOM!(node));
        removeEditorVisibilityAttributes(rendered.dom);
        addEditorVisibilityMarkerClass(rendered.dom, node);
        return {
          dom: rendered.dom,
          contentDOM: rendered.contentDOM,
        };
      }]),
  );
  const markView = (mark: Mark) => {
    const rendered = DOMSerializer.renderSpec(
      document,
      mark.type.spec.toDOM!(mark, true),
    );
    removeEditorVisibilityAttributes(rendered.dom);
    addEditorVisibilityMarkClass(rendered.dom, mark);
    return {
      dom: rendered.dom,
      contentDOM: rendered.contentDOM,
    };
  };
  return new Plugin({
    props: {
      nodeViews,
      markViews: {
        link: markView,
        strong: markView,
        em: markView,
        code: markView,
        visibility: markView,
      },
    },
  });
}

function withCustomStylingNodeSpecs(nodes: typeof richTextNodes) {
  let customStyledNodes = nodes;
  nodes.forEach((name, spec) => {
    if (name !== 'doc' && name !== 'text') {
      customStyledNodes = customStyledNodes.update(name, withCustomStylingNodeSpec(spec));
    }
  });
  return customStyledNodes;
}

const visibilityMarkSpec: MarkSpec = {
  attrs: {
    state: { default: 'hidden' },
  },
  toDOM: (mark) => ['span', mark.attrs.state === 'hidden'
    ? { hidden: '' }
    : mark.attrs.state === 'visuallyhidden'
      ? { class: 'vh' }
      : { 'aria-hidden': 'true' }, 0],
  parseDOM: [
    { tag: 'span[hidden]', attrs: { state: 'hidden' } },
    { tag: 'span.vh', attrs: { state: 'visuallyhidden' } },
    { tag: 'span[aria-hidden="true"]', attrs: { state: 'ariahidden' } },
  ],
};

const linkMarkSpec: MarkSpec = {
  attrs: {
    href: {},
    title: { default: null },
    visibilityState: { default: null },
  },
  inclusive: false,
  parseDOM: [{
    tag: 'a[href]',
    getAttrs: (element) => {
      const state = element.hasAttribute('hidden')
        ? 'hidden'
        : element.classList.contains('vh')
          ? 'visuallyhidden'
          : element.getAttribute('aria-hidden') === 'true'
            ? 'ariahidden'
            : null;
      return {
        href: element.getAttribute('href'),
        title: element.getAttribute('title'),
        visibilityState: state,
      };
    },
  }],
  toDOM: (mark) => {
    const { href, title, visibilityState } = mark.attrs;
    return ['a', {
      href,
      title,
      ...(visibilityState === 'hidden' ? { hidden: '' } : {}),
      ...(visibilityState === 'visuallyhidden' ? { class: 'vh' } : {}),
      ...(visibilityState === 'ariahidden' ? { 'aria-hidden': 'true' } : {}),
    }, 0];
  },
};

function markWithVisibilityState(spec: MarkSpec): MarkSpec {
  const toDOM = spec.toDOM!;
  return {
    ...spec,
    attrs: {
      ...spec.attrs,
      visibilityState: { default: null },
    },
    toDOM: (mark, inline) => {
      const output = toDOM(mark, inline);
      if (!Array.isArray(output) || !mark.attrs.visibilityState) {
        return output;
      }
      const [tag, firstChild, ...children] = output;
      const attrs = firstChild !== null
        && typeof firstChild === 'object'
        && !Array.isArray(firstChild)
        ? firstChild as Record<string, unknown>
        : {};
      const visibilityAttrs = mark.attrs.visibilityState === 'hidden'
        ? { hidden: '' }
        : mark.attrs.visibilityState === 'visuallyhidden'
          ? { class: 'vh' }
          : { 'aria-hidden': 'true' };
      return [tag, { ...attrs, ...visibilityAttrs }, ...(Object.keys(attrs).length > 0 ? children : [firstChild, ...children])] as DOMOutputSpec;
    },
  };
}

function marksWithVisibility() {
  return basicSchema.spec.marks
    .update('link', linkMarkSpec)
    .update('em', markWithVisibilityState(basicSchema.spec.marks.get('em') as MarkSpec))
    .update('strong', markWithVisibilityState(basicSchema.spec.marks.get('strong') as MarkSpec))
    .update('code', markWithVisibilityState(basicSchema.spec.marks.get('code') as MarkSpec))
    .addToEnd('visibility', visibilityMarkSpec);
}

export const richTextSchema = new Schema({
  nodes: richTextNodes,
  marks: marksWithVisibility(),
});

export const layoutClasses = {
  box: 'box',
  center: 'center',
  cluster: 'cluster',
  cover: 'cover',
  frame: 'frame',
  grid: 'grid',
  reel: 'reel',
  sidebar: 'with-sidebar',
  stack: 'stack',
  switcher: 'switcher',
} as const;
export type LayoutOption = keyof typeof layoutClasses;
export const layoutOptions = Object.keys(layoutClasses) as LayoutOption[];
const layoutLabels: Record<LayoutOption, string> = {
  box: 'Box',
  center: 'Center',
  cluster: 'Cluster',
  cover: 'Cover',
  frame: 'Frame',
  grid: 'Grid',
  reel: 'Reel',
  sidebar: 'With sidebar',
  stack: 'Stack',
  switcher: 'Switcher',
};
export const frameRatios = ['16-9', '1-1', '4-3'] as const;
export type FrameRatio = typeof frameRatios[number];
export const defaultFrameRatio: FrameRatio = '16-9';
export const measures = ['lg', 'md', 'sm'] as const;
export type Measure = typeof measures[number];
export const defaultMeasure: Measure = 'lg';
export const gridMinimums = [16, 20, 24, 28, 32] as const;
export type GridMinimum = typeof gridMinimums[number];
export const defaultGridMinimum: GridMinimum = 16;
export const clusterJustifyValues = ['start', 'end', 'between', 'around', 'center'] as const;
export type ClusterJustify = typeof clusterJustifyValues[number];
export const defaultClusterJustify: ClusterJustify = 'start';
const clusterJustifyClasses: Record<ClusterJustify, string | null> = {
  start: null,
  end: 'justify-content:flex-end',
  between: 'justify-content:space-between',
  around: 'justify-content:space-around',
  center: 'justify-content:center',
};
export const clusterAlignValues = ['start', 'center', 'end', 'stretch', 'baseline'] as const;
export type ClusterAlign = typeof clusterAlignValues[number];
export const defaultClusterAlign: ClusterAlign = 'start';
const clusterAlignClasses: Record<ClusterAlign, string> = {
  start: 'align-items:flex-start',
  center: 'align-items:center',
  end: 'align-items:flex-end',
  stretch: 'align-items:stretch',
  baseline: 'align-items:baseline',
};

export function normalizeFrameRatio(value: unknown): FrameRatio {
  return frameRatios.includes(value as FrameRatio)
    ? value as FrameRatio
    : defaultFrameRatio;
}

export function normalizeGridMinimum(value: unknown): GridMinimum {
  return gridMinimums.includes(value as GridMinimum)
    ? value as GridMinimum
    : defaultGridMinimum;
}

export function normalizeClusterJustify(value: unknown): ClusterJustify {
  return clusterJustifyValues.includes(value as ClusterJustify)
    ? value as ClusterJustify
    : defaultClusterJustify;
}

export function normalizeClusterAlign(value: unknown): ClusterAlign {
  return clusterAlignValues.includes(value as ClusterAlign)
    ? value as ClusterAlign
    : defaultClusterAlign;
}

export const baseBlockTags = [
  'div',
  'section',
  'article',
  'aside',
  'header',
  'footer',
  'nav',
  'main',
] as const;
export type BaseBlockTag = typeof baseBlockTags[number];
const zeroSpace = 'zero';

function spaceClass(space: number | typeof zeroSpace) {
  return space === zeroSpace ? 'space-zero' : `space-s${space}`;
}

function gapClass(gap: number | typeof zeroSpace) {
  return gap === zeroSpace ? 'gap-zero' : `gap-s${gap}`;
}

function paddingClass(padding: number | typeof zeroSpace) {
  return padding === zeroSpace ? 'padding-zero' : `padding-s${padding}`;
}

function measureClass(value: unknown): Measure {
  return measures.includes(value as Measure)
    ? value as Measure
    : defaultMeasure;
}

const centeredNodeAttrs = {
  id: { default: null },
  center: { default: false },
  centerIntrinsic: { default: true },
  measure: { default: null },
  centerText: { default: false },
  box: { default: false },
  padding: { default: 1 },
  boxInvert: { default: false },
  boxBorder: { default: false },
};
const preservedTextBlockAttrs = [
  'id',
  'coverMain',
  'center',
  'centerIntrinsic',
  'measure',
  'centerText',
  'box',
  'padding',
  'boxInvert',
  'boxBorder',
] as const;

function centeredNodeClasses(node: Parameters<NonNullable<NodeSpec['toDOM']>>[0]) {
  const classes = node.attrs.measure ? [`measure:${measureClass(node.attrs.measure)}`] : [];
  if (node.attrs.box) {
    classes.push('box');
    if (node.attrs.boxInvert) {
      classes.push('box:invert');
    }
    if (node.attrs.boxBorder) {
      classes.push('box:border');
    }
  }
  if (node.attrs.center) {
    classes.push('center');
    if (node.attrs.centerIntrinsic) {
      classes.push('center:intrinsic');
    }
    if (node.attrs.centerText) {
      classes.push('center:text');
    }
  }
  if (node.attrs.box || node.attrs.center) {
    classes.push(paddingClass(node.attrs.padding));
  }
  return classes.length > 0 ? classes.join(' ') : undefined;
}

export const layoutNodeAttrs = {
  layouts: { default: [] },
  coverMain: { default: false },
  space: { default: 1 },
  padding: { default: 1 },
  boxInvert: { default: false },
  boxBorder: { default: false },
  centerIntrinsic: { default: true },
  measure: { default: null },
  centerText: { default: false },
  gap: { default: 1 },
  gridMin: { default: defaultGridMinimum },
  sidebarBreakpoint: { default: 66 },
  sidebarWidth: { default: 'auto' },
  sidebarPosition: { default: 'left' },
  switcherMax: { default: 5 },
  switcherThreshold: { default: 30 },
  frameRatio: { default: defaultFrameRatio },
  clusterJustify: { default: defaultClusterJustify },
  clusterAlign: { default: defaultClusterAlign },
  clusterAlignCenter: { default: false },
};

/** Serializes shared Every Layout component state for any layout-capable node. */
export function layoutNodeClasses(node: Parameters<NonNullable<NodeSpec['toDOM']>>[0]) {
  const layouts = [...new Set(
    (node.attrs.layouts as unknown[]).filter(
      (layout): layout is LayoutOption => (
        typeof layout === 'string' && layout in layoutClasses
      ),
    ),
  )] as LayoutOption[];
  const hasLayout = (layout: LayoutOption) => layouts.includes(layout);
  const classes: string[] = layouts.map((layout) => layoutClasses[layout]);

  if (node.attrs.measure) {
    classes.push(`measure:${measureClass(node.attrs.measure)}`);
  }
  if (hasLayout('stack') || hasLayout('cover')) {
    classes.push(spaceClass(node.attrs.space));
  }
  if (hasLayout('box') || hasLayout('center')) {
    classes.push(paddingClass(node.attrs.padding));
  }
  if (hasLayout('box') && node.attrs.boxInvert) {
    classes.push('box:invert');
  }
  if (hasLayout('box') && node.attrs.boxBorder) {
    classes.push('box:border');
  }
  if (hasLayout('center')) {
    if (node.attrs.centerIntrinsic) {
      classes.push('center:intrinsic');
    }
    if (node.attrs.centerText) {
      classes.push('center:text');
    }
  }
  if (
    hasLayout('cluster')
    || hasLayout('grid')
    || hasLayout('reel')
    || hasSidebarLayout(layouts)
    || hasLayout('switcher')
  ) {
    classes.push(gapClass(node.attrs.gap));
  }
  if (hasLayout('cluster')) {
    const justify = normalizeClusterJustify(node.attrs.clusterJustify);
    const justifyClass = clusterJustifyClasses[justify];
    if (justifyClass) {
      classes.push(justifyClass);
    }
    const align = normalizeClusterAlign(
      node.attrs.clusterAlignCenter ? 'center' : node.attrs.clusterAlign,
    );
    classes.push(clusterAlignClasses[align]);
  }
  if (hasLayout('grid')) {
    classes.push(`grid-min-${normalizeGridMinimum(node.attrs.gridMin)}`);
  }
  if (hasSidebarLayout(layouts)) {
    if (node.attrs.sidebarPosition === 'right') {
      classes.push('with-sidebar:right');
    }
    classes.push(`content-min-${node.attrs.sidebarBreakpoint}`);
    if (node.attrs.sidebarWidth !== 'auto') {
      classes.push(`sidebar-width-${node.attrs.sidebarWidth}`);
    }
  }
  if (hasLayout('switcher')) {
    classes.push(`switcher:max${node.attrs.switcherMax}`);
    classes.push(`switcher-threshold-${node.attrs.switcherThreshold}`);
  }
  if (hasLayout('frame')) {
    const ratio = normalizeFrameRatio(node.attrs.frameRatio);
    if (ratio !== defaultFrameRatio) {
      classes.push(`frame:${ratio}`);
    }
  }

  return classes.length > 0 ? classes.join(' ') : undefined;
}

/** Restores Every Layout state from classes emitted by `layoutNodeClasses`. */
export function layoutNodeAttrsFromDOM(element: HTMLElement) {
  const classes = element.classList;
  const layouts = layoutOptions.filter((layout) => classes.contains(layoutClasses[layout]));
  const scale = (name: 'space' | 'padding' | 'gap') => {
    if (classes.contains(`${name}-zero`)) return zeroSpace;
    const value = [...classes].find((className) => className.startsWith(`${name}-s`));
    const parsed = value ? Number(value.slice(`${name}-s`.length)) : null;
    return Number.isInteger(parsed) ? parsed : undefined;
  };
  const numbered = (prefix: string) => {
    const value = [...classes].find((className) => className.startsWith(prefix));
    return value ? Number(value.slice(prefix.length)) : undefined;
  };
  const space = scale('space');
  const padding = scale('padding');
  const gap = scale('gap');
  const gridMin = numbered('grid-min-');
  const sidebarBreakpoint = numbered('content-min-');
  const sidebarWidth = numbered('sidebar-width-');
  const switcherMax = numbered('switcher:max');
  const switcherThreshold = numbered('switcher-threshold-');
  const ratio = [...classes].find((className) => className.startsWith('frame:'));
  const measure = [...classes].find((className) => className.startsWith('measure:'));
  const clusterJustify = classes.contains('justify-content:flex-end')
    || classes.contains('cluster:end')
    ? 'end'
    : classes.contains('justify-content:space-between')
      || classes.contains('cluster:between')
      ? 'between'
      : defaultClusterJustify;
  const clusterAlign = classes.contains('align-items:center')
    || classes.contains('cluster:center')
    ? 'center'
    : classes.contains('align-items:flex-end')
      ? 'end'
      : classes.contains('align-items:stretch')
        ? 'stretch'
        : classes.contains('align-items:baseline')
          ? 'baseline'
          : defaultClusterAlign;

  return {
    layouts,
    ...(space === undefined ? {} : { space }),
    ...(padding === undefined ? {} : { padding }),
    ...(gap === undefined ? {} : { gap }),
    boxInvert: classes.contains('box:invert'),
    boxBorder: classes.contains('box:border'),
    centerIntrinsic: !classes.contains('measure:') && !classes.contains('center:intrinsic')
      ? true
      : classes.contains('center:intrinsic'),
    centerText: classes.contains('center:text'),
    ...(measure ? { measure: measureClass(measure.slice('measure:'.length)) } : {}),
    ...(gridMin === undefined ? {} : { gridMin: normalizeGridMinimum(gridMin) }),
    ...(sidebarBreakpoint === undefined ? {} : { sidebarBreakpoint }),
    sidebarPosition: classes.contains('with-sidebar:right') ? 'right' : 'left',
    sidebarWidth: sidebarWidth === undefined ? 'auto' : sidebarWidth,
    ...(switcherMax === undefined ? {} : { switcherMax }),
    ...(switcherThreshold === undefined ? {} : { switcherThreshold }),
    ...(ratio ? { frameRatio: normalizeFrameRatio(ratio.slice('frame:'.length)) } : {}),
    clusterJustify,
    clusterAlign,
    clusterAlignCenter: clusterAlign === 'center',
  };
}

function hasSidebarLayout(layouts: readonly LayoutOption[]) {
  return layouts.includes('sidebar');
}

function baseBlock(): NodeSpec {
  return {
    group: 'layout_block',
    content: '(block | base_block)+',
    attrs: {
      tag: { default: 'div' },
      id: { default: null },
      ariaLabelledBy: { default: null },
      ...layoutNodeAttrs,
    },
    toDOM: (node) => {
      const tag = baseBlockTags.includes(node.attrs.tag)
        ? node.attrs.tag
        : 'div';
      return [
        tag,
        {
          [everyLayoutBlockClipboardMarker]: '',
          'data-cover-main': node.attrs.coverMain ? '' : undefined,
          id: node.attrs.id,
          'aria-labelledby': node.attrs.ariaLabelledBy,
          class: layoutNodeClasses(node),
        },
        0,
      ];
    },
    parseDOM: [{
      tag: `[${everyLayoutBlockClipboardMarker}]`,
      getAttrs: (element) => {
        const dom = element as HTMLElement;
        const tag = dom.tagName.toLowerCase();
        if (!baseBlockTags.includes(tag as BaseBlockTag)) {
          return false;
        }

        return {
          tag,
          id: dom.id || null,
          ariaLabelledBy: dom.getAttribute('aria-labelledby'),
          coverMain: dom.hasAttribute('data-cover-main'),
          ...layoutNodeAttrsFromDOM(dom),
        };
      },
    }],
  };
}

function preserveTextBlockAttrs() {
  return new Plugin({
    appendTransaction(transactions, oldState, newState) {
      if (!transactions.some((transaction) => transaction.docChanged)) {
        return null;
      }

      let transaction: Transaction | null = null;
      oldState.doc.descendants((node, position) => {
        if (!['paragraph', 'heading', 'blockquote'].includes(node.type.name)) {
          return;
        }
        const mappedPosition = transactions.reduce(
          (currentPosition, currentTransaction) => (
            currentTransaction.mapping.map(currentPosition)
          ),
          position,
        );
        const updatedNode = newState.doc.nodeAt(mappedPosition);
        if (
          !updatedNode
          || !['paragraph', 'heading', 'blockquote'].includes(updatedNode.type.name)
          || updatedNode.type === node.type
        ) {
          return;
        }

        const attrs = { ...updatedNode.attrs };
        let changed = false;
        for (const attr of preservedTextBlockAttrs) {
          if (attrs[attr] !== node.attrs[attr]) {
            attrs[attr] = node.attrs[attr];
            changed = true;
          }
        }
        if (changed) {
          transaction ??= newState.tr;
          transaction.setNodeMarkup(mappedPosition, undefined, attrs);
        }
      });

      return transaction;
    },
  });
}

const reelOverflowPluginKey = new PluginKey<DecorationSet>('reel-overflow');

function isReelBaseBlock(node: ProseMirrorNode) {
  return node.type.name === 'base_block'
    && Array.isArray(node.attrs.layouts)
    && node.attrs.layouts.includes('reel');
}

function overflowDecorations(
  doc: ProseMirrorNode,
  overflowPositions: readonly number[],
) {
  return DecorationSet.create(doc, overflowPositions.flatMap((position) => {
    const node = doc.nodeAt(position);
    return node && isReelBaseBlock(node)
      ? [Decoration.node(position, position + node.nodeSize, { class: 'overflowing' })]
      : [];
  }));
}

function reelOverflowPlugin() {
  return new Plugin<DecorationSet>({
    key: reelOverflowPluginKey,
    state: {
      init: () => DecorationSet.empty,
      apply(transaction, decorations) {
        const mappedDecorations = decorations.map(
          transaction.mapping,
          transaction.doc,
        );
        const overflowPositions: readonly number[] | undefined = transaction.getMeta(
          reelOverflowPluginKey,
        );

        return overflowPositions === undefined
          ? mappedDecorations
          : overflowDecorations(transaction.doc, overflowPositions);
      },
    },
    props: {
      decorations(state) {
        return reelOverflowPluginKey.getState(state);
      },
    },
    view(view) {
      const observedByReel = new Map<HTMLElement, Set<Element>>();
      let destroyed = false;
      let measuring = false;
      let measureFrame: number | null = null;
      const resizeObserver = typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => scheduleMeasure());

      function reelsInDocument() {
        const reels: Array<{ position: number; element: HTMLElement }> = [];
        view.state.doc.descendants((node, position) => {
          if (!isReelBaseBlock(node)) {
            return;
          }
          const element = view.nodeDOM(position);
          if (element instanceof HTMLElement) {
            reels.push({ position, element });
          }
        });
        return reels;
      }

      function unobserveReel(reel: HTMLElement) {
        const observed = observedByReel.get(reel);
        if (!observed) {
          return;
        }
        for (const element of observed) {
          resizeObserver?.unobserve(element);
        }
        observedByReel.delete(reel);
      }

      function measureOverflow() {
        measureFrame = null;
        if (destroyed || measuring) {
          return;
        }

        measuring = true;
        try {
          const overflowPositions = reelsInDocument()
            .filter(({ element }) => element.scrollWidth > element.clientWidth)
            .map(({ position }) => position);
          const decorations = reelOverflowPluginKey.getState(view.state);
          const decoratedPositions = decorations
            ? decorations.find().map((decoration) => decoration.from)
            : [];
          if (
            overflowPositions.length === decoratedPositions.length
            && overflowPositions.every(
              (position, index) => position === decoratedPositions[index],
            )
          ) {
            return;
          }

          view.dispatch(
            view.state.tr
              .setMeta(reelOverflowPluginKey, overflowPositions)
              .setMeta('addToHistory', false),
          );
        } finally {
          measuring = false;
        }
      }

      function scheduleMeasure() {
        if (destroyed || measureFrame !== null) {
          return;
        }
        measureFrame = requestAnimationFrame(measureOverflow);
      }

      function syncReels() {
        const reels = reelsInDocument();
        const reelElements = new Set(reels.map(({ element }) => element));
        for (const reel of observedByReel.keys()) {
          if (!reelElements.has(reel)) {
            unobserveReel(reel);
          }
        }
        for (const { element: reel } of reels) {
          const observed = observedByReel.get(reel) ?? new Set<Element>();
          const targets = new Set([reel, ...Array.from(reel.children)]);
          for (const element of observed) {
            if (!targets.has(element)) {
              resizeObserver?.unobserve(element);
              observed.delete(element);
            }
          }
          for (const element of targets) {
            if (!observed.has(element)) {
              resizeObserver?.observe(element);
              observed.add(element);
            }
          }
          observedByReel.set(reel, observed);
        }
        // Plugin views are constructed before the EditorView is assigned to its
        // host variable. Dispatching here can invoke the host callback too early.
        scheduleMeasure();
      }

      syncReels();
      return {
        update() {
          syncReels();
        },
        destroy() {
          destroyed = true;
          if (measureFrame !== null) {
            cancelAnimationFrame(measureFrame);
          }
          resizeObserver?.disconnect();
          observedByReel.clear();
        },
      };
    },
  });
}

export const everyLayoutSchema = new Schema({
  nodes: withCustomStylingNodeSpecs(richTextNodes
    .update('paragraph', {
      ...(richTextNodes.get('paragraph') as NodeSpec),
      attrs: {
        coverMain: { default: false },
        ...centeredNodeAttrs,
      },
      content: 'inline*',
      group: 'block',
      toDOM: (node) => ['p', {
        'data-cover-main': node.attrs.coverMain ? '' : undefined,
        id: node.attrs.id,
        class: centeredNodeClasses(node),
      }, 0],
    })
    .update('heading', {
      ...(richTextNodes.get('heading') as NodeSpec),
      attrs: {
        level: { default: 1 },
        coverMain: { default: false },
        ...centeredNodeAttrs,
      },
      content: 'inline*',
      group: 'block',
      defining: true,
      toDOM: (node) => [
        `h${node.attrs.level}`,
        {
          'data-cover-main': node.attrs.coverMain ? '' : undefined,
          id: node.attrs.id,
          class: centeredNodeClasses(node),
        },
        0,
      ],
    })
    .update('blockquote', {
      ...(richTextNodes.get('blockquote') as NodeSpec),
      attrs: centeredNodeAttrs,
      toDOM: (node) => ['blockquote', {
        id: node.attrs.id,
        class: centeredNodeClasses(node),
      }, 0],
    })
    .update('doc', { content: '(base_block | block)+' })
    .addToEnd('base_block', baseBlock())),
  marks: marksWithVisibility(),
});

function isAriaHiddenMark(mark: Mark) {
  return mark.type.name === 'visibility' && mark.attrs.state === 'ariahidden';
}

class AriaHiddenDOMSerializer extends DOMSerializer {
  private renderMark(mark: Mark, inline: boolean, options: { document?: Document }) {
    const toDOM = this.marks[mark.type.name];
    return toDOM
      ? DOMSerializer.renderSpec(
        options.document ?? document,
        toDOM(mark, inline),
      )
      : null;
  }

  private renderNode(node: ProseMirrorNode, options: { document?: Document }) {
    const domDocument = options.document ?? document;
    if (node.isText) {
      return domDocument.createTextNode(node.text ?? '');
    }

    const { dom, contentDOM } = DOMSerializer.renderSpec(
      domDocument,
      this.nodes[node.type.name](node),
    );
    if (contentDOM) {
      if (node.isLeaf) {
        throw new RangeError('Content hole not allowed in a leaf node spec');
      }
      this.serializeFragment(node.content, options, contentDOM);
    }
    return dom;
  }

  serializeFragment(
    fragment: Fragment,
    options: { document?: Document } = {},
    target?: HTMLElement | DocumentFragment,
  ) {
    const domDocument = options.document ?? document;
    const output = target ?? domDocument.createDocumentFragment();
    let top: HTMLElement | DocumentFragment = output;
    const active: Array<[Mark, HTMLElement | DocumentFragment]> = [];

    fragment.forEach((node) => {
      if (active.length > 0 || node.marks.length > 0) {
        const ariaHidden = node.marks.some(isAriaHiddenMark);
        const hasWrapper = node.marks.some((mark) => (
          !isAriaHiddenMark(mark) && Boolean(this.marks[mark.type.name])
        ));
        const activeAriaHidden = active.some(([mark]) => isAriaHiddenMark(mark));
        let keep = 0;
        let rendered = 0;
        if (ariaHidden === activeAriaHidden) {
          while (keep < active.length && rendered < node.marks.length) {
            const next = node.marks[rendered];
            if (!this.marks[next.type.name]) {
              rendered += 1;
              continue;
            }
            if (!next.eq(active[keep][0]) || next.type.spec.spanning === false) {
              break;
            }
            keep += 1;
            rendered += 1;
          }
        }
        while (keep < active.length) {
          top = active.pop()![1];
        }

        let ariaApplied = ariaHidden && active.some(([mark]) => !isAriaHiddenMark(mark));
        while (rendered < node.marks.length) {
          const mark = node.marks[rendered];
          rendered += 1;
          if (isAriaHiddenMark(mark)) {
            if (hasWrapper) {
              active.push([mark, top]);
            } else {
              const fallback = domDocument.createElement('span');
              fallback.setAttribute('aria-hidden', 'true');
              active.push([mark, top]);
              top.append(fallback);
              top = fallback;
            }
            continue;
          }

          const markDOM = this.renderMark(mark, node.isInline, options);
          if (!markDOM) {
            continue;
          }
          if (ariaHidden && !ariaApplied) {
            markDOM.dom.setAttribute('aria-hidden', 'true');
            ariaApplied = true;
          }
          active.push([mark, top]);
          top.append(markDOM.dom);
          top = markDOM.contentDOM ?? markDOM.dom;
        }
      }
      top.append(this.renderNode(node, options));
    });

    return output;
  }
}

export function createAriaHiddenDOMSerializer(schema: Schema) {
  const serializer = DOMSerializer.fromSchema(schema);
  return new AriaHiddenDOMSerializer(serializer.nodes, serializer.marks);
}

export function richTextPlugins(): Plugin[] {
  return standardEditorPlugins(richTextSchema);
}

export function pasteAfterNodeSelection(
  state: EditorState,
  slice: Slice,
  dispatch?: (transaction: Transaction) => void,
): boolean {
  if (!(state.selection instanceof NodeSelection)) {
    return false;
  }

  const insertionPoint = state.selection.to;
  const transaction = state.tr.replaceRange(insertionPoint, insertionPoint, slice);
  if (!transaction.docChanged) {
    return false;
  }

  const pastedEnd = transaction.mapping.map(insertionPoint, 1);
  transaction.setSelection(Selection.near(transaction.doc.resolve(pastedEnd), -1));
  dispatch?.(transaction);
  return true;
}

export function insertBaseBlockAfterNodeSelection(
  schema: Schema,
  state: EditorState,
  dispatch?: (transaction: Transaction) => void,
): boolean {
  if (
    !(state.selection instanceof NodeSelection)
    || state.selection.node.type.name !== 'base_block'
  ) {
    return false;
  }

  const baseBlockType = schema.nodes.base_block;
  const paragraphType = schema.nodes.paragraph;
  if (!baseBlockType || !paragraphType) {
    return false;
  }

  const selectedLayouts = state.selection.node.attrs.layouts as unknown[];
  const hasBox = selectedLayouts.includes('box');
  const insertionPoint = state.selection.to;
  const block = baseBlockType.create(
    hasBox
      ? {
        layouts: ['box'],
        padding: state.selection.node.attrs.padding,
        boxInvert: state.selection.node.attrs.boxInvert,
        boxBorder: state.selection.node.attrs.boxBorder,
      }
      : null,
    paragraphType.create(),
  );
  const transaction = state.tr.insert(insertionPoint, block);
  transaction.setSelection(TextSelection.create(transaction.doc, insertionPoint + 2));
  dispatch?.(transaction.scrollIntoView());
  return true;
}

function pasteSliceAtSelection(
  state: EditorState,
  slice: Slice,
  dispatch: (transaction: Transaction) => void,
): boolean {
  const transaction = state.tr.replaceSelection(slice);
  if (!transaction.docChanged) {
    return false;
  }

  dispatch(transaction.scrollIntoView());
  return true;
}

function pasteAfterNodeSelectionPlugin() {
  let nodeClipboard: Slice | null = null;

  const captureNodeClipboard = (view: EditorView) => {
    nodeClipboard = view.state.selection instanceof NodeSelection
      ? view.state.selection.content()
      : null;
    return false;
  };

  return new Plugin({
    props: {
      handleDOMEvents: {
        copy: captureNodeClipboard,
        cut: captureNodeClipboard,
      },
      handlePaste(view, event, slice) {
        const storedSlice = nodeClipboard;
        nodeClipboard = null;
        const pastedHTML = event.clipboardData?.getData('text/html') ?? '';
        const pastedSlice = storedSlice && pastedHTML.includes(everyLayoutBlockClipboardMarker)
          ? storedSlice
          : slice;

        if (view.state.selection instanceof NodeSelection) {
          return pasteAfterNodeSelection(view.state, pastedSlice, view.dispatch);
        }

        return pastedSlice === slice
          ? false
          : pasteSliceAtSelection(view.state, pastedSlice, view.dispatch);
      },
    },
  });
}

export function prosemirrorEditorShellPlugin(shell: HTMLElement): Plugin {
  return new Plugin({
    view(view: EditorView) {
      if (view.dom.parentElement !== shell) {
        return {};
      }

      const addedShellClass = !shell.classList.contains('prosemirror-editor-shell');
      shell.classList.add('prosemirror-editor-shell');
      return {
        destroy() {
          if (addedShellClass) {
            shell.classList.remove('prosemirror-editor-shell');
          }
        },
      };
    },
  });
}

/** Builds the standard Every Layout editor plugins for the schema mounted by a host. */
export function everyLayoutPlugins(schema: Schema, shell: HTMLElement): Plugin[] {
  return [
    ...standardEditorPlugins(schema),
    pasteAfterNodeSelectionPlugin(),
    copiedIdPlugin(),
    editorVisibilityNodeViewsPlugin(schema),
    visibilityMarkerPlugin(),
    prosemirrorEditorShellPlugin(shell),
    modalPopupPlugin(shell),
    preserveTextBlockAttrs(),
    reelOverflowPlugin(),
    breadcrumbPlugin({
      showMarks: true,
      displayName(node) {
        if (node.type.name === 'heading') {
          return `h${node.attrs.level}`;
        }
        if (node.type.name !== 'base_block') {
          return node.type.name;
        }
        const allLayouts = node.attrs.layouts as Array<keyof typeof layoutClasses>;
        const layouts = allLayouts
          .filter((layout) => layout !== 'box');
        const label = layouts.length > 0
          ? layouts.map((layout) => layoutLabels[layout]).join(' + ')
          : 'Block';
        return allLayouts.includes('box') ? `[${label}]` : label;
      },
    }),
  ];
}
