(() => {
  const stage = document.querySelector('#demo-stage');
  const canvas = stage.querySelector('canvas');
  const preview = stage.querySelector('.demo-preview');
  const photo = preview.querySelector('.demo-product');
  const looseCard = stage.querySelector('.demo-loose-card');
  const next = document.querySelector('#demo-next');
  const reset = document.querySelector('#demo-reset');
  const instruction = document.querySelector('#demo-instruction');
  const audio = document.querySelector('#demo-audio');
  const rotateHint = document.querySelector('.demo-rotate-hint');
  const viewMenu = document.querySelector('.demo-views');
  const viewButtons = [...viewMenu.querySelectorAll('button')];
  const skinPanel = document.querySelector('.demo-skin');
  const skinToggle = document.querySelector('#demo-skin-toggle');
  const skinSwatches = [...skinPanel.querySelectorAll('[data-color]')];
  const photoViews = {
    front: 'cad-face.webp', top: 'cad-top.webp?v=button-icons', left: 'cad-left.webp?v=contrast',
    right: 'cad-right.webp?v=contrast', back: 'cad-back.webp',
  };
  const swipeViews = ['home', 'right', 'back', 'left', 'front'];
  let activeView = 'home';
  let selectModelView;
  let toggleModelSkin;
  let resetSkin;
  let rotateWithKeys;
  let pickSkin;
  const zoomControls = document.querySelector('.demo-zoom');
  const zoomOut = document.querySelector('#demo-zoom-out');
  const zoomIn = document.querySelector('#demo-zoom-in');
  const zoomLevels = [1, 1.2, 1.45, 1.75];
  let scale = 1;
  let zoomModel;
  let pointer;
  let dragged = false;
  const steps = [
    ['투명 전면 커버를 열어보세요.', '커버 열기'],
    ['열린 커버에서 NFC 피스를 위로 빼보세요.', '피스 빼기'],
    ['NFC 피스를 커버 안쪽 거치부에 넣어보세요.', '피스 넣기'],
    ['커버를 닫으면 앨범이 재생돼요.', '커버 닫고 앨범 재생'],
  ];
  let step = 0;
  let drawModel;
  let playbackError = false;
  let playAttempt = 0;

  function show() {
    const playing = !audio.paused && !audio.ended;
    const [message, action] = steps[step] || [
      playbackError ? '앨범을 재생할 수 없어요.' : playing ? '앨범 재생 중' : '',
      playing ? '일시정지' : '앨범 재생',
    ];
    instruction.textContent = message;
    next.textContent = action;
    stage.setAttribute('aria-label', action);
    stage.dataset.step = step;
    if (drawModel) {
      drawModel(step);
    } else {
      const image = step === 2 ? 'cad-demo-open-empty.webp?v=rounded-card' :
        step === 1 || step === 3 ? 'cad-cover-open.webp?v=rounded-card' : 'cad-front.webp?v=rounded-card';
      photo.src = 'images/' + (photoViews[activeView] || image);
      looseCard.hidden = step !== 2 || activeView !== 'home';
    }
  }

  function play() {
    const attempt = ++playAttempt;
    playbackError = false;
    if (audio.ended) audio.currentTime = 0;
    audio.play().catch(() => {
      if (attempt !== playAttempt) return;
      playbackError = true;
      show();
    });
  }

  function advance() {
    if (step < steps.length) {
      if (!drawModel) selectView('home');
      step += 1;
      if (step === steps.length) play();
    } else if (audio.paused || audio.ended) {
      play();
    } else {
      playAttempt += 1;
      audio.pause();
    }
    show();
  }

  function markView(name) {
    activeView = name;
    for (const button of viewButtons) button.setAttribute('aria-pressed', String(button.dataset.view === name));
  }

  function selectView(name) {
    markView(name);
    if (selectModelView) selectModelView(name);
    else show();
  }

  function updateZoom(value) {
    scale = value;
    preview.style.transform = `scale(${scale})`;
    zoomOut.disabled = scale <= zoomLevels[0] + .001;
    zoomIn.disabled = scale >= zoomLevels.at(-1) - .001;
  }

  function setZoom(value) {
    updateZoom(value);
    zoomModel?.(value);
  }

  zoomOut.addEventListener('click', () => setZoom(zoomLevels.filter(level => level < scale - .001).at(-1) ?? 1));
  zoomIn.addEventListener('click', () => setZoom(zoomLevels.find(level => level > scale + .001) ?? zoomLevels.at(-1)));
  zoomControls.hidden = viewMenu.hidden = false;

  for (const button of viewButtons) button.addEventListener('click', () => selectView(button.dataset.view));
  skinToggle.addEventListener('click', () => toggleModelSkin?.());
  stage.addEventListener('click', event => {
    if (!dragged || event.detail === 0) {
      if (event.detail > 0 && pickSkin?.(event)) toggleModelSkin();
      else advance();
    }
    dragged = false;
  });

  stage.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    if (!event.isPrimary) {
      dragged = true;
      return;
    }
    dragged = false;
    pointer = {id: event.pointerId, x: event.clientX, y: event.clientY};
    if (!drawModel) stage.setPointerCapture(pointer.id);
  });
  stage.addEventListener('pointermove', event => {
    if (event.pointerId !== pointer?.id) return;
    if (Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) < 5) return;
    dragged = true;
    if (drawModel) {
      markView(null);
      stage.classList.add('is-dragging');
    }
  });
  stage.addEventListener('pointerup', event => {
    if (event.pointerId !== pointer?.id) return;
    const dx = event.clientX - pointer.x;
    const dy = event.clientY - pointer.y;
    if (!drawModel && Math.abs(dx) > 22 && Math.abs(dx) > Math.abs(dy)) {
      const index = Math.max(0, swipeViews.indexOf(activeView));
      selectView(swipeViews[(index + (dx < 0 ? 1 : swipeViews.length - 1)) % swipeViews.length]);
    }
    pointer = null;
    stage.classList.remove('is-dragging');
  });
  stage.addEventListener('pointercancel', () => {
    pointer = null;
    dragged = true;
    stage.classList.remove('is-dragging');
  });
  stage.addEventListener('wheel', event => {
    if (drawModel || event.deltaY === 0) return;
    event.preventDefault();
    const value = Math.max(1, Math.min(zoomLevels.at(-1), scale * (event.deltaY < 0 ? 1.12 : 1 / 1.12)));
    setZoom(value);
  }, {passive: false});

  stage.addEventListener('keydown', event => {
    const movement = {ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1]};
    if (!movement[event.key] || !rotateWithKeys) return;
    event.preventDefault();
    rotateWithKeys(...movement[event.key]);
  });
  next.addEventListener('click', advance);
  reset.addEventListener('click', () => {
    playAttempt += 1;
    audio.pause();
    audio.currentTime = 0;
    playbackError = false;
    step = 0;
    selectView('home');
    resetSkin?.();
    setZoom(zoomLevels[0]);
    show();
    next.focus();
  });

  for (const event of ['playing', 'pause', 'ended']) audio.addEventListener(event, show);
  stage.disabled = false;
  next.hidden = reset.hidden = false;
  show();

  async function loadModel(THREE) {
    async function readParts(url) {
      const response = await fetch(url);
      if (!response.ok) throw new Error('Could not load the model');
      return response.json();
    }
    const [parts, controls, artwork] = await Promise.all([
      readParts('../parts.json'),
      readParts('control-parts.json'),
      new THREE.TextureLoader().loadAsync('images/card.webp?v=mymy'),
    ]);
    const renderer = new THREE.WebGLRenderer({canvas, alpha: true, antialias: true});
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    artwork.encoding = THREE.sRGBEncoding;
    artwork.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-58, 58, 43, -43, 1, 400);
    camera.up.set(0, 0, 1);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x9bafbc, .62));
    const key = new THREE.DirectionalLight(0xffffff, .49);
    key.position.set(-75, -80, 135);
    const rearLight = new THREE.DirectionalLight(0xffffff, .34);
    rearLight.position.set(65, 110, 100);
    scene.add(key, rearLight);

    const shell = new THREE.MeshStandardMaterial({color: 0xc5cad0, roughness: .94, side: THREE.DoubleSide});
    const glass = new THREE.MeshPhysicalMaterial({
      color: 0x829ba8, roughness: .60, metalness: 0,
      transparent: true, opacity: .25, depthWrite: false,
    });
    const rotation = new THREE.Matrix4().makeBasis(
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 1, 0),
    );
    const decode = (base64, ArrayType) => new ArrayType(Uint8Array.from(atob(base64), c => c.charCodeAt(0)).buffer);
    function mesh(id, material) {
      const part = parts[id];
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(decode(part.v, Float32Array), 3));
      geometry.setIndex(new THREE.BufferAttribute(decode(part.f, part.wide ? Uint32Array : Uint16Array), 1));
      if (part.n) geometry.setAttribute('normal', new THREE.BufferAttribute(decode(part.n, Float32Array), 3));
      else geometry.computeVertexNormals();
      geometry.applyMatrix4(rotation);
      return new THREE.Mesh(geometry, material);
    }
    function controlMesh(name, material) {
      const part = controls[name];
      const geometry = new THREE.BufferGeometry();
      const positions = Float32Array.from(decode(part.v, Int16Array), value => value / 512);
      const normals = Float32Array.from(decode(part.n, Int16Array), value => value / 32767);
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
      geometry.setIndex(new THREE.BufferAttribute(decode(part.f, Uint16Array), 1));
      return new THREE.Mesh(geometry, material);
    }
    const wheelMaterial = new THREE.MeshStandardMaterial({color: 0xa5a9ae, roughness: .92, side: THREE.DoubleSide});
    const portMaterial = new THREE.MeshStandardMaterial({color: 0x4b5058, roughness: .89, side: THREE.DoubleSide});
    const ledMaterial = new THREE.MeshStandardMaterial({color: 0x9cc6ca, roughness: .75, side: THREE.DoubleSide});
    const skinMaterial = shell.clone();
    const skin = mesh('16', skinMaterial);
    for (const id of ['0', '1']) scene.add(mesh(id, shell));
    scene.add(skin);
    scene.add(mesh('13', portMaterial));
    const buttons = new THREE.MeshStandardMaterial({color: 0xaab2ba, roughness: .94, side: THREE.DoubleSide});
    scene.add(controlMesh('buttons', buttons), controlMesh('power', buttons));
    scene.add(controlMesh('wheel', wheelMaterial), controlMesh('usb', portMaterial), controlMesh('led', ledMaterial));

    function buttonIcon(type) {
      const artwork = document.createElement('canvas');
      artwork.width = artwork.height = 128;
      const ink = artwork.getContext('2d');
      ink.fillStyle = '#5d656b';
      function triangle(x, direction) {
        ink.beginPath();
        ink.moveTo(x, 38);
        ink.lineTo(x + direction * 37, 64);
        ink.lineTo(x, 90);
        ink.closePath();
        ink.fill();
      }
      if (type === 'play') {
        triangle(22, 1);
        ink.fillRect(72, 38, 9, 52);
        ink.fillRect(91, 38, 9, 52);
      } else if (type === 'previous') {
        triangle(92, -1);
        ink.fillRect(34, 38, 10, 52);
      } else {
        triangle(36, 1);
        ink.fillRect(84, 38, 10, 52);
      }
      const texture = new THREE.CanvasTexture(artwork);
      texture.encoding = THREE.sRGBEncoding;
      return new THREE.Mesh(
        new THREE.PlaneGeometry(4.8, 4.8),
        new THREE.MeshBasicMaterial({map: texture, transparent: true, alphaTest: .3}),
      );
    }
    for (const [type, x] of [['previous', -10.2], ['play', 0], ['next', 10.2]]) {
      const icon = buttonIcon(type);
      icon.position.set(x, 9.6, 27.31);
      scene.add(icon);
    }


    // The front door swings around the lower horizontal edge of the CAD mesh.
    const hinge = new THREE.Group();
    hinge.position.set(0, 2.2, -24);
    scene.add(hinge);
    const door = controlMesh('door', glass);
    door.position.copy(hinge.position).negate();
    door.renderOrder = 1;
    hinge.add(door);

    const cardWidth = 60;
    const cardHeight = 40;
    const cardRadius = 2;
    const cardThickness = 1;
    const halfWidth = cardWidth / 2;
    const halfHeight = cardHeight / 2;
    const outline = new THREE.Shape();
    outline.moveTo(-halfWidth + cardRadius, -halfHeight);
    outline.lineTo(halfWidth - cardRadius, -halfHeight);
    outline.quadraticCurveTo(halfWidth, -halfHeight, halfWidth, -halfHeight + cardRadius);
    outline.lineTo(halfWidth, halfHeight - cardRadius);
    outline.quadraticCurveTo(halfWidth, halfHeight, halfWidth - cardRadius, halfHeight);
    outline.lineTo(-halfWidth + cardRadius, halfHeight);
    outline.quadraticCurveTo(-halfWidth, halfHeight, -halfWidth, halfHeight - cardRadius);
    outline.lineTo(-halfWidth, -halfHeight + cardRadius);
    outline.quadraticCurveTo(-halfWidth, -halfHeight, -halfWidth + cardRadius, -halfHeight);

    const cardGeometry = new THREE.ExtrudeGeometry(outline, {
      depth: cardThickness, bevelEnabled: false, curveSegments: 8,
    });
    cardGeometry.translate(0, 0, -cardThickness / 2);
    const positions = cardGeometry.getAttribute('position');
    const uv = cardGeometry.getAttribute('uv');
    for (let i = 0; i < positions.count; i++) {
      uv.setXY(i, positions.getX(i) / cardWidth + .5, positions.getY(i) / cardHeight + .5);
    }
    const card = new THREE.Mesh(cardGeometry, [
      new THREE.MeshBasicMaterial({map: artwork}),
      new THREE.MeshStandardMaterial({color: 0x3b2720, roughness: .92}),
    ]);
    scene.add(card);

    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    let frame;
    let coverAngle = 0;
    let skinLift = 0;
    let skinDetached = false;
    let cardOffset = 0;
    let viewShift = 0;
    let viewHeight = 0;
    const coverOpening = THREE.MathUtils.degToRad(35);
    const homeYaw = .54;
    const homePitch = .35;
    const views = {
      home: [homeYaw, homePitch], front: [0, 0], top: [0, Math.PI / 2 - .001],
      left: [-Math.PI / 2, 0], right: [Math.PI / 2, 0], back: [Math.PI, 0],
    };
    const orbit = new THREE.OrbitControls(camera, canvas);
    orbit.enablePan = false;
    orbit.minZoom = 1;
    orbit.maxZoom = zoomLevels.at(-1);
    orbit.target.set(0, -2, 0);
    orbit.addEventListener('change', () => {
      updateZoom(camera.zoom);
      renderer.render(scene, camera);
    });
    const cameraDirection = new THREE.Vector3();
    const target = new THREE.Vector3();
    function setCameraView(name) {
      const [yaw, pitch] = views[name];
      const radius = 170;
      const horizontal = radius * Math.cos(pitch);
      camera.position.set(viewShift + horizontal * Math.sin(yaw), -2 - horizontal * Math.cos(yaw), viewHeight + radius * Math.sin(pitch));
      orbit.update();
    }
    const slot = new THREE.Vector3(0, 2.6, -.85).sub(hinge.position);
    const stowedPosition = new THREE.Vector3(65, -19, 6);
    const axis = new THREE.Vector3(1, 0, 0);
    const cardPosition = new THREE.Vector3();
    const slide = new THREE.Vector3();
    function render() {
      hinge.rotation.x = coverAngle;
      cardPosition.copy(slot).applyAxisAngle(axis, coverAngle).add(hinge.position);
      slide.set(0, 0, 23 * Math.sin(Math.PI * cardOffset)).applyAxisAngle(axis, coverAngle);
      card.position.copy(cardPosition).lerp(stowedPosition, cardOffset).add(slide);
      card.rotation.x = Math.PI / 2 + coverAngle * (1 - cardOffset);
      skin.position.z = skinLift;
      target.set(viewShift, -2, viewHeight);
      camera.position.sub(orbit.target).add(target);
      orbit.target.copy(target);
      orbit.update();
      renderer.render(scene, camera);
    }
    function update(state) {
      cancelAnimationFrame(frame);
      const from = [coverAngle, cardOffset, viewShift, skinLift, viewHeight];
      const targets = [state > 0 && state < 4 ? coverOpening : 0, state === 2 ? 1 : 0, state === 2 ? 25 : 0, skinDetached ? 36 : 0, skinDetached ? 13 : 0];
      if (reducedMotion.matches || from.every((n, i) => n === targets[i])) {
        [coverAngle, cardOffset, viewShift, skinLift, viewHeight] = targets;
        render();
        return;
      }
      const start = performance.now();
      function tick(now) {
        const t = Math.min((now - start) / 460, 1);
        const ease = t * t * (3 - 2 * t);
        [coverAngle, cardOffset, viewShift, skinLift, viewHeight] = from.map((value, i) => value + (targets[i] - value) * ease);
        render();
        if (t < 1) frame = requestAnimationFrame(tick);
      }
      frame = requestAnimationFrame(tick);
    }

    function resize() {
      const {width, height} = stage.getBoundingClientRect();
      const aspect = width / height;
      const span = Math.max(104, 150 / aspect);
      camera.left = -span * aspect / 2;
      camera.right = span * aspect / 2;
      camera.top = span / 2;
      camera.bottom = -span / 2;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      render();
    }

    selectModelView = setCameraView;
    rotateWithKeys = (dx, dy) => {
      cameraDirection.copy(camera.position).sub(orbit.target);
      const yaw = Math.atan2(cameraDirection.x, -cameraDirection.y) - dx * .14;
      const pitch = Math.max(-1.42, Math.min(1.42, Math.asin(cameraDirection.z / cameraDirection.length()) + dy * .14));
      camera.position.set(viewShift + 170 * Math.cos(pitch) * Math.sin(yaw), -2 - 170 * Math.cos(pitch) * Math.cos(yaw), viewHeight + 170 * Math.sin(pitch));
      markView(null);
      orbit.update();
    };
    function setSkinDetached(value) {
      skinDetached = value;
      skinToggle.setAttribute('aria-pressed', String(value));
      skinToggle.textContent = value ? '스킨 끼우기' : '스킨 분리';
      if (value && activeView === 'top') selectView('home');
      update(step);
    }
    function setSkinColor(selected) {
      const color = Number.parseInt(selected.dataset.color, 16);
      skinMaterial.color.setHex(color);
      if (selected !== skinSwatches[0]) skinMaterial.color.convertSRGBToLinear();
      for (const swatch of skinSwatches) swatch.setAttribute('aria-pressed', String(swatch === selected));
      render();
    }
    toggleModelSkin = () => setSkinDetached(!skinDetached);
    resetSkin = () => {
      setSkinDetached(false);
      setSkinColor(skinSwatches[0]);
    };
    for (const swatch of skinSwatches) swatch.addEventListener('click', () => setSkinColor(swatch));
    const ray = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    pickSkin = event => {
      const bounds = canvas.getBoundingClientRect();
      mouse.set(2 * (event.clientX - bounds.left) / bounds.width - 1, 1 - 2 * (event.clientY - bounds.top) / bounds.height);
      ray.setFromCamera(mouse, camera);
      return ray.intersectObjects(scene.children, true)[0]?.object === skin;
    };
    skinPanel.hidden = false;
    rotateHint.hidden = false;
    stage.classList.add('has-model');
    const observer = new ResizeObserver(resize);
    observer.observe(stage);
    canvas.addEventListener('webglcontextlost', () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      orbit.dispose();
      selectModelView = toggleModelSkin = resetSkin = rotateWithKeys = pickSkin = null;
      stage.classList.remove('has-model');
      rotateHint.hidden = skinPanel.hidden = true;
      zoomModel = null;
      drawModel = null;
      canvas.hidden = true;
      preview.hidden = false;
      selectView('home');
    });
    drawModel = update;
    canvas.hidden = false;
    preview.hidden = true;
    zoomModel = scale => {
      camera.zoom = scale;
      camera.updateProjectionMatrix();
      render();
    };
    camera.zoom = scale;
    setCameraView(views[activeView] ? activeView : 'home');
    resize();
    update(step);
  }

  if (window.THREE?.OrbitControls) loadModel(window.THREE).catch(() => {
    // The same controls stay available on devices using the photo preview.
  });
})();
