import * as assert from 'node:assert/strict';
import { Fragment, Slice } from 'prosemirror-model';
import { NodeSelection, TextSelection, EditorState } from 'prosemirror-state';
import { djangoMediaSchema } from '../src/prosemirror-editor/django-media-schema';
import {
  blockMoveTarget,
  moveBlockDown,
  moveBlockUp,
} from '../src/prosemirror-editor/move-block';
import {
  componentToolbarLayoutOptions,
  layoutControlEnabled,
  normalizeLayoutOptions,
  selectedLayoutTarget,
} from '../src/prosemirror-editor/layout-targets';
import {
  everyLayoutSchema,
  insertBaseBlockAfterNodeSelection,
  layoutOptions,
  pasteAfterNodeSelection,
} from '../src/prosemirror-editor/setup';
import {
  idTextFromNode,
  maximumGeneratedIdLength,
  uniqueNodeId,
} from '../src/prosemirror-editor/node-id';
import { customStylingClasses } from '../src/prosemirror-editor/custom-styling';
import {
  wrapInBaseBlock,
  wrapInBaseBlockTitle,
} from '../src/prosemirror-editor/wrap-in-block';
import { defaultPlaygroundDocument } from '../src/playground-document';

function applyWrap(state: EditorState) {
  let nextState = state;
  assert.equal(wrapInBaseBlock(state, (transaction) => {
    nextState = state.apply(transaction);
  }), true);
  return nextState;
}

assert.ok(
  everyLayoutSchema.nodes.paragraph.spec.parseDOM?.some((rule) => rule.tag === 'p'),
  'paragraphs must retain their HTML parser rule for cross-window clipboard pastes',
);
assert.ok(
  everyLayoutSchema.nodes.heading.spec.parseDOM?.some((rule) => /^h[1-6]$/.test(rule.tag ?? '')),
  'headings must retain their HTML parser rules for cross-window clipboard pastes',
);
assert.ok(customStylingClasses.includes('custom-highlight'));
const customStyledParagraph = everyLayoutSchema.node('paragraph', {
  customClasses: ['custom-highlight', 'not-allowed'],
}, everyLayoutSchema.text('Custom styles'));
const customStyledParagraphDOM = everyLayoutSchema.nodes.paragraph.spec.toDOM!(customStyledParagraph);
assert.ok(Array.isArray(customStyledParagraphDOM));
assert.equal(
  (customStyledParagraphDOM[1] as { class?: string }).class,
  'custom-highlight',
);
const visibleParagraph = everyLayoutSchema.node('paragraph', {
  id: 'visible-paragraph',
}, everyLayoutSchema.text('Visible'));
const visibleParagraphDOM = everyLayoutSchema.nodes.paragraph.spec.toDOM!(visibleParagraph);
assert.ok(Array.isArray(visibleParagraphDOM));
assert.equal((visibleParagraphDOM[1] as { id?: string }).id, 'visible-paragraph');
const hiddenParagraph = everyLayoutSchema.node('paragraph', {
  customClasses: ['block-size:50vb'],
  hidden: true,
  visuallyHidden: true,
}, everyLayoutSchema.text('Hidden in published output'));
const hiddenParagraphDOM = everyLayoutSchema.nodes.paragraph.spec.toDOM!(hiddenParagraph);
assert.ok(Array.isArray(hiddenParagraphDOM));
assert.equal((hiddenParagraphDOM[1] as { hidden?: string }).hidden, '');
assert.equal((hiddenParagraphDOM[1] as { class?: string }).class, 'block-size:50vb vh');
const ariaHiddenParagraph = everyLayoutSchema.node('paragraph', {
  ariaHidden: true,
}, everyLayoutSchema.text('ARIA hidden in published output'));
const ariaHiddenParagraphDOM = everyLayoutSchema.nodes.paragraph.spec.toDOM!(ariaHiddenParagraph);
assert.ok(Array.isArray(ariaHiddenParagraphDOM));
assert.equal((ariaHiddenParagraphDOM[1] as { 'aria-hidden'?: string })['aria-hidden'], 'true');
const hiddenText = everyLayoutSchema.text('Hidden text', [
  everyLayoutSchema.marks.visibility.create({ state: 'hidden' }),
]);
const hiddenTextDOM = everyLayoutSchema.marks.visibility.spec.toDOM!(
  hiddenText.marks[0],
  true,
);
assert.deepEqual(hiddenTextDOM, ['span', { hidden: '' }, 0]);
const visuallyHiddenTextDOM = everyLayoutSchema.marks.visibility.spec.toDOM!(
  everyLayoutSchema.marks.visibility.create({ state: 'visuallyhidden' }),
  true,
);
assert.deepEqual(visuallyHiddenTextDOM, ['span', { class: 'vh' }, 0]);
const ariaHiddenTextDOM = everyLayoutSchema.marks.visibility.spec.toDOM!(
  everyLayoutSchema.marks.visibility.create({ state: 'ariahidden' }),
  true,
);
assert.deepEqual(ariaHiddenTextDOM, ['span', { 'aria-hidden': 'true' }, 0]);
const hiddenLinkDOM = everyLayoutSchema.marks.link.spec.toDOM!(
  everyLayoutSchema.marks.link.create({
    href: '#held-id',
    title: 'Held label',
    visibilityState: 'hidden',
  }),
  true,
);
assert.deepEqual(hiddenLinkDOM, ['a', {
  href: '#held-id',
  title: 'Held label',
  hidden: '',
}, 0]);
assert.ok('customClasses' in (djangoMediaSchema.nodes.image_media.spec.attrs ?? {}));
const labelledBlock = everyLayoutSchema.node('base_block', {
  ariaLabelledBy: 'source-label',
}, everyLayoutSchema.node('paragraph'));
const labelledBlockDOM = everyLayoutSchema.nodes.base_block.spec.toDOM!(labelledBlock);
assert.ok(Array.isArray(labelledBlockDOM));
assert.equal(
  (labelledBlockDOM[1] as { 'aria-labelledby'?: string })['aria-labelledby'],
  'source-label',
);

