import { Node as ProseMirrorNode, type Schema } from 'prosemirror-model';
import {
  EditorState,
  NodeSelection,
  type Plugin,
} from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import {
  Dropdown,
  MenuItem,
  renderGrouped,
  type MenuElement,
} from 'prosemirror-menu';
import './editor.css';
import 'prosemirror-view/style/prosemirror.css';
import 'prosemirror-menu/style/menu.css';
import 'prosemirror-example-setup/style/style.css';
import '../../prosemirror-breadcrumbs/style/breadcrumbs.css';
import '../everylayout.scss';
import {
  buildExampleToolbarGroupsWithIcons,
  menuItemWithGeneratedIcon,
  menuItemWithRequiredGeneratedIcon,
  type IconName,
} from './example-menu-icons';
import { customStylingClasses } from './custom-styling';
import { uniqueNodeId } from './node-id';
import {
  baseBlockTags,
  defaultClusterAlign,
  defaultClusterJustify,
  defaultMeasure,
  frameRatios,
  gridMinimums,
  measures,
  normalizeFrameRatio,
  normalizeClusterAlign,
  normalizeClusterJustify,
  normalizeGridMinimum,
  everyLayoutPlugins,
  everyLayoutSchema,
  insertBaseBlockAfterNodeSelection,
  type BaseBlockTag,
  type ClusterAlign,
  type ClusterJustify,
  type FrameRatio,
  type LayoutOption,
  type Measure,
} from './setup';
import {
  componentToolbarLayoutOptions,
  layoutControlEnabled,
  normalizeLayoutOptions,
  selectedLayoutTarget,
  type LayoutTarget,
} from './layout-targets';
import { wrapInBaseBlock, wrapInBaseBlockTitle } from './wrap-in-block';

export { everyLayoutSchema } from './setup';
export { wrapInBaseBlock } from './wrap-in-block';
export {
  blockMoveTarget,
  moveBlock,
  moveBlockDown,
  moveBlockUp,
  type BlockMoveDirection,
  type BlockMoveTarget,
} from './move-block';

const layoutOptions: readonly LayoutOption[] = [
  'box', 'center', 'cluster', 'cover', 'frame', 'grid', 'reel', 'sidebar', 'stack', 'switcher',
];
const zeroSpace = 'zero';
const spaceValues = [zeroSpace, -4, -3, -2, -1, 0, 1, 2, 3] as const;
const sidebarBreakpoints = [50, 66, 75];
const sidebarWidths = ['auto', 12, 16, 20, 24, 28, 32] as const;

type CustomStylingTarget = {
  node: ProseMirrorNode;
  from: number;
};

function normalizedCustomClasses(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((className): className is string => (
      typeof className === 'string' && customStylingClasses.includes(className)
    ))
    : [];
}

function customStylingTarget(state: EditorState): CustomStylingTarget | null {
  if (state.selection instanceof NodeSelection) {
    return 'customClasses' in state.selection.node.attrs
      ? { node: state.selection.node, from: state.selection.from }
      : null;
  }

  for (let depth = state.selection.$from.depth; depth > 0; depth -= 1) {
    const node = state.selection.$from.node(depth);
    if ('customClasses' in node.attrs) {
      return { node, from: state.selection.$from.before(depth) };
    }
  }
  return null;
}
const switcherMaximums = [2, 3, 4, 5, 6, 7];
const switcherThresholds = [20, 25, 30, 35, 40];
const measureWidths: Record<Measure, number> = {
  lg: 60,
  md: 45,
  sm: 30,
};
type ControlValue = number | typeof zeroSpace;
type SidebarWidth = typeof sidebarWidths[number];
type MeasureTarget = {
  node: ProseMirrorNode;
  from: number;
  layoutContainer: boolean;
};

function normalizeMeasure(value: unknown): Measure {
  return measures.includes(value as Measure)
    ? value as Measure
    : defaultMeasure;
}

function stepMeasure(measure: Measure, direction: -1 | 1) {
  const index = measures.indexOf(measure);
  return measures[Math.max(
    0,
    Math.min(measures.length - 1, index - direction),
  )] as Measure;
}
function modifierIconName(
  attribute: string,
  direction: -1 | 1,
): string | undefined {
  if (attribute === 'space') {
    return direction < 0 ? 'decreasespace' : 'increasespace';
  }
  if (attribute === 'gap') {
    return direction < 0 ? 'decreasegap' : 'increasegap';
  }
  if (attribute === 'padding') {
    return direction < 0 ? 'decreasepadding' : 'increasepadding';
  }
  if (attribute === 'gridMin') {
    return direction < 0 ? 'decreasegridmin' : 'increasegridmin';
  }
  if (attribute === 'sidebarBreakpoint') {
    return direction < 0
      ? 'decreasewithsidebarcontentwidth'
      : 'increasewithsidebarcontentwidth';
  }
  if (attribute === 'switcherMax') {
    return direction < 0 ? 'decreaseswitchmax' : 'increaseswitchmax';
  }
  if (attribute === 'switcherThreshold') {
    return direction < 0
      ? 'decreaseswitchthreshold'
      : 'increaseswitchthreshold';
  }
  return undefined;
}

const componentConfigurationControlSpecs = [
  { attribute: 'gridMin', values: gridMinimums },
  {
    attribute: 'sidebarBreakpoint',
    values: sidebarBreakpoints,
  },
  {
    attribute: 'switcherMax',
    values: switcherMaximums,
  },
  {
    attribute: 'switcherThreshold',
    values: switcherThresholds,
  },
] as const;

const genericSpacingControlSpecs = [
  { attribute: 'space', values: spaceValues },
  { attribute: 'padding', values: spaceValues },
  { attribute: 'gap', values: spaceValues },
] as const;

const modifierLayouts = {
  space: ['stack', 'cover'],
  padding: ['box', 'center'],
  gap: ['cluster', 'grid', 'reel', 'sidebar', 'switcher'],
} as const satisfies Partial<Record<string, readonly LayoutOption[]>>;

const clusterJustifyControls = [
  ['start', 'Justify Cluster to start', 'justifycontentflexsstart'],
  ['end', 'Justify Cluster to end', 'justifycontentflexend'],
  ['between', 'Justify Cluster between items', 'justifycontentspacebetween'],
  ['around', 'Justify Cluster around items', 'justifycontentspacearound'],
  ['center', 'Center Cluster justification', 'justifycontentcenter'],
] as const satisfies ReadonlyArray<readonly [ClusterJustify, string, IconName]>;

const clusterAlignControls = [
  ['start', 'Align Cluster items to start', 'alignitemsflexstart'],
  ['center', 'Center Cluster items', 'alignitemscenter'],
  ['end', 'Align Cluster items to end', 'alignitemsflexend'],
  ['stretch', 'Stretch Cluster items', 'alignitemsstretch'],
  ['baseline', 'Align Cluster item baselines', 'alignitemsbaseline'],
] as const satisfies ReadonlyArray<readonly [ClusterAlign, string, IconName]>;

const controlLabels = {
  gridMin: 'Grid minimum',
  sidebarBreakpoint: 'With sidebar content min width',
  switcherMax: 'Switcher maximum',
  switcherThreshold: 'Switcher threshold',
} as const;

function controlLabel(attribute: string) {
  return attribute in controlLabels
    ? controlLabels[attribute as keyof typeof controlLabels]
    : attribute;
}

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

const layoutIconNames = {
  box: 'box',
  center: 'center',
  cluster: 'cluster',
  cover: 'cover',
  frame: 'frame',
  grid: 'grid',
  reel: 'reel',
  sidebar: 'withsidebar',
  stack: 'stack',
  switcher: 'switcher',
} as const satisfies Record<LayoutOption, IconName>;

