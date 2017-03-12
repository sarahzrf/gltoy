#define GL (this.gl)

class Toy {
    constructor(canvas, vshaderTA, fshaderTA,
        verticesTA, trianglesTA, rButton, sButton) {
        this.gl = canvas.getContext('webgl');
        this.vshaderTA = vshaderTA;
        this.fshaderTA = fshaderTA;
        this.verticesTA = verticesTA;
        this.trianglesTA = trianglesTA;
        this.rButton = rButton;
        this.sButton = sButton;

        this.initGL();
        this.initShaders();
        this.vbuffer = GL.createBuffer();
        this.ebuffer = GL.createBuffer();
        rButton.onclick = () => this.reload();
        sButton.onclick = () => this.save();
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

    loadGist(id) {
        fetch(`https://api.github.com/gists/${id}`).
            then(resp => {
                if (!resp.ok) throw "could not load";
                return resp.json();
            }).
            then(
                data => {this.populate(data.files); this.reload();},
                () => alert("Failed to load Gist."));
    }

    populate(files) {
        ({
            vertex_shader: {content: this.vshaderTA.value},
            fragment_shader: {content: this.fshaderTA.value},
            vertices: {content: this.verticesTA.value},
            triangles: {content: this.trianglesTA.value}
        } = files);
    }

    save() {
        if (!confirm(
            "Are you sure? You can't delete anonymous Gists!")) return;
        let files = {
            vertex_shader: {content: this.vshaderTA.value},
            fragment_shader: {content: this.fshaderTA.value},
            vertices: {content: this.verticesTA.value},
            triangles: {content: this.trianglesTA.value}
        },
            body = JSON.stringify({files});
        fetch("https://api.github.com/gists", {method: 'POST', body}).
            then(resp => {
                if (!resp.ok) throw "could not save";
                return resp.json();
            }).
            then(
                data => alert(`Saved Gist ${window.location.hash=data.id}.`),
                () => alert("Failed to save Gist."));
    }

    loadShaders(vshaderSource, fshaderSource) {
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
        GL.bufferData(GL.ARRAY_BUFFER,
            new Float32Array(dat.data), GL.STATIC_DRAW);
        let total_offset = 0,
            attrs = dat.attributes.map(([name, size]) => {
                let res = [name, size, total_offset];
                total_offset += size;
                return res;
            });
        attrs.forEach(([name, size, offset]) => {
            let attr = GL.getAttribLocation(this.program, name);
            if (attr === -1) return;
            GL.enableVertexAttribArray(attr);
            GL.vertexAttribPointer(attr, size, GL.FLOAT, false,
                total_offset * 4, offset * 4);
        });
    }

    loadTriangles(dat) {
        GL.bindBuffer(GL.ELEMENT_ARRAY_BUFFER, this.ebuffer);
        GL.bufferData(GL.ELEMENT_ARRAY_BUFFER,
            new Uint16Array(dat), GL.STATIC_DRAW);
        this.numTriangles = dat.length;
    }

    reload() {
        var vdat, tdat;
        try {vdat = Function(this.verticesTA.value)();}
        catch (e) {
            alert("An error occurred evaluating the vertices: " + e);
            throw e;
        }
        try {tdat = Function(this.trianglesTA.value)();}
        catch (e) {
            alert("An error occurred evaluating the triangles: " + e);
            throw e;
        }
        this.loadShaders(this.vshaderTA.value, this.fshaderTA.value);
        this.loadVertices(vdat);
        this.loadTriangles(tdat);

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
        "fshader-source", "vertices", "triangles", "reload", "save"].
        map(i => document.getElementById(i));
    toy = new Toy(...controls);
    window.onhashchange = () => {
        if (window.location.hash)
            toy.loadGist(window.location.hash.slice(1))
    };
    if (window.location.hash) toy.loadGist(window.location.hash.slice(1));
    else toy.reload();
}

window.onload = main;

