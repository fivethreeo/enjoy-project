import { Fragment, type Node as ProseMirrorNode } from 'prosemirror-model';
import {
  NodeSelection,
  type Command,
  type EditorState,
} from 'prosemirror-state';

export type BlockMoveDirection = 'up' | 'down';

export type BlockMoveTarget = {
  node: ProseMirrorNode;
  from: number;
  to: number;
  movedTo: number;
  replacement: Fragment;
};

function isMovableBlock(node: ProseMirrorNode) {
  return node.isBlock && !node.isLeaf;
}

/**
 * Finds the innermost block that can swap with its adjacent sibling. This
 * deliberately walks outward when a caption/media boundary cannot be swapped,
 * allowing its enclosing Figure to move instead when its parent permits it.
 */
export function blockMoveTarget(
  state: EditorState,
  direction: BlockMoveDirection,
): BlockMoveTarget | null {
  const { $from, $to } = state.selection;
  const directSelection = state.selection instanceof NodeSelection
    ? {
      node: state.selection.node,
      from: state.selection.from,
      depth: state.selection.$from.depth + 1,
    }
    : null;

  for (let depth = directSelection?.depth ?? $from.depth; depth > 0; depth -= 1) {
    const node = directSelection?.depth === depth
      ? directSelection.node
      : $from.node(depth);
    if (!isMovableBlock(node)) {
      continue;
    }

    const parentDepth = depth - 1;
    const parent = $from.node(parentDepth);
    const index = $from.index(parentDepth);
    const targetIndex = directSelection?.depth === depth
      ? state.selection instanceof NodeSelection
        ? state.selection.$from.index()
        : index
      : index;
    const siblingIndex = targetIndex + (direction === 'up' ? -1 : 1);
    const sibling = parent.maybeChild(siblingIndex);
    if (!sibling) {
      continue;
    }

    const from = directSelection?.depth === depth
      ? directSelection.from
      : $from.before(depth);
    if ($to.pos > from + node.nodeSize) {
      continue;
    }
    const siblingFrom = direction === 'up'
      ? from - sibling.nodeSize
      : from + node.nodeSize;
    const to = direction === 'up'
      ? from + node.nodeSize
      : siblingFrom + sibling.nodeSize;
    const replacement = Fragment.fromArray(direction === 'up'
      ? [node, sibling]
      : [sibling, node]);
    const replaceFrom = Math.min(from, siblingFrom);
    const replaceTo = Math.max(to, from + node.nodeSize);

    if (!parent.canReplace(
      Math.min(targetIndex, siblingIndex),
      Math.max(targetIndex, siblingIndex) + 1,
      replacement,
    )) {
      continue;
    }

    return {
      node,
      from: replaceFrom,
      to: replaceTo,
      movedTo: direction === 'up' ? replaceFrom : from + sibling.nodeSize,
      replacement,
    };
  }

  return null;
}

export function moveBlock(
  direction: BlockMoveDirection,
): Command {
  return (state, dispatch) => {
    const target = blockMoveTarget(state, direction);
    if (!target) {
      return false;
    }

    if (dispatch) {
      const transaction = state.tr.replaceWith(
        target.from,
        target.to,
        target.replacement,
      );
      transaction.setSelection(NodeSelection.create(transaction.doc, target.movedTo));
      dispatch(transaction);
    }
    return true;
  };
}

export const moveBlockUp = moveBlock('up');
export const moveBlockDown = moveBlock('down');
