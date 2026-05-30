import React, { useEffect, useRef } from 'react';

// WebGL Pass-Through Vertex Shader Source
const VERTEX_SHADER_SOURCE = `
  attribute vec2 position;
  void main() {
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

// Custom WebGL Fragment Shader Source
const FRAGMENT_SHADER_SOURCE = `
  precision mediump float;
  uniform vec2 u_resolution;
  uniform vec2 u_mouse;
  uniform float u_time;

  float rand(vec2 co) {
    return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
  }

  void main() {
    vec2 p = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / min(u_resolution.x, u_resolution.y);
    vec2 m = (u_mouse.xy * 2.0 - u_resolution.xy) / min(u_resolution.x, u_resolution.y);
    
    // Invert Y Axis For Shader Coordinate Math Alignment
    m.y = -m.y;

    float time = u_time * 0.4;
    
    // Blob 1: Cyber Purple
    vec2 c1 = vec2(sin(time * 0.6) * 0.5, cos(time * 0.4) * 0.5);
    float d1 = length(p - c1);
    float v1 = 0.22 / (d1 * d1 + 0.22);
    
    // Blob 2: Electric Blue
    vec2 c2 = vec2(cos(time * 0.5 + 1.5) * 0.6, sin(time * 0.7 - 1.0) * 0.4);
    float d2 = length(p - c2);
    float v2 = 0.26 / (d2 * d2 + 0.26);
    
    // Interactive Mouse Blob: Glowing Cyan Accent
    float dMouse = length(p - m);
    float vMouse = 0.14 / (dMouse * dMouse + 0.14);
    
    // Dark Space Obsidian Background
    float distToCenter = length(p);
    vec3 voidBg = mix(vec3(0.011, 0.007, 0.023), vec3(0.003, 0.003, 0.007), distToCenter);
    
    // Combine Liquid Blob Color Gradients
    vec3 color1 = vec3(0.54, 0.36, 0.96) * v1; // Cyber Purple
    vec3 color2 = vec3(0.23, 0.51, 0.96) * v2; // Electric Blue
    vec3 colorMouse = vec3(0.08, 0.72, 0.65) * vMouse; // Teal
    
    vec3 finalColor = voidBg + color1 + color2 + colorMouse;
    
    // Subtle Analog Film Grain Overlay
    float grain = (rand(gl_FragCoord.xy + u_time) - 0.5) * 0.015;
    finalColor += vec3(grain);
    
    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

export const ShaderBackground: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl');
    if (!gl) {
      console.warn("WebGL Context Creation Failed. Falling Back.");
      return;
    }

    // Helper To Compile Shaders
    const compileShader = (source: string, type: number): WebGLShader | null => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error("Failed To Compile Shader:", gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const vertexShader = compileShader(VERTEX_SHADER_SOURCE, gl.VERTEX_SHADER);
    const fragmentShader = compileShader(FRAGMENT_SHADER_SOURCE, gl.FRAGMENT_SHADER);
    if (!vertexShader || !fragmentShader) return;

    // Create Shader Program
    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error("Shader Program Linking Failed:", gl.getProgramInfoLog(program));
      return;
    }

    gl.useProgram(program);

    // Setup Position Buffers
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    const vertices = new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
      -1,  1,
       1, -1,
       1,  1,
    ]);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    const positionLocation = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    // Find Uniform Bindings
    const resolutionLocation = gl.getUniformLocation(program, 'u_resolution');
    const mouseLocation = gl.getUniformLocation(program, 'u_mouse');
    const timeLocation = gl.getUniformLocation(program, 'u_time');

    // Track Canvas Sizing
    const resizeCanvas = () => {
      const displayWidth = window.innerWidth;
      const displayHeight = window.innerHeight;
      if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
        canvas.width = displayWidth;
        canvas.height = displayHeight;
        gl.viewport(0, 0, canvas.width, canvas.height);
      }
    };
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    // Mouse Coordination Tracking
    let targetMouseX = canvas.width / 2;
    let targetMouseY = canvas.height / 2;
    let currentMouseX = targetMouseX;
    let currentMouseY = targetMouseY;

    const handleMouseMove = (e: MouseEvent) => {
      targetMouseX = e.clientX;
      targetMouseY = e.clientY;
    };
    window.addEventListener('mousemove', handleMouseMove);

    // Animate Shader Frame Loops
    let animFrameId: number;
    const startTime = performance.now();

    const loop = () => {
      // Linear Interpolation For Liquid Inertia
      currentMouseX += (targetMouseX - currentMouseX) * 0.06;
      currentMouseY += (targetMouseY - currentMouseY) * 0.06;

      const elapsedSeconds = (performance.now() - startTime) / 1000.0;

      // Pass Values To GLSL Variables
      gl.uniform2f(resolutionLocation, canvas.width, canvas.height);
      gl.uniform2f(mouseLocation, currentMouseX, currentMouseY);
      gl.uniform1f(timeLocation, elapsedSeconds);

      // Render Screen Primitive Triangle Fan
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      animFrameId = requestAnimationFrame(loop);
    };

    loop();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(animFrameId);
      gl.deleteBuffer(positionBuffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
    };
  }, []);

  return (
    <canvas 
      ref={canvasRef} 
      className="fixed inset-0 w-full h-full pointer-events-none z-0" 
      style={{ mixBlendMode: 'screen', opacity: 0.85 }}
    />
  );
};
export default ShaderBackground;
