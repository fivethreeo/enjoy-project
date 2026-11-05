import { type Node as ProseMirrorNode } from 'prosemirror-model';
import type { MenuElement } from 'prosemirror-menu';
import type { EditorView } from 'prosemirror-view';
import { menuItemWithRequiredGeneratedIcon } from './example-menu-icons';
import { openModalPopup } from './modal-popup';

type Kind = 'image' | 'video';
type Folder = { id: number | null; name: string; path: string };
type Thumbnail = {
  url: string | null;
  kind: 'image' | 'video-placeholder';
  alt: string;
};
type Asset = {
  id: number;
  url: string;
  name: string;
  description: string;
  mimeType: string;
  folder: Folder;
  thumbnail: Thumbnail;
  thumbnailUrl: string | null;
};
type Endpoints = { list: string; folders: string; upload: string };

function csrfToken() {
  return document.cookie.split('; ').find((value) => value.startsWith('csrftoken='))?.split('=')[1] ?? '';
}

function json<T>(url: string): Promise<T> {
  return fetch(url, { credentials: 'same-origin' }).then(async (response) => {
    const body = await response.json() as T & { error?: string };
    if (!response.ok) throw new Error(body.error ?? 'Request failed.');
    return body;
  });
}

function picker(view: EditorView, kind: Kind, endpoints: Endpoints) {
  openModalPopup(view, {
    id: `filer-${kind}`,
    title: `Insert ${kind}`,
    render: ({ close }) => {
      const root = document.createElement('div');
      root.className = 'filer-media-picker';
      let folder: number | null = null;
      let selected: Asset | null = null;
      let page = 1;
      const folders = document.createElement('select');
      folders.setAttribute('aria-label', 'Folder');
      const search = document.createElement('input');
      search.type = 'search';
      search.placeholder = 'Search files';
      search.setAttribute('aria-label', 'Search files');
      const assets = document.createElement('div');
      assets.className = 'filer-media-picker__assets stack space-s0';
      const status = document.createElement('p');
      status.className = 'filer-media-picker__status';
      status.setAttribute('role', 'status');
      const figure = document.createElement('input');
      figure.type = 'checkbox';
      const insert = document.createElement('button');
      insert.textContent = 'Insert';
      insert.disabled = true;
      const uploadForm = document.createElement('form');
      uploadForm.className = 'filer-media-picker__upload stack space-s-1';
      uploadForm.setAttribute('aria-label', `Upload ${kind}`);
      const upload = document.createElement('input');
      upload.type = 'file';
      upload.accept = `${kind}/*`;
      upload.id = `filer-${kind}-upload`;
      upload.required = true;
      const uploadLabel = document.createElement('label');
      uploadLabel.htmlFor = upload.id;
      uploadLabel.textContent = `Upload ${kind}`;
      const uploadSubmit = document.createElement('button');
      uploadSubmit.type = 'submit';
      uploadSubmit.textContent = `Upload ${kind}`;
      const description = document.createElement('textarea');
      description.id = `filer-${kind}-description`;
      description.name = 'description';
      description.rows = 3;
      description.placeholder = 'Description (used as the default figure caption)';
      const descriptionLabel = document.createElement('label');
      descriptionLabel.htmlFor = description.id;
      descriptionLabel.textContent = 'Description';
      const filters = document.createElement('div');
      filters.className = 'filer-media-picker__filters cluster gap-s0';
      filters.append(folders, search);
      const metadata = document.createElement('div');
      metadata.className = 'filer-media-picker__metadata stack space-s-1';
      metadata.append(descriptionLabel, description, uploadLabel, upload);
      uploadForm.append(metadata, uploadSubmit);
      const insertionForm = document.createElement('form');
      insertionForm.className = 'filer-media-picker__insertion stack space-s0';
      insertionForm.setAttribute('aria-label', `Insert ${kind}`);
      insertionForm.id = `filer-${kind}-browse-panel`;
      insertionForm.setAttribute('role', 'tabpanel');
      const actions = document.createElement('div');
      actions.className = 'filer-media-picker__actions cluster gap-s0 cluster:end';
      const figureLabel = document.createElement('label');
      figureLabel.append(figure, ' Insert as figure');
      actions.append(figureLabel, insert);
      insertionForm.append(filters, assets, actions);
      uploadForm.id = `filer-${kind}-upload-panel`;
      uploadForm.setAttribute('role', 'tabpanel');
      const tabs = document.createElement('div');
      tabs.className = 'filer-media-picker__tabs';
      tabs.setAttribute('role', 'tablist');
      tabs.setAttribute('aria-label', `${kind} actions`);
      const browseTab = document.createElement('button');
      browseTab.type = 'button';
      browseTab.id = `filer-${kind}-browse-tab`;
      browseTab.textContent = 'Insert';
      browseTab.setAttribute('role', 'tab');
      browseTab.setAttribute('aria-controls', insertionForm.id);
      insertionForm.setAttribute('aria-labelledby', browseTab.id);
      const uploadTab = document.createElement('button');
      uploadTab.type = 'button';
      uploadTab.id = `filer-${kind}-upload-tab`;
      uploadTab.textContent = 'Upload';
      uploadTab.setAttribute('role', 'tab');
      uploadTab.setAttribute('aria-controls', uploadForm.id);
      uploadForm.setAttribute('aria-labelledby', uploadTab.id);
      const selectTab = (name: 'browse' | 'upload') => {
        const browsing = name === 'browse';
        browseTab.setAttribute('aria-selected', String(browsing));
        browseTab.tabIndex = browsing ? 0 : -1;
        insertionForm.hidden = !browsing;
        uploadTab.setAttribute('aria-selected', String(!browsing));
        uploadTab.tabIndex = browsing ? -1 : 0;
        uploadForm.hidden = browsing;
      };
      browseTab.addEventListener('click', () => selectTab('browse'));
      uploadTab.addEventListener('click', () => selectTab('upload'));
      tabs.addEventListener('keydown', (event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        const nextTab = event.key === 'ArrowLeft' ? browseTab : uploadTab;
        selectTab(nextTab === browseTab ? 'browse' : 'upload');
        nextTab.focus();
      });
      tabs.append(browseTab, uploadTab);
      selectTab('browse');
      const panels = document.createElement('div');
      panels.className = 'filer-media-picker__panels';
      panels.append(insertionForm, uploadForm);

      const load = () => {
        status.textContent = 'Loading…';
        const params = new URLSearchParams({ kind, page: String(page), folder: folder === null ? 'unfiled' : String(folder), q: search.value });
        json<{ assets: Asset[]; hasNext: boolean }>(`${endpoints.list}?${params}`).then((data) => {
          const assetGrid = document.createElement('div');
          assetGrid.className = 'grid gap-s0 grid-min-16';
          assetGrid.append(...data.assets.map((asset) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'filer-media-picker__asset box box:border padding-s0';
            if (selected?.id === asset.id) button.classList.add('is-selected');
            button.setAttribute('aria-pressed', String(selected?.id === asset.id));
            button.setAttribute('aria-label', `${asset.name || 'Untitled file'}, ${asset.mimeType || kind}`);
            const preview = document.createElement('span');
            preview.className = 'filer-media-picker__preview';
            if (asset.thumbnail.kind === 'image' && asset.thumbnail.url) {
              const image = document.createElement('img');
              image.src = asset.thumbnail.url;
              image.alt = '';
              image.loading = 'lazy';
              image.decoding = 'async';
              preview.append(image);
            } else {
              preview.classList.add('filer-media-picker__video-placeholder');
              preview.setAttribute('role', 'img');
              preview.setAttribute('aria-label', asset.thumbnail.alt);
              const type = document.createElement('span');
              type.textContent = asset.mimeType || 'Video';
              preview.append('Video', type);
            }
            const details = document.createElement('span');
            details.className = 'filer-media-picker__asset-details';
            const name = document.createElement('strong');
            name.textContent = asset.name || 'Untitled file';
            const type = document.createElement('span');
            type.textContent = asset.mimeType || kind;
            details.append(name, type);
            if (asset.description) {
              const assetDescription = document.createElement('span');
              assetDescription.textContent = asset.description;
              details.append(assetDescription);
            }
            button.append(preview, details);
            button.addEventListener('click', () => { selected = asset; load(); });
            return button;
          }));
          const pagination = document.createElement('div');
          pagination.className = 'cluster gap-s0 cluster:end';
          const next = document.createElement('button');
          next.type = 'button'; next.textContent = 'Next page'; next.disabled = !data.hasNext;
          next.addEventListener('click', () => { page += 1; load(); });
          pagination.append(next);
          assets.replaceChildren(assetGrid, pagination);
          status.textContent = data.assets.length ? '' : 'No files found.';
        }).catch((error: Error) => { status.textContent = error.message; });
      };
      json<{ folders: Folder[] }>(endpoints.folders).then((data) => {
        folders.replaceChildren(...data.folders.map((item) => {
          const option = new Option(item.path, item.id === null ? 'unfiled' : String(item.id));
          return option;
        }));
      }).catch((error: Error) => { status.textContent = error.message; });
      folders.addEventListener('change', () => { folder = folders.value === 'unfiled' ? null : Number(folders.value); page = 1; load(); });
      search.addEventListener('change', () => { page = 1; load(); });
      uploadForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const file = upload.files?.[0]; if (!file) return;
        const form = new FormData();
        form.set('kind', kind);
        form.set('folder', folder === null ? 'unfiled' : String(folder));
        form.set('description', description.value);
        form.set('file', file);
        status.textContent = 'Uploading…';
        fetch(endpoints.upload, { method: 'POST', credentials: 'same-origin', headers: { 'X-CSRFToken': decodeURIComponent(csrfToken()) }, body: form })
          .then(async (response) => {
            const data = await response.json() as { error?: string; asset?: Asset };
            if (!response.ok || !data.asset) throw new Error(data.error ?? 'Upload failed.');
            selected = data.asset; load();
          }).catch((error: Error) => { status.textContent = error.message; });
      });
      insertionForm.addEventListener('submit', (event) => {
        event.preventDefault();
        if (!selected) return;
        const node = view.state.schema.node(kind === 'image' ? 'image_media' : 'video_media', {
          filerId: selected.id, src: selected.url, alt: selected.description || selected.name,
          name: selected.name, mimeType: selected.mimeType,
        });
        const content: ProseMirrorNode = figure.checked
          ? view.state.schema.node('figure', null, selected.description
            ? [node, view.state.schema.node('figcaption', null, view.state.schema.text(selected.description))]
            : [node])
          : node;
        view.dispatch(view.state.tr.replaceSelectionWith(content).scrollIntoView());
        close();
        view.focus();
      });
      root.append(tabs, panels, status);
      load();
      const observer = new MutationObserver(() => { insert.disabled = selected === null; });
      observer.observe(root, { childList: true, subtree: true });
      return root;
    },
  });
}

export function djangoMediaMenu(view: EditorView, endpoints: Endpoints): MenuElement[] {
  return (['image', 'video'] as const).map((kind) => menuItemWithRequiredGeneratedIcon({
    label: `Insert ${kind}`,
    run: () => picker(view, kind, endpoints),
  }, kind, `Insert ${kind}`));
}
