// Camera rig: orbit inspection, first-person walking (gravity-locked eye height, collision against formwork,
// props, stored material and trench walls), and eased interpolation between saved viewpoints.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export const EYE_HEIGHT = 1.6;      // operator eye height above the working floor (m)
const WALK_SPEED = 2.4, SPRINT = 4.6;
const PLAYER_R = 0.32;

export const PRESETS = {
  cinematic: { label: 'Cinematic', pos: [-27, 17.5, 31], target: [0, 3.2, 0] },
  elevation: { label: 'South elevation', pos: [0, 6.5, 42], target: [0, 3.6, 0] },
  joint: { label: 'Joint 3B · 2F', pos: [4.8, 4.9, 10.4], target: [0, 3.6, 2.5] },
  underSlab: { label: 'Under 2F slab', pos: [-7.2, EYE_HEIGHT, 3.8], target: [-3, 2.2, 0.6] },
  aerial: { label: 'Aerial', pos: [-44, 46, 50], target: [0, 2, 0] },
};

export class CameraRig {
  constructor({ camera, canvas, collision, floorAt = () => 0 }) {
    this.camera = camera;
    this.canvas = canvas;
    this.collision = collision;
    this.floorAt = floorAt;
    this.mode = 'orbit';
    this.controls = new OrbitControls(camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 1.2;
    this.controls.maxDistance = 140;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.screenSpacePanning = true;
    this.tween = null;
    this.keys = new Set();
    this.yaw = 0; this.pitch = 0;
    this.locked = false;
    this._onMove = (e) => this.onMouseMove(e);
    this._onLock = () => { this.locked = document.pointerLockElement === this.canvas; };
    this._onKeyDown = (e) => this.onKey(e, true);
    this._onKeyUp = (e) => this.onKey(e, false);
    this.applyPreset('cinematic', 0);
    document.addEventListener('pointerlockchange', this._onLock);
    document.addEventListener('mousemove', this._onMove);
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', () => this.keys.clear());
  }

  dispose() {
    document.removeEventListener('pointerlockchange', this._onLock);
    document.removeEventListener('mousemove', this._onMove);
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    this.controls.dispose();
  }

  // ---- presets with eased interpolation
  applyPreset(name, duration = 1.4) {
    const p = PRESETS[name];
    if (!p) return;
    if (this.mode === 'walk') this.setMode('orbit');
    if (duration <= 0) {
      this.tween = null;
      this.camera.position.set(...p.pos);
      this.controls.target.set(...p.target);
      this.controls.enabled = true;
      this.controls.update();
      return;
    }
    this.tweenTo(new THREE.Vector3(...p.pos), new THREE.Vector3(...p.target), duration);
  }

  tweenTo(pos, target, duration = 1.2) {
    const from = { pos: this.camera.position.clone(), target: this.controls.target.clone() };
    this.tween = { from, pos, target, t: 0, duration: Math.max(0.001, duration) };
    this.controls.enabled = false;
  }

  setMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.tween = null;
    if (mode === 'walk') {
      this.controls.enabled = false;
      this.camera.position.set(-19.2, EYE_HEIGHT, 6.0);   // outside, south-west corner of the stores
      const dir = new THREE.Vector3(0.6, 0, -0.8).normalize();
      this.yaw = Math.atan2(-dir.x, -dir.z);
      this.pitch = -0.12;
      this.applyLook();
    } else {
      this.controls.enabled = true;
      this.controls.target.set(0, 3.2, 0);
      this.controls.update();
      if (document.pointerLockElement) document.exitPointerLock();
    }
  }

  // ---- walk
  lockPointer() {
    if (this.mode === 'walk' && this.canvas.requestPointerLock) this.canvas.requestPointerLock();
  }
  onMouseMove(e) {
    if (this.mode !== 'walk' || !this.locked) return;
    this.yaw -= e.movementX * 0.0022;
    this.pitch = clamp(this.pitch - e.movementY * 0.0022, -1.35, 1.1);
    this.applyLook();
  }
  onKey(e, down) {
    const k = e.key.toLowerCase();
    if (['w', 'a', 's', 'd', 'shift', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
      if (down) this.keys.add(k); else this.keys.delete(k);
    }
  }
  applyLook() {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
    this.camera.quaternion.copy(q);
  }
  walkStep(dt) {
    if (this.mode !== 'walk') return;
    const k = this.keys;
    let fwd = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0);
    let side = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0);
    if (!fwd && !side) return;
    const sp = (k.has('shift') ? SPRINT : WALK_SPEED) * dt;
    const f = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const r = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const move = new THREE.Vector3().addScaledVector(f, fwd).addScaledVector(r, side);
    if (move.lengthSq() === 0) return;
    move.normalize().multiplyScalar(sp);
    const p = this.camera.position;
    // axis-separated collision on the ground plane (world x, z)
    const nx = p.x + move.x, nz = p.z;
    if (!this.blocked(nx, nz)) p.x = nx;
    const nz2 = p.z + move.z;
    if (!this.blocked(p.x, nz2)) p.z = nz2;
    // gravity lock: eye height above the floor under the player
    p.y = this.floorAt(p.x, p.z) + EYE_HEIGHT;
  }
  blocked(x, z) {
    for (const b of this.collision) {
      // world z = -N; collision boxes are in engineering (E, N)
      const E = x, N = -z;
      if (E > b.min[0] - PLAYER_R && E < b.max[0] + PLAYER_R && N > b.min[1] - PLAYER_R && N < b.max[1] + PLAYER_R) return true;
    }
    if (Math.abs(x) > 40 || Math.abs(z) > 40) return true;
    return false;
  }

  // ---- per-frame
  update(dt) {
    if (this.tween) {
      const tw = this.tween;
      tw.t = Math.min(1, tw.t + dt / tw.duration);
      const e = tw.t < 0.5 ? 4 * tw.t * tw.t * tw.t : 1 - Math.pow(-2 * tw.t + 2, 3) / 2;   // cubic in-out
      this.camera.position.lerpVectors(tw.from.pos, tw.pos, e);
      this.controls.target.lerpVectors(tw.from.target, tw.target, e);
      this.camera.lookAt(this.controls.target);
      if (tw.t >= 1) {
        this.tween = null;
        this.controls.enabled = this.mode === 'orbit';
        if (this.mode === 'orbit') this.controls.update();
      }
      return;
    }
    if (this.mode === 'orbit') this.controls.update();
    else this.walkStep(dt);
  }
}

function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
