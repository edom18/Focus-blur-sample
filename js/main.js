(function () {

    'use strict';

    var VERTEX_SHADER = `
        varying vec2 vUV;
        void main() {
            vUV = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `;

    var FRAGMENT_SHADER = `
        uniform sampler2D texture;
        uniform sampler2D blurTexture;
        uniform sampler2D maskTexture;
        varying vec2 vUV;

        void main() {
            float mask = texture2D(maskTexture, vUV).r;
            if (mask > 0.0) {
                gl_FragColor = texture2D(texture, vUV);
            }
            else {
                gl_FragColor = texture2D(blurTexture, vUV);
            }
        }
    `;

    var BLUR_VERTEX_SHADER = `
        varying vec2 vUV;
        void main() {
            vUV = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `;

    var BLUR_FRAGMENT_SHADER = `
        uniform sampler2D texture;
        uniform vec2 renderSize;
        uniform float blur;
        uniform int useBlur;

        varying vec2 vUV;

        vec4 blurColor() {
            vec4 destColor = vec4(0.0);

            const int blurPixel = 10;
            const int blurW = blurPixel;
            const int blurH = blurPixel;

            float maxLevel = float((blurPixel - 1) / 2);
            float total = 0.0;

            if (useBlur == 0) {
                return texture2D(texture, vUV);
            }

            for (int y = 0; y < blurH; y++) {
                for (int x = 0; x < blurW; x++) {
                    if (x != 0 || y != 0) {
                        int addX = x - (blurW - 1) / 2;
                        int addY = y - (blurH - 1) / 2;
                        float level = max(abs(float(addX)), abs(float(addY))) - 1.0;
                        float b = blur * maxLevel - level;
                        b = clamp(b, 0.0, 1.0);
                        float surroundX = float(addX) * 3.0 / renderSize.x;
                        float surroundY = float(addY) * 3.0 / renderSize.y;
                        destColor += texture2D(texture, (vUV + vec2(surroundX, surroundY))) * b;
                        total += b;
                    }
                }
            }

            return destColor / (total + 1.0);
        }

        void main() {
            vec4 destColor = blurColor();
            gl_FragColor = destColor;
        }
    `;


    //////////////////////////////////////////////////

    var shareDepth = function () {
        var scene = new THREE.Scene();
        var camera = new THREE.Camera();

        return function (renderer, renderTarget, renderTargetFrom) {
            // to force setup RT1, not for rendering.
            renderer.render(scene, camera, renderTargetFrom);

            // to force setup RT2, not for rendering.
            renderer.render(scene, camera, renderTarget);

            var _gl = renderer.context;
            var framebuffer = renderer.properties.get(renderTarget).__webglFramebuffer;
            var renderbufferShareFrom = renderer.properties.get(renderTargetFrom).__webglDepthbuffer;
            _gl.bindFramebuffer(_gl.FRAMEBUFFER, framebuffer);
            _gl.bindRenderbuffer(_gl.RENDERBUFFER, renderbufferShareFrom);

            _gl.framebufferRenderbuffer(
                _gl.FRAMEBUFFER, 
                _gl.DEPTH_ATTACHMENT,
                _gl.RENDERBUFFER,
                renderbufferShareFrom
            );

            _gl.bindFramebuffer(_gl.FRAMEBUFFER, null);
            _gl.bindRenderbuffer(_gl.RENDERBUFFER, null);
        };
    }();


    //////////////////////////////////////////////////


    // レンダラを生成
    var renderer = new THREE.WebGLRenderer({antialias: true});
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.autoClear = false;

    window.addEventListener('resize', function () {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }, false);

    document.body.appendChild(renderer.domElement);


    //////////////////////////////////////////////////
    // スクリーン

    // レンダーターゲット
    var width  = window.innerWidth;
    var height = window.innerHeight;

    // スクリーンカメラ
    var screenCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    var screenGeo    = new THREE.PlaneGeometry(2, 2);

    // ブラー用
    var blurRenderTarget = new THREE.WebGLRenderTarget(width, height, {
        magFilter: THREE.NearestFilter,
        minFilter: THREE.NearestFilter,
        wrapS: THREE.ClampToEdgeWrapping,
        wrapT: THREE.ClampToEdgeWrapping
    });

    // 最終結果用
    var renderTarget = new THREE.WebGLRenderTarget(width, height, {
        magFilter: THREE.NearestFilter,
        minFilter: THREE.NearestFilter,
        wrapS: THREE.ClampToEdgeWrapping,
        wrapT: THREE.ClampToEdgeWrapping,
        depthBuffer  : true,
        stencilBuffer: false
    });

    // マスク用
    var maskTarget = new THREE.WebGLRenderTarget(width, height, {
        magFilter: THREE.NearestFilter,
        minFilter: THREE.NearestFilter,
        wrapS: THREE.ClampToEdgeWrapping,
        wrapT: THREE.ClampToEdgeWrapping,
        depthBuffer  : true,
        stencilBuffer: false
    });

    // Blur
    {
        var blurScene = new THREE.Scene();

        var blurUniforms = {
            texture   : { type: 't',  value: renderTarget },
            renderSize: { type: 'v2', value: new THREE.Vector2(width, height) },
            blur      : { type: 'f',  value: 0.5 },
            useBlur   : { type: 'i',  value: 0 }
        };

        var blurMat = new THREE.ShaderMaterial({
            uniforms: blurUniforms,
            vertexShader: BLUR_VERTEX_SHADER,
            fragmentShader: BLUR_FRAGMENT_SHADER
        });

        var blurScreen = new THREE.Mesh(screenGeo, blurMat);
        blurScreen.position.z = -1;

        blurScene.add(screenCamera);
        blurScene.add(blurScreen);
    }

    // Screen
    {

        var screenScene = new THREE.Scene();

        var screenUniforms = {
            texture    : { type: 't', value: renderTarget },
            blurTexture: { type: 't', value: blurRenderTarget },
            maskTexture: { type: 't', value: maskTarget }
        };

        var screenMat = new THREE.ShaderMaterial({
            uniforms      : screenUniforms,
            vertexShader  : VERTEX_SHADER,
            fragmentShader: FRAGMENT_SHADER,
            depthWrite    : false
        })

        var screen = new THREE.Mesh(screenGeo, screenMat);
        screen.position.z = -1;

        screenScene.add(screenCamera);
        screenScene.add(screen);
    }



    //////////////////////////////////////////////////

    // シーンを生成
    var scene = new THREE.Scene();

    // カメラを生成
    var camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 10000);
    camera.position.x = 0;
    camera.position.y = 1.0;
    camera.position.z = 5.0;

    var controls = new THREE.OrbitControls(camera, renderer.domElement);

    //////////////////////////////////////////////////
    // 各種オブジェクトのセットアップ

    var bed, table, floor;
    var loader        = new THREE.JSONLoader();
    var textureLoader = new THREE.TextureLoader();

    // ベッド
    loader.load('models/bed.json', function (geometry, materials) {
        var material = new THREE.MeshFaceMaterial(materials);
        bed = new THREE.Mesh(geometry, material);
        var s = 0.5;
        bed.scale.set(s, s, s);
        bed.castShadow = true;
        bed.receiveShadow = true;
        bed.renderOrder = 10;
        scene.add(bed);
    });

    // テーブル
    loader.load('models/table.json', function (geometry, materials) {
        var material = new THREE.MeshFaceMaterial(materials);
        table = new THREE.Mesh(geometry, material);
        var s = 0.25;
        table.scale.set(s, s, s);
        table.position.x = 1.2;
        table.castShadow = true;
        scene.add(table);
    });

    // ライトの生成
    var light = new THREE.DirectionalLight(0xffffff);
    light.position.set(10, 10, -10);
    light.castShadow = true;
    light.shadow.mapSize.width  = 4096;
    light.shadow.mapSize.height = 4096;
    scene.add(light);

    var ambient = new THREE.AmbientLight(0xeeeeee);
    scene.add(ambient);


    // 床
    textureLoader.load('models/Sapele Mahogany.jpg', function (texture) {
        texture.repeat.set(4, 4);

        var planeGeo = new THREE.PlaneGeometry(5, 5);
        var planeMat = new THREE.MeshLambertMaterial({
            color: 0xffffff,
            map: texture
        });
        floor = new THREE.Mesh(planeGeo, planeMat);
        floor.receiveShadow = true;
        floor.rotation.x = -Math.PI / 2;
        scene.add(floor);
    });

    var planeGeo = new THREE.PlaneGeometry(5, 2.5);
    var planeMat = new THREE.MeshLambertMaterial({
        color: 0xffffff
    });
    var wall = new THREE.Mesh(planeGeo, planeMat);
    wall.position.z = -2.5;
    wall.position.y = 1.25;
    scene.add(wall);

    var leftWall = wall.clone();
    leftWall.position.z = 0;
    leftWall.position.x = -2.5;
    leftWall.rotation.y = Math.PI / 2;
    scene.add(leftWall);

    var rightWall = wall.clone();
    rightWall.position.z = 0;
    rightWall.position.x = 2.5;
    rightWall.rotation.y = -Math.PI / 2;
    scene.add(rightWall);



    //////////////////////////////////////////////////

    function show() {
        table && (table.visible = true);
        floor && (floor.visible = true);

        wall.visible      = true;
        leftWall.visible  = true;
        rightWall.visible = true;
    }

    function hide() {
        table && (table.visible = false);
        floor && (floor.visible = false);

        wall.visible      = false;
        leftWall.visible  = false;
        rightWall.visible = false;
    }

    var useBlur = false;
    var btn = document.getElementById('btn').addEventListener('click', function () {
        useBlur = !useBlur;
        blurScreen.material.uniforms.useBlur.value = useBlur ? 1 : 0;
    }, false);

    // マスク用マテリアル
    var maskMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        depthWrite: false,
        fog: false
    });

    // Share depth buffer.
    shareDepth(renderer, maskTarget, renderTarget);

    // アニメーションループ
    function animate(timestamp) {

        renderer.clear( true, true, true );
        renderer.clearTarget( renderTarget, true, true, true );
        renderer.clearTarget( maskTarget, true, true, true );
        renderer.clearTarget( blurRenderTarget, true, true, true );

        // バックバッファへ通常シーンのレンダリング
        renderer.render(scene, camera, renderTarget);

        // マスク用データを収集
        scene.overrideMaterial = maskMaterial;
        hide();
        renderer.render(scene, camera, maskTarget);
        show();
        scene.overrideMaterial = null;

        // ブラー
        renderer.render(blurScene, screenCamera, blurRenderTarget);

        // 描画
        renderer.render(screenScene, screenCamera);

        // アニメーションループ
        requestAnimationFrame(animate);
    }

    // アニメーションの開始
    animate(performance ? performance.now() : Date.now());

}());