function isSidebarLayout(layout: LayoutOption) {
  return layout === 'sidebar';
}

function hasSidebarLayout(layouts: readonly LayoutOption[]) {
  return layouts.some(isSidebarLayout);
}

function menuItemForLayout(
  spec: Parameters<typeof menuItemWithGeneratedIcon>[0],
  layout: LayoutOption,
) {
  return menuItemWithRequiredGeneratedIcon(spec, layoutIconNames[layout]);
}

function assertLayoutMenuItemIcons() {
  for (const layout of layoutOptions) {
    menuItemForLayout({ label: layoutLabels[layout], run: () => {} }, layout);
  }
}

assertLayoutMenuItemIcons();

function modifierLabel(
  attribute: keyof typeof modifierLayouts,
  layouts: readonly LayoutOption[],
) {
  const owners = modifierLayouts[attribute]
    .filter((layout) => layouts.includes(layout))
    .map((layout) => layoutLabels[layout]);
  const unit = attribute === 'space' ? 'spacing' : attribute;
  return `${owners.join(' / ')} ${unit}`;
}

function isModifierAttribute(
  attribute: string,
): attribute is keyof typeof modifierLayouts {
  return attribute in modifierLayouts;
}

function baseBlock(schema: Schema) {
  return schema.node('base_block', null, schema.node('paragraph'));
}

const loremIpsum = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.';
const loremIpsumDetail = 'Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.';

function exampleParagraph(schema: Schema, text: string, coverMain = false) {
  return schema.node(
    'paragraph',
    { coverMain },
    schema.text(text),
  );
}

function exampleText(label: string) {
  return `${label}. ${loremIpsum} ${loremIpsumDetail}`;
}

function exampleBlock(
  schema: Schema,
  label: string,
  paragraphs = 2,
  coverMain = false,
) {
  return schema.node(
    'base_block',
    { coverMain },
    Array.from(
      { length: paragraphs },
      (_, index) => exampleParagraph(schema,
        index === 0 ? exampleText(label) : loremIpsumDetail,
      ),
    ),
  );
}

function layoutExample(schema: Schema, layout: LayoutOption) {
  switch (layout) {
    case 'box':
      return [exampleParagraph(schema, exampleText('Box content'))];
    case 'center':
      return [exampleParagraph(schema, exampleText('Centered content'))];
    case 'cluster':
      return [
        exampleParagraph(schema, exampleText('Cluster item one')),
        exampleParagraph(schema, exampleText('Cluster item two')),
        exampleParagraph(schema, exampleText('Cluster item three')),
      ];
    case 'cover':
      return [
        exampleParagraph(schema, exampleText('Cover header')),
        exampleParagraph(schema, exampleText('Cover main'), true),
        exampleParagraph(schema, exampleText('Cover footer')),
      ];
    case 'frame':
      return [exampleParagraph(schema, exampleText('Framed content'))];
    case 'grid':
      return [
        exampleBlock(schema, 'Grid item one'),
        exampleBlock(schema, 'Grid item two'),
        exampleBlock(schema, 'Grid item three'),
      ];
    case 'reel':
      return [
        exampleBlock(schema, 'Reel item one'),
        exampleBlock(schema, 'Reel item two'),
        exampleBlock(schema, 'Reel item three'),
      ];
    case 'sidebar':
      return [
        exampleBlock(schema, 'Sidebar content', 3),
        exampleBlock(schema, 'Main content', 4),
      ];
    case 'stack':
      return [
        exampleParagraph(schema, exampleText('Stack item one')),
        exampleParagraph(schema, exampleText('Stack item two')),
        exampleParagraph(schema, exampleText('Stack item three')),
      ];
    case 'switcher':
      return [
        exampleBlock(schema, 'Switcher item one'),
        exampleBlock(schema, 'Switcher item two'),
        exampleBlock(schema, 'Switcher item three'),
      ];
  }
}

function isEmptyBlock(node: NodeSelection['node']) {
  return node.childCount === 1
    && node.firstChild?.type.name === 'paragraph'
    && node.firstChild.content.size === 0;
}

function updateBlockLayout(
  schema: Schema,
  editor: EditorView,
  target: LayoutTarget,
  layout: LayoutOption,
) {
  const layouts = target.node.attrs.layouts as LayoutOption[];
  const addingLayout = !layouts.includes(layout);
  const nextLayouts = addingLayout
    ? [
      ...layouts.filter((current) => !isSidebarLayout(layout) || !isSidebarLayout(current)),
      layout,
    ]
    : layouts.filter((current) => current !== layout);
  const attrs = {
    ...target.node.attrs,
    layouts: nextLayouts,
    ...(addingLayout && layout === 'center' && target.node.attrs.measure
      ? { centerIntrinsic: false }
      : {}),
  };

  if (target.node.type.name === 'base_block' && addingLayout && isEmptyBlock(target.node)) {
    const transaction = editor.state.tr.replaceWith(
      target.from,
      target.from + target.node.nodeSize,
      schema.node('base_block', attrs, layoutExample(schema, layout)),
    );
    transaction.setSelection(NodeSelection.create(transaction.doc, target.from));
    dispatchStructuralEdit(editor, transaction);
    return;
  }

  dispatchStructuralEdit(
    editor,
    editor.state.tr.setNodeMarkup(target.from, undefined, attrs),
  );
}

function paragraphEnd(state: EditorState) {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if (
      $from.node(depth).type.name === 'paragraph'
      && ['doc', 'base_block'].includes($from.node(depth - 1).type.name)
    ) {
      return $from.after(depth);
    }
  }
  return null;
}

function insertBaseBlockAfterParagraph(schema: Schema, editor: EditorView) {
  const position = paragraphEnd(editor.state);
  if (position === null) {
    return false;
  }
  const transaction = editor.state.tr.insert(position, baseBlock(schema));
  transaction.setSelection(NodeSelection.create(transaction.doc, position));
  editor.dispatch(transaction);
  editor.focus();
  return true;
}

function selectedBaseBlock(state: EditorState) {
  const { selection } = state;
  return selection instanceof NodeSelection && selection.node.type.name === 'base_block'
    ? selection
    : null;
}

function frameRatioCycleLabel(state: EditorState) {
  const currentRatio = normalizeFrameRatio(selectedLayoutTarget(state)?.node.attrs.frameRatio);
  const nextRatio = frameRatios[
    (frameRatios.indexOf(currentRatio) + 1) % frameRatios.length
  ] as FrameRatio;
  return `Cycle to next ratio ${nextRatio.replace('-', ':')}`;
}

function selectedDirectMeasureNode(state: EditorState): MeasureTarget | null {
  const { selection } = state;
  if (
    selection instanceof NodeSelection
    && ['paragraph', 'heading', 'blockquote'].includes(selection.node.type.name)
  ) {
    return {
      node: selection.node,
      from: selection.from,
      layoutContainer: false,
    };
  }

  for (let depth = 1; depth <= selection.$from.depth; depth += 1) {
    const node = selection.$from.node(depth);
    if (!['paragraph', 'heading', 'blockquote'].includes(node.type.name)) {
      continue;
    }
    const from = selection.$from.before(depth);
    if (selection.to < from + node.nodeSize) {
      return { node, from, layoutContainer: false };
    }
  }

  return null;
}

function selectedMeasureTarget(state: EditorState): MeasureTarget | null {
  // A text selection within a directly configurable text block must update
  // that block rather than its enclosing Base Block. Node selections of Base
  // Blocks and Figures still fall through to the generic layout target.
  const directTarget = selectedDirectMeasureNode(state);
  if (directTarget) return directTarget;
  return selectedLayoutTarget(state);
}

