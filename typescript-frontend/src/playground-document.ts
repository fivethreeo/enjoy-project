/** Default content for the standalone Every Layout editor playground. */
export const defaultPlaygroundDocument = {
    type: 'doc',
    content: [
      {
        type: 'base_block',
        attrs: { layouts: ['sidebar'], gap: 2, sidebarWidth: 24 },
        content: [
          {
            type: 'base_block',
            attrs: {
              tag: 'nav',
              layouts: ['box', 'stack'],
              padding: 1,
              space: 1,
              boxInvert: true,
              boxBorder: true,
            },
            content: [
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Playground navigation' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'Explore the Every Layout component examples in the main content.' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'Sidebar navigation · left orientation' }] },
            ],
          },
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
                attrs: { layouts: ['box', 'stack'], padding: 1, space: 1, boxBorder: true },
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Compose blocks' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Select a block to add layouts and adjust their controls.' }] },
                ],
              },
              {
                type: 'base_block',
                attrs: { layouts: ['box', 'stack'], padding: 1, space: 1, boxBorder: true },
                content: [
                  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Edit content' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Use the shared ProseMirror toolbar to format this representative content.' }] },
                ],
              },
            ],
          },
          {
            type: 'base_block',
            attrs: {
              tag: 'section',
              layouts: ['box', 'stack'],
              padding: 2,
              space: 1,
              boxInvert: true,
              boxBorder: true,
            },
            content: [
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Box: inverted and bordered' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'This Box has both inversion and a border enabled. Its padding and Stack spacing are editable through the selected block controls.' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Suspendisse potenti, sed luctus nunc consectetur vitae.' }] },
            ],
          },
          {
            type: 'base_block',
            attrs: { tag: 'section', layouts: ['stack'], space: 1 },
            content: [
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Reel: horizontally scrolling collection' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'The cards below are repeated intentionally: scroll horizontally to explore the reel at practical viewport widths.' }] },
              {
                type: 'base_block',
                attrs: { layouts: ['stack'], space: 1 },
                content: [
                  {
                    type: 'base_block',
                    attrs: { layouts: ['reel'], gap: 2 },
                    content: [
                  {
                    type: 'base_block',
                    attrs: { tag: 'article', layouts: ['box', 'stack'], padding: 1, space: 1, boxBorder: true },
                    content: [
                      { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Field note 01' }] },
                      { type: 'paragraph', content: [{ type: 'text', text: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.' }] },
                    ],
                  },
                  {
                    type: 'base_block',
                    attrs: { tag: 'article', layouts: ['box', 'stack'], padding: 1, space: 1, boxBorder: true },
                    content: [
                      { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Field note 02' }] },
                      { type: 'paragraph', content: [{ type: 'text', text: 'Integer posuere erat a ante venenatis dapibus posuere velit aliquet.' }] },
                    ],
                  },
                  {
                    type: 'base_block',
                    attrs: { tag: 'article', layouts: ['box', 'stack'], padding: 1, space: 1, boxBorder: true },
                    content: [
                      { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Field note 03' }] },
                      { type: 'paragraph', content: [{ type: 'text', text: 'Donec ullamcorper nulla non metus auctor fringilla.' }] },
                    ],
                  },
                  {
                    type: 'base_block',
                    attrs: { tag: 'article', layouts: ['box', 'stack'], padding: 1, space: 1, boxBorder: true },
                    content: [
                      { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Field note 04' }] },
                      { type: 'paragraph', content: [{ type: 'text', text: 'Maecenas sed diam eget risus varius blandit sit amet non magna.' }] },
                    ],
                  },
                  {
                    type: 'base_block',
                    attrs: { tag: 'article', layouts: ['box', 'stack'], padding: 1, space: 1, boxBorder: true },
                    content: [
                      { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Field note 05' }] },
                      { type: 'paragraph', content: [{ type: 'text', text: 'Aenean lacinia bibendum nulla sed consectetur.' }] },
                    ],
                  },
                  {
                    type: 'base_block',
                    attrs: { tag: 'article', layouts: ['box', 'stack'], padding: 1, space: 1, boxBorder: true },
                    content: [
                      { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Field note 06' }] },
                      { type: 'paragraph', content: [{ type: 'text', text: 'Vestibulum id ligula porta felis euismod semper.' }] },
                    ],
                  },
                    ],
                  },
                ],
              },
            ],
          },
          {
            type: 'base_block',
            attrs: { tag: 'section', layouts: ['stack'], space: 1 },
            content: [
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Cluster: compact related items' }] },
              {
                type: 'base_block',
                attrs: { layouts: ['cluster'], gap: 1 },
                content: [
                  { type: 'paragraph', content: [{ type: 'text', text: 'Editable paragraph item' }] },
                  { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Inline heading item' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Lorem ipsum label' }] },
                  { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A short quoted item in the cluster.' }] }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Final flexible item' }] },
                ],
              },
            ],
          },
          {
            type: 'base_block',
            attrs: { tag: 'section', layouts: ['stack'], space: 1 },
            content: [
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Switcher: responsive feature cards' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'This Switcher uses a maximum of three items and a 25rem threshold, so its cards wrap as available space changes.' }] },
              {
                type: 'base_block',
                attrs: { layouts: ['switcher'], gap: 2, switcherMax: 3, switcherThreshold: 25 },
                content: [
                  {
                    type: 'base_block',
                    attrs: { tag: 'article', layouts: ['box', 'stack'], padding: 1, space: 1, boxBorder: true },
                    content: [
                      { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Discover' }] },
                      { type: 'paragraph', content: [{ type: 'text', text: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.' }] },
                    ],
                  },
                  {
                    type: 'base_block',
                    attrs: { tag: 'article', layouts: ['box', 'stack'], padding: 1, space: 1, boxBorder: true },
                    content: [
                      { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Compose' }] },
                      { type: 'paragraph', content: [{ type: 'text', text: 'Praesent commodo cursus magna, vel scelerisque nisl consectetur.' }] },
                    ],
                  },
                  {
                    type: 'base_block',
                    attrs: { tag: 'article', layouts: ['box', 'stack'], padding: 1, space: 1, boxBorder: true },
                    content: [
                      { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Arrange' }] },
                      { type: 'paragraph', content: [{ type: 'text', text: 'Nullam quis risus eget urna mollis ornare vel eu leo.' }] },
                    ],
                  },
                  {
                    type: 'base_block',
                    attrs: { tag: 'article', layouts: ['box', 'stack'], padding: 1, space: 1, boxBorder: true },
                    content: [
                      { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Adapt' }] },
                      { type: 'paragraph', content: [{ type: 'text', text: 'Cras mattis consectetur purus sit amet fermentum.' }] },
                    ],
                  },
                  {
                    type: 'base_block',
                    attrs: { tag: 'article', layouts: ['box', 'stack'], padding: 1, space: 1, boxBorder: true },
                    content: [
                      { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Refine' }] },
                      { type: 'paragraph', content: [{ type: 'text', text: 'Etiam porta sem malesuada magna mollis euismod.' }] },
                    ],
                  },
                ],
              },
            ],
          },
          ],
        },
      ],
    },
  ],
  } as const;