const paragraph = everyLayoutSchema.node(
  'paragraph',
  null,
  everyLayoutSchema.text('Paragraph'),
);
const heading = everyLayoutSchema.node(
  'heading',
  { level: 2 },
  everyLayoutSchema.text('Heading'),
);
const filledBaseBlock = everyLayoutSchema.nodes.base_block!.createAndFill();
assert.ok(filledBaseBlock, 'a Base Block can generate its required initial paragraph');
assert.equal(filledBaseBlock.firstChild!.type.name, 'paragraph');
const wrappingDocument = everyLayoutSchema.node('doc', null, [paragraph, heading]);

let wrappingState = applyWrap(EditorState.create({
  doc: wrappingDocument,
  selection: TextSelection.create(wrappingDocument, 2),
}));
assert.equal(wrappingState.doc.firstChild!.type.name, 'base_block');
assert.equal(wrappingState.doc.firstChild!.firstChild!.type.name, 'paragraph');
assert.equal(wrapInBaseBlockTitle(EditorState.create({
  doc: wrappingState.doc,
  selection: NodeSelection.create(wrappingState.doc, 0),
})), 'Wrap Base Block in new nested Block');

const nestedBlockDocument = everyLayoutSchema.node('doc', null, [
  everyLayoutSchema.node('base_block', null, paragraph),
]);
wrappingState = applyWrap(EditorState.create({
  doc: nestedBlockDocument,
  selection: NodeSelection.create(nestedBlockDocument, 0),
}));
assert.equal(wrappingState.doc.firstChild!.firstChild!.type.name, 'base_block');

const listDocument = everyLayoutSchema.node('doc', null, [
  everyLayoutSchema.node('bullet_list', null, [
    everyLayoutSchema.node('list_item', null, paragraph),
  ]),
]);
assert.equal(wrapInBaseBlock(EditorState.create({
  doc: listDocument,
  selection: NodeSelection.create(listDocument, 2),
})), false);

const document = everyLayoutSchema.nodeFromJSON(defaultPlaygroundDocument);

assert.equal(document.type.name, 'doc');
assert.ok(everyLayoutSchema.topNodeType.validContent(document.content));
assert.equal(document.childCount, 1, 'the playground has one outer layout shell');

