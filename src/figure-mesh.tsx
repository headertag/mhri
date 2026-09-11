'use client';

import { useEffect, useRef, useState } from 'react';

const vertexShader = `
  precision highp float;
  attribute vec2 aUV;
  uniform float uTime;
  uniform float uMotion;
  varying vec2 vUV;
  varying float vLight;
  void main() {
    vec2 p = aUV * vec2(798.0, 1260.0);
    // The attachment to the body is pinned. The influence increases towards
    // the free left edge, and vanishes before the feet and upper torso.
    float attachment = 1.0 - smoothstep(75.0, 295.0, p.x);
    float heightBand = smoothstep(535.0, 690.0, p.y)
                     * (1.0 - smoothstep(925.0, 1040.0, p.y));
    float weight = attachment * heightBand * uMotion;
    float phase = uTime * 0.72 - (p.y - 600.0) * 0.017 + p.x * 0.005;
    float breeze = sin(phase) + 0.22 * sin(phase * 1.63 + 1.1);
    p.x += weight * breeze * 9.0;
    p.y += weight * cos(phase * 0.82 + 0.7) * 4.0;
    float z = weight * sin(phase + 0.45) * 9.0;
    vec2 clip = vec2(p.x / 798.0 * 2.0 - 1.0, 1.0 - p.y / 1260.0 * 2.0);
    gl_Position = vec4(clip, -z / 1000.0, 1.0 - z / 1600.0);
    vUV = aUV;
    vLight = 1.0 + weight * cos(phase + 0.45) * 0.012;
  }
`;

const fragmentShader = `
  precision mediump float;
  uniform sampler2D uPainting;
  varying vec2 vUV;
  varying float vLight;
  void main() {
    vec4 painted = texture2D(uPainting, vUV);
    gl_FragColor = vec4(painted.rgb * vLight, painted.a);
  }
`;

type Renderer = { setMotion: (value: boolean) => void };

/** Original painted pixels on a connected 64 × 100 grid of triangles. */
export function FigureMesh({ shape, motion, onReady }: {
  shape: string;
  motion: boolean;
  onReady: (ready: boolean) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<Renderer | null>(null);
  const motionState = useRef(motion);
  const [contextVersion, setContextVersion] = useState(0);

  useEffect(() => {
    motionState.current = motion;
    renderer.current?.setMotion(motion);
  }, [motion]);

  useEffect(() => {
    const surface = canvas.current;
    if (!surface) return;
    let disposed = false, frame = 0, elapsed = 0, last = 0;
    let draw: (() => void) | undefined;
    const cleanups: (() => void)[] = [];
    onReady(false);

    function animate(now: number) {
      if (disposed || document.hidden) return;
      elapsed += last ? Math.min((now - last) / 1000, .05) : 0;
      last = now;
      draw?.();
      if (motionState.current) frame = requestAnimationFrame(animate);
    }
    function restart() {
      cancelAnimationFrame(frame);
      last = 0;
      if (!document.hidden && !disposed) frame = requestAnimationFrame(animate);
    }
    function contextLost(event: Event) {
      event.preventDefault();
      cancelAnimationFrame(frame);
      onReady(false);
    }
    function contextRestored() { setContextVersion(value => value + 1); }
    surface.addEventListener('webglcontextlost', contextLost);
    surface.addEventListener('webglcontextrestored', contextRestored);
    document.addEventListener('visibilitychange', restart);

    async function initialize() {
      const gl = surface!.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: true });
      if (!gl) return; // The existing SVG figure remains the static fallback.
      const compile = (type: number, source: string) => {
        const shader = gl.createShader(type)!;
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          gl.deleteShader(shader);
          throw new Error('Unable to compile the painting mesh shader');
        }
        cleanups.push(() => gl.deleteShader(shader));
        return shader;
      };
      const program = gl.createProgram()!;
      cleanups.push(() => gl.deleteProgram(program));
      gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexShader));
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentShader));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Unable to link the painting mesh');

      const columns = 64, rows = 100;
      const vertices = new Float32Array((columns + 1) * (rows + 1) * 2);
      const triangles = new Uint16Array(columns * rows * 6);
      let index = 0;
      for (let y = 0; y <= rows; y++) for (let x = 0; x <= columns; x++) {
        vertices[index++] = x / columns;
        vertices[index++] = y / rows;
      }
      index = 0;
      for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
        const a = y * (columns + 1) + x, b = a + 1, c = a + columns + 1, d = c + 1;
        triangles.set([a, c, b, b, c, d], index);
        index += 6;
      }
      const vertexBuffer = gl.createBuffer()!, indexBuffer = gl.createBuffer()!;
      cleanups.push(() => { gl.deleteBuffer(vertexBuffer); gl.deleteBuffer(indexBuffer); });
      gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, triangles, gl.STATIC_DRAW);
      gl.useProgram(program);
      const position = gl.getAttribLocation(program, 'aUV');
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

      const painting = new Image();
      painting.src = '/art/le-bon-pasteur.png';
      await painting.decode();
      if (disposed) return;
      // Reuse the corrected silhouette. Masking happens once at load time;
      // animation moves vertices, never a noise/displacement image filter.
      const cutout = document.createElement('canvas');
      cutout.width = 798; cutout.height = 1260;
      const textureContext = cutout.getContext('2d')!;
      textureContext.drawImage(painting, 0, 0, 798, 1260);
      const mask = document.createElement('canvas');
      mask.width = 798; mask.height = 1260;
      const maskContext = mask.getContext('2d')!;
      maskContext.fillStyle = 'white';
      maskContext.filter = 'blur(0.65px)';
      maskContext.fill(new Path2D(shape));
      textureContext.globalCompositeOperation = 'destination-in';
      textureContext.drawImage(mask, 0, 0);

      const texture = gl.createTexture()!;
      cleanups.push(() => gl.deleteTexture(texture));
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cutout);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.uniform1i(gl.getUniformLocation(program, 'uPainting'), 0);
      const timeUniform = gl.getUniformLocation(program, 'uTime');
      const motionUniform = gl.getUniformLocation(program, 'uMotion');
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.clearColor(0, 0, 0, 0);
      draw = () => {
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform1f(timeUniform, elapsed);
        gl.uniform1f(motionUniform, motionState.current ? 1 : 0);
        gl.drawElements(gl.TRIANGLES, triangles.length, gl.UNSIGNED_SHORT, 0);
      };
      const resize = () => {
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        surface!.width = Math.max(1, Math.round(surface!.clientWidth * ratio));
        surface!.height = Math.max(1, Math.round(surface!.clientHeight * ratio));
        gl.viewport(0, 0, surface!.width, surface!.height);
        draw?.();
      };
      const observer = new ResizeObserver(resize);
      observer.observe(surface!);
      cleanups.push(() => observer.disconnect());
      resize();
      renderer.current = { setMotion: restart };
      onReady(true);
      restart();
    }
    initialize().catch(() => { if (!disposed) onReady(false); });
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      renderer.current = null;
      surface.removeEventListener('webglcontextlost', contextLost);
      surface.removeEventListener('webglcontextrestored', contextRestored);
      document.removeEventListener('visibilitychange', restart);
      cleanups.forEach(cleanup => cleanup());
    };
  }, [shape, onReady, contextVersion]);

  return <canvas ref={canvas} className="figure-mesh" aria-hidden="true" data-triangles="12800" />;
}
