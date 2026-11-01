import { initEveryLayout } from './everylayout/init';
import './index.scss';

const rootEl = document.querySelector<HTMLElement>('#root');

if (rootEl) {
  const faviconUrl = rootEl.dataset.faviconUrl;
  if (!faviconUrl) {
    throw new Error('The root element must include a favicon URL.');
  }

  rootEl.innerHTML = `
    <div class="stack space-s3">
      <main class="stack space-s3">
        <section class="cover box box:raised box:invert padding-s3" aria-labelledby="hero-title">
            <nav class="cluster cluster:between cluster:center gap-s0" aria-label="Main navigation">
              <a href="/" aria-label="Prosango home">prosango.</a>
              <div class="cluster cluster:center gap-s0">
                <a href="#approach">Integration</a>
                <a href="#principles">Layout system</a>
                <a href="#contact">Contact</a>
              </div>
            </nav>
            <p>Prosango / structured publishing</p>
            <div class="stack space-s2" data-cover-main>
              <h1 id="hero-title">A Django editing system built around ProseMirror and Every Layout.</h1>
              <p>Write structured content in django-admin, manage images with django-filer, and publish interfaces from a shared set of layout primitives.</p>
              <div class="cluster gap-s0">
                <a class="with-icon" href="#approach">Explore the integration <svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 8h11M9 4l4 4-4 4" fill="none" stroke="currentColor"/></svg></a>
                <a href="#contact">Discuss an integration</a>
              </div>
            </div>
            <p>One editing experience, from Django admin to the published app.</p>
        </section>

        <section class="center stack space-s3" id="approach" aria-labelledby="approach-title">
          <div class="with-sidebar with-sidebar:left sidebar-width-16 content-min-66 gap-s2">
            <aside class="box box:raised stack padding-s0 space-s0">
              <p>01 / integration</p>
              <p>Bring structured editing into the Django tools your team already uses.</p>
            </aside>
            <div class="stack space-s2">
              <h2 id="approach-title">A complete authoring workflow, without leaving django-admin.</h2>
              <div class="switcher switcher:max5 gap-s-1">
                <span class="box box:raised box:raised--aqua padding-s-1">Django</span>
                <span class="box box:raised padding-s-1">ProseMirror</span>
                <span class="box box:raised box:raised--sun padding-s-1">django-filer</span>
              </div>
            </div>
          </div>

          <div class="grid grid-min-16 gap-s2">
            <article class="box box:raised stack padding-s0 space-s0">
              <p>01</p>
              <h3>Django and django-admin</h3>
              <p>Pages, publishing metadata, and content management stay inside the familiar Django admin workflow.</p>
            </article>
            <article class="box box:raised stack padding-s0 space-s0">
              <p>02</p>
              <h3>ProseMirror editing</h3>
              <p>A full-screen editing surface turns stored page content into structured, editable documents.</p>
            </article>
            <article class="box box:raised stack padding-s0 space-s0">
              <p>03</p>
              <h3>django-filer media</h3>
              <p>Attach, preview, and reuse managed images through django-filer directly from a Page.</p>
            </article>
          </div>
        </section>

        <section class="center stack space-s3" id="principles" aria-labelledby="principles-title">
          <div class="with-sidebar with-sidebar:right sidebar-width-20 content-min-66 gap-s2">
            <div class="stack space-s0">
              <p>02 / shared layout system</p>
              <h2 id="principles-title">The app and editor speak the same Every Layout language.</h2>
            </div>
            <div class="imposter-container frame">
              <img src="${faviconUrl}" alt="">
              <p class="imposter box box:raised box:raised--sun padding-s-1">One<br>system</p>
            </div>
          </div>

          <div class="reel" aria-label="Every Layout principles">
            <article class="box box:raised stack padding-s0 space-s0">
              <p>Primitives</p>
              <h3>Compose instead of custom-build.</h3>
              <p>Box, Stack, Grid, With sidebar, and Cover provide a small, configurable vocabulary for content.</p>
            </article>
            <article class="box box:raised box:invert stack padding-s0 space-s0">
              <p>Consistency</p>
              <h3>Editing mirrors the published app.</h3>
              <p>The editor loads the same layout system, so authored components remain familiar in both contexts.</p>
            </article>
            <article class="box box:raised stack padding-s0 space-s0">
              <p>Flexibility</p>
              <h3>Keep structure configurable.</h3>
              <p>Small layout contracts adapt to content while avoiding one-off templates and brittle page rules.</p>
            </article>
          </div>
          <p class="instruction">Scroll horizontally to see more.</p>
        </section>

        <section class="center" id="contact" aria-labelledby="contact-title">
          <div class="box box:raised stack padding-s3 space-s2">
            <p>03 / integrate</p>
            <div class="stack space-s0">
              <h2 id="contact-title">Bring structured editing to your Django project.</h2>
              <p>Talk to us about connecting ProseMirror, django-admin, django-filer, and Every Layout.</p>
              <a class="with-icon" href="mailto:hello@prosango.com">hello@prosango.com <svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 8h11M9 4l4 4-4 4" fill="none" stroke="currentColor"/></svg></a>
            </div>
            <p>Structured content, from authoring to application.</p>
          </div>
        </section>
      </main>

      <footer class="box box:raised padding-s0">
        <div class="center">
          <div class="cluster cluster:between cluster:center gap-s0">
            <a href="/" aria-label="Prosango home">prosango.</a>
            <p>ProseMirror, django-admin, django-filer, and Every Layout.</p>
          </div>
        </div>
      </footer>
    </div>
  `;

  initEveryLayout();
}