let reelNestedBelowIntrinsicCenter = false;
function findNestedReel(
  node: typeof document,
  baseBlockAncestors = 0,
  intrinsicCenterDepth: number | null = null,
) {
  const isBaseBlock = node.type.name === 'base_block';
  const layouts = isBaseBlock ? node.attrs.layouts as readonly string[] : [];
  const nestedBaseBlockAncestors = baseBlockAncestors + Number(isBaseBlock);
  const nextIntrinsicCenterDepth = isBaseBlock
    && layouts.includes('center')
    && node.attrs.centerIntrinsic
    ? nestedBaseBlockAncestors
    : intrinsicCenterDepth;
  if (isBaseBlock && layouts.includes('reel')) {
    reelNestedBelowIntrinsicCenter ||= intrinsicCenterDepth !== null
      && nestedBaseBlockAncestors - intrinsicCenterDepth >= 3;
  }
  node.forEach((child) => findNestedReel(
    child,
    nestedBaseBlockAncestors,
    nextIntrinsicCenterDepth,
  ));
}
findNestedReel(document);
assert.ok(
  reelNestedBelowIntrinsicCenter,
  'the playground fixture must cover a Reel nested below the intrinsic Center',
);

const shell = document.firstChild!;
assert.equal(shell.type.name, 'base_block');
assert.deepEqual(shell.attrs.layouts, ['sidebar']);
assert.equal(shell.attrs.sidebarPosition, 'left', 'the outer shell uses the default left orientation');
assert.equal(shell.attrs.sidebarWidth, 24, 'the outer shell uses a 24rem sidebar');
assert.equal(shell.childCount, 2, 'the outer shell has navigation and main-content children');

const navigation = shell.firstChild!;
assert.equal(navigation.type.name, 'base_block');
assert.equal(navigation.attrs.tag, 'nav');
assert.deepEqual(navigation.attrs.layouts, ['box', 'stack']);
assert.equal(navigation.attrs.boxInvert, true);
assert.equal(navigation.attrs.boxBorder, true);

const main = shell.lastChild!;
assert.equal(main.type.name, 'base_block');
assert.equal(main.attrs.tag, 'main');
assert.deepEqual(main.attrs.layouts, ['stack', 'center']);
assert.equal(main.attrs.centerIntrinsic, true);

const cluster = everyLayoutSchema.node('base_block', {
  layouts: ['cluster'],
  clusterJustify: 'between',
  clusterAlignCenter: true,
}, everyLayoutSchema.node('paragraph', null, everyLayoutSchema.text('Cluster item')));
const [, clusterAttributes] = cluster.type.spec.toDOM!(cluster) as [
  string,
  { class: string },
  number,
];
assert.equal(
  clusterAttributes.class,
  'cluster gap-s1 justify-content:space-between align-items:center',
  'Cluster modifiers serialize to the exact Cluster CSS classes',
);
const defaultCluster = everyLayoutSchema.node('base_block', {
  layouts: ['cluster'],
}, everyLayoutSchema.node('paragraph', null, everyLayoutSchema.text('Cluster item')));
const [, defaultClusterAttributes] = defaultCluster.type.spec.toDOM!(defaultCluster) as [
  string,
  { class: string },
  number,
];
assert.equal(
  defaultClusterAttributes.class,
  'cluster gap-s1 align-items:flex-start',
  'the default Cluster alignment and justification emit no modifier classes',
);

const firstBlock = everyLayoutSchema.node('base_block', {
  tag: 'section',
  layouts: ['stack'],
}, everyLayoutSchema.node('paragraph', null, everyLayoutSchema.text('First')));
const secondBlock = everyLayoutSchema.node('base_block', {
  tag: 'article',
  layouts: ['box'],
}, everyLayoutSchema.node('paragraph', null, everyLayoutSchema.text('Second')));
const [, firstBlockDOMAttributes] = firstBlock.type.spec.toDOM!(firstBlock) as [
  string,
  Record<string, string>,
  number,
];
assert.equal(
  firstBlockDOMAttributes['data-everylayout-block'],
  '',
  'Base Blocks include a clipboard marker so their parser rule restores the node',
);
const moveDocument = everyLayoutSchema.node('doc', null, [firstBlock, secondBlock]);