function centerIsActive(target: MeasureTarget) {
  return target.layoutContainer
    ? (target.node.attrs.layouts as LayoutOption[]).includes('center')
    : target.node.attrs.center;
}

function boxIsActive(target: MeasureTarget) {
  return target.layoutContainer
    ? (target.node.attrs.layouts as LayoutOption[]).includes('box')
    : target.node.attrs.box;
}

function toggleBox(schema: Schema, editor: EditorView, target: MeasureTarget) {
  if (target.layoutContainer) {
    const layoutTarget = selectedLayoutTarget(editor.state);
    if (layoutTarget) updateBlockLayout(schema, editor, layoutTarget, 'box');
    return;
  }
  dispatchStructuralEdit(editor, editor.state.tr.setNodeMarkup(target.from, undefined, {
    ...target.node.attrs,
    box: !target.node.attrs.box,
  }), target);
}

function dispatchStructuralEdit(
  editor: EditorView,
  transaction: EditorState['tr'],
  selectionTarget?: Pick<MeasureTarget, 'node' | 'from'>,
) {
  const target = selectionTarget ?? selectedLayoutTarget(editor.state);
  if (target) {
    const mappedPosition = transaction.mapping.map(target.from);
    if (transaction.doc.nodeAt(mappedPosition)?.type.name === target.node.type.name) {
      transaction.setSelection(NodeSelection.create(transaction.doc, mappedPosition));
    }
  }
  editor.dispatch(transaction);
  editor.focus();
}

function canBeCoverMain(node: NodeSelection['node']) {
  return Object.prototype.hasOwnProperty.call(node.attrs, 'coverMain');
}

function canHaveId(node: NodeSelection['node']) {
  return Object.prototype.hasOwnProperty.call(node.attrs, 'id');
}

function descriptionParent(selection: NodeSelection) {
  if (!canHaveId(selection.node)) {
    return null;
  }

  let fallback: {
    node: typeof selection.$from.parent;
    position: number;
  } | null = null;
  for (let depth = selection.$from.depth; depth > 0; depth -= 1) {
    const node = selection.$from.node(depth);
    if (node.type.name !== 'base_block') {
      continue;
    }

    const parent = {
      node,
      position: selection.$from.before(depth),
    };
    if (node.attrs.tag === 'header') {
      continue;
    }
    fallback ??= parent;
    if (node.attrs.tag !== 'div') {
      return parent;
    }
  }

  return fallback;
}

function descriptionId(editor: EditorView, selection: NodeSelection) {
  const usedIds = new Set<string>();
  editor.state.doc.descendants((node, position) => {
    if (position !== selection.from && typeof node.attrs.id === 'string') {
      usedIds.add(node.attrs.id);
    }
  });

  return uniqueNodeId(selection.node, usedIds, 'aria-');
}

function setAriaDescription(editor: EditorView, selection: NodeSelection) {
  const parent = descriptionParent(selection);
  if (!parent) {
    return false;
  }

  const id = descriptionId(editor, selection);
  let transaction = editor.state.tr;
  parent.node.descendants((node, position) => {
    if (node.attrs.id === parent.node.attrs.ariaDescribedBy) {
      transaction = transaction.setNodeMarkup(parent.position + position + 1, undefined, {
        ...node.attrs,
        id: null,
      });
    }
  });
  transaction = transaction
    .setNodeMarkup(parent.position, undefined, {
      ...parent.node.attrs,
      ariaDescribedBy: id,
    })
    .setNodeMarkup(selection.from, undefined, {
      ...selection.node.attrs,
      id,
    });
  dispatchStructuralEdit(editor, transaction);
  return true;
}

function isCoverChild(selection: NodeSelection) {
  const parent = selection.$from.parent;
  return parent.type.name === 'base_block'
    && (parent.attrs.layouts as LayoutOption[]).includes('cover')
    && canBeCoverMain(selection.node);
}

function setCoverMain(editor: EditorView, selection: NodeSelection, coverMain: boolean) {
  const parent = selection.$from.parent;
  const parentStart = selection.$from.start();
  let transaction = editor.state.tr;

  parent.forEach((sibling, offset) => {
    if (!canBeCoverMain(sibling)) {
      return;
    }
    const position = parentStart + offset;
    transaction = transaction.setNodeMarkup(position, undefined, {
      ...sibling.attrs,
      coverMain: coverMain && position === selection.from,
    });
  });

  dispatchStructuralEdit(editor, transaction);
}

function stepValue<Value>(
  value: Value,
  values: readonly Value[],
  direction: -1 | 1,
) {
  const index = values.indexOf(value);
  return values[Math.max(0, Math.min(values.length - 1, index + direction))];
}

function formatScaleValue(value: ControlValue) {
  return value === zeroSpace ? 'zero' : `s${value}`;
}

function formatMeasureValue(value: unknown) {
  return `${measureWidths[normalizeMeasure(value)]}ch`;
}

function formatModifierTarget(attribute: string, value: ControlValue) {
  if (attribute === 'gridMin') {
    return `${normalizeGridMinimum(value)}rem`;
  }
  if (attribute === 'space' || attribute === 'padding' || attribute === 'gap') {
    return formatScaleValue(value);
  }
  return String(value);
}

function normalizeSidebarWidth(value: unknown): SidebarWidth {
  return sidebarWidths.includes(value as SidebarWidth)
    ? value as SidebarWidth
    : 'auto';
}

function formatSidebarWidth(value: SidebarWidth) {
  return value === 'auto' ? value : `${value}rem`;
}

function inspectableNode(node: NodeSelection['node']) {
  return ['base_block', 'paragraph', 'heading', 'blockquote'].includes(node.type.name);
}

function nodeTag(node: NodeSelection['node']) {
  if (node.type.name === 'base_block') {
    return node.attrs.tag;
  }
  if (node.type.name === 'heading') {
    return `h${node.attrs.level}`;
  }
  if (node.type.name === 'paragraph') {
    return 'p';
  }
  return node.type.name;
}

