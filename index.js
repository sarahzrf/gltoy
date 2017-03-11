class Toy {
    constructor(canvas, vshaderTA, fshaderTA, verticesTA, trianglesTA) {
        this.gl = canvas.getContext('webgl');
        this.vshaderTA = vshaderTA;
        this.fshaderTA = fshaderTA;
        this.verticesTA = verticesTA;
        this.trianglesTA = trianglesTA;

        this.initGL();
        this.initShaders();
        this.vbuffer = this.gl.createBuffer();
        this.ebuffer = this.gl.createBuffer();
    }

    initGL() {
        this.gl.clearColor(0.0, 0.0, 0.0, 1.0);
        this.gl.clearDepth(1.0);
        this.gl.enable(this.gl.DEPTH_TEST);
        this.gl.depthFunc(this.gl.LESS);
    }

    initShaders() {
        this.vshader = this.gl.createShader(this.gl.VERTEX_SHADER);
        this.fshader = this.gl.createShader(this.gl.FRAGMENT_SHADER);
        this.program = this.gl.createProgram();
        this.gl.attachShader(this.program, this.vshader);
        this.gl.attachShader(this.program, this.fshader);
    }

    loadShaders() {
        let vshaderSource = this.vshaderTA.value,
            fshaderSource = this.fshaderTA.value;
        this.gl.shaderSource(this.vshader, vshaderSource);
        this.gl.shaderSource(this.fshader, fshaderSource);
        this.gl.compileShader(this.vshader);
        let err = false;
        if (!this.gl.getShaderParameter(
            this.vshader, this.gl.COMPILE_STATUS)) {
            alert("An error occurred compiling the vertex shader: " +
                this.gl.getShaderInfoLog(this.vshader));
            err = true;
        }
        this.gl.compileShader(this.fshader);
        if (!this.gl.getShaderParameter(
            this.fshader, this.gl.COMPILE_STATUS)) {
            alert("An error occurred compiling the fragment shader: " +
                this.gl.getShaderInfoLog(this.fshader));
            err = true;
        }
        if (err) throw "shader compilation error";
        this.gl.linkProgram(this.program);
        this.gl.useProgram(this.program);
    }

    loadVertices(dat) {
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vbuffer);
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
        this.gl.bufferData(this.gl.ARRAY_BUFFER,
            new Float32Array(vals), this.gl.STATIC_DRAW);
        let stride = offset;
        attrs.forEach(([name, size, offset]) => {
            let attr = this.gl.getAttribLocation(this.program, name);
            if (attr == -1) return;
            this.gl.enableVertexAttribArray(attr);
            this.gl.vertexAttribPointer(attr, size, this.gl.FLOAT, false,
                stride * 4, offset * 4);
        });
    }

    loadTriangles(dat) {
        this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.ebuffer);
        let lines = dat.split("\n"),
            vals = lines.map(l => l.split(/\s+/).
            filter(v => !!v).map(v => parseInt(v))).
            reduce((a, b) => a.concat(b));
        this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER,
            new Uint16Array(vals), this.gl.STATIC_DRAW);
        this.numTriangles = vals.length;
    }

    main() {
        let gl = this.gl;

        // buffers
        this.loadVertices(this.verticesTA.value);
        this.loadTriangles(this.trianglesTA.value);

        if (this.interval) clearInterval(this.interval);
        this.interval = setInterval(() => this.draw(), 0.0333);
    }

    draw() {
        let gl = this.gl;

        let tUniform = gl.getUniformLocation(this.program, "time");
        if (tUniform != -1) gl.uniform1f(tUniform, performance.now() / 1000);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.vbuffer);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ebuffer);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.drawElements(gl.TRIANGLES, this.numTriangles,
            gl.UNSIGNED_SHORT, 0);
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

