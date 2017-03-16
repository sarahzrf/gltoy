#define GL (this.gl)

class MediaCache {
    constructor() {
        this.media = {};
    }

    load(url) {
        if (url in this.media)
            return this.media[url];
        return this.media[url] = fetch(url).then(resp => {
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
}

// assumptions: only one Scene gets to fuck with the vao, the current program,
// the uniforms, and the texture bindings at any given time. anything else is
// fair game. a Scene may assume that it is the currently-active one at any
// point between an invocation of setup() on it and an invocation of cleanup()
// on it.

class Scene {
    constructor(gl, cache) {
        this.gl = gl;
        this.cache = cache;
        this.textures = {};

        this.vbo = GL.createBuffer();
        this.ebo = GL.createBuffer();
        this.program = GL.createProgram();
        this.enabledAttribs = [];
    }

    ready() {
        return true;
    }

    cleanup() {
        GL.deleteBuffer(this.vbo);
        GL.deleteBuffer(this.ebo);
        GL.deleteProgram(this.program);
        this.enabledAttribs.forEach(a => GL.disableVertexAttribArray(a));
    }

    loadShaders(vshaderSource, fshaderSource) {
        let vshader = GL.createShader(GL.VERTEX_SHADER),
            fshader = GL.createShader(GL.FRAGMENT_SHADER);
        GL.attachShader(this.program, vshader);
        GL.attachShader(this.program, fshader);

        GL.shaderSource(vshader, vshaderSource);
        GL.shaderSource(fshader, fshaderSource);
        GL.compileShader(vshader);
        let err = false;
        if (!GL.getShaderParameter(
            vshader, GL.COMPILE_STATUS)) {
            alert("An error occurred compiling the vertex shader: " +
                GL.getShaderInfoLog(vshader));
            err = true;
        }
        GL.compileShader(fshader);
        if (!GL.getShaderParameter(
            fshader, GL.COMPILE_STATUS)) {
            alert("An error occurred compiling the fragment shader: " +
                GL.getShaderInfoLog(fshader));
            err = true;
        }
        if (!err) GL.linkProgram(this.program);
        GL.deleteShader(vshader);
        GL.deleteShader(fshader);
        if (err) throw "shader compilation error";
    }

    loadVertices(dat) {
        GL.bindBuffer(GL.ARRAY_BUFFER, this.vbo);
        GL.bufferData(GL.ARRAY_BUFFER,
            new Float32Array(dat.data), GL.STATIC_DRAW);
        let total_offset = 0;
        this.attribs = dat.attributes.map(([name, size]) => {
            let res = [name, size, total_offset];
            total_offset += size * 4;
            return res;
        });
        this.stride = total_offset;
    }

    setupVertices() {
        this.attribs.forEach(([name, size, offset]) => {
            let attrib = GL.getAttribLocation(this.program, name);
            if (attrib === -1) return;
            this.enabledAttribs.push(attrib);
            GL.enableVertexAttribArray(attrib);
            GL.vertexAttribPointer(attrib, size, GL.FLOAT, false,
                this.stride, offset);
        });
    }

    loadTriangles(dat) {
        GL.bindBuffer(GL.ELEMENT_ARRAY_BUFFER, this.ebo);
        GL.bufferData(GL.ELEMENT_ARRAY_BUFFER,
            new Uint16Array(dat), GL.STATIC_DRAW);
        this.numTriangles = dat.length;
    }

    loadUniforms(dat) {
        this.constUniforms = [];
        this.uniformFuns = [];
        let textureURLs = [];
        Object.entries(dat).forEach(([name, val]) => {
            let uni = GL.getUniformLocation(this.program, name);
            if (uni === -1) return;
            if (typeof val === 'function') this.uniformFuns.push([uni, val]);
            else if (typeof val === 'string') textureURLs.push([uni, val]);
            else this.constUniforms.push([uni, val]);
        });
        this.textureUniforms = [];
        return Promise.all(textureURLs.map(([uni, url], ix) =>
            this.cache.load(url).then(el => this.textureUniforms.push([uni, ix, el]))));
    }

    setupUniforms() {
        this.constUniforms.forEach(([uni, val]) => {
            this.setUniform(uni, val);
        });
        this.vidTextures = [];
        this.textureUniforms.forEach(([uni, ix, el]) => {
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
        });
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

    setup() {
        GL.useProgram(this.program);
        this.setupVertices();
        this.setupUniforms();
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

        GL.bindBuffer(GL.ARRAY_BUFFER, this.vbo);
        GL.bindBuffer(GL.ELEMENT_ARRAY_BUFFER, this.ebo);
        GL.clear(GL.COLOR_BUFFER_BIT | GL.DEPTH_BUFFER_BIT);
        GL.drawElements(GL.TRIANGLES, this.numTriangles,
            GL.UNSIGNED_SHORT, 0);
    }
}

class Renderer {
    constructor(gl) {
        this.gl = gl;
    }

    setScene(scene) {
        if (!scene.ready()) throw "scene not ready";
        if (this.scene) this.scene.cleanup();
        scene.setup();
        this.scene = scene;
    }

    start() {
        if (!this.scene) throw "no scene";
        if (!this.drawing) {
            this.drawing = true;
            requestAnimationFrame(() => this.draw());
        }
    }

    stop() {
        if (this.drawing) this.stopped = true;
    }

    draw() {
        if (this.stopped) {
            this.stopped = false;
            this.drawing = false;
            return;
        }

        this.scene.draw();
        requestAnimationFrame(() => this.draw());
    }
}

class Toy {
    constructor(canvas,
        vshaderTA, fshaderTA, uniformsTA,
        verticesTA, trianglesTA,
        lButton, sButton, rButton) {
        this.gl = canvas.getContext('webgl');
        this.initGL();

        this.renderer = new Renderer(this.gl);
        this.cache = new MediaCache();

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

    initGL() {
        GL.clearColor(0.0, 0.0, 0.0, 1.0);
        GL.clearDepth(1.0);
        GL.enable(GL.DEPTH_TEST);
        GL.depthFunc(GL.LESS);
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

    reload() {
        let vdat, tdat, udat;
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
        let scene = new Scene(this.gl, this.cache);
        scene.loadShaders(this.vshaderTA.value, this.fshaderTA.value);
        scene.loadVertices(vdat);
        scene.loadTriangles(tdat);
        scene.loadUniforms(udat).then(
            () => {this.renderer.setScene(scene); this.renderer.start()},
            err => alert("Failed to load some textures: " + err));
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

