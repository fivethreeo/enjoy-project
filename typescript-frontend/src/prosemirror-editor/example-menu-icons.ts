import { buildMenuItems } from 'prosemirror-example-setup';
import type { Schema } from 'prosemirror-model';
import { joinBackward, joinUp } from 'prosemirror-commands';
import { NodeSelection, TextSelection, type EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import {
  MenuItem,
  joinUpItem,
  liftItem,
  redoItem,
  selectParentNodeItem,
  undoItem,
  type MenuElement,
  type MenuItemSpec,
} from 'prosemirror-menu';
import { icons } from '../icons';

type ExampleMenuItems = ReturnType<typeof buildMenuItems>;
type ExampleMenuItemIdentity =
  | 'toggleStrong'
  | 'toggleEm'
  | 'toggleCode'
  | 'toggleLink'
  | 'wrapBulletList'
  | 'wrapOrderedList';
export type IconName = keyof typeof icons;

function hasGeneratedIcon(iconName: string): iconName is IconName {
  return Object.prototype.hasOwnProperty.call(icons, iconName);
}

export const exampleMenuIconMappings: ReadonlyArray<
  readonly [ExampleMenuItemIdentity, IconName]
> = [
  ['toggleStrong', 'strong'],
  ['toggleEm', 'italic'],
  ['toggleCode', 'code'],
  ['toggleLink', 'link'],
  ['wrapBulletList', 'bulletList'],
  ['wrapOrderedList', 'orderedLint'],
];

export function menuItemWithGeneratedIcon(
  spec: MenuItemSpec,
  iconName: string,
) {
  const icon = hasGeneratedIcon(iconName) ? icons[iconName] : undefined;
  return new MenuItem({
    ...spec,
    ...(icon ? { icon } : {}),
    title: spec.title ?? spec.label,
  });
}

export function menuItemWithRequiredGeneratedIcon(
  spec: MenuItemSpec,
  iconName: IconName,
) {
  const icon = icons[iconName];
  if (!icon) {
    throw new Error(`Missing required generated icon: ${iconName}`);
  }
  const item = new MenuItem({
    ...spec,
    icon,
    title: spec.title ?? spec.label,
  });
  if (item.spec.icon !== icon) {
    throw new Error(`Menu item did not retain generated icon: ${iconName}`);
  }
  return item;
}

function replaceIcon(item: MenuItem, iconName: string) {
  return hasGeneratedIcon(iconName)
    ? menuItemWithGeneratedIcon(item.spec, iconName)
    : item;
}

function keepMenuItemVisible(item: MenuItem) {
  const { enable, select, ...spec } = item.spec;
  return new MenuItem({
    ...spec,
    enable: (state) => enable
      ? enable(state)
      : select
        ? select(state)
        : true,
  });
}

function textblockJoinState(state: EditorState) {
  const { selection } = state;
  const cursorState = selection instanceof NodeSelection && selection.node.isTextblock
    ? state.apply(state.tr.setSelection(TextSelection.create(
      state.doc,
      selection.from + 1,
    )))
    : state;
  const { $cursor } = cursorState.selection as TextSelection;

  if (!$cursor || $cursor.parentOffset !== 0 || !$cursor.parent.isTextblock) {
    return null;
  }

  const parentDepth = $cursor.depth - 1;
  if (parentDepth < 0) {
    return null;
  }
  const parent = $cursor.node(parentDepth);
  const index = $cursor.index(parentDepth);
  const before = parent.maybeChild(index - 1);
  const current = parent.maybeChild(index);

  if (
    !before
    || !current
    || !before.type.compatibleContent(current.type)
    || (
      before.content.size > 0
      && !parent.canReplace(index, index + 1)
    )
    || (
      before.content.size === 0
      && !parent.canReplace(index - 1, index)
    )
  ) {
    return null;
  }

  return cursorState;
}

function joinWithAbove(
  state: EditorState,
  dispatch?: (transaction: EditorState['tr']) => void,
  view?: EditorView,
) {
  if (joinUp(state, dispatch, view)) {
    return true;
  }

  const cursorState = textblockJoinState(state);
  return Boolean(cursorState && joinBackward(cursorState, dispatch, view));
}

export const joinUpItemWithTextblockSupport = new MenuItem({
  ...joinUpItem.spec,
  run: joinWithAbove,
  select: joinWithAbove,
});

function iconMappings(items: ExampleMenuItems) {
  const mappedItems = new Map<MenuItem, IconName>();
  for (const [identity, iconName] of exampleMenuIconMappings) {
    const item = items[identity];
    if (item) {
      mappedItems.set(item, iconName);
    }
  }
  return mappedItems;
}

function iconForItem(item: MenuItem, mappedItems: ReadonlyMap<MenuItem, IconName>) {
  return mappedItems.get(item) ?? (
    item.spec.run === selectParentNodeItem.spec.run ? 'selectParent' : undefined
  );
}

function isNativeBlockAction(element: MenuElement) {
  return element instanceof MenuItem && (
    element.spec.run === joinUpItem.spec.run
    || element.spec.run === liftItem.spec.run
    || element.spec.run === selectParentNodeItem.spec.run
  );
}

function decorateMenuGroups(
  groups: readonly (readonly MenuElement[])[],
  mappedItems: ReadonlyMap<MenuItem, IconName>,
) {
  return groups
    .map((group) => group.map((element) => {
      if (!(element instanceof MenuItem)) {
        return element;
      }
      const iconName = iconForItem(element, mappedItems);
      const iconItem = iconName ? replaceIcon(element, iconName) : element;
      return keepMenuItemVisible(iconItem);
    }))
    .filter((group) => group.length > 0);
}

export function selectParentNodeItemWithGeneratedIcon() {
  return replaceIcon(selectParentNodeItem, 'selectParent');
}

export function buildExampleToolbarGroupsWithIcons(schema: Schema) {
  const items = buildMenuItems(schema);
  const mappedItems = iconMappings(items);
  const nativeBlockActions = items.blockMenu
    .flat()
    .filter(isNativeBlockAction)
    .map((element) => (
      element instanceof MenuItem && element.spec.run === joinUpItem.spec.run
        ? joinUpItemWithTextblockSupport
        : element
    ));
  const textBlockMenu = items.blockMenu
    .map((group) => group.filter((element) => !isNativeBlockAction(element)));

  return {
    common: decorateMenuGroups([[undoItem, redoItem]], mappedItems),
    nativeBlockActions: decorateMenuGroups([nativeBlockActions], mappedItems),
    text: decorateMenuGroups([
      ...items.inlineMenu,
      [items.insertMenu, items.typeMenu],
      ...textBlockMenu,
    ], mappedItems),
  };
}

/**
 * Builds the example setup menu, replacing only mapped items with generated
 * icons. Unmapped items are returned unchanged, preserving their original
 * render, icon, or label.
 */
export function buildExampleMenuWithIcons(
  schema: Schema,
  includeSelectParentNode = true,
  includeHistoryItems = true,
  includeLiftItem = true,
): MenuElement[][] {
  const items = buildMenuItems(schema);
  const mappedItems = iconMappings(items);

  return items.fullMenu
    .map((group) => group.filter((element) => {
      if (!(element instanceof MenuItem)) {
        return true;
      }
      if (
        !includeSelectParentNode
        && element.spec.run === selectParentNodeItem.spec.run
      ) {
        return false;
      }
      if (!includeLiftItem && element.spec.run === liftItem.spec.run) {
        return false;
      }
      return includeHistoryItems
        || (
          element.spec.run !== undoItem.spec.run
          && element.spec.run !== redoItem.spec.run
        );
    }))
    .filter((group) => group.length > 0)
    .map((group) => group
      .map((element) => {
        if (!(element instanceof MenuItem)) {
          return element;
        }
        const iconName = iconForItem(element, mappedItems);
        const iconItem = iconName ? replaceIcon(element, iconName) : element;
        return keepMenuItemVisible(iconItem);
      }));
}
