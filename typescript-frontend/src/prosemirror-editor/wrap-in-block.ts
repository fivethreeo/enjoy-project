import { findWrapping } from 'prosemirror-transform';
import { NodeSelection, type EditorState, type Transaction } from 'prosemirror-state';

function wrappingRange(state: EditorState) {
  return state.selection.$from.blockRange(state.selection.$to) ?? null;
}

export function wrapInBaseBlockTitle(state: EditorState) {
  return state.selection instanceof NodeSelection
    && state.selection.node.type.name === 'base_block'
    ? 'Wrap Base Block in new nested Block'
    : 'Wrap selected block(s) in new Block';
}

/**
 * Wraps the block range identified by the current selection in one Base Block.
 * `blockRange` limits the operation to sibling blocks, while `findWrapping`
 * keeps the operation constrained by the active schema.
 */
export function wrapInBaseBlock(
  state: EditorState,
  dispatch?: (transaction: Transaction) => void,
) {
  const range = wrappingRange(state);
  const baseBlock = state.schema.nodes.base_block;
  const wrapping = range && baseBlock ? findWrapping(range, baseBlock) : null;
  if (!range || !wrapping) {
    return false;
  }

  if (dispatch) {
    const transaction = state.tr.wrap(range, wrapping);
    const wrapper = transaction.doc.nodeAt(range.start);
    if (wrapper?.type === baseBlock) {
      transaction.setSelection(NodeSelection.create(transaction.doc, range.start));
    }
    dispatch(transaction.scrollIntoView());
  }
  return true;
}
