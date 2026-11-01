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
import 'prosemirror-view/style/prosemirror.css';
import 'prosemirror-menu/style/menu.css';
import 'prosemirror-example-setup/style/style.css';
import '../../prosemirror-breadcrumbs/style/breadcrumbs.css';
import '../everylayout.scss';
import './editor.css';
import {
  buildExampleToolbarGroupsWithIcons,
  menuItemWithGeneratedIcon,
  menuItemWithRequiredGeneratedIcon,
  type IconName,
} from './example-menu-icons';
import {
  baseBlockTags,
  frameRatios,
  normalizeFrameRatio,
  pagePlugins,
  pageSchema,
  type BaseBlockTag,
  type FrameRatio,
} from './setup';

export { pageSchema } from './setup';

const layoutOptions = [
  'box',
  'center',
  'cluster',
  'cover',
  'frame',
  'grid',
  'reel',
  'sidebar',
  'stack',
  'switcher',
] as const;
type LayoutOption = typeof layoutOptions[number];
const zeroSpace = 'zero';
const spaceValues = [zeroSpace, -4, -3, -2, -1, 0, 1, 2, 3] as const;
const gridMinimums = [12, 16, 20, 24];
const sidebarBreakpoints = [50, 66, 75];
const sidebarWidths = ['auto', 12, 16, 20, 24, 28, 32] as const;
const switcherMaximums = [2, 3, 4, 5, 6, 7];
const switcherThresholds = [20, 25, 30, 35, 40];
type ControlValue = number | typeof zeroSpace;
type SidebarWidth = typeof sidebarWidths[number];
type CenterTarget = {
  node: ProseMirrorNode;
  from: number;
  baseBlock: boolean;
};
function modifierIconName(
  attribute: string,
  direction: -1 | 1,
) {
  if (attribute === 'space') {
    return direction < 0 ? 'decreasespace' : 'increasespace';
  }
  if (attribute === 'gap') {
    return direction < 0 ? 'decreasegap' : 'increasegap';
  }
  if (attribute === 'padding') {
    return direction < 0 ? 'decreasepadding' : 'increasepadding';
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
  selectedBlock: NodeSelection,
  layout: LayoutOption,
) {
  const layouts = selectedBlock.node.attrs.layouts as LayoutOption[];
  const addingLayout = !layouts.includes(layout);
  const nextLayouts = addingLayout
    ? [
      ...layouts.filter((current) => !isSidebarLayout(layout) || !isSidebarLayout(current)),
      layout,
    ]
    : layouts.filter((current) => current !== layout);
  const attrs = { ...selectedBlock.node.attrs, layouts: nextLayouts };

  if (addingLayout && isEmptyBlock(selectedBlock.node)) {
    const transaction = editor.state.tr.replaceWith(
      selectedBlock.from,
      selectedBlock.to,
      schema.node('base_block', attrs, layoutExample(schema, layout)),
    );
    transaction.setSelection(NodeSelection.create(transaction.doc, selectedBlock.from));
    dispatchStructuralEdit(editor, transaction);
    return;
  }

  dispatchStructuralEdit(
    editor,
    editor.state.tr.setNodeMarkup(selectedBlock.from, undefined, attrs),
  );
}

function migrateBaseBoxNodes(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(migrateBaseBoxNodes);
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
  const legacyLayouts = isBaseBlock && Array.isArray(node.attrs?.layouts)
    ? node.attrs.layouts
    : null;
  const attrs = node.attrs && isBaseBlock
    ? {
      ...node.attrs,
      layouts: legacyLayouts
        ? [...new Set(legacyLayouts.map((layout) => (
          layout === 'sidebarLeft' || layout === 'sidebarRight' ? 'sidebar' : layout
        )))]
        : node.attrs.layouts,
      sidebarPosition: legacyLayouts?.includes('sidebarRight')
        ? 'right'
        : node.attrs.sidebarPosition === 'right'
          ? 'right'
          : 'left',
      sidebarWidth: node.attrs.sidebarWidth ?? 'auto',
      frameRatio: normalizeFrameRatio(node.attrs.frameRatio),
    }
    : node.attrs;
  return {
    ...node,
    ...(node.type === 'base_box' ? { type: 'base_block' } : {}),
    ...(attrs ? { attrs } : {}),
    ...(Array.isArray(node.content)
      ? { content: node.content.map(migrateBaseBoxNodes) }
      : {}),
  };
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

function selectedDirectCenterNode(state: EditorState): CenterTarget | null {
  const { selection } = state;
  if (
    selection instanceof NodeSelection
    && ['paragraph', 'heading', 'blockquote'].includes(selection.node.type.name)
  ) {
    return {
      node: selection.node,
      from: selection.from,
      baseBlock: false,
    };
  }

  for (let depth = 1; depth <= selection.$from.depth; depth += 1) {
    const node = selection.$from.node(depth);
    if (!['paragraph', 'heading', 'blockquote'].includes(node.type.name)) {
      continue;
    }
    const from = selection.$from.before(depth);
    if (selection.to < from + node.nodeSize) {
      return { node, from, baseBlock: false };
    }
  }

  return null;
}

function selectedCenterTarget(state: EditorState): CenterTarget | null {
  const block = selectedBaseBlock(state);
  if (block) {
    return {
      node: block.node,
      from: block.from,
      baseBlock: true,
    };
  }
  return selectedDirectCenterNode(state);
}

function centerIsActive(target: CenterTarget) {
  return target.baseBlock
    ? (target.node.attrs.layouts as LayoutOption[]).includes('center')
    : target.node.attrs.center;
}

function dispatchStructuralEdit(editor: EditorView, transaction: EditorState['tr']) {
  const selectedBlock = selectedBaseBlock(editor.state);
  if (selectedBlock) {
    const mappedPosition = transaction.mapping.map(selectedBlock.from);
    if (transaction.doc.nodeAt(mappedPosition)?.type.name === 'base_block') {
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

function slugify(text: string) {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'description';
}

function descriptionId(editor: EditorView, selection: NodeSelection) {
  const usedIds = new Set<string>();
  editor.state.doc.descendants((node, position) => {
    if (position !== selection.from && typeof node.attrs.id === 'string') {
      usedIds.add(node.attrs.id);
    }
  });

  const baseId = slugify(selection.node.textContent);
  let id = baseId;
  for (let suffix = 2; usedIds.has(id); suffix += 1) {
    id = `${baseId}-${suffix}`;
  }
  return id;
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
    if (node.attrs.center) {
      details.push('Components: center');
      details.push(`Center padding: ${formatScaleValue(node.attrs.padding)}`);
      details.push(`center: ${node.attrs.centerIntrinsic ? 'intrinsic' : 'measure'}`);
      details.push(`text: ${node.attrs.centerText ? 'centered' : 'default'}`);
    } else {
      details.push('Components: none');
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
  if (
    layouts.includes('cluster')
    || layouts.includes('grid')
    || layouts.includes('reel')
    || hasSidebarLayout(layouts)
    || layouts.includes('switcher')
  ) {
    details.push(`${modifierLabel('gap', layouts)}: ${formatScaleValue(node.attrs.gap)}`);
  }
  if (layouts.includes('grid')) {
    details.push(`Grid minimum: ${node.attrs.gridMin}rem`);
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

export type PageEditorChangeContext = {
  document: ProseMirrorNode;
  view: EditorView;
};

export type PageEditorPluginContext = {
  schema: Schema;
  shell: HTMLElement;
};

/**
 * The outer arrays are toolbar rows; each inner array is passed to
 * `renderGrouped`, so its item boundaries remain menu separators.
 */
export type PageEditorMenuGroups = readonly (
  readonly (readonly MenuElement[])[]
)[];

export type PageEditorMenuContext = PageEditorPluginContext & {
  view: EditorView;
  menu: HTMLElement;
  /** The current default groups; return these unchanged to retain the built-in toolbar. */
  defaultGroups: PageEditorMenuGroups;
};

export type PageEditorOptions = {
  /** Element that receives the editor shell, toolbar, breadcrumbs, and modal UI. */
  mount: HTMLElement;
  /** Defaults to pageSchema. It is also supplied to the plugin and menu factories. */
  schema?: Schema;
  /** A document for `schema`, or its JSON representation. */
  initialDocument?: ProseMirrorNode | unknown;
  /** A preconfigured state for `schema`; its plugins are extended with configured page plugins. */
  initialState?: EditorState;
  /**
   * Receives a fresh default plugin list in shell, modal, reel-overflow,
   * breadcrumb order. Return a new list to add, remove, reorder, or replace it.
   */
  plugins?: (context: PageEditorPluginContext & {
    defaultPlugins: readonly Plugin[];
  }) => readonly Plugin[];
  /**
   * Receives the current built-in toolbar groups. Return them, a transformed
   * copy, or replacement groups. The factory runs after selection/document
   * changes so custom controls stay synchronized with editor state.
   */
  menu?: (context: PageEditorMenuContext) => PageEditorMenuGroups;
  /** Called after a document-changing transaction has been applied. */
  onChange?: (context: PageEditorChangeContext) => void;
};

export type PageEditor = {
  view: EditorView;
  destroy: () => void;
};

export function pageDocumentFromJSON(
  value: ProseMirrorNode | unknown | undefined,
  schema: Schema = pageSchema,
) {
  if (value instanceof ProseMirrorNode) {
    return value;
  }
  if (value !== undefined) {
    return schema.nodeFromJSON(
      schema === pageSchema ? migrateBaseBoxNodes(value) : value,
    );
  }
  return schema.node('paragraph');
}

/**
 * Mounts the complete, host-neutral page editor. Hosts provide persistence and
 * initial content through options rather than importing editor implementation details.
 *
 * ```ts
 * mountPageEditor({
 *   mount, schema: mySchema,
 *   plugins: ({ defaultPlugins }) => [...defaultPlugins, myPlugin],
 *   menu: ({ defaultGroups, view, schema }) => defaultGroups,
 * });
 * ```
 */
export function mountPageEditor(options: PageEditorOptions): PageEditor {
  const {
    mount: shell,
    schema = pageSchema,
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
    throw new Error('initialState must use the configured page-editor schema.');
  }
  const defaultPlugins = pagePlugins(schema, shell);
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
  const selectedTextualNode = (state: EditorState) => {
    const selection = selectedNode(state);
    return selection?.node.isTextblock ? selection : null;
  };
  const centerEnabled = (state: EditorState) => selectedCenterTarget(state) !== null;
  const baseBlockEnabled = (state: EditorState) => selectedBaseBlock(state) !== null;
  const renderMenu = () => {
    menu.replaceChildren();
    const state = editor.state;
    const block = selectedBaseBlock(state);
    const nodeSelection = selectedNode(state);
    const inspectedNode = nodeSelection && inspectableNode(nodeSelection.node)
      ? nodeSelection
      : null;
    const blockLayouts = block?.node.attrs.layouts as LayoutOption[] | undefined;
    const hasLayout = (layout: LayoutOption) => Boolean(blockLayouts?.includes(layout));
    const descriptionEnabled = (currentState: EditorState) => {
      const selection = selectedNode(currentState);
      return Boolean(selection && canHaveId(selection.node) && descriptionParent(selection));
    };
    const coverMainEnabled = (currentState: EditorState) => {
      const selection = selectedNode(currentState);
      return Boolean(selection && isCoverChild(selection));
    };
    const layoutControls = layoutOptions
      .filter((layout) => layout !== 'center')
      .map((layout) => menuItemForLayout({
        label: `${blockLayouts?.includes(layout) ? 'Remove' : 'Add'} ${layoutLabels[layout]}`,
        enable: baseBlockEnabled,
        run: () => {
          const selectedBlock = selectedBaseBlock(editor.state);
          if (selectedBlock) updateBlockLayout(schema, editor, selectedBlock, layout);
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
        const selectedBlock = selectedBaseBlock(currentState);
        if (!selectedBlock) return false;
        const layouts = selectedBlock.node.attrs.layouts as LayoutOption[];
        if (attribute === 'gridMin') return layouts.includes('grid');
        if (attribute === 'sidebarBreakpoint') return hasSidebarLayout(layouts);
        if (attribute === 'space') return layouts.some((layout) => layout === 'stack' || layout === 'cover');
        if (attribute === 'padding') return layouts.includes('box') || layouts.includes('center');
        if (attribute === 'switcherMax' || attribute === 'switcherThreshold') return layouts.includes('switcher');
        return layouts.some((layout) => ['cluster', 'grid', 'reel', 'sidebar', 'switcher'].includes(layout));
      };
      const changeValue = (direction: -1 | 1) => () => {
        const selectedBlock = selectedBaseBlock(editor.state);
        if (!selectedBlock || !enabled(editor.state)) return;
        const current = selectedBlock.node.attrs[attribute] as ControlValue;
        dispatchStructuralEdit(
          editor,
          editor.state.tr.setNodeMarkup(selectedBlock.from, undefined, {
            ...selectedBlock.node.attrs,
            [attribute]: stepValue(current, values, direction),
          }),
        );
      };
      return ([1, -1] as const).map((direction) => {
        const iconName = modifierIconName(attribute, direction);
        const spec = {
          label: `${direction < 0 ? 'Decrease' : 'Increase'} ${contextualLabel}`,
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
    const centerTarget = selectedCenterTarget(state);
    const centerModifiers = centerTarget && centerIsActive(centerTarget) ? [
      ...(!centerTarget.baseBlock ? ([1, -1] as const).map((direction) => (
        menuItemWithGeneratedIcon({
          label: `${direction < 0 ? 'Decrease' : 'Increase'} Center padding`,
          enable: (currentState) => {
            const target = selectedCenterTarget(currentState);
            return Boolean(target && !target.baseBlock && centerIsActive(target));
          },
          run: () => {
            const target = selectedCenterTarget(editor.state);
            if (!target || target.baseBlock || !centerIsActive(target)) return;
            dispatchStructuralEdit(editor, editor.state.tr.setNodeMarkup(target.from, undefined, {
              ...target.node.attrs,
              padding: stepValue(
                target.node.attrs.padding as ControlValue,
                spaceValues,
                direction,
              ),
            }));
          },
        }, modifierIconName('padding', direction)!)
      )) : []),
      new MenuItem({
        label: centerTarget.node.attrs.centerIntrinsic
          ? 'Use measure'
          : 'Use intrinsic',
        enable: (currentState) => {
          const target = selectedCenterTarget(currentState);
          return Boolean(target && centerIsActive(target));
        },
        run: () => {
          const target = selectedCenterTarget(editor.state);
          if (!target || !centerIsActive(target)) return;
          dispatchStructuralEdit(editor, editor.state.tr.setNodeMarkup(target.from, undefined, {
            ...target.node.attrs,
            centerIntrinsic: !target.node.attrs.centerIntrinsic,
          }));
        },
      }),
      menuItemWithGeneratedIcon({
        label: centerTarget.node.attrs.centerText ? 'Uncenter text' : 'Center text',
        enable: (currentState) => {
          const target = selectedCenterTarget(currentState);
          return Boolean(target && centerIsActive(target));
        },
        run: () => {
          const target = selectedCenterTarget(editor.state);
          if (!target || !centerIsActive(target)) return;
          dispatchStructuralEdit(editor, editor.state.tr.setNodeMarkup(target.from, undefined, {
            ...target.node.attrs,
            centerText: !target.node.attrs.centerText,
          }));
        },
      }, 'center'),
    ] : [];
    const centerAction = menuItemWithGeneratedIcon({
        label: centerTarget && centerIsActive(centerTarget) ? 'Remove Center' : 'Add Center',
        enable: centerEnabled,
        run: () => {
          const target = selectedCenterTarget(editor.state);
          if (!target) return;
          if (target.baseBlock) {
            const block = selectedBaseBlock(editor.state);
            if (block) updateBlockLayout(schema, editor, block, 'center');
            return;
          }
          dispatchStructuralEdit(editor, editor.state.tr.setNodeMarkup(target.from, undefined, {
            ...target.node.attrs,
            center: !target.node.attrs.center,
          }));
        },
      }, 'center');
    const sidebarWidthControls = hasSidebarLayout(blockLayouts ?? [])
      ? ([1, -1] as const).map((direction) => menuItemWithGeneratedIcon({
        label: `${direction < 0 ? 'Decrease' : 'Increase'} With sidebar sidebar width`,
        enable: (currentState) => {
          const selectedBlock = selectedBaseBlock(currentState);
          return Boolean(
            selectedBlock
            && hasSidebarLayout(selectedBlock.node.attrs.layouts as LayoutOption[]),
          );
        },
        run: () => {
          const selectedBlock = selectedBaseBlock(editor.state);
          if (!selectedBlock || !hasSidebarLayout(selectedBlock.node.attrs.layouts as LayoutOption[])) {
            return;
          }
          const width = (selectedBlock.node.attrs.sidebarWidth ?? 'auto') as SidebarWidth;
          dispatchStructuralEdit(editor, editor.state.tr.setNodeMarkup(selectedBlock.from, undefined, {
            ...selectedBlock.node.attrs,
            sidebarWidth: stepValue(width, sidebarWidths, direction),
          }));
        },
      }, direction < 0
        ? 'decreasewithsidebarsidebarwidth'
        : 'increasewithsidebarsidebarwidth'))
      : [];
    const sidebarOrientationControl = hasSidebarLayout(blockLayouts ?? [])
      ? (() => {
        const sidebarOnRight = block?.node.attrs.sidebarPosition === 'right';
        const direction = sidebarOnRight ? 'left' : 'right';
        return menuItemWithRequiredGeneratedIcon({
          label: `Move sidebar ${direction}`,
          title: `Move sidebar ${direction}`,
          enable: (currentState) => {
            const selectedBlock = selectedBaseBlock(currentState);
            return Boolean(
              selectedBlock
              && hasSidebarLayout(selectedBlock.node.attrs.layouts as LayoutOption[]),
            );
          },
          run: () => {
            const selectedBlock = selectedBaseBlock(editor.state);
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
        const currentRatio = normalizeFrameRatio(block?.node.attrs.frameRatio);
        const nextRatio = frameRatios[
          (frameRatios.indexOf(currentRatio) + 1) % frameRatios.length
        ] as FrameRatio;
        const label = `Cycle to next ratio ${nextRatio.replace('-', ':')}`;

        return menuItemWithRequiredGeneratedIcon({
          label,
          title: label,
          enable: (currentState) => {
            const selectedBlock = selectedBaseBlock(currentState);
            return Boolean(
              selectedBlock
              && (selectedBlock.node.attrs.layouts as LayoutOption[]).includes('frame'),
            );
          },
          run: () => {
            const selectedBlock = selectedBaseBlock(editor.state);
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
        }, 'cycleframeratios');
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
    const convertToBlockAction = menuItemWithGeneratedIcon({
      label: 'Convert to block',
      enable: (currentState) => Boolean(selectedTextualNode(currentState)),
      run: () => {
        const selection = selectedTextualNode(editor.state);
        if (!selection) return;
        const transaction = editor.state.tr.replaceWith(
          selection.from,
          selection.to,
          schema.node('base_block', null, selection.node),
        );
        transaction.setSelection(NodeSelection.create(transaction.doc, selection.from));
        dispatchStructuralEdit(editor, transaction);
      },
    }, 'converttoblock');
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
    const blockToolbarGroups: MenuElement[][] = [
      layoutControls,
      [centerAction],
      [blockTagControl],
    ];
    const modifierToolbarGroups: MenuElement[][] = [
      ...(sidebarOrientationControl ? [[sidebarOrientationControl]] : []),
      ...(frameRatioControl ? [[frameRatioControl]] : []),
      ...(coverMainAction ? [[coverMainAction]] : []),
      ...(centerModifiers.length > 0 ? [centerModifiers] : []),
      ...(componentConfigurationControls.length > 0 ? [componentConfigurationControls] : []),
      ...(sidebarWidthControls.length > 0 ? [sidebarWidthControls] : []),
      ...(genericSpacingModifierControls.length > 0 ? [genericSpacingModifierControls] : []),
    ];
    const exampleToolbarGroups = buildExampleToolbarGroupsWithIcons(schema);
    const toolbarGroups: MenuElement[][][] = [
      [
        ...exampleToolbarGroups.common,
        [
          ...exampleToolbarGroups.nativeBlockActions.flat(),
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
        ],
      ],
      [
        ...exampleToolbarGroups.text,
        [descriptionAction, convertToBlockAction],
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
      doc: pageDocumentFromJSON(initialDocument, schema),
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
