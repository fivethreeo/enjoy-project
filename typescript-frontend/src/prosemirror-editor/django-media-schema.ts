import { Schema, type NodeSpec } from 'prosemirror-model';
import {
  everyLayoutSchema,
  layoutNodeAttrs,
  layoutNodeAttrsFromDOM,
  layoutNodeClasses,
  type LayoutOption,
  withCustomStylingNodeSpec,
} from './setup';
import { figureLayoutOptions } from './layout-targets';

export { figureLayoutOptions } from './layout-targets';

/**
 * A Figure has only media plus an optional caption. Box, Center, Frame, and
 * Stack style that semantic unit; child-distribution components are excluded.
 */
const figureNodeSpec: NodeSpec & { layoutOptions: readonly LayoutOption[] } = {
  group: 'block',
  content: '(image_media | video_media) figcaption?',
  isolating: true,
  attrs: layoutNodeAttrs,
  layoutOptions: figureLayoutOptions,
  toDOM: (node) => ['figure', { class: layoutNodeClasses(node) }, 0],
  parseDOM: [{
    tag: 'figure',
    getAttrs: (element) => layoutNodeAttrsFromDOM(element as HTMLElement),
  }],
};

const mediaAttrs = {
  filerId: { default: null },
  src: { default: '' },
  alt: { default: '' },
  name: { default: '' },
  mimeType: { default: '' },
};

function mediaNode(tag: 'img' | 'video'): NodeSpec {
  return {
    group: 'block',
    atom: true,
    selectable: true,
    attrs: mediaAttrs,
    toDOM: (node) => tag === 'img'
      ? ['img', { src: node.attrs.src, alt: node.attrs.alt || node.attrs.name, 'data-filer-id': node.attrs.filerId }]
      : ['video', { src: node.attrs.src, controls: 'true', 'data-filer-id': node.attrs.filerId, 'data-mime-type': node.attrs.mimeType }],
    parseDOM: [{
      tag,
      getAttrs: (element) => {
        const dom = element as HTMLElement;
        return {
          filerId: dom.dataset.filerId ?? null,
          src: dom.getAttribute('src') ?? '',
          alt: dom.getAttribute('alt') ?? '',
          name: dom.getAttribute('alt') ?? '',
          mimeType: dom.dataset.mimeType ?? (tag === 'img' ? 'image/*' : 'video/*'),
        };
      },
    }],
  };
}

export const djangoMediaSchema = new Schema({
  nodes: everyLayoutSchema.spec.nodes
    .addToEnd('image_media', withCustomStylingNodeSpec(mediaNode('img')))
    .addToEnd('video_media', withCustomStylingNodeSpec(mediaNode('video')))
    .addToEnd('figcaption', withCustomStylingNodeSpec({
      content: 'inline*',
      group: 'block',
      toDOM: () => ['figcaption', 0],
      parseDOM: [{ tag: 'figcaption' }],
    }))
    .addToEnd('figure', withCustomStylingNodeSpec(figureNodeSpec)),
  marks: everyLayoutSchema.spec.marks,
});
