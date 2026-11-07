import type { Node as ProseMirrorNode } from 'prosemirror-model';

export const maximumGeneratedIdLength = 25;

export function idTextFromNode(node: ProseMirrorNode): string {
  if (node.isTextblock) {
    return node.textContent;
  }

  let firstTextBlock = '';
  let foundTextBlock = false;
  node.descendants((child) => {
    if (foundTextBlock) {
      return false;
    }
    if (!child.isTextblock) {
      return true;
    }

    firstTextBlock = child.textContent;
    foundTextBlock = true;
    return false;
  });
  return foundTextBlock ? firstTextBlock : node.textContent;
}

export function slugifyId(text: string): string {
  const slug = text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maximumGeneratedIdLength)
    .replace(/-+$/g, '');

  return slug || 'label';
}

export function uniqueNodeId(
  node: ProseMirrorNode,
  usedIds: ReadonlySet<string>,
  prefix = '',
): string {
  const baseId = `${prefix}${slugifyId(idTextFromNode(node))
    .slice(0, maximumGeneratedIdLength - prefix.length)
    .replace(/-+$/g, '')}`;
  let id = baseId;
  for (let suffix = 2; usedIds.has(id); suffix += 1) {
    const suffixText = `-${suffix}`;
    id = `${baseId
      .slice(0, maximumGeneratedIdLength - suffixText.length)
      .replace(/-+$/g, '')}${suffixText}`;
  }
  return id;
}