const pastedParagraph = everyLayoutSchema.node(
  'paragraph',
  null,
  everyLayoutSchema.text('Pasted below the selected node'),
);
let pasteState = EditorState.create({
  doc: moveDocument,
  selection: NodeSelection.create(moveDocument, 0),
});
assert.equal(
  pasteAfterNodeSelection(
    pasteState,
    new Slice(Fragment.from(pastedParagraph), 0, 0),
    (transaction) => {
      pasteState = pasteState.apply(transaction);
    },
  ),
  true,
);
assert.equal(pasteState.doc.childCount, 3);
assert.equal(pasteState.doc.firstChild!.attrs.tag, 'section');
assert.equal(pasteState.doc.child(1).textContent, 'Pasted below the selected node');
assert.equal(pasteState.doc.lastChild!.attrs.tag, 'article');
assert.ok(pasteState.selection instanceof TextSelection);

const textPasteState = EditorState.create({
  doc: moveDocument,
  selection: TextSelection.create(moveDocument, 2),
});
assert.equal(
  pasteAfterNodeSelection(
    textPasteState,
    new Slice(Fragment.from(pastedParagraph), 0, 0),
  ),
  false,
  'text selections retain ProseMirror’s normal paste behavior',
);

const boxedBlock = everyLayoutSchema.node('base_block', {
  id: 'source-block',
  ariaLabelledBy: 'source-label',
  tag: 'section',
  layouts: ['box', 'stack'],
  padding: 3,
  space: 3,
  boxInvert: true,
  boxBorder: true,
}, everyLayoutSchema.node('paragraph', null, everyLayoutSchema.text('Boxed source')));
const boxedDocument = everyLayoutSchema.node('doc', null, [boxedBlock]);
let enterState = EditorState.create({
  doc: boxedDocument,
  selection: NodeSelection.create(boxedDocument, 0),
});
assert.equal(
  insertBaseBlockAfterNodeSelection(
    everyLayoutSchema,
    enterState,
    (transaction) => {
      enterState = enterState.apply(transaction);
    },
  ),
  true,
);
assert.equal(enterState.doc.childCount, 2);
const insertedBlock = enterState.doc.lastChild!;
assert.deepEqual(insertedBlock.attrs.layouts, ['box']);
assert.equal(insertedBlock.attrs.tag, 'div');
assert.equal(insertedBlock.attrs.padding, 3);
assert.equal(insertedBlock.attrs.space, 1);
assert.equal(insertedBlock.attrs.boxInvert, true);
assert.equal(insertedBlock.attrs.boxBorder, true);
assert.equal(insertedBlock.attrs.id, null);
assert.equal(insertedBlock.attrs.ariaLabelledBy, null);
assert.equal(insertedBlock.childCount, 1);
assert.equal(insertedBlock.firstChild!.type.name, 'paragraph');
assert.equal(insertedBlock.textContent, '');
assert.ok(enterState.selection instanceof TextSelection);

const multiItemBlock = everyLayoutSchema.node('base_block', null, [
  everyLayoutSchema.node(
    'paragraph',
    null,
    everyLayoutSchema.text('First text block supplies the generated ID'),
  ),
  everyLayoutSchema.node(
    'paragraph',
    null,
    everyLayoutSchema.text('This later text block must not affect the ID'),
  ),
]);
assert.equal(
  idTextFromNode(multiItemBlock),
  'First text block supplies the generated ID',
);
const longIdNode = everyLayoutSchema.node(
  'paragraph',
  null,
  everyLayoutSchema.text('A '.repeat(100)),
);
const generatedId = uniqueNodeId(longIdNode, new Set(), 'aria-');
assert.match(generatedId, /^aria-/);
assert.ok(generatedId.length <= maximumGeneratedIdLength);
const duplicateId = uniqueNodeId(longIdNode, new Set([generatedId]), 'aria-');
assert.ok(duplicateId.length <= maximumGeneratedIdLength);
assert.match(duplicateId, /-2$/);

