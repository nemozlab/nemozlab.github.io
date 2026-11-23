(() => {
  const stage = document.querySelector('#demo-stage');
  const canvas = stage.querySelector('canvas');
  const preview = stage.querySelector('.demo-preview');
  const photo = preview.querySelector('.demo-product');
  const looseCard = stage.querySelector('.demo-loose-card');
  const next = document.querySelector('#demo-next');
  const stepLabel = next.querySelector('.step-label');
  const reset = document.querySelector('#demo-reset');
  const auto = document.querySelector('#demo-auto');
  const playback = document.querySelector('#demo-playback');
  const instruction = document.querySelector('#demo-instruction');
  const audio = document.querySelector('#demo-audio');
  const viewMenu = document.querySelector('.demo-views');
  const viewButtons = [...viewMenu.querySelectorAll('button')];
  const skinPanel = document.querySelector('.demo-skin');
  const skinToggle = document.querySelector('#demo-skin-toggle');
  const skinSwatches = [...skinPanel.querySelectorAll('[data-color]')];
  const photoViews = {
    front: 'cad-face.webp', top: 'cad-top.webp?v=button-icons', left: 'cad-left.webp?v=contrast',
    right: 'cad-right.webp?v=contrast', back: 'cad-back.webp',
    'back-right': 'cad-back-right.webp', 'back-left': 'cad-back-left.webp', 'front-left': 'cad-front-left.webp',
  };
  const horizontalViews = viewButtons.filter(button => button.hasAttribute('data-yaw'));
  const swipeViews = horizontalViews.map(button => button.dataset.view);
  let activeView = 'home';
  let selectModelView;
  let toggleModelSkin;
  let resetSkin;
  let rotateModel;
  let pickSkin;
  let cardNeedsStowing;
  const maxZoom = 1.75;
  let scale = 1;
  let pointer;
  let zoomModel;
  const touches = new Map();
  let pinchDistance;
  let dragged = false;
  const steps = [
    ['투명 전면 커버를 열어보세요.', '커버 열기'],
    ['열린 커버에서 NFC 피스를 위로 빼보세요.', '피스 빼기'],
    ['NFC 피스를 커버 안쪽 거치부에 넣어보세요.', '피스 넣기'],
    ['커버를 닫으면 앨범이 재생돼요.', '커버 닫기'],
  ];
  let step = 0;
  let drawModel;
  let playbackError = false;
  let playAttempt = 0;
  let transitioning = false;
  let automatic = false;
  let autoTimer;

  function syncControls() {
    next.setAttribute('aria-disabled', String(transitioning || automatic || step === steps.length));
    skinToggle.setAttribute('aria-disabled', String(transitioning || automatic));
    auto.setAttribute('aria-pressed', String(automatic));
  }

  function stopAutomatic() {
    clearTimeout(autoTimer);
    automatic = false;
    syncControls();
  }

  function queueStep(delay) {
    clearTimeout(autoTimer);
    if (automatic) autoTimer = setTimeout(advance, delay);
  }

  function moveModel(onComplete) {
    if (!drawModel) {
      onComplete?.();
      return;
    }
    transitioning = true;
    syncControls();
    drawModel(step, () => {
      transitioning = false;
      syncControls();
      onComplete?.();
    });
  }

  function show() {
    const playing = !audio.paused && !audio.ended;
    const complete = step === steps.length;
    const [message, action] = steps[step] || ['커버가 닫혔어요.', '완료'];
    instruction.textContent = playbackError ? '앨범을 재생할 수 없어요.' : message;
    playback.toggleAttribute('data-playing', playing);
    playback.title = playing ? '일시정지' : '앨범 재생';
    playback.setAttribute('aria-label', playback.title);
    syncControls();
    instruction.toggleAttribute('data-error', playbackError);
    next.toggleAttribute('data-complete', complete);
    stepLabel.textContent = complete ? action : `${step + 1}) ${action}`;
    next.setAttribute('aria-label', stepLabel.textContent);
    stage.setAttribute('aria-label', complete ? '네모 플레이어 3D 모델' : action);
    stage.dataset.step = step;
    if (!drawModel) {
      const image = step === 2 ? 'cad-demo-open-empty.webp?v=rounded-card' :
        step === 1 || step === 3 ? 'cad-cover-open.webp?v=rounded-card' : 'cad-home-45.webp';
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
    if (transitioning || step === steps.length) return;
    if (activeView !== 'home' && !drawModel) selectView('home');
    step += 1;
    moveModel(() => {
      if (step === steps.length) {
        stopAutomatic();
        play();
      } else {
        queueStep(430);
      }
    });
    show();
  }

  function togglePlayback() {
    if (audio.paused || audio.ended) {
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

  function selectView(name, resetZoom = false) {
    markView(name);
    if (selectModelView) selectModelView(name, resetZoom);
    else show();
  }

  function updateZoom(value) {
    scale = value;
    preview.style.transform = `scale(${scale})`;
  }

  viewMenu.hidden = false;

  for (const button of viewButtons) button.addEventListener('click', () => selectView(button.dataset.view));
  function toggleSkin() {
    if (!transitioning && !automatic) toggleModelSkin?.();
  }

  skinToggle.addEventListener('click', toggleSkin);
  stage.addEventListener('click', event => {
    if (!dragged || event.detail === 0) {
      if (event.detail > 0 && pickSkin?.(event)) toggleSkin();
      else if (!automatic) advance();
    }
    dragged = false;
  });

  function distanceBetweenTouches() {
    const [first, second] = touches.values();
    return Math.hypot(first.x - second.x, first.y - second.y);
  }

  function setZoom(value) {
    const zoom = Math.max(1, Math.min(maxZoom, value));
    updateZoom(zoom);
    zoomModel?.(zoom);
  }

  stage.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    stage.setPointerCapture(event.pointerId);
    if (event.pointerType === 'touch' && rotateModel) {
      touches.set(event.pointerId, {x: event.clientX, y: event.clientY});
      if (touches.size >= 2) {
        pointer = null;
        dragged = true;
        pinchDistance = distanceBetweenTouches();
        return;
      }
    }
    if (!event.isPrimary) return;
    dragged = false;
    pointer = {id: event.pointerId, x: event.clientX, y: event.clientY, lastX: event.clientX, lastY: event.clientY};
  });

  stage.addEventListener('pointermove', event => {
    if (touches.has(event.pointerId)) {
      touches.set(event.pointerId, {x: event.clientX, y: event.clientY});
      if (touches.size >= 2) {
        const distance = distanceBetweenTouches();
        if (pinchDistance > 0) setZoom(scale * distance / pinchDistance);
        pinchDistance = distance;
        return;
      }
    }
    if (event.pointerId !== pointer?.id) return;
    const dx = event.clientX - pointer.x;
    const dy = event.clientY - pointer.y;
    if (!dragged && Math.hypot(dx, dy) < 5) return;
    dragged = true;
    if (!rotateModel) return;
    const isTouch = event.pointerType === 'touch';
    if (isTouch) {
      pointer.horizontal ??= Math.abs(dx) > Math.abs(dy);
      if (!pointer.horizontal) return;
    }
    rotateModel((event.clientX - pointer.lastX) / 18, isTouch ? 0 : (event.clientY - pointer.lastY) / 18);
    pointer.lastX = event.clientX;
    pointer.lastY = event.clientY;
    stage.classList.add('is-dragging');
  });

  function finishPointer(event) {
    if (touches.delete(event.pointerId)) {
      pinchDistance = touches.size >= 2 ? distanceBetweenTouches() : undefined;
    }
    if (event.pointerId === pointer?.id) pointer = null;
    stage.classList.remove('is-dragging');
  }

  stage.addEventListener('pointerup', event => {
    if (!rotateModel && event.pointerId === pointer?.id) {
      const dx = event.clientX - pointer.x;
      const dy = event.clientY - pointer.y;
      if (Math.abs(dx) > 22 && Math.abs(dx) > Math.abs(dy)) {
        dragged = true;
        const index = Math.max(0, swipeViews.indexOf(activeView));
        selectView(swipeViews[(index + (dx < 0 ? 1 : swipeViews.length - 1)) % swipeViews.length]);
      }
    }
    finishPointer(event);
  });

  stage.addEventListener('pointercancel', event => {
    dragged = true;
    finishPointer(event);
  });

  stage.addEventListener('wheel', event => {
    if ((!event.ctrlKey && !event.metaKey) || event.deltaY === 0) return;
    event.preventDefault();
    setZoom(scale * (event.deltaY < 0 ? 1.12 : 1 / 1.12));
  }, {passive: false});

  stage.addEventListener('keydown', event => {
    if (!event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey &&
        (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      window.scrollBy(0, event.key === 'ArrowDown' ? 40 : -40);
      return;
    }
    const movement = {ArrowLeft: [-1, 0], ArrowRight: [1, 0]};
    if (event.shiftKey) Object.assign(movement, {ArrowUp: [0, -1], ArrowDown: [0, 1]});
    if (!movement[event.key] || !rotateModel) return;
    event.preventDefault();
    rotateModel(...movement[event.key]);
  });
  next.addEventListener('click', () => {
    if (!automatic) advance();
  });

  function restart(onComplete) {
    playAttempt += 1;
    audio.pause();
    audio.currentTime = 0;
    playbackError = false;
    const cardIsOut = cardNeedsStowing?.();
    selectView('home', true);
    resetSkin?.();
    if (!drawModel) updateZoom(1);
    step = 0;
    if (cardIsOut && drawModel) {
      transitioning = true;
      syncControls();
      drawModel(3, () => moveModel(onComplete));
    } else {
      moveModel(onComplete);
    }
    show();
  }

  reset.addEventListener('click', () => {
    stopAutomatic();
    restart();
  });
  auto.addEventListener('click', () => {
    if (automatic) {
      stopAutomatic();
      return;
    }
    automatic = true;
    syncControls();
    restart(() => queueStep(250));
  });
  playback.addEventListener('click', togglePlayback);

  for (const event of ['playing', 'pause', 'ended']) audio.addEventListener(event, show);
  stage.disabled = false;
  next.hidden = reset.hidden = auto.hidden = playback.hidden = false;
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
    const coverOpening = THREE.MathUtils.degToRad(35);
    const views = Object.fromEntries(horizontalViews.map(({dataset: {view, yaw}}) => [
      view, [THREE.MathUtils.degToRad(Number(yaw)), Number(yaw) % 90 === 0 ? 0 : .35],
    ]));
    views.top = [0, Math.PI / 2 - .001];
    const viewTarget = new THREE.Vector3(0, -2, 0);
    const cameraDirection = new THREE.Vector3();
    const modelMeshes = [];
    scene.traverse(object => {
      if (!object.isMesh) return;
      object.geometry.computeBoundingBox();
      modelMeshes.push(object);
    });
    const frameBounds = new THREE.Box3();
    const meshBounds = new THREE.Box3();
    const viewMatrix = new THREE.Matrix4();
    let aspect = 1;

    function frameModel() {
      scene.updateMatrixWorld(true);
      camera.updateMatrixWorld(true);
      frameBounds.makeEmpty();
      for (const mesh of modelMeshes) {
        viewMatrix.multiplyMatrices(camera.matrixWorldInverse, mesh.matrixWorld);
        meshBounds.copy(mesh.geometry.boundingBox).applyMatrix4(viewMatrix);
        frameBounds.union(meshBounds);
      }
      const {min, max} = frameBounds;
      const centerX = (min.x + max.x) / 2;
      const centerY = (min.y + max.y) / 2;
      const height = Math.max(62, (max.y - min.y) / .88, (max.x - min.x) / (.9 * aspect));
      const halfWidth = height * aspect / 2;
      camera.left = centerX - halfWidth;
      camera.right = centerX + halfWidth;
      camera.top = centerY + height / 2;
      camera.bottom = centerY - height / 2;
      camera.updateProjectionMatrix();
    }
    let cameraFrame;
    function placeCamera(yaw, pitch) {
      const radius = 170;
      const horizontal = radius * Math.cos(pitch);
      camera.position.set(horizontal * Math.sin(yaw), -horizontal * Math.cos(yaw), radius * Math.sin(pitch)).add(viewTarget);
    }

    function setCameraView(name, resetZoom = false) {
      cancelAnimationFrame(cameraFrame);
      const [yaw, pitch] = views[name];
      cameraDirection.copy(camera.position).sub(viewTarget);
      const length = cameraDirection.length();
      if (reducedMotion.matches || length < 1 || !stage.classList.contains('has-model')) {
        placeCamera(yaw, pitch);
        if (resetZoom) {
          camera.zoom = 1;
          updateZoom(1);
        }
        render();
        return;
      }

      const startYaw = Math.atan2(cameraDirection.x, -cameraDirection.y);
      const startPitch = Math.asin(THREE.MathUtils.clamp(cameraDirection.z / length, -1, 1));
      const deltaYaw = Math.atan2(Math.sin(yaw - startYaw), Math.cos(yaw - startYaw));
      const startZoom = camera.zoom;
      const start = performance.now();
      function tick(now) {
        const t = Math.min((now - start) / 460, 1);
        const ease = t * t * (3 - 2 * t);
        placeCamera(startYaw + deltaYaw * ease, startPitch + (pitch - startPitch) * ease);
        if (resetZoom) {
          camera.zoom = startZoom + (1 - startZoom) * ease;
          updateZoom(camera.zoom);
        }
        render();
        if (t < 1) cameraFrame = requestAnimationFrame(tick);
      }
      cameraFrame = requestAnimationFrame(tick);
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
      camera.lookAt(viewTarget);
      frameModel();
      renderer.render(scene, camera);
    }
    function update(state, onComplete) {
      cancelAnimationFrame(frame);
      const from = [coverAngle, cardOffset, skinLift];
      const targets = [state > 0 && state < 4 ? coverOpening : 0, state === 2 ? 1 : 0, skinDetached ? 36 : 0];
      if (reducedMotion.matches || from.every((n, i) => n === targets[i])) {
        [coverAngle, cardOffset, skinLift] = targets;
        render();
        onComplete?.();
        return;
      }
      const start = performance.now();
      function tick(now) {
        const t = Math.min((now - start) / 460, 1);
        const ease = t * t * (3 - 2 * t);
        [coverAngle, cardOffset, skinLift] = from.map((value, i) => value + (targets[i] - value) * ease);
        render();
        if (t < 1) frame = requestAnimationFrame(tick);
        else onComplete?.();
      }
      frame = requestAnimationFrame(tick);
    }

    function resize() {
      const {width, height} = stage.getBoundingClientRect();
      if (!width || !height) return;
      aspect = width / height;
      renderer.setSize(width, height, false);
      render();
    }

    selectModelView = setCameraView;
    rotateModel = (dx, dy) => {
      cancelAnimationFrame(cameraFrame);
      cameraDirection.copy(camera.position).sub(viewTarget);
      const yaw = Math.atan2(cameraDirection.x, -cameraDirection.y) - dx * .14;
      const pitch = Math.max(-1.42, Math.min(1.42, Math.asin(cameraDirection.z / cameraDirection.length()) + dy * .14));
      placeCamera(yaw, pitch);
      markView(null);
      render();
    };
    function setSkinDetached(value) {
      skinDetached = value;
      skinToggle.setAttribute('aria-pressed', String(value));
      skinToggle.textContent = value ? '스킨 끼우기' : '스킨 분리';

    }
    function setSkinColor(selected) {
      const color = Number.parseInt(selected.dataset.color, 16);
      skinMaterial.color.setHex(color);
      if (selected !== skinSwatches[0]) skinMaterial.color.convertSRGBToLinear();
      for (const swatch of skinSwatches) swatch.setAttribute('aria-pressed', String(swatch === selected));
      render();
    }
    toggleModelSkin = () => {
      setSkinDetached(!skinDetached);
      if (skinDetached && activeView === 'top') selectView('home');
      update(step);
    };
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
    cardNeedsStowing = () => cardOffset > .001;
    skinPanel.hidden = false;
    stage.classList.add('has-model');
    const observer = new ResizeObserver(resize);
    observer.observe(stage);
    canvas.addEventListener('webglcontextlost', () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      cancelAnimationFrame(cameraFrame);
      zoomModel = null;
      transitioning = false;
      stopAutomatic();
      selectModelView = toggleModelSkin = resetSkin = rotateModel = pickSkin = cardNeedsStowing = null;
      stage.classList.remove('has-model');
      skinPanel.hidden = true;
      drawModel = null;
      canvas.hidden = true;
      preview.hidden = false;
      selectView('home');
    });
    drawModel = update;
    canvas.hidden = false;
    preview.hidden = true;
    zoomModel = zoom => {
      cancelAnimationFrame(cameraFrame);
      camera.zoom = zoom;
      render();
    };
    camera.zoom = scale;
    placeCamera(...views.home);
    setCameraView(views[activeView] ? activeView : 'home');
    resize();
    update(step);
  }

  function showPhotoPreview() {
    preview.hidden = false;
  }

  if (window.THREE) loadModel(window.THREE).catch(showPhotoPreview);
  else showPhotoPreview();
})();