function nodeInspection(node: NodeSelection['node']) {
  const details = [
    `Tag: ${nodeTag(node)}`,
  ];
  if (node.attrs.id) {
    details.push(`id: ${node.attrs.id}`);
  }
  if (node.type.name !== 'base_block') {
    if (node.attrs.ariaDescribedBy) {
      details.push(`aria-describedby: ${node.attrs.ariaDescribedBy}`);
    }
    const components = [
      ...(node.attrs.box ? ['Box'] : []),
      ...(node.attrs.center ? ['Center'] : []),
    ];
    details.push(`Components: ${components.length > 0 ? components.join(', ') : 'none'}`);
    if (node.attrs.box) {
      details.push(`Box padding: ${formatScaleValue(node.attrs.padding)}`);
      if (node.attrs.boxInvert) {
        details.push('Box: inverted');
      }
      if (node.attrs.boxBorder) {
        details.push('Box: bordered');
      }
    }
    if (node.attrs.center) {
      details.push(`Center padding: ${formatScaleValue(node.attrs.padding)}`);
      details.push(`Center: ${node.attrs.centerIntrinsic ? 'intrinsic' : 'measured'}`);
      details.push(`text: ${node.attrs.centerText ? 'centered' : 'default'}`);
    }
    if (node.attrs.measure) {
      details.push(`Measure: ${normalizeMeasure(node.attrs.measure)}`);
    }
    if (node.attrs.coverMain) {
      details.push('cover main');
    }
    return details.join(' • ');
  }

  const layouts = node.attrs.layouts as LayoutOption[];
  if (node.attrs.ariaDescribedBy) {
    details.push(`aria-describedby: ${node.attrs.ariaDescribedBy}`);
  }
  details.push(
    `Components: ${
      layouts.length > 0 ? layouts.map((layout) => layoutLabels[layout]).join(', ') : 'none'
    }`,
  );

  if (layouts.includes('stack') || layouts.includes('cover')) {
    details.push(`${modifierLabel('space', layouts)}: ${formatScaleValue(node.attrs.space)}`);
  }
  if (layouts.includes('box') || layouts.includes('center')) {
    details.push(`${modifierLabel('padding', layouts)}: ${formatScaleValue(node.attrs.padding)}`);
  }
  if (layouts.includes('box')) {
    if (node.attrs.boxInvert) {
      details.push('Box: inverted');
    }
    if (node.attrs.boxBorder) {
      details.push('Box: bordered');
    }
  }
  if (layouts.includes('center')) {
    details.push(`Center: ${node.attrs.centerIntrinsic ? 'intrinsic' : 'measured'}`);
  }
  if (node.attrs.measure) {
    details.push(`Measure: ${normalizeMeasure(node.attrs.measure)}`);
  }
  if (
    layouts.includes('cluster')
    || layouts.includes('grid')
    || layouts.includes('reel')
    || hasSidebarLayout(layouts)
    || layouts.includes('switcher')
  ) {
    details.push(`${modifierLabel('gap', layouts)}: ${formatScaleValue(node.attrs.gap)}`);
  }
  if (layouts.includes('cluster')) {
    const clusterJustify = normalizeClusterJustify(node.attrs.clusterJustify);
    if (clusterJustify !== defaultClusterJustify) {
      details.push(`Cluster justification: ${clusterJustify}`);
    }
    const clusterAlign = normalizeClusterAlign(
      node.attrs.clusterAlignCenter ? 'center' : node.attrs.clusterAlign,
    );
    if (clusterAlign !== defaultClusterAlign) {
      details.push(`Cluster alignment: ${clusterAlign}`);
    }
  }
  if (layouts.includes('grid')) {
    details.push(`Grid minimum: ${normalizeGridMinimum(node.attrs.gridMin)}rem`);
  }
  if (hasSidebarLayout(layouts)) {
    details.push(
      `With sidebar position: ${
        node.attrs.sidebarPosition === 'right' ? 'right' : 'left'
      }`,
    );
    details.push(`With sidebar content min width: ${node.attrs.sidebarBreakpoint}%`);
    const sidebarWidth = node.attrs.sidebarWidth as SidebarWidth | null;
    details.push(
      `With sidebar sidebar width: ${
        sidebarWidth === null || sidebarWidth === 'auto' ? 'auto' : `${sidebarWidth}rem`
      }`,
    );
  }
  if (layouts.includes('switcher')) {
    details.push(`Switcher maximum: ${node.attrs.switcherMax}`);
    details.push(`Switcher threshold: ${node.attrs.switcherThreshold}rem`);
  }
  if (layouts.includes('frame')) {
    details.push(`Frame ratio: ${normalizeFrameRatio(node.attrs.frameRatio).replace('-', ':')}`);
  }
  if (node.attrs.coverMain) {
    details.push('cover main');
  }

  return details.join(' • ');
}

export type EveryLayoutEditorChangeContext = {
  document: ProseMirrorNode;
  view: EditorView;
};

export type EveryLayoutEditorPluginContext = {
  schema: Schema;
  shell: HTMLElement;
};

/**
 * The outer arrays are toolbar rows; each inner array is passed to
 * `renderGrouped`, so its item boundaries remain menu separators.
 */
export type EveryLayoutEditorMenuGroups = readonly (
  readonly (readonly MenuElement[])[]
)[];

export type EveryLayoutEditorMenuContext = EveryLayoutEditorPluginContext & {
  view: EditorView;
  menu: HTMLElement;
  /** The current default groups; return these unchanged to retain the built-in toolbar. */
  defaultGroups: EveryLayoutEditorMenuGroups;
};

export type EveryLayoutEditorOptions = {
  /** Element that receives the editor shell, toolbar, breadcrumbs, and modal UI. */
  mount: HTMLElement;
  /** Defaults to everyLayoutSchema. It is also supplied to the plugin and menu factories. */
  schema?: Schema;
  /** A document for `schema`, or its JSON representation. */
  initialDocument?: ProseMirrorNode | unknown;
  /** A preconfigured state for `schema`; its plugins are extended with configured Every Layout plugins. */
  initialState?: EditorState;
  /**
   * Receives a fresh default plugin list in shell, modal, reel-overflow,
   * breadcrumb order. Return a new list to add, remove, reorder, or replace it.
   */
  plugins?: (context: EveryLayoutEditorPluginContext & {
    defaultPlugins: readonly Plugin[];
  }) => readonly Plugin[];
  /**
   * Receives the current built-in toolbar groups. Return them, a transformed
   * copy, or replacement groups. The factory runs after selection/document
   * changes so custom controls stay synchronized with editor state.
   */
  menu?: (context: EveryLayoutEditorMenuContext) => EveryLayoutEditorMenuGroups;
  /** Called after a document-changing transaction has been applied. */
  onChange?: (context: EveryLayoutEditorChangeContext) => void;
};

export type EveryLayoutEditor = {
  view: EditorView;
  destroy: () => void;
};

function migrateDocument(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(migrateDocument);
  }
  if (!value || typeof value !== 'object') {
    return value;
  }

  const node = value as {
    type?: unknown;
    attrs?: Record<string, unknown>;
    content?: unknown[];
  };
  const isBaseBlock = node.type === 'base_block' || node.type === 'base_box';
  const isFigure = node.type === 'figure';
  const isLayoutContainer = isBaseBlock || isFigure;
  const isDirectTextBlock = ['paragraph', 'heading', 'blockquote'].includes(
    node.type as string,
  );
  const isCentered = isLayoutContainer
    ? Array.isArray(node.attrs?.layouts) && node.attrs.layouts.includes('center')
    : node.attrs?.center === true;
  const { centerMeasure: legacyCenterMeasure, ...currentAttrs } = node.attrs ?? {};
  const legacyMeasureEnabled = isCentered && node.attrs?.centerIntrinsic === false;
  const measure = currentAttrs.measure ?? (
    legacyMeasureEnabled ? legacyCenterMeasure ?? defaultMeasure : null
  );
  const gridMin = isLayoutContainer
    ? normalizeGridMinimum(currentAttrs.gridMin)
    : undefined;
  const attrs = node.attrs
    ? {
      ...currentAttrs,
      ...(isLayoutContainer
        ? {
          boxInvert: currentAttrs.boxInvert === true,
          boxBorder: currentAttrs.boxBorder === true,
          ...(Array.isArray(currentAttrs.layouts)
            ? {
              layouts: normalizeLayoutOptions(node.type, currentAttrs.layouts),
            }
            : {}),
          clusterJustify: normalizeClusterJustify(currentAttrs.clusterJustify),
          clusterAlign: normalizeClusterAlign(
            currentAttrs.clusterAlignCenter ? 'center' : currentAttrs.clusterAlign,
          ),
          clusterAlignCenter: currentAttrs.clusterAlignCenter === true,
        }
        : {}),
      ...(isDirectTextBlock
        ? {
          box: currentAttrs.box === true,
          boxInvert: currentAttrs.boxInvert === true,
          boxBorder: currentAttrs.boxBorder === true,
        }
        : {}),
      ...(measure === null || measure === undefined ? {} : { measure: normalizeMeasure(measure) }),
      ...(gridMin === undefined ? {} : { gridMin }),
      ...(isCentered && measure !== null && measure !== undefined
        ? { centerIntrinsic: false }
        : {}),
    }
    : undefined;

  return {
    ...node,
    ...(node.type === 'base_box' ? { type: 'base_block' } : {}),
    ...(attrs ? { attrs } : {}),
    ...(Array.isArray(node.content)
      ? { content: node.content.map(migrateDocument) }
      : {}),
  };
}