let moveState = EditorState.create({
  doc: moveDocument,
  selection: TextSelection.create(moveDocument, 2),
});
assert.ok(blockMoveTarget(moveState, 'down'));
assert.equal(moveBlockDown(moveState, (transaction) => {
  moveState = moveState.apply(transaction);
}), true);
assert.equal(moveState.doc.firstChild!.attrs.tag, 'article');
assert.equal(moveState.doc.lastChild!.attrs.tag, 'section');
assert.deepEqual(moveState.doc.lastChild!.attrs.layouts, ['stack']);
const movedDownSelection = moveState.selection;
assert.ok(movedDownSelection instanceof NodeSelection);
assert.equal(movedDownSelection.node.attrs.tag, 'section');
assert.equal(moveBlockDown(moveState), false, 'the last sibling cannot move down');

moveState = EditorState.create({
  doc: moveDocument,
  selection: NodeSelection.create(moveDocument, secondBlock.nodeSize),
});
assert.equal(moveBlockUp(moveState, (transaction) => {
  moveState = moveState.apply(transaction);
}), true);
assert.equal(moveState.doc.firstChild!.attrs.tag, 'article');
const movedUpSelection = moveState.selection;
assert.ok(movedUpSelection instanceof NodeSelection);
assert.equal(movedUpSelection.node.attrs.tag, 'article');

const figure = djangoMediaSchema.node('figure', null, [
  djangoMediaSchema.node('image_media', { src: '/media/example.jpg' }),
  djangoMediaSchema.node('figcaption', null, djangoMediaSchema.text('Caption')),
]);
const trailingParagraph = djangoMediaSchema.node(
  'paragraph',
  null,
  djangoMediaSchema.text('After figure'),
);
const figureDocument = djangoMediaSchema.node('doc', null, [figure, trailingParagraph]);
assert.ok(
  djangoMediaSchema.topNodeType.validContent(figureDocument.content),
  'the Figure fixture remains schema-valid',
);
const wrappedFigureState = applyWrap(EditorState.create({
  doc: figureDocument,
  selection: NodeSelection.create(figureDocument, 0),
}));
assert.equal(wrappedFigureState.doc.firstChild!.type.name, 'base_block');
assert.equal(wrappedFigureState.doc.firstChild!.firstChild!.type.name, 'figure');
let figureState = EditorState.create({
  doc: figureDocument,
  selection: TextSelection.create(figureDocument, 3),
});
assert.deepEqual(
  componentToolbarLayoutOptions,
  layoutOptions,
  'the component toolbar group always renders every layout icon',
);
assert.deepEqual(
  normalizeLayoutOptions('figure', ['box', 'grid', 'frame', 'switcher']),
  ['box', 'frame'],
  'Figure layout normalization continues to reject unsupported layouts',
);
for (const selection of [
  NodeSelection.create(figureDocument, 0),
  NodeSelection.create(figureDocument, 1),
  TextSelection.create(figureDocument, 3),
]) {
  const state = EditorState.create({ doc: figureDocument, selection });
  assert.deepEqual(
    selectedLayoutTarget(state)?.allowedLayouts,
    ['box', 'center', 'frame', 'stack'],
    'Figure, media, and caption selections resolve to the Figure layout target',
  );
  for (const layout of componentToolbarLayoutOptions) {
    assert.equal(
      layoutControlEnabled(state, layout),
      ['box', 'center', 'frame', 'stack'].includes(layout),
      `Figure component action ${layout} is enabled only when the schema supports it`,
    );
  }
}
const baseBlockDocument = everyLayoutSchema.node('doc', null, [
  everyLayoutSchema.node('base_block', null, everyLayoutSchema.node('paragraph')),
]);
const baseBlockState = EditorState.create({
  doc: baseBlockDocument,
  selection: NodeSelection.create(baseBlockDocument, 0),
});
for (const layout of componentToolbarLayoutOptions) {
  assert.equal(layoutControlEnabled(baseBlockState, layout), true);
}
assert.equal(
  blockMoveTarget(figureState, 'down')?.node.type.name,
  'figure',
  'a caption does not cross its Figure media boundary',
);
assert.equal(moveBlockDown(figureState, (transaction) => {
  figureState = figureState.apply(transaction);
}), true);
assert.equal(figureState.doc.lastChild!.type.name, 'figure');
