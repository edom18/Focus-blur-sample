(function () {

    'use strict';

    var BLUR_VS = `
        varying vec2 vUV;
        void main() {
            vUV = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `;

    var BLUR_FS = `
        uniform sampler2D texture;
        uniform vec2 renderSize;
        uniform float blur;

        varying vec2 vUV;

        vec4 blurColor() {
            vec4 destColor = vec4(0.0);

            const int blurPixel = 10;
            const int blurW = blurPixel;
            const int blurH = blurPixel;

            float maxLevel = float((blurPixel - 1) / 2);
            float total = 0.0;

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


    // レンダラを生成
    var renderer = new THREE.WebGLRenderer({antialias: true});
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;

    window.addEventListener('resize', function () {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }, false);

    document.body.appendChild(renderer.domElement);


    //////////////////////////////////////////////////
    // サブシーン

    // レンダーターゲット
    var width  = window.innerWidth;
    var height = window.innerHeight;

    var renderTarget = new THREE.WebGLRenderTarget(width, height, {
        magFilter: THREE.NearestFilter,
        minFilter: THREE.NearestFilter,
        wrapS: THREE.ClampToEdgeWrapping,
        wrapT: THREE.ClampToEdgeWrapping
    });

    var screenScene = new THREE.Scene();

    var screenCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);

    var screenGeo = new THREE.PlaneGeometry(1, 1);
    var uniforms = {
        texture: { type: 't', value: renderTarget },
        renderSize: { type: 'v2', value: new THREE.Vector2(width, height) },
        blur: { type: 'f', value: 0 }
    };

    var screenMat = new THREE.ShaderMaterial({
        uniforms: uniforms,
        vertexShader: BLUR_VS,
        fragmentShader: BLUR_FS
    });

    var screen = new THREE.Mesh(screenGeo, screenMat);
    screen.position.z = -1;

    screenScene.add(screenCamera);
    screenScene.add(screen);

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

    // ベッド
    var bedLoader = new THREE.JSONLoader();
    bedLoader.load('models/bed.json', function (geometry, materials) {
        var material = new THREE.MeshFaceMaterial(materials);
        var bed = new THREE.Mesh(geometry, material);
        var s = 0.5;
        bed.scale.set(s, s, s);
        bed.castShadow = true;
        bed.receiveShadow = true;
        bed.renderOrder = 10;
        scene.add(bed);
    });

    var tableLoader = new THREE.JSONLoader();
    tableLoader.load('models/table.json', function (geometry, materials) {
        var material = new THREE.MeshFaceMaterial(materials);
        var table = new THREE.Mesh(geometry, material);
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


    var floorTextureLoader = new THREE.TextureLoader();
    floorTextureLoader.load('models/Sapele Mahogany.jpg', function (texture) {
        texture.repeat.set(4, 4);

        var planeGeo = new THREE.PlaneGeometry(5, 5);
        var planeMat = new THREE.MeshLambertMaterial({
            color: 0xffffff,
            map: texture
        });
        var plane = new THREE.Mesh(planeGeo, planeMat);
        plane.receiveShadow = true;
        plane.rotation.x = -Math.PI / 2;
        // plane.position.y = 0.3;
        scene.add(plane);
    });

    var planeGeo = new THREE.PlaneGeometry(5, 2.5);
    var planeMat = new THREE.MeshLambertMaterial({
        color: 0xffffff
    });
    var plane = new THREE.Mesh(planeGeo, planeMat);
    plane.position.z = -2.5;
    plane.position.y = 1.25;
    scene.add(plane);

    var leftWall = plane.clone();
    leftWall.position.z = 0;
    leftWall.position.x = -2.5;
    leftWall.rotation.y = Math.PI / 2;
    scene.add(leftWall);

    var rightWall = plane.clone();
    rightWall.position.z = 0;
    rightWall.position.x = 2.5;
    rightWall.rotation.y = -Math.PI / 2;
    scene.add(rightWall);



    //////////////////////////////////////////////////

    // アニメーションループ
    function animate(timestamp) {
        // renderer.render(scene, subCamera, renderTarget);
        renderer.render(scene, camera);

        // アニメーションループ
        requestAnimationFrame(animate);
    }

    // アニメーションの開始
    animate(performance ? performance.now() : Date.now());

}());
