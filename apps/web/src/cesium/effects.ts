import * as Cesium from 'cesium';

const EXPOSURE_FRAG = `
uniform sampler2D colorTexture;
uniform float exposure;
in vec2 v_textureCoordinates;
vec3 s2l(vec3 c){ return mix(pow((c + 0.055) / 1.055, vec3(2.4)), c / 12.92, step(vec3(0.04045), c)); }
vec3 l2s(vec3 c){ return mix(1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, c * 12.92, step(c, vec3(0.0031308))); }
void main() {
  vec3 c = texture(colorTexture, v_textureCoordinates).rgb;
  vec3 e = s2l(c) * exposure;
  vec3 mapped = e / (e + vec3(1.0));
  out_FragColor = vec4(l2s(mapped), 1.0);
}`;

const RAIN_FRAG = `
uniform sampler2D colorTexture;
uniform float intensity;
uniform float time;
in vec2 v_textureCoordinates;
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main() {
  vec4 color = texture(colorTexture, v_textureCoordinates);
  vec2 uv = v_textureCoordinates;
  vec2 g = vec2(160.0, 110.0);
  vec2 cell = floor(uv * g);
  vec2 f = fract(uv * g);
  float r = hash12(cell);
  float speed = 2.5 + r * 3.5;
  f.y = fract(f.y + time * speed * 0.02);
  f.x = fract(f.x + r);
  float streak = smoothstep(0.10, 0.0, abs(f.x - 0.5) + 0.06 * abs(f.y - 0.5))
               * smoothstep(0.0, 0.15, f.y) * smoothstep(1.0, 0.45, f.y);
  float a = streak * intensity * (0.25 + 0.75 * r);
  vec3 rain = mix(color.rgb, vec3(0.78, 0.82, 0.9), clamp(a, 0.0, 1.0) * 0.8);
  out_FragColor = vec4(rain * (1.0 - 0.18 * intensity), 1.0);
}`;

const SNOW_FRAG = `
uniform sampler2D colorTexture;
uniform float intensity;
uniform float time;
in vec2 v_textureCoordinates;
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main() {
  vec4 color = texture(colorTexture, v_textureCoordinates);
  vec2 uv = v_textureCoordinates;
  float t = time;
  float a = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    vec2 sc = vec2(28.0 + 22.0 * fi);
    vec2 p = uv * sc + vec2(0.0, t * (0.06 + 0.05 * fi));
    vec2 cell = floor(p);
    vec2 f = fract(p);
    float r = hash12(cell);
    vec2 c = vec2(0.5 + 0.22 * sin(t * (0.7 + r) + r * 40.0), 0.5 + 0.22 * sin(t * (0.4 + r * 2.0) + r * 17.0));
    float d = length(f - c);
    a += smoothstep(0.20 + 0.10 * r, 0.03, d) * (0.35 + 0.65 * r);
  }
  color.rgb = mix(color.rgb, vec3(1.0), clamp(a * intensity, 0.0, 1.0) * 0.9);
  out_FragColor = color;
}`;

const FOG_FRAG = `
uniform sampler2D colorTexture;
uniform float density;
in vec2 v_textureCoordinates;
void main() {
  vec4 color = texture(colorTexture, v_textureCoordinates);
  float lum = dot(color.rgb, vec3(0.299, 0.587, 0.114));
  vec3 fogCol = mix(vec3(0.62, 0.66, 0.72), vec3(0.9, 0.92, 0.95), lum);
  float veil = clamp(density, 0.0, 1.0) * (0.75 - 0.25 * smoothstep(0.2, 0.9, v_textureCoordinates.y));
  color.rgb = mix(color.rgb, fogCol, veil * 0.7);
  out_FragColor = color;
}`;

export type Precip = 'none' | 'rain' | 'snow';

interface State {
  exposure: number;
  rain: number;
  snow: number;
  fog: number;
}

type StageOpts = NonNullable<ConstructorParameters<typeof Cesium.PostProcessStage>[0]>;

const stage = (s: Cesium.Scene, o: StageOpts): Cesium.PostProcessStage =>
  s.postProcessStages.add(new Cesium.PostProcessStage(o)) as Cesium.PostProcessStage;

export class Effects {
  private u: State = { exposure: 1, rain: 0, snow: 0, fog: 0 };
  private stages: Record<'exposure' | 'rain' | 'snow' | 'fog', Cesium.PostProcessStage>;

  constructor(private viewer: Cesium.Viewer) {
    const s = viewer.scene;
    this.stages = {
      exposure: stage(s, {
        fragmentShader: EXPOSURE_FRAG,
        uniforms: { exposure: () => this.u.exposure },
      }),
      rain: stage(s, {
        fragmentShader: RAIN_FRAG,
        uniforms: { intensity: () => this.u.rain, time: () => Cesium.JulianDate.totalDays(viewer.clock.currentTime) * 86400 },
      }),
      snow: stage(s, {
        fragmentShader: SNOW_FRAG,
        uniforms: { intensity: () => this.u.snow, time: () => Cesium.JulianDate.totalDays(viewer.clock.currentTime) * 86400 },
      }),
      fog: stage(s, {
        fragmentShader: FOG_FRAG,
        uniforms: { density: () => this.u.fog },
      }),
    };
    this.stages.rain.enabled = false;
    this.stages.snow.enabled = false;
    this.stages.fog.enabled = false;
  }

  setExposure(factor: number): void {
    this.u.exposure = factor;
  }

  setPrecip(kind: Precip, intensity: number): void {
    const v = Math.min(1, Math.max(0, intensity));
    this.u.rain = kind === 'rain' ? v : 0;
    this.u.snow = kind === 'snow' ? v : 0;
    this.stages.rain.enabled = kind === 'rain' && v > 0.01;
    this.stages.snow.enabled = kind === 'snow' && v > 0.01;
  }

  setFog(density: number): void {
    const v = Math.min(1, Math.max(0, density));
    this.u.fog = v;
    this.stages.fog.enabled = v > 0.01;
    this.viewer.scene.fog.density = 2e-4 + v * 3e-3;
  }

  setCloud(pct: number): void {
    const p = Math.min(1, Math.max(0, pct / 100));
    const sa = this.viewer.scene.skyAtmosphere;
    if (sa) sa.brightnessShift = -0.55 * p;
    for (let i = 0; i < this.viewer.imageryLayers.length; i++) {
      const l = this.viewer.imageryLayers.get(i);
      if (l) l.brightness = 1 - 0.3 * p;
    }
  }

  destroy(): void {
    for (const st of Object.values(this.stages)) this.viewer.scene.postProcessStages.remove(st);
  }
}
