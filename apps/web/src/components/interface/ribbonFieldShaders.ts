// Adapted from MengTo/threeui Ribbon Field, MIT. See docs/licenses/threeui.txt.
export const RIBBON_FIELD_VERTEX_SHADER = `
  attribute vec2 position;
  void main() { gl_Position = vec4(position, 0.0, 1.0); }
`;
export const RIBBON_FIELD_FRAGMENT_SHADER = `
  precision highp float;
  uniform vec2 resolution;
  uniform float time;
  uniform vec2 pointer;
  float silk(vec2 uv, float offset, float phase) {
    float center = 0.48 + offset + 0.24 * sin(uv.x * 4.4 + phase)
      + 0.045 * sin(uv.x * 9.0 - phase * 0.6);
    float d = uv.y - center;
    float body = exp(-d * d / 0.0016);
    float edge = exp(-pow(d - 0.023, 2.0) / 0.000035);
    return body * 0.28 + edge * 0.16;
  }
  void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    float t = time * 0.28;
    uv.x += (pointer.x - 0.5) * 0.025;
    float a = silk(uv, -0.17, t);
    float b = silk(uv, 0.24, t + 2.6);
    float right = smoothstep(0.30, 0.77, uv.x);
    float glow = exp(-pow(distance(uv, vec2(0.78, 0.52)), 2.0) / 0.13);
    vec3 base = mix(vec3(0.094, 0.024, 0.035), vec3(0.20, 0.026, 0.044), glow * 0.5);
    vec3 ruby = vec3(0.655, 0.035, 0.055);
    vec3 champagne = vec3(0.64, 0.39, 0.26);
    vec3 color = base + (ruby * a * 0.95 + champagne * b * 0.50) * right;
    gl_FragColor = vec4(color, 1.0);
  }
`;
