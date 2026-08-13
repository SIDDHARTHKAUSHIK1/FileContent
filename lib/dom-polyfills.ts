/**
 * Comprehensive Node.js / Serverless DOM polyfills for PDF and document parsing.
 * Automatically polyfills browser geometric & DOM structures required by pdfjs-dist.
 */

if (typeof globalThis.DOMMatrix === "undefined") {
  // @ts-ignore
  globalThis.DOMMatrix = class DOMMatrix {
    a = 1
    b = 0
    c = 0
    d = 1
    e = 0
    f = 0
    m11 = 1
    m12 = 0
    m13 = 0
    m14 = 0
    m21 = 0
    m22 = 1
    m23 = 0
    m24 = 0
    m31 = 0
    m32 = 0
    m33 = 1
    m34 = 0
    m41 = 0
    m42 = 0
    m43 = 0
    m44 = 1
    is2D = true
    isIdentity = true

    constructor(init?: any) {
      if (Array.isArray(init) || (init && typeof init.length === "number")) {
        if (init.length === 6) {
          this.a = this.m11 = init[0] ?? 1
          this.b = this.m12 = init[1] ?? 0
          this.c = this.m21 = init[2] ?? 0
          this.d = this.m22 = init[3] ?? 1
          this.e = this.m41 = init[4] ?? 0
          this.f = this.m42 = init[5] ?? 0
        } else if (init.length === 16) {
          this.m11 = init[0] ?? 1
          this.m12 = init[1] ?? 0
          this.m13 = init[2] ?? 0
          this.m14 = init[3] ?? 0
          this.m21 = init[4] ?? 0
          this.m22 = init[5] ?? 1
          this.m23 = init[6] ?? 0
          this.m24 = init[7] ?? 0
          this.m31 = init[8] ?? 0
          this.m32 = init[9] ?? 0
          this.m33 = init[10] ?? 1
          this.m34 = init[11] ?? 0
          this.m41 = init[12] ?? 0
          this.m42 = init[13] ?? 0
          this.m43 = init[14] ?? 0
          this.m44 = init[15] ?? 1
          this.a = this.m11
          this.b = this.m12
          this.c = this.m21
          this.d = this.m22
          this.e = this.m41
          this.f = this.m42
          this.is2D = false
        }
      }
    }

    multiply() {
      return this
    }
    translate() {
      return this
    }
    scale() {
      return this
    }
    rotate() {
      return this
    }
    inverse() {
      return this
    }
    transformPoint(point: any) {
      return point || { x: 0, y: 0, z: 0, w: 1 }
    }
    toFloat32Array() {
      return new Float32Array([
        this.m11, this.m12, this.m13, this.m14,
        this.m21, this.m22, this.m23, this.m24,
        this.m31, this.m32, this.m33, this.m34,
        this.m41, this.m42, this.m43, this.m44,
      ])
    }
    toFloat64Array() {
      return new Float64Array([
        this.m11, this.m12, this.m13, this.m14,
        this.m21, this.m22, this.m23, this.m24,
        this.m31, this.m32, this.m33, this.m34,
        this.m41, this.m42, this.m43, this.m44,
      ])
    }
  }
}

if (typeof globalThis.DOMPoint === "undefined") {
  // @ts-ignore
  globalThis.DOMPoint = class DOMPoint {
    x = 0
    y = 0
    z = 0
    w = 1
    constructor(x = 0, y = 0, z = 0, w = 1) {
      this.x = x
      this.y = y
      this.z = z
      this.w = w
    }
    matrixTransform() {
      return this
    }
  }
}

if (typeof globalThis.DOMRect === "undefined") {
  // @ts-ignore
  globalThis.DOMRect = class DOMRect {
    x = 0
    y = 0
    width = 0
    height = 0
    top = 0
    right = 0
    bottom = 0
    left = 0
    constructor(x = 0, y = 0, width = 0, height = 0) {
      this.x = x
      this.y = y
      this.width = width
      this.height = height
      this.top = y
      this.left = x
      this.right = x + width
      this.bottom = y + height
    }
    toJSON() {
      return { x: this.x, y: this.y, width: this.width, height: this.height }
    }
  }
}

if (typeof globalThis.Path2D === "undefined") {
  // @ts-ignore
  globalThis.Path2D = class Path2D {
    addPath() {}
    closePath() {}
    moveTo() {}
    lineTo() {}
    bezierCurveTo() {}
    quadraticCurveTo() {}
    arc() {}
    arcTo() {}
    ellipse() {}
    rect() {}
  }
}

export {}
