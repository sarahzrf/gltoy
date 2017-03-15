#define GL (this.gl)

class Toy {
    constructor(canvas,
        vshaderTA, fshaderTA, uniformsTA,
        verticesTA, trianglesTA,
        lButton, sButton, rButton) {
        this.gl = canvas.getContext('webgl');
        this.vbuffer = GL.createBuffer();
        this.ebuffer = GL.createBuffer();
        this.textures = {};
        this.texCache = {};
        this.initGL();
        this.initShaders();

        this.vshaderTA = vshaderTA;
        this.fshaderTA = fshaderTA;
        this.uniformsTA = uniformsTA;
        this.verticesTA = verticesTA;
        this.trianglesTA = trianglesTA;
        this.lButton = lButton;
        this.sButton = sButton;
        this.rButton = rButton;
        this.bindEvents();
    }

    bindEvents() {
        document.body.onkeydown = e => {
            if (!e.ctrlKey) return;
            if (e.keyCode === 79) this.load();
            else if (e.keyCode === 83) this.save();
            else if (e.keyCode === 13) this.reload();
            else return;
            e.preventDefault();
        };
        this.lButton.onclick = () => this.load();
        this.sButton.onclick = () => this.save();
        this.rButton.onclick = () => this.reload();
    }

    load() {
        let id = prompt("Enter the Gist id:");
        if (id) window.location.hash = id;
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
            triangles: {content: this.trianglesTA.value},
            uniforms: {content: this.uniformsTA.value}
        } = files);
    }

    save() {
        if (!confirm(
            "Are you sure? You can't delete anonymous Gists!")) return;
        let files = {
            vertex_shader: {content: this.vshaderTA.value},
            fragment_shader: {content: this.fshaderTA.value},
            vertices: {content: this.verticesTA.value},
            triangles: {content: this.trianglesTA.value},
            uniforms: {content: this.uniformsTA.value}
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

    loadUniforms(dat) {
        this.uniformFuns = [];
        let textureURLs = [];
        Object.entries(dat).forEach(([name, val]) => {
            let uni = GL.getUniformLocation(this.program, name);
            if (uni === -1) return;
            if (typeof val === 'function') this.uniformFuns.push([uni, val]);
            else if (typeof val === 'string') textureURLs.push([uni, val]);
            else this.setUniform(uni, val);
        });
        this.vidTextures = [];
        return Promise.all(textureURLs.map(([uni, url], ix) =>
            this.loadTexture(url, uni, ix).then(el => {
                let glIx = GL[`TEXTURE${ix}`],
                    texture = this.textures[ix];
                if (!texture) {
                    texture = this.textures[ix] = GL.createTexture();
                }
                GL.activeTexture(glIx);
                GL.bindTexture(GL.TEXTURE_2D, texture);
                GL.texParameteri(
                    GL.TEXTURE_2D, GL.TEXTURE_MIN_FILTER, GL.LINEAR);
                GL.texParameteri(
                    GL.TEXTURE_2D, GL.TEXTURE_WRAP_S, GL.CLAMP_TO_EDGE);
                GL.texParameteri(
                    GL.TEXTURE_2D, GL.TEXTURE_WRAP_T, GL.CLAMP_TO_EDGE);
                GL.texImage2D(GL.TEXTURE_2D,
                    0, GL.RGBA, GL.RGBA, GL.UNSIGNED_BYTE, el);
                GL.uniform1i(uni, ix);
                if (el instanceof HTMLVideoElement)
                    this.vidTextures.push([glIx, el]);
        })));
    }

    setUniform(uni, val) {
        if (typeof val === 'number') GL.uniform1f(uni, val);
        else if (typeof val === 'array') {
            let size = val.length;
            if (typeof val[0] === 'array') {
                if (size == 2) GL.uniformMatrix2fv(uni, val);
                else if (size == 3) GL.uniformMatrix3fv(uni, val);
                else if (size == 4) GL.uniformMatrix4fv(uni, val);
            }
            else {
                if (size == 2) GL.uniform2fv(uni, val);
                else if (size == 3) GL.uniform3fv(uni, val);
                else if (size == 4) GL.uniform4fv(uni, val);
            }
        }
    }

    loadTexture(url, uni, ix) {
        if (url in this.texCache)
            return this.texCache[url];
        return this.texCache[url] = fetch(url).then(resp => {
            if (!resp.ok) throw `could not load ${resp.url}`;
            let mime = resp.headers.get('Content-Type'),
                el, loaded;
            if (mime.match('^video/')) {
                el = document.createElement('video');
                loaded = new Promise((res, rej) => {
                    el.oncanplay = () => {
                        el.loop = true;
                        el.play();
                        res(el);
                    };
                    el.onerror = () =>
                        rej(`${resp.url} contains bad video data`);
                });
            }
            else if (mime.match('^image/')) {
                el = new Image();
                loaded = new Promise((res, rej) => {
                    el.onload = () => res(el);
                    el.onerror = () =>
                        rej(`${resp.url} contains bad image data`);
                });
            }
            else throw `${resp.url} not a video or image`;

            return resp.blob().then(blob => {
                el.src = URL.createObjectURL(blob);
                return loaded;
            });
        });
    }

    reload() {
        var vdat, tdat, udat;
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
        try {udat = Function(this.uniformsTA.value)();}
        catch (e) {
            alert("An error occurred evaluating the uniforms: " + e);
            throw e;
        }
        this.loadShaders(this.vshaderTA.value, this.fshaderTA.value);
        this.loadVertices(vdat);
        this.loadTriangles(tdat);
        this.loadUniforms(udat).then(() => this.start(),
            err => alert("Failed to load some textures: " + err));
    }

    start() {
        if (!this.drawing) {
            this.drawing = true;
            requestAnimationFrame(() => this.draw());
        }
    }

    stop() {
        this.drawing = false;
    }

    recalcUniforms() {
        this.vidTextures.forEach(([glIx, vid]) => {
            GL.activeTexture(glIx);
            GL.texImage2D(GL.TEXTURE_2D,
                0, GL.RGBA, GL.RGBA, GL.UNSIGNED_BYTE, vid);
        });
        this.uniformFuns.forEach(([uni, fun]) => {
            this.setUniform(uni, fun());
        });
    }

    draw() {
        this.recalcUniforms();

        GL.bindBuffer(GL.ARRAY_BUFFER, this.vbuffer);
        GL.bindBuffer(GL.ELEMENT_ARRAY_BUFFER, this.ebuffer);
        GL.clear(GL.COLOR_BUFFER_BIT | GL.DEPTH_BUFFER_BIT);
        GL.drawElements(GL.TRIANGLES, this.numTriangles,
            GL.UNSIGNED_SHORT, 0);

        if (this.drawing) requestAnimationFrame(() => this.draw());
    }
}

function main() {
    let controls = [
        "main-canvas",
        "vshader-source", "fshader-source", "uniforms",
        "vertices", "triangles",
        "load", "save", "reload"
    ].map(i => document.getElementById(i));
    toy = new Toy(...controls);
    window.onhashchange = () => {
        if (window.location.hash)
            toy.loadGist(window.location.hash.slice(1))
    };
    if (window.location.hash) toy.loadGist(window.location.hash.slice(1));
    else toy.reload();
}

window.onload = main;

