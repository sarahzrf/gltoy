const vertices = [
    1.0,  1.0,  0.0,
    -1.0, 1.0,  0.0,
    1.0,  -1.0, 0.0,
    -1.0, -1.0, 0.0],
    perspectiveMatrix = [
        1.8106601717798214,0,0,0,0,
        2.4142135623730954,0,0,0,0,
        -1.002002002002002,-1,0,0,-0.20020020020020018,0],
    mvMatrix = [1,0,0,0,0,1,0,0,0,0,1,0,0,0,-6,1];

function main() {
    let canvas = document.querySelector("#main-canvas"),
        gl = canvas.getContext("webgl");

    // settings
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clearDepth(1.0);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);

    // shaders
    let vshader = gl.createShader(gl.VERTEX_SHADER),
        fshader = gl.createShader(gl.FRAGMENT_SHADER),
        program = gl.createProgram();
    gl.shaderSource(vshader, document.querySelector("#vshader-source").value);
    gl.shaderSource(fshader, document.querySelector("#fshader-source").value);
    gl.compileShader(vshader);
    gl.compileShader(fshader);
    gl.attachShader(program, vshader);
    gl.attachShader(program, fshader);
    gl.linkProgram(program);
    gl.useProgram(program);

    // shader params
    let vertexPositionAttribute =
        gl.getAttribLocation(program, "aVertexPosition"),
        pUniform = gl.getUniformLocation(program, "uPMatrix"),
        mvUniform = gl.getUniformLocation(program, "uMVMatrix");
    gl.enableVertexAttribArray(vertexPositionAttribute);

    // buffers
    let vbuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbuffer);
    gl.bufferData(gl.ARRAY_BUFFER,
        new Float32Array(vertices), gl.STATIC_DRAW);

    // setting uniforms
    gl.uniformMatrix4fv(pUniform, false, new Float32Array(perspectiveMatrix));
    gl.uniformMatrix4fv(mvUniform, false, new Float32Array(mvMatrix));

    // draw
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbuffer);
    gl.vertexAttribPointer(vertexPositionAttribute, 3, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

window.onload = main;

