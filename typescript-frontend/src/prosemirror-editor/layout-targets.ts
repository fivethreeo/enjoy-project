import { Node as ProseMirrorNode, type NodeSpec } from 'prosemirror-model';
import { NodeSelection, type EditorState } from 'prosemirror-state';
import { layoutOptions, type LayoutOption } from './setup';

export const figureLayoutOptions = ['box', 'center', 'frame', 'stack'] as const;
export const componentToolbarLayoutOptions = layoutOptions;

export type LayoutTarget = {
  node: ProseMirrorNode;
  from: number;
  layoutContainer: true;
  allowedLayouts: readonly LayoutOption[];
};

export function layoutOptionsForNode(node: ProseMirrorNode): readonly LayoutOption[] | null {
  if (node.type.name === 'base_block') {
    return layoutOptions;
  }
  return (
    node.type.spec as NodeSpec & { layoutOptions?: readonly LayoutOption[] }
  ).layoutOptions ?? null;
}

function layoutTargetForNode(node: ProseMirrorNode, from: number): LayoutTarget | null {
  if (node.type.name === 'base_block') {
    return { node, from, layoutContainer: true, allowedLayouts: layoutOptions };
  }
  const allowedLayouts = layoutOptionsForNode(node);
  return allowedLayouts
    ? { node, from, layoutContainer: true, allowedLayouts }
    : null;
}

export function selectedLayoutTarget(state: EditorState): LayoutTarget | null {
  const { selection } = state;
  if (selection instanceof NodeSelection) {
    const target = layoutTargetForNode(selection.node, selection.from);
    if (target) return target;
  }
  for (let depth = selection.$from.depth; depth > 0; depth -= 1) {
    const target = layoutTargetForNode(
      selection.$from.node(depth),
      selection.$from.before(depth),
    );
    if (target) return target;
  }
  return null;
}

export function layoutControlEnabled(state: EditorState, layout: LayoutOption) {
  return Boolean(selectedLayoutTarget(state)?.allowedLayouts.includes(layout));
}

export function normalizeLayoutOptions(
  nodeType: unknown,
  layouts: unknown[],
): LayoutOption[] {
  const allowed: readonly LayoutOption[] = nodeType === 'figure'
    ? figureLayoutOptions
    : layoutOptions;
  return layouts.filter((layout): layout is LayoutOption => (
    allowed.includes(layout as LayoutOption)
  ));
}
