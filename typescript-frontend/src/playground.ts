import { mountEveryLayoutEditor, everyLayoutDocumentFromJSON } from './prosemirror-editor/everylayout-editor';

const mount = document.querySelector<HTMLElement>('#everylayout-editor');

if (!mount) {
  throw new Error('The playground page needs a #everylayout-editor mount element.');
}

mountEveryLayoutEditor({
  mount,
  initialDocument: everyLayoutDocumentFromJSON({
    type: 'doc',
    content: [
      {
        type: 'base_block',
        attrs: { tag: 'main', layouts: ['stack', 'center'], space: 3, padding: 2 },
        content: [
          { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Every Layout editor playground' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'This standalone editor has the same schema, toolbar, breadcrumbs, modal infrastructure, and Every Layout styles as the Django admin editor.' }] },
          {
            type: 'base_block',
            attrs: { layouts: ['grid'], gap: 2, gridMin: 16 },
            content: [
              {
                type: 'base_block',
                attrs: { layouts: ['box', 'stack'], padding: 1, space: 1 },
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Compose blocks' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Select a block to add layouts and adjust their controls.' }] },
                ],
              },
              {
                type: 'base_block',
                attrs: { layouts: ['box', 'stack'], padding: 1, space: 1 },
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Edit content' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Use the shared ProseMirror toolbar to format this representative content.' }] },
                ],
              },
            ],
          },
        ],
      },
    ],
  }),
});
