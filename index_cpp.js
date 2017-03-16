#define GL (this.gl)
#define SCENE (this.scene)

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

// A Scene should not mess with any shared GL state besides bindings

class Scene {
    constructor(gl, cache) {
        this.gl = gl;
        this.cache = cache;

        this.vbo = GL.createBuffer();
        this.ebo = GL.createBuffer();
        this.program = GL.createProgram();
        this.attribs = [];
        this.constUniforms = [];
        this.funUniforms = [];
        this.textures = [];
        this.vidTextures = [];
    }

    ready() {
        return true;
    }

    cleanup() {
        GL.deleteBuffer(this.vbo);
        GL.deleteBuffer(this.ebo);
        GL.deleteProgram(this.program);
        this.textures.forEach(([glIx, t]) => GL.deleteTexture(t));
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
        dat.attributes.forEach(([name, size]) => {
            let attrib = GL.getAttribLocation(this.program, name);
            if (attrib === -1) return;
            this.attribs.push([attrib, size, total_offset]);
            total_offset += size * 4;
        });
        this.stride = total_offset;
    }

    loadTriangles(dat) {
        GL.bindBuffer(GL.ELEMENT_ARRAY_BUFFER, this.ebo);
        GL.bufferData(GL.ELEMENT_ARRAY_BUFFER,
            new Uint16Array(dat), GL.STATIC_DRAW);
        this.numTriangles = dat.length;
    }

    loadUniforms(dat) {
        let texturePs = [],
            textureIx = 0;
        Object.entries(dat).forEach(([name, val]) => {
            let uni = GL.getUniformLocation(this.program, name);
            if (uni === -1) return;
            if (typeof val === 'function') this.funUniforms.push([uni, val]);
            else if (typeof val === 'string') {
                let ix = textureIx++,
                    p = this.cache.load(val).then(el =>
                        this.loadTexture(uni, ix, el));
                this.constUniforms.push([uni, {sampler: true, ix}]);
                texturePs.push(p);
            }
            else this.constUniforms.push([uni, val]);
        });
        return Promise.all(texturePs);
    }

    loadTexture(uni, ix, el) {
        let glIx = GL[`TEXTURE${ix}`],
            texture = GL.createTexture();
        this.textures.push([glIx, texture]);
        if (el instanceof HTMLVideoElement)
            this.vidTextures.push([glIx, el]);

        GL.bindTexture(GL.TEXTURE_2D, texture);
        GL.texParameteri(
            GL.TEXTURE_2D, GL.TEXTURE_MIN_FILTER, GL.LINEAR);
        GL.texParameteri(
            GL.TEXTURE_2D, GL.TEXTURE_WRAP_S, GL.CLAMP_TO_EDGE);
        GL.texParameteri(
            GL.TEXTURE_2D, GL.TEXTURE_WRAP_T, GL.CLAMP_TO_EDGE);
        GL.texImage2D(GL.TEXTURE_2D,
            0, GL.RGBA, GL.RGBA, GL.UNSIGNED_BYTE, el);
    }
}

class Renderer {
    constructor(gl) {
        this.gl = gl;
        this.enabledAttribs = [];
    }

    useScene(scene) {
        if (!scene.ready()) throw "scene not ready";
        this.cleanup();
        this.setup(scene);
    }

    cleanup() {
        if (this.scene) this.scene.cleanup();
        this.enabledAttribs.forEach(a => GL.disableVertexAttribArray(a));
        this.enabledAttribs = [];
    }

    setup(scene) {
        this.scene = scene;

        GL.useProgram(SCENE.program);

        GL.bindBuffer(GL.ARRAY_BUFFER, SCENE.vbo);
        SCENE.attribs.forEach(([attrib, size, offset]) => {
            this.enabledAttribs.push(attrib);
            GL.enableVertexAttribArray(attrib);
            GL.vertexAttribPointer(attrib, size, GL.FLOAT, false,
                SCENE.stride, offset);
        });

        SCENE.constUniforms.forEach(([uni, val]) => {
            this.setUniform(uni, val);
        });
    }

    setUniform(uni, val) {
        if (typeof val === 'number') GL.uniform1f(uni, val);
        else if (typeof val === 'array') {
            let size = val.length;
            if (typeof val[0] === 'array') {
                if (size === 2) GL.uniformMatrix2fv(uni, val);
                else if (size === 3) GL.uniformMatrix3fv(uni, val);
                else if (size === 4) GL.uniformMatrix4fv(uni, val);
            }
            else {
                if (size === 2) GL.uniform2fv(uni, val);
                else if (size === 3) GL.uniform3fv(uni, val);
                else if (size === 4) GL.uniform4fv(uni, val);
            }
        }
        else if (val.sampler) GL.uniform1i(uni, val.ix);
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

    bind() {
        GL.bindBuffer(GL.ARRAY_BUFFER, SCENE.vbo);
        GL.bindBuffer(GL.ELEMENT_ARRAY_BUFFER, SCENE.ebo);
        SCENE.textures.forEach(([glIx, texture]) => {
            GL.activeTexture(glIx);
            GL.bindTexture(GL.TEXTURE_2D, texture);
        });
    }

    recalcUniforms() {
        SCENE.vidTextures.forEach(([glIx, vid]) => {
            GL.activeTexture(glIx);
            GL.texImage2D(GL.TEXTURE_2D,
                0, GL.RGBA, GL.RGBA, GL.UNSIGNED_BYTE, vid);
        });
        SCENE.funUniforms.forEach(([uni, fun]) => {
            this.setUniform(uni, fun());
        });
    }

    draw() {
        if (this.stopped) {
            this.stopped = false;
            this.drawing = false;
            return;
        }

        this.bind();
        this.recalcUniforms();
        GL.clear(GL.COLOR_BUFFER_BIT | GL.DEPTH_BUFFER_BIT);
        GL.drawElements(GL.TRIANGLES, SCENE.numTriangles,
            GL.UNSIGNED_SHORT, 0);

        requestAnimationFrame(() => this.draw());
    }
}

class Toy {
    constructor(canvas, ...controls) {
        this.gl = canvas.getContext('webgl');
        this.initGL();

        this.renderer = new Renderer(this.gl);
        this.cache = new MediaCache();

        [this.container,
            this.vshaderTA, this.fshaderTA, this.uniformsTA,
            this.verticesTA, this.trianglesTA,
            this.lButton, this.sButton, this.rButton] = controls;
        this.bindEvents();
    }

    initGL() {
        GL.clearColor(0.0, 0.0, 0.0, 1.0);
        GL.clearDepth(1.0);
        GL.enable(GL.DEPTH_TEST);
        GL.depthFunc(GL.LESS);
    }

    bindEvents() {
        this.container.onkeydown = e => {
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
            () => {
                this.renderer.useScene(scene);
                this.renderer.start();
            },
            err => {
                scene.cleanup();
                alert("Failed to load some textures: " + err)
            });
    }
}

function main() {
    let canvas = document.getElementById("main-canvas"),
        controls = [
        "vshader-source", "fshader-source", "uniforms",
        "vertices", "triangles",
        "load", "save", "reload"
    ].map(i => document.getElementById(i));
    toy = new Toy(canvas, document.body, ...controls);
    window.onhashchange = () => {
        if (window.location.hash)
            toy.loadGist(window.location.hash.slice(1))
    };
    if (window.location.hash) toy.loadGist(window.location.hash.slice(1));
    else toy.reload();
}

window.onload = main;