export function everyLayoutDocumentFromJSON(
  value: ProseMirrorNode | unknown | undefined,
  schema: Schema = everyLayoutSchema,
) {
  if (value instanceof ProseMirrorNode) {
    return value;
  }
  if (value !== undefined) {
    return schema.nodeFromJSON(migrateDocument(value));
  }
  return schema.node('paragraph');
}

/**
 * Mounts the complete, host-neutral Every Layout editor. Hosts provide persistence and
 * initial content through options rather than importing editor implementation details.
 *
 * ```ts
 * mountEveryLayoutEditor({
 *   mount, schema: mySchema,
 *   plugins: ({ defaultPlugins }) => [...defaultPlugins, myPlugin],
 *   menu: ({ defaultGroups, view, schema }) => defaultGroups,
 * });
 * ```
 */
export function mountEveryLayoutEditor(options: EveryLayoutEditorOptions): EveryLayoutEditor {
  const {
    mount: shell,
    schema = everyLayoutSchema,
    initialDocument,
    initialState,
    onChange,
    plugins,
    menu: menuFactory,
  } = options;
  const menu = document.createElement('div');
  menu.setAttribute('role', 'toolbar');
  shell.append(menu);

  if (initialState && initialState.schema !== schema) {
    throw new Error('initialState must use the configured Every Layout editor schema.');
  }
  const defaultPlugins = everyLayoutPlugins(schema, shell);
  const configuredPlugins = plugins?.({
    shell,
    schema,
    defaultPlugins: [...defaultPlugins],
  }) ?? defaultPlugins;

  let editor: EditorView;
  let showBlockOutlines = true;
  let showBlockInspection = false;
  shell.classList.add('show-block-outlines');

  const selectedNode = (state: EditorState) => (
    state.selection instanceof NodeSelection ? state.selection : null
  );
  const measureEnabled = (state: EditorState) => selectedMeasureTarget(state) !== null;
  const baseBlockEnabled = (state: EditorState) => selectedBaseBlock(state) !== null;
  const renderMenu = () => {
    menu.replaceChildren();
    const state = editor.state;
    const block = selectedBaseBlock(state);
    const layoutTarget = selectedLayoutTarget(state);
    const nodeSelection = selectedNode(state);
    const inspectedNode = nodeSelection && inspectableNode(nodeSelection.node)
      ? nodeSelection
      : null;
    const blockLayouts = layoutTarget?.node.attrs.layouts as LayoutOption[] | undefined;
    const hasLayout = (layout: LayoutOption) => Boolean(
      layoutTarget?.allowedLayouts.includes(layout) && blockLayouts?.includes(layout),
    );
    const descriptionEnabled = (currentState: EditorState) => {
      const selection = selectedNode(currentState);
      return Boolean(selection && canHaveId(selection.node) && descriptionParent(selection));
    };
    const coverMainEnabled = (currentState: EditorState) => {
      const selection = selectedNode(currentState);
      return Boolean(selection && isCoverChild(selection));
    };
    const boxTarget = selectedMeasureTarget(state);
    const boxAction = menuItemForLayout({
      label: boxTarget && boxIsActive(boxTarget) ? 'Remove Box' : 'Add Box',
      enable: (currentState) => selectedMeasureTarget(currentState) !== null,
      run: () => {
        const target = selectedMeasureTarget(editor.state);
        if (target) toggleBox(schema, editor, target);
      },
    }, 'box');
    const layoutControls = componentToolbarLayoutOptions
      .filter((layout) => (
        layout !== 'box'
        && layout !== 'center'
      ))
      .map((layout) => menuItemForLayout({
        label: `${blockLayouts?.includes(layout) ? 'Remove' : 'Add'} ${layoutLabels[layout]}`,
        enable: (currentState) => layoutControlEnabled(currentState, layout),
        run: () => {
          const target = selectedLayoutTarget(editor.state);
          if (target?.allowedLayouts.includes(layout)) {
            updateBlockLayout(schema, editor, target, layout);
          }
        },
      }, layout));
    const blockTagControl = new Dropdown(
      baseBlockTags.map((tag) => new MenuItem({
        label: tag,
        enable: baseBlockEnabled,
        run: () => {
          const selectedBlock = selectedBaseBlock(editor.state);
          if (!selectedBlock) return;
          dispatchStructuralEdit(
            editor,
            editor.state.tr.setNodeMarkup(selectedBlock.from, undefined, {
              ...selectedBlock.node.attrs,
              tag,
            }),
          );
        },
      })),
      { label: `Tag: ${block?.node.attrs.tag as BaseBlockTag ?? 'div'}` },
    );
    const controlsFor = (
      controls: readonly { attribute: string; values: readonly ControlValue[] }[],
    ) => controls.flatMap(({ attribute, values }) => {
      const contextualLabel = isModifierAttribute(attribute)
        ? modifierLabel(attribute, blockLayouts ?? [])
        : controlLabel(attribute);
      const applicable = (
        (attribute === 'gridMin' && hasLayout('grid'))
        || (attribute === 'sidebarBreakpoint' && hasSidebarLayout(blockLayouts ?? []))
        || (attribute === 'space' && (hasLayout('stack') || hasLayout('cover')))
        || (attribute === 'padding' && (hasLayout('box') || hasLayout('center')))
        || (
          (attribute === 'switcherMax' || attribute === 'switcherThreshold')
          && hasLayout('switcher')
        )
        || (
          attribute === 'gap'
          && ['cluster', 'grid', 'reel', 'sidebar', 'switcher'].some(
            (layout) => hasLayout(layout as LayoutOption),
          )
        )
      );
      if (!applicable) {
        return [];
      }
      const enabled = (currentState: EditorState) => {
        const target = selectedLayoutTarget(currentState);
        if (!target) return false;
        const layouts = target.node.attrs.layouts as LayoutOption[];
        if (attribute === 'gridMin') return layouts.includes('grid');
        if (attribute === 'sidebarBreakpoint') return hasSidebarLayout(layouts);
        if (attribute === 'space') return layouts.some((layout) => layout === 'stack' || layout === 'cover');
        if (attribute === 'padding') return layouts.includes('box') || layouts.includes('center');
        if (attribute === 'switcherMax' || attribute === 'switcherThreshold') return layouts.includes('switcher');
        return layouts.some((layout) => ['cluster', 'grid', 'reel', 'sidebar', 'switcher'].includes(layout));
      };
      const changeValue = (direction: -1 | 1) => () => {
        const target = selectedLayoutTarget(editor.state);
        if (!target || !enabled(editor.state)) return;
        const current = target.node.attrs[attribute] as ControlValue;
        dispatchStructuralEdit(
          editor,
          editor.state.tr.setNodeMarkup(target.from, undefined, {
            ...target.node.attrs,
            [attribute]: stepValue(current, values, direction),
          }),
        );
      };
      return ([1, -1] as const).map((direction) => {
        const iconName = modifierIconName(attribute, direction);
        const nextValue = stepValue(
          layoutTarget!.node.attrs[attribute] as ControlValue,
          values,
          direction,
        );
        const spec = {
          label: `${direction < 0 ? 'Decrease' : 'Increase'} ${contextualLabel} to ${
            formatModifierTarget(attribute, nextValue)
          }`,
          enable: enabled,
          run: changeValue(direction),
        };
        return iconName
          ? menuItemWithGeneratedIcon(spec, iconName)
          : new MenuItem(spec);
      });
    });
    const componentConfigurationControls = controlsFor(componentConfigurationControlSpecs);
    const genericSpacingModifierControls = controlsFor(genericSpacingControlSpecs);
    const clusterModifierControls = hasLayout('cluster')
      ? [
        ...clusterJustifyControls.map(([justify, actionLabel, iconName]) => {
          const currentJustify = normalizeClusterJustify(
            layoutTarget!.node.attrs.clusterJustify,
          );
          const label = currentJustify === justify && justify !== defaultClusterJustify
            ? 'Reset Cluster justification'
            : actionLabel;
          return (
          menuItemWithRequiredGeneratedIcon({
            label,
            title: label,
            enable: (currentState) => {
              const target = selectedLayoutTarget(currentState);
              return Boolean(
                target
                && (target.node.attrs.layouts as LayoutOption[]).includes('cluster'),
              );
            },
            run: () => {
              const target = selectedLayoutTarget(editor.state);
              if (!target || !(target.node.attrs.layouts as LayoutOption[]).includes('cluster')) {
                return;
              }
              dispatchStructuralEdit(
                editor,
                editor.state.tr.setNodeMarkup(target.from, undefined, {
                  ...target.node.attrs,
                  clusterJustify: normalizeClusterJustify(target.node.attrs.clusterJustify) === justify
                    ? defaultClusterJustify
                    : justify,
                }),
              );
            },
          }, iconName, label)
          );
        }),
        ...clusterAlignControls.map(([align, actionLabel, iconName]) => {
          const currentAlign = normalizeClusterAlign(
            layoutTarget!.node.attrs.clusterAlignCenter
              ? 'center'
              : layoutTarget!.node.attrs.clusterAlign,
          );
          const label = currentAlign === align && align !== defaultClusterAlign
            ? 'Reset Cluster alignment'
            : actionLabel;
          return menuItemWithRequiredGeneratedIcon({
            label,
            title: label,
            enable: (currentState) => {
              const target = selectedLayoutTarget(currentState);
              return Boolean(
                target
                && (target.node.attrs.layouts as LayoutOption[]).includes('cluster'),
              );
            },
            run: () => {
              const target = selectedLayoutTarget(editor.state);
              if (!target || !(target.node.attrs.layouts as LayoutOption[]).includes('cluster')) {
                return;
              }
              const nextAlign = normalizeClusterAlign(
                target.node.attrs.clusterAlignCenter
                  ? 'center'
                  : target.node.attrs.clusterAlign,
              ) === align
                ? defaultClusterAlign
                : align;
              dispatchStructuralEdit(
                editor,
                editor.state.tr.setNodeMarkup(target.from, undefined, {
                  ...target.node.attrs,
                  clusterAlign: nextAlign,
                  clusterAlignCenter: nextAlign === 'center',
                }),
              );
            },
          }, iconName, label);
        }),
      ]
      : [];
    const boxModifierControls = boxTarget && boxIsActive(boxTarget)
      ? ([
        ['boxInvert', 'Invert Box', 'Remove Box Inversion', 'invertbox'],
        ['boxBorder', 'Add Box Border', 'Remove Box Border', 'addboxborder'],
      ] as const).map(([attribute, enableLabel, removeLabel, iconName]) => (
        menuItemWithRequiredGeneratedIcon({
          label: boxTarget.node.attrs[attribute] ? removeLabel : enableLabel,
          title: boxTarget.node.attrs[attribute] ? removeLabel : enableLabel,
          enable: (currentState) => {
            const target = selectedMeasureTarget(currentState);
            return Boolean(target && boxIsActive(target));
          },
          run: () => {
            const target = selectedMeasureTarget(editor.state);
            if (!target || !boxIsActive(target)) return;
            dispatchStructuralEdit(
              editor,
              editor.state.tr.setNodeMarkup(target.from, undefined, {
                ...target.node.attrs,
                [attribute]: !target.node.attrs[attribute],
              }),
              target,
            );
          },
        }, iconName)
      ))
      : [];
    const measureTarget = selectedMeasureTarget(state);
    const measureModifiers = measureTarget ? [
      menuItemWithRequiredGeneratedIcon({
        label: centerIsActive(measureTarget)
          ? (measureTarget.node.attrs.measure ? 'Restore intrinsic' : 'Add measure')
          : (measureTarget.node.attrs.measure ? 'Remove measure' : 'Add measure'),
        enable: (currentState) => {
          return selectedMeasureTarget(currentState) !== null;
        },
        run: () => {
          const target = selectedMeasureTarget(editor.state);
          if (!target) return;
          const centered = centerIsActive(target);
          const measured = Boolean(target.node.attrs.measure);
          dispatchStructuralEdit(editor, editor.state.tr.setNodeMarkup(target.from, undefined, {
            ...target.node.attrs,
            measure: measured ? null : defaultMeasure,
            ...(centered ? { centerIntrinsic: measured } : {}),
          }), target);
        },
      }, 'addmeasure'),
      ...([1, -1] as const).map((direction) => {
        const measure = normalizeMeasure(measureTarget.node.attrs.measure);
        const nextMeasure = stepMeasure(measure, direction);
        return menuItemWithRequiredGeneratedIcon({
          label: `${direction > 0 ? 'Increase' : 'Decrease'} measure to ${
            formatMeasureValue(nextMeasure)
          }`,
          enable: (currentState) => {
            const target = selectedMeasureTarget(currentState);
            if (!target || !target.node.attrs.measure) {
              return false;
            }
            return stepMeasure(
              normalizeMeasure(target.node.attrs.measure),
              direction,
            ) !== normalizeMeasure(target.node.attrs.measure);
          },
          run: () => {
            const target = selectedMeasureTarget(editor.state);
            if (!target || !target.node.attrs.measure) return;
            const currentMeasure = normalizeMeasure(target.node.attrs.measure);
            const updatedMeasure = stepMeasure(currentMeasure, direction);
            if (updatedMeasure === currentMeasure) return;
            dispatchStructuralEdit(editor, editor.state.tr.setNodeMarkup(target.from, undefined, {
              ...target.node.attrs,
              measure: updatedMeasure,
            }), target);
          },
        }, direction > 0 ? 'increasemeasure' : 'decreasemeasure');
      }),
      ...((centerIsActive(measureTarget) || boxIsActive(measureTarget)) && !measureTarget.layoutContainer
        ? ([1, -1] as const).map((direction) => (
        menuItemWithGeneratedIcon({
          label: `${direction < 0 ? 'Decrease' : 'Increase'} ${
            boxIsActive(measureTarget) && centerIsActive(measureTarget)
              ? 'Box / Center'
              : boxIsActive(measureTarget) ? 'Box' : 'Center'
          } padding to ${formatScaleValue(stepValue(
            measureTarget.node.attrs.padding as ControlValue,
            spaceValues,
            direction,
          ))}`,
          enable: (currentState) => {
            const target = selectedMeasureTarget(currentState);
            return Boolean(
              target
              && !target.layoutContainer
              && (centerIsActive(target) || boxIsActive(target)),
            );
          },
          run: () => {
            const target = selectedMeasureTarget(editor.state);
            if (
              !target
              || target.layoutContainer
              || (!centerIsActive(target) && !boxIsActive(target))
            ) return;
            dispatchStructuralEdit(editor, editor.state.tr.setNodeMarkup(target.from, undefined, {
              ...target.node.attrs,
              padding: stepValue(
                target.node.attrs.padding as ControlValue,
                spaceValues,
                direction,
              ),
            }), target);
          },
        }, modifierIconName('padding', direction)! as IconName)
      )) : []),
      ...(centerIsActive(measureTarget) ? [menuItemWithGeneratedIcon({
        label: measureTarget.node.attrs.centerText ? 'Uncenter text' : 'Center text',
        enable: (currentState) => {
          const target = selectedMeasureTarget(currentState);
          return Boolean(target && centerIsActive(target));
        },
        run: () => {
          const target = selectedMeasureTarget(editor.state);
          if (!target || !centerIsActive(target)) return;
          dispatchStructuralEdit(editor, editor.state.tr.setNodeMarkup(target.from, undefined, {
            ...target.node.attrs,
            centerText: !target.node.attrs.centerText,
          }), target);
        },
      }, 'centertext'),
      ] : []),
    ] : [];
    const centerAction = menuItemWithGeneratedIcon({
        label: measureTarget && centerIsActive(measureTarget) ? 'Remove Center' : 'Add Center',
        enable: measureEnabled,
        run: () => {
          const target = selectedMeasureTarget(editor.state);
          if (!target) return;
          if (target.layoutContainer) {
            const layoutTarget = selectedLayoutTarget(editor.state);
            if (layoutTarget) updateBlockLayout(schema, editor, layoutTarget, 'center');
            return;
          }
          dispatchStructuralEdit(editor, editor.state.tr.setNodeMarkup(target.from, undefined, {
            ...target.node.attrs,
            center: !target.node.attrs.center,
            ...(!target.node.attrs.center && target.node.attrs.measure
              ? { centerIntrinsic: false }
              : {}),
          }), target);
        },
      }, 'center');
    const sidebarWidthControls = hasSidebarLayout(blockLayouts ?? [])
      ? ([1, -1] as const).map((direction) => {
        const sidebarWidth = normalizeSidebarWidth(layoutTarget!.node.attrs.sidebarWidth);
        const nextSidebarWidth = stepValue(sidebarWidth, sidebarWidths, direction);
        const label = `${direction < 0 ? 'Decrease' : 'Increase'} With sidebar sidebar width to ${
          formatSidebarWidth(nextSidebarWidth)
        }`;
        return menuItemWithGeneratedIcon({
          label,
          enable: (currentState) => {
            const selectedBlock = selectedLayoutTarget(currentState);
            if (
              !selectedBlock
              || !hasSidebarLayout(selectedBlock.node.attrs.layouts as LayoutOption[])
            ) {
              return false;
            }
            const currentSidebarWidth = normalizeSidebarWidth(selectedBlock.node.attrs.sidebarWidth);
            return stepValue(currentSidebarWidth, sidebarWidths, direction) !== currentSidebarWidth;
          },
          run: () => {
            const selectedBlock = selectedLayoutTarget(editor.state);
            if (!selectedBlock || !hasSidebarLayout(selectedBlock.node.attrs.layouts as LayoutOption[])) {
              return;
            }
            const currentSidebarWidth = normalizeSidebarWidth(selectedBlock.node.attrs.sidebarWidth);
            const updatedSidebarWidth = stepValue(
              currentSidebarWidth,
              sidebarWidths,
              direction,
            );
            if (updatedSidebarWidth === currentSidebarWidth) return;
            dispatchStructuralEdit(editor, editor.state.tr.setNodeMarkup(selectedBlock.from, undefined, {
              ...selectedBlock.node.attrs,
              sidebarWidth: updatedSidebarWidth,
            }));
          },
        }, direction < 0
          ? 'decreasewithsidebarsidebarwidth'
          : 'increasewithsidebarsidebarwidth', label);
      })
      : [];
    const sidebarOrientationControl = hasSidebarLayout(blockLayouts ?? [])
      ? (() => {
        const sidebarOnRight = block?.node.attrs.sidebarPosition === 'right';
        const direction = sidebarOnRight ? 'left' : 'right';
        return menuItemWithRequiredGeneratedIcon({
          label: `Move sidebar ${direction}`,
          title: `Move sidebar ${direction}`,
          enable: (currentState) => {
            const selectedBlock = selectedLayoutTarget(currentState);
            return Boolean(
              selectedBlock
              && hasSidebarLayout(selectedBlock.node.attrs.layouts as LayoutOption[]),
            );
          },
          run: () => {
            const selectedBlock = selectedLayoutTarget(editor.state);
            if (!selectedBlock || !hasSidebarLayout(selectedBlock.node.attrs.layouts as LayoutOption[])) {
              return;
            }
            const sidebarPosition = selectedBlock.node.attrs.sidebarPosition === 'right'
              ? 'left'
              : 'right';
            dispatchStructuralEdit(editor, editor.state.tr.setNodeMarkup(selectedBlock.from, undefined, {
              ...selectedBlock.node.attrs,
              sidebarPosition,
            }));
          },
        }, sidebarOnRight ? 'withsidebarleft' : 'withsidebarright');
      })()
      : null;
    const frameRatioControl = hasLayout('frame')
      ? (() => {
        return menuItemWithRequiredGeneratedIcon({
          label: frameRatioCycleLabel(state),
          title: frameRatioCycleLabel,
          enable: (currentState) => {
            const selectedBlock = selectedLayoutTarget(currentState);
            return Boolean(
              selectedBlock
              && (selectedBlock.node.attrs.layouts as LayoutOption[]).includes('frame'),
            );
          },
          run: () => {
            const selectedBlock = selectedLayoutTarget(editor.state);
            if (!selectedBlock || !(selectedBlock.node.attrs.layouts as LayoutOption[]).includes('frame')) {
              return;
            }
            const currentRatio = normalizeFrameRatio(selectedBlock.node.attrs.frameRatio);
            const nextRatio = frameRatios[
              (frameRatios.indexOf(currentRatio) + 1) % frameRatios.length
            ] as FrameRatio;
            dispatchStructuralEdit(editor, editor.state.tr.setNodeMarkup(selectedBlock.from, undefined, {
              ...selectedBlock.node.attrs,
              frameRatio: nextRatio,
            }));
          },
        }, 'cycleframeratios', frameRatioCycleLabel);
      })()
      : null;
    const descriptionAction = menuItemWithGeneratedIcon({
      label: 'Set as description',
      enable: descriptionEnabled,
      run: () => {
        const selection = selectedNode(editor.state);
        if (selection && descriptionEnabled(editor.state)) setAriaDescription(editor, selection);
      },
    }, 'setarialabeledby');
    const wrapInBlockAction = menuItemWithGeneratedIcon({
      label: 'Wrap in Block',
      title: wrapInBaseBlockTitle,
      enable: wrapInBaseBlock,
      run: () => {
        if (wrapInBaseBlock(editor.state, editor.dispatch)) {
          editor.focus();
        }
      },
    }, 'converttoblock', wrapInBaseBlockTitle);
    const coverMainAction = nodeSelection && isCoverChild(nodeSelection)
      ? menuItemWithGeneratedIcon({
        label: nodeSelection.node.attrs.coverMain ? 'Remove cover main' : 'Set as cover main',
        enable: coverMainEnabled,
        run: () => {
          const selection = selectedNode(editor.state);
          if (selection && isCoverChild(selection)) {
            setCoverMain(editor, selection, !selection.node.attrs.coverMain);
          }
        },
      }, 'setcovermain')
      : null;
    const selectedCustomClasses = normalizedCustomClasses(
      customStylingTarget(state)?.node.attrs.customClasses,
    );
    const customStylingControl = new Dropdown([
      new MenuItem({
        label: 'Remove custom classes',
        enable: (currentState) => normalizedCustomClasses(
          customStylingTarget(currentState)?.node.attrs.customClasses,
        ).length > 0,
        run: () => {
          const target = customStylingTarget(editor.state);
          if (!target) return;
          dispatchStructuralEdit(editor, editor.state.tr.setNodeMarkup(target.from, undefined, {
            ...target.node.attrs,
            customClasses: [],
          }));
        },
      }),
      ...customStylingClasses.map((className) => new MenuItem({
        label: `${selectedCustomClasses.includes(className) ? 'Remove' : 'Add'} ${className}`,
        enable: (currentState) => customStylingTarget(currentState) !== null,
        run: () => {
          const target = customStylingTarget(editor.state);
          if (!target) return;
          const currentClasses = normalizedCustomClasses(target.node.attrs.customClasses);
          const customClasses = currentClasses.includes(className)
            ? currentClasses.filter((currentClass) => currentClass !== className)
            : [...currentClasses, className];
          dispatchStructuralEdit(editor, editor.state.tr.setNodeMarkup(target.from, undefined, {
            ...target.node.attrs,
            customClasses,
          }));
        },
      })),
    ], {
      label: selectedCustomClasses.length > 0
        ? `Classes: ${selectedCustomClasses.join(', ')}`
        : 'Classes',
    });
    const blockToolbarGroups: MenuElement[][] = [
      [wrapInBlockAction, boxAction, ...layoutControls],
      [centerAction],
      ...(block ? [[blockTagControl]] : []),
    ];
    const modifierToolbarGroups: MenuElement[][] = [
      ...(sidebarOrientationControl ? [[sidebarOrientationControl]] : []),
      ...(frameRatioControl ? [[frameRatioControl]] : []),
      ...(coverMainAction ? [[coverMainAction]] : []),
      ...(measureModifiers.length > 0 ? [measureModifiers] : []),
      ...(boxModifierControls.length > 0 ? [boxModifierControls] : []),
      ...(componentConfigurationControls.length > 0 ? [componentConfigurationControls] : []),
      ...(sidebarWidthControls.length > 0 ? [sidebarWidthControls] : []),
      ...(clusterModifierControls.length > 0 ? [clusterModifierControls] : []),
      ...(genericSpacingModifierControls.length > 0 ? [genericSpacingModifierControls] : []),
    ];
    const exampleToolbarGroups = buildExampleToolbarGroupsWithIcons(schema);
    const utilityActions: MenuElement[] = [
      showBlockOutlines
        ? menuItemWithGeneratedIcon({
          label: 'Hide block outlines',
          run: () => {
            showBlockOutlines = false;
            shell.classList.remove('show-block-outlines');
            renderMenu();
          },
        }, 'hideoutlines')
        : menuItemWithGeneratedIcon({
          label: 'Show block outlines',
          run: () => {
            showBlockOutlines = true;
            shell.classList.add('show-block-outlines');
            renderMenu();
          },
        }, 'hideoutlines'),
      menuItemWithGeneratedIcon({
        label: inspectedNode ? `Inspect ${inspectedNode.node.type.name.replace('_', ' ')}` : 'Inspect selection',
        enable: (currentState) => {
          const selection = selectedNode(currentState);
          return Boolean(selection && inspectableNode(selection.node));
        },
        run: () => {
          showBlockInspection = !showBlockInspection;
          renderMenu();
        },
      }, 'inspect'),
      menuItemWithGeneratedIcon({
        label: shell.classList.contains('is-fullscreen') ? 'Exit fullscreen' : 'Fullscreen',
        run: () => {
          shell.classList.toggle('is-fullscreen');
          updateFloatingControls();
          renderMenu();
        },
      }, 'fullscreen'),
    ];
    const toolbarGroups: MenuElement[][][] = [
      [
        ...exampleToolbarGroups.common,
        [
          ...exampleToolbarGroups.nativeBlockActions.flat(),
        ],
        utilityActions,
      ],
      [
        ...exampleToolbarGroups.text,
        [descriptionAction, customStylingControl],
      ],
      blockToolbarGroups,
      ...(modifierToolbarGroups.length > 0 ? [modifierToolbarGroups] : []),
    ];
    const menuGroups = menuFactory?.({
      shell,
      schema,
      view: editor,
      menu,
      defaultGroups: toolbarGroups,
    }) ?? toolbarGroups;
    for (const controls of menuGroups) {
      const group = document.createElement('div');
      group.className = 'prosemirror-editor-toolbar-group';
      group.dataset.toolbarLevel = 'first';
      const toolbar = renderGrouped(editor, controls);
      toolbar.dom.querySelectorAll('.ProseMirror-menuseparator').forEach((divider) => {
        divider.setAttribute('data-toolbar-level', 'second');
      });
      if (controls[controls.length - 1] === utilityActions) {
        toolbar.dom.querySelector('.ProseMirror-menuseparator:last-of-type')
          ?.setAttribute('data-toolbar-spacer', '');
      }
      group.append(toolbar.dom);
      menu.append(group);
      toolbar.update(state);
    }
    if (showBlockInspection && inspectedNode) {
      const inspection = document.createElement('div');
      inspection.className = 'block-inspection';
      inspection.setAttribute('role', 'status');
      inspection.textContent = nodeInspection(inspectedNode.node);
      menu.append(inspection);
    }
    updateFloatingControls();
  };

  editor = new EditorView(shell, {
    state: initialState?.reconfigure({
      plugins: [
        ...initialState.plugins,
        ...configuredPlugins,
      ],
    }) ?? EditorState.create({
      doc: everyLayoutDocumentFromJSON(initialDocument, schema),
      plugins: configuredPlugins,
    }),
    dispatchTransaction(transaction) {
      const state = editor.state.apply(transaction);
      editor.updateState(state);
      if (transaction.docChanged) onChange?.({ document: editor.state.doc, view: editor });
      if (transaction.selectionSet || transaction.docChanged) renderMenu();
    },
    editable: () => true,
    handleKeyDown: (_view, event) => {
      if (
        event.key === 'Enter'
        && insertBaseBlockAfterNodeSelection(schema, editor.state, editor.dispatch)
      ) {
        event.preventDefault();
        return true;
      }
      if (
        (event.metaKey || event.ctrlKey)
        && event.altKey
        && event.key.toLowerCase() === 'b'
        && insertBaseBlockAfterParagraph(schema, editor)
      ) {
        event.preventDefault();
        return true;
      }
      if (event.key !== 'Escape' || !shell.classList.contains('is-fullscreen')) return false;
      event.preventDefault();
      shell.classList.remove('is-fullscreen');
      updateFloatingControls();
      renderMenu();
      return true;
    },
  });
  const updateFloatingControls = () => {
    const bounds = shell.getBoundingClientRect();
    shell.style.setProperty('--editor-shell-left', `${bounds.left}px`);
    shell.style.setProperty('--editor-shell-width', `${bounds.width}px`);
    shell.style.setProperty('--editor-controls-top', `${Math.max(0, bounds.top)}px`);

    const breadcrumbs = shell.querySelector<HTMLElement>('.ProseMirror-breadcrumb-container');
    const toolbarHeight = menu.getBoundingClientRect().height;
    const breadcrumbHeight = breadcrumbs?.getBoundingClientRect().height ?? 0;
    shell.style.setProperty('--editor-toolbar-height', `${toolbarHeight}px`);
    shell.style.setProperty('--editor-controls-height', `${toolbarHeight + breadcrumbHeight}px`);
  };
  window.addEventListener('resize', updateFloatingControls);
  window.addEventListener('scroll', updateFloatingControls, { passive: true });
  renderMenu();
  return {
    view: editor,
    destroy() {
      window.removeEventListener('resize', updateFloatingControls);
      window.removeEventListener('scroll', updateFloatingControls);
      editor.destroy();
      shell.replaceChildren();
    },
  };
}
