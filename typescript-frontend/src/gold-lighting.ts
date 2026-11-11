import goldUrl from './assets/gold-border-3d.webp';
import normalUrl from './assets/gold-border-normal.png';

const vertexSource = `
attribute vec2 position;
varying vec2 uv;
void main() {
  uv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}`;

const fragmentSource = `
precision highp float;
varying vec2 uv;
uniform sampler2D gold;
uniform sampler2D normals;
uniform vec2 size;
uniform vec2 light;
uniform float strength;
void main() {
  float tileWidth = size.y * 1.6;
  vec2 tile = vec2(fract(uv.x * size.x / tileWidth), uv.y);
  vec4 base = texture2D(gold, tile);
  vec3 normal = normalize(texture2D(normals, tile).rgb * 2.0 - 1.0);
  vec2 delta = light - uv * size;
  vec3 direction = normalize(vec3(delta, size.y * 2.0));
  vec3 halfway = normalize(direction + vec3(0.0, 0.0, 1.0));
  float diffuse = max(dot(normal, direction), 0.0);
  float shine = pow(max(dot(normal, halfway), 0.0), 48.0);
  float falloff = 1.0 / (1.0 + dot(delta / tileWidth, delta / tileWidth) * 0.3);
  vec3 linear = pow(base.rgb, vec3(2.2));
  vec3 lit = linear * (0.82 + diffuse * 0.22)
    + vec3(1.0, 0.72, 0.28) * shine * falloff * 0.85;
  vec3 color = pow(mix(linear, lit, strength), vec3(1.0 / 2.2));
  gl_FragColor = vec4(color, base.a);
}`;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
  });
}

function mountLighting(frame: HTMLElement): () => void {
  const canvas = document.createElement('canvas');
  canvas.className = 'gold-lighting';
  canvas.setAttribute('aria-hidden', 'true');
  frame.prepend(canvas);
  let context: WebGLRenderingContext | null;
  try {
    context = canvas.getContext('webgl', {
      alpha: true, antialias: false, depth: false, premultipliedAlpha: false,
    });
  } catch {
    canvas.remove();
    return () => {};
  }
  if (!context) {
    canvas.remove();
    return () => {};
  }
  const gl = context;

  let program: WebGLProgram | null = null;
  let buffer: WebGLBuffer | null = null;
  const textures: WebGLTexture[] = [];
  let locations: Record<string, WebGLUniformLocation | null> = {};
  let visible = false;
  let loading = false;
  let disposed = false;
  let animation = 0;
  let generation = 0;
  let pointer: { x: number; y: number } | null = null;

  function draw() {
    animation = 0;
    if (!program || !visible || document.hidden || gl.isContextLost()) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const limit = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array;
    const ratio = Math.min(window.devicePixelRatio || 1, 2, limit[0] / rect.width, limit[1] / rect.height);
    const width = Math.max(1, Math.round(rect.width * ratio));
    const height = Math.max(1, Math.round(rect.height * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
    gl.uniform2f(locations.size, rect.width, rect.height);
    gl.uniform2f(locations.light, pointer ? pointer.x - rect.left : rect.width / 2,
      pointer ? Math.max(-rect.height * 2, Math.min(rect.height * 3, rect.bottom - pointer.y)) : rect.height);
    gl.uniform1f(locations.strength, pointer ? 1 : 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    frame.classList.add('has-live-gold');
  }

  function schedule() {
    if (!disposed && visible && !document.hidden && !animation) animation = requestAnimationFrame(draw);
  }

  function compile(type: number, source: string): WebGLShader {
    const shader = gl.createShader(type);
    if (!shader) throw new Error('Unable to allocate gold shader');
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader);
      throw new Error('Unable to compile gold shader');
    }
    return shader;
  }

  async function initialize() {
    loading = true;
    const current = ++generation;
    try {
      const images = await Promise.all([loadImage(goldUrl), loadImage(normalUrl)]);
      if (disposed || gl.isContextLost() || current !== generation) return;
      program = gl.createProgram();
      if (!program) throw new Error('Unable to allocate gold program');
      const vertex = compile(gl.VERTEX_SHADER, vertexSource);
      const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
      gl.attachShader(program, vertex);
      gl.attachShader(program, fragment);
      gl.linkProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Unable to link gold program');
      gl.useProgram(program);
      buffer = gl.createBuffer();
      if (!buffer) throw new Error('Unable to allocate gold surface');
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(program, 'position');
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      locations = Object.fromEntries(['size', 'light', 'strength'].map((name) =>
        [name, gl.getUniformLocation(program!, name)]));
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
      images.forEach((image, index) => {
        const texture = gl.createTexture();
        if (!texture) throw new Error('Unable to allocate gold texture');
        textures.push(texture);
        gl.activeTexture(gl.TEXTURE0 + index);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        gl.uniform1i(gl.getUniformLocation(program!, index ? 'normals' : 'gold'), index);
      });
      if (gl.getError() !== gl.NO_ERROR) throw new Error('Gold textures unavailable');
      schedule();
    } catch {
      dispose();
    }
  }

  function move(event: PointerEvent) {
    if (event.pointerType === 'touch') return;
    pointer = { x: event.clientX, y: event.clientY };
    schedule();
  }

  function leave() {
    pointer = null;
    schedule();
  }

  function contextLost(event: Event) {
    event.preventDefault();
    cancelAnimationFrame(animation);
    animation = 0;
    generation++;
    program = null;
    frame.classList.remove('has-live-gold');
  }

  function contextRestored() {
    textures.length = 0;
    buffer = null;
    void initialize();
  }

  const intersection = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible && !loading) void initialize();
    schedule();
  });
  const resize = new ResizeObserver(schedule);
  intersection.observe(canvas);
  resize.observe(canvas);
  window.addEventListener('pointermove', move, { passive: true });
  document.documentElement.addEventListener('pointerleave', leave);
  window.addEventListener('blur', leave);
  window.addEventListener('scroll', schedule, { passive: true });
  document.addEventListener('visibilitychange', schedule);
  canvas.addEventListener('webglcontextlost', contextLost);
  canvas.addEventListener('webglcontextrestored', contextRestored);

  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(animation);
    intersection.disconnect();
    resize.disconnect();
    window.removeEventListener('pointermove', move);
    document.documentElement.removeEventListener('pointerleave', leave);
    window.removeEventListener('blur', leave);
    window.removeEventListener('scroll', schedule);
    document.removeEventListener('visibilitychange', schedule);
    canvas.removeEventListener('webglcontextlost', contextLost);
    canvas.removeEventListener('webglcontextrestored', contextRestored);
    textures.forEach((texture) => gl.deleteTexture(texture));
    if (buffer) gl.deleteBuffer(buffer);
    if (program) gl.deleteProgram(program);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    frame.classList.remove('has-live-gold');
    canvas.remove();
  }
  return dispose;
}

export function initGoldLighting() {
  const frame = document.querySelector<HTMLElement>('.ornate-frame');
  if (!frame || !window.IntersectionObserver || !window.ResizeObserver) return;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const pointer = matchMedia('(hover: hover) and (pointer: fine)');
  let dispose: (() => void) | undefined;
  function update() {
    dispose?.();
    dispose = undefined;
    if (!motion.matches && pointer.matches) dispose = mountLighting(frame!);
  }
  motion.addEventListener('change', update);
  pointer.addEventListener('change', update);
  update();
}
