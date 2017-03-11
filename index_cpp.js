#define GL (this.gl)

class Toy {
    constructor(canvas, vshaderTA, fshaderTA, verticesTA, trianglesTA) {
        this.gl = canvas.getContext('webgl');
        this.vshaderTA = vshaderTA;
        this.fshaderTA = fshaderTA;
        this.verticesTA = verticesTA;
        this.trianglesTA = trianglesTA;

        this.initGL();
        this.initShaders();
        this.vbuffer = GL.createBuffer();
        this.ebuffer = GL.createBuffer();
    }

    initGL() {
        GL.clearColor(0.0, 0.0, 0.0, 1.0);
        GL.clearDepth(1.0);
        GL.enable(GL.DEPTH_TEST);
        GL.depthFunc(GL.LESS);
    }

    initShaders() {
        this.vshader = GL.createShader(GL.VERTEX_SHADER);
        this.fshader = GL.createShader(GL.FRAGMENT_SHADER);
        this.program = GL.createProgram();
        GL.attachShader(this.program, this.vshader);
        GL.attachShader(this.program, this.fshader);
    }

    loadShaders() {
        let vshaderSource = this.vshaderTA.value,
            fshaderSource = this.fshaderTA.value;
        GL.shaderSource(this.vshader, vshaderSource);
        GL.shaderSource(this.fshader, fshaderSource);
        GL.compileShader(this.vshader);
        let err = false;
        if (!GL.getShaderParameter(
            this.vshader, GL.COMPILE_STATUS)) {
            alert("An error occurred compiling the vertex shader: " +
                GL.getShaderInfoLog(this.vshader));
            err = true;
        }
        GL.compileShader(this.fshader);
        if (!GL.getShaderParameter(
            this.fshader, GL.COMPILE_STATUS)) {
            alert("An error occurred compiling the fragment shader: " +
                GL.getShaderInfoLog(this.fshader));
            err = true;
        }
        if (err) throw "shader compilation error";
        GL.linkProgram(this.program);
        GL.useProgram(this.program);
    }

    loadVertices(dat) {
        GL.bindBuffer(GL.ARRAY_BUFFER, this.vbuffer);
        let lines = dat.split("\n"),
            attrs = lines.shift().split(/\s+/).filter(a => !!a),
            offset = 0;
        attrs = attrs.map(a => {
            let [, name, , size] = a.match(/([^\[]+)(\[([^\]]+)\])?/);
            size = size ? parseInt(size) : 1;
            let attr = [name, size, offset];
            offset += size;
            return attr;
        });
        let vals = lines.map(l => l.split(/\s+/).
            filter(v => !!v).map(parseFloat)).
            reduce((a, b) => a.concat(b));
        GL.bufferData(GL.ARRAY_BUFFER,
            new Float32Array(vals), GL.STATIC_DRAW);
        let stride = offset;
        attrs.forEach(([name, size, offset]) => {
            let attr = GL.getAttribLocation(this.program, name);
            if (attr == -1) return;
            GL.enableVertexAttribArray(attr);
            GL.vertexAttribPointer(attr, size, GL.FLOAT, false,
                stride * 4, offset * 4);
        });
    }

    loadTriangles(dat) {
        GL.bindBuffer(GL.ELEMENT_ARRAY_BUFFER, this.ebuffer);
        let lines = dat.split("\n"),
            vals = lines.map(l => l.split(/\s+/).
            filter(v => !!v).map(v => parseInt(v))).
            reduce((a, b) => a.concat(b));
        GL.bufferData(GL.ELEMENT_ARRAY_BUFFER,
            new Uint16Array(vals), GL.STATIC_DRAW);
        this.numTriangles = vals.length;
    }

    main() {
        // buffers
        this.loadVertices(this.verticesTA.value);
        this.loadTriangles(this.trianglesTA.value);

        if (this.interval) clearInterval(this.interval);
        this.interval = setInterval(() => this.draw(), 0.0333);
    }

    draw() {
        let tUniform = GL.getUniformLocation(this.program, "time");
        if (tUniform != -1) GL.uniform1f(tUniform, performance.now() / 1000);

        GL.bindBuffer(GL.ARRAY_BUFFER, this.vbuffer);
        GL.bindBuffer(GL.ELEMENT_ARRAY_BUFFER, this.ebuffer);
        GL.clear(GL.COLOR_BUFFER_BIT | GL.DEPTH_BUFFER_BIT);
        GL.drawElements(GL.TRIANGLES, this.numTriangles,
            GL.UNSIGNED_SHORT, 0);
    }
}

function main() {
    let controls = ["main-canvas", "vshader-source",
        "fshader-source", "vertices", "triangles"].
        map(i => document.getElementById(i)),
        rButton = document.querySelector("#reload");
    toy = new Toy(...controls);
    rButton.onclick = () => {toy.loadShaders(); toy.main();};
    toy.loadShaders();
    toy.main();
}

window.onload = main;

