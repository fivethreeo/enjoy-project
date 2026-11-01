import { exampleSetup } from 'prosemirror-example-setup';
import { Schema, type Node as ProseMirrorNode, type NodeSpec } from 'prosemirror-model';
import { schema as basicSchema } from 'prosemirror-schema-basic';
import { addListNodes } from 'prosemirror-schema-list';
import { Plugin, PluginKey, type Transaction } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { breadcrumbPlugin } from '../../prosemirror-breadcrumbs/src/index';

const richTextNodes = addListNodes(
  basicSchema.spec.nodes.remove('image'),
  'paragraph block*',
  'block',
);

export const richTextSchema = new Schema({
  nodes: richTextNodes,
  marks: basicSchema.spec.marks,
});

const layoutClasses = {
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
const layoutLabels: Record<keyof typeof layoutClasses, string> = {
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

export function normalizeFrameRatio(value: unknown): FrameRatio {
  return frameRatios.includes(value as FrameRatio)
    ? value as FrameRatio
    : defaultFrameRatio;
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

const centeredNodeAttrs = {
  id: { default: null },
  center: { default: false },
  centerIntrinsic: { default: true },
  centerText: { default: false },
  padding: { default: 1 },
};
const preservedTextBlockAttrs = [
  'id',
  'coverMain',
  'center',
  'centerIntrinsic',
  'centerText',
  'padding',
] as const;

function centeredNodeClasses(node: Parameters<NonNullable<NodeSpec['toDOM']>>[0]) {
  if (!node.attrs.center) {
    return undefined;
  }
  return [
    'center',
    paddingClass(node.attrs.padding),
    ...(node.attrs.centerIntrinsic ? ['center:intrinsic'] : []),
    ...(node.attrs.centerText ? ['center:text'] : []),
  ].join(' ');
}

function baseBlockClasses(node: Parameters<NonNullable<NodeSpec['toDOM']>>[0]) {
  const layouts = [...new Set(
    node.attrs.layouts as Array<keyof typeof layoutClasses>,
  )];
  const hasLayout = (layout: keyof typeof layoutClasses) => layouts.includes(layout);
  const classes: string[] = layouts.map((layout) => layoutClasses[layout]);

  if (hasLayout('stack') || hasLayout('cover')) {
    classes.push(spaceClass(node.attrs.space));
  }
  if (hasLayout('box') || hasLayout('center')) {
    classes.push(paddingClass(node.attrs.padding));
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
  if (hasLayout('grid')) {
    classes.push(`grid-min-${node.attrs.gridMin}`);
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

function hasSidebarLayout(layouts: readonly (keyof typeof layoutClasses)[]) {
  return layouts.includes('sidebar');
}

function baseBlock(): NodeSpec {
  return {
    group: 'layout_block',
    content: '(base_block | block)+',
    attrs: {
      layouts: { default: [] },
      tag: { default: 'div' },
      id: { default: null },
      ariaDescribedBy: { default: null },
      coverMain: { default: false },
      space: { default: 1 },
      padding: { default: 1 },
      centerIntrinsic: { default: true },
      centerText: { default: false },
      gap: { default: 1 },
      gridMin: { default: 16 },
      sidebarBreakpoint: { default: 66 },
      sidebarWidth: { default: 'auto' },
      sidebarPosition: { default: 'left' },
      switcherMax: { default: 5 },
      switcherThreshold: { default: 30 },
      frameRatio: { default: defaultFrameRatio },
    },
    toDOM: (node) => {
      const tag = baseBlockTags.includes(node.attrs.tag)
        ? node.attrs.tag
        : 'div';
      return [
        tag,
        {
          'data-cover-main': node.attrs.coverMain ? '' : undefined,
          id: node.attrs.id,
          'aria-describedby': node.attrs.ariaDescribedBy,
          class: baseBlockClasses(node),
        },
        0,
      ];
    },
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
        if (!['paragraph', 'heading'].includes(node.type.name)) {
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
          || !['paragraph', 'heading'].includes(updatedNode.type.name)
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
      const resizeObserver = typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => measureOverflow());

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
        measureOverflow();
      }

      syncReels();
      return {
        update() {
          syncReels();
        },
        destroy() {
          destroyed = true;
          resizeObserver?.disconnect();
          observedByReel.clear();
        },
      };
    },
  });
}

export const pageSchema = new Schema({
  nodes: richTextNodes
    .update('paragraph', {
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
    .addToEnd('base_block', baseBlock()),
  marks: basicSchema.spec.marks,
});

export function richTextPlugins(): Plugin[] {
  return exampleSetup({ schema: richTextSchema, menuBar: false });
}

export function pagePlugins(): Plugin[] {
  return [
    ...exampleSetup({ schema: pageSchema, menuBar: false }),
    preserveTextBlockAttrs(),
    reelOverflowPlugin(),
    breadcrumbPlugin({
      showMarks: true,
      displayName(node) {
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
