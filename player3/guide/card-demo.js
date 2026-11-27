(() => {
  const designMode = document.documentElement.classList.contains('player-design');
  const variant = document.documentElement.dataset.design;
  const designCard = document.querySelector('#design-card');
  let showDesignCard;
  if (designMode) {
    document.querySelector('#title').textContent = '네모 플레이어 디자인';
    document.querySelector('.player-nav .guide-link').removeAttribute('aria-current');
    document.querySelector('.player-nav .design-link').setAttribute('aria-current', 'page');
    const variantLink = document.querySelector(`[data-design-link="${variant}"]`);
    variantLink.setAttribute('aria-current', 'page');
    if (variant === 'artist') {
      document.querySelector('#design-pending').hidden = false;
      return;
    }
    designCard.disabled = true;
    designCard.addEventListener('click', () => {
      const attached = designCard.getAttribute('aria-pressed') !== 'true';
      designCard.setAttribute('aria-pressed', String(attached));
      designCard.textContent = attached ? '카드 빼기' : '카드 장착';
      showDesignCard(attached);
    });
  }

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
  const trackLabel = document.querySelector('.demo-track');
  const trackControls = document.querySelectorAll('[data-track-direction]');
  const tracks = [
    {src: audio.getAttribute('src'), label: trackLabel.textContent},
    {src: 'audio/yongyong-panorama-demo.mp3', label: '용용 · 소녀의 파노라마 (feat. 기욱 (ONEWE)) · 30초'},
    {src: 'audio/yongyong-monday-demo.mp3', label: '용용 · 월요병 · 30초'},
    {src: 'audio/yongyong-orange-sunny-angel-demo.mp3', label: '용용 · 오렌지 태양을 삼킨 천사 · 30초'},
    {src: 'audio/yongyong-rainy-night-demo.mp3', label: '용용 · 밤비 : Rainy night · 30초'},
  ];
  let trackIndex = 0;
  const viewMenu = document.querySelector('.demo-views');
  const viewButtons = [...viewMenu.querySelectorAll('button')];
  const skinPanel = document.querySelector('.demo-skin');
  const skinToggle = document.querySelector('#demo-skin-toggle');
  const skinSwatches = [...skinPanel.querySelectorAll('[data-color]')];
  const photoViews = {
    front: 'cad-face.webp', top: 'top-drawing.webp', left: 'cad-left.webp?v=contrast',
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
  let pickModelPart;
  let cardNeedsStowing;
  const minZoom = .55;
  const maxZoom = 3;
  const zoomFactor = 1.12;
  let scale = 1;
  let pointer;
  let zoomModel;
  let panModel;
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

  function canPlay() {
    return !transitioning && (step === 0 || step === steps.length);
  }

  function syncControls() {
    next.setAttribute('aria-disabled', String(transitioning || automatic));
    skinToggle.setAttribute('aria-disabled', String(transitioning || automatic));
    auto.setAttribute('aria-pressed', String(automatic));
    playback.disabled = !canPlay();
    for (const button of trackControls) button.disabled = playback.disabled;
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
    const [message, action] = steps[step] || ['커버가 닫혔어요.', '커버 다시 열기'];
    instruction.textContent = playbackError ? '앨범을 재생할 수 없어요.' : message;
    playback.toggleAttribute('data-playing', playing);
    playback.title = playing ? '일시정지' : '앨범 재생';
    playback.setAttribute('aria-label', playback.title);
    syncControls();
    instruction.toggleAttribute('data-error', playbackError);
    if (!complete || !transitioning) {
      stepLabel.textContent = `${step + 1}. ${action}`;
      next.setAttribute('aria-label', stepLabel.textContent);
    }
    stage.setAttribute('aria-label', designMode ? '네모 플레이어 디자인 3D 모델' : action);
    stage.dataset.step = step;
    if (!drawModel) {
      const image = step === 2 ? 'cad-demo-open-empty.webp?v=rounded-card' :
        step === 1 || step === 3 ? 'cad-cover-open.webp?v=rounded-card' : 'cad-home-45.webp';
      photo.src = 'images/' + (photoViews[activeView] || image);
      looseCard.hidden = step !== 2 || activeView !== 'home';
    }
  }

  function play() {
    if (!canPlay()) return;
    const attempt = ++playAttempt;
    playbackError = false;
    if (audio.ended) audio.currentTime = 0;
    audio.play().catch(() => {
      if (attempt !== playAttempt) return;
      playbackError = true;
      show();
    });
  }

  function pausePlayback() {
    playAttempt += 1;
    audio.pause();
  }

  function advance() {
    if (transitioning) return;
    if (activeView !== 'home' && !drawModel) selectView('home');
    if (step === steps.length) {
      pausePlayback();
      audio.currentTime = 0;
      step = 0;
    }
    step += 1;
    if (step === 1) pausePlayback();
    moveModel(() => {
      if (step === steps.length) {
        stopAutomatic();
        show();
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
      pausePlayback();
    }
    show();
  }

  function changeTrack(direction) {
    if (!canPlay()) return;
    pausePlayback();
    trackIndex = (trackIndex + direction + tracks.length) % tracks.length;
    const track = tracks[trackIndex];
    audio.src = track.src;
    trackLabel.textContent = track.label;
    play();
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
  stage.addEventListener('dragstart', event => event.preventDefault());
  stage.addEventListener('click', event => {
    if (designMode) return;
    const keyboard = event.detail === 0;
    const wasDragged = dragged;
    dragged = false;
    if (automatic || transitioning || (wasDragged && !keyboard)) return;
    if (keyboard) {
      advance();
      return;
    }
    if (pickModelPart) {
      const part = pickModelPart(event);
      if (part === 'play') togglePlayback();
      else if (part === 'previous' || part === 'next') changeTrack(part === 'previous' ? -1 : 1);
      else if (part === 'model') advance();
      return;
    }
    if (isOverPreview(event)) advance();
  });

  function isOverPreview(event) {
    if (preview.hidden) return false;
    return [photo, looseCard].some(image => {
      if (image.hidden) return false;
      const bounds = image.getBoundingClientRect();
      return event.clientX >= bounds.left && event.clientX <= bounds.right &&
        event.clientY >= bounds.top && event.clientY <= bounds.bottom;
    });
  }

  function distanceBetweenTouches() {
    const [first, second] = touches.values();
    return Math.hypot(first.x - second.x, first.y - second.y);
  }

  function setZoom(value) {
    const zoom = Math.max(minZoom, Math.min(maxZoom, value));
    updateZoom(zoom);
    zoomModel?.(zoom);
  }


  stage.addEventListener('contextmenu', event => {
    if (panModel) event.preventDefault();
  });

  stage.addEventListener('pointerdown', event => {
    if (event.button !== 0 && !(event.button === 2 && panModel)) return;
    stage.setPointerCapture(event.pointerId);
    if (event.pointerType === 'touch') {
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
    pointer = {id: event.pointerId, pan: event.button === 2 || event.shiftKey, x: event.clientX, y: event.clientY, lastX: event.clientX, lastY: event.clientY};
  });

  stage.addEventListener('pointermove', event => {
    if (touches.has(event.pointerId)) {
      const prior = touches.get(event.pointerId);
      touches.set(event.pointerId, {x: event.clientX, y: event.clientY});
      if (touches.size >= 2) {
        panModel?.((event.clientX - prior.x) / 2, (event.clientY - prior.y) / 2);
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
    const moveX = event.clientX - pointer.lastX;
    const moveY = event.clientY - pointer.lastY;
    if (pointer.pan) panModel?.(moveX, moveY);
    else rotateModel(moveX / 18, moveY / 18);
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
    if (event.deltaY === 0 || !event.cancelable) return;
    const overPlayer = pickModelPart ? Boolean(pickModelPart(event)) : isOverPreview(event);
    if (!designMode && !overPlayer && !event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    setZoom(scale * (event.deltaY < 0 ? zoomFactor : 1 / zoomFactor));
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
    pausePlayback();
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
  for (const button of trackControls) {
    button.addEventListener('click', () => changeTrack(Number(button.dataset.trackDirection)));
    button.hidden = false;
  }

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
    const [parts, controls, artwork, frontPrint] = await Promise.all([
      readParts('../parts.json'),
      readParts('control-parts.json'),
      new THREE.TextureLoader().loadAsync('images/card.webp?v=mymy'),
      new THREE.TextureLoader().loadAsync('images/basic-front-print.png?v=basic-design-markings'),
    ]);
    const renderer = new THREE.WebGLRenderer({canvas, alpha: true, antialias: true});
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    artwork.encoding = THREE.sRGBEncoding;
    artwork.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-58, 58, 43, -43, 1, 400);
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
    const trackButtons = controlMesh('buttons', buttons);
    const powerMaterial = variant === 'color' ? buttons.clone() : buttons;
    scene.add(trackButtons, controlMesh('power', powerMaterial));
    scene.add(controlMesh('wheel', wheelMaterial), controlMesh('usb', portMaterial));
    // Cover the original CAD opening and display the LED at the drawing location.
    const originalOpening = new THREE.Mesh(new THREE.CircleGeometry(.91, 48), skinMaterial);
    originalOpening.position.set(21.7, 9.6, 25.904);
    skin.add(originalOpening);
    const drawingLed = new THREE.Mesh(new THREE.CircleGeometry(.8, 48), ledMaterial);
    drawingLed.position.set(-21.7, 9.6, 25.925);
    skin.add(drawingLed);

    // Paths from the supplied top-view drawing, in model units about each button center.
    const buttonPrint = {
      previous: 'M -0.656 0.950 C -0.618 0.950 -0.587 0.920 -0.587 0.881 L -0.587 0.178 L 0.579 0.804 C 0.644 0.839 0.723 0.791 0.723 0.717 L 0.723 -0.544 C 0.723 -0.618 0.644 -0.666 0.579 -0.631 L -0.587 -0.005 L -0.587 -0.708 C -0.587 -0.746 -0.618 -0.777 -0.656 -0.777 C -0.694 -0.777 -0.725 -0.746 -0.725 -0.708 L -0.725 0.881 C -0.725 0.920 -0.694 0.950 -0.656 0.950 Z',
      play: 'M 0.212 -0.004 L -0.940 -0.666 C -1.010 -0.705 -1.096 -0.655 -1.096 -0.575 L -1.096 0.748 C -1.096 0.829 -1.010 0.879 -0.940 0.839 L 0.212 0.177 C 0.282 0.137 0.282 0.036 0.212 -0.004 Z M 0.181 -0.577 L 0.181 0.751 C 0.181 0.785 0.208 0.812 0.242 0.812 L 0.593 0.812 C 0.626 0.812 0.654 0.785 0.654 0.751 L 0.654 -0.577 C 0.654 -0.611 0.626 -0.638 0.593 -0.638 L 0.242 -0.638 C 0.208 -0.638 0.181 -0.611 0.181 -0.577 Z M 0.864 -0.577 L 0.864 0.751 C 0.864 0.785 0.891 0.812 0.925 0.812 L 1.276 0.812 C 1.310 0.812 1.337 0.785 1.337 0.751 L 1.337 -0.577 C 1.337 -0.611 1.310 -0.638 1.276 -0.638 L 0.925 -0.638 C 0.891 -0.638 0.864 -0.611 0.864 -0.577 Z',
      next: 'M 0.842 -0.777 C 0.804 -0.777 0.773 -0.746 0.773 -0.708 L 0.773 -0.005 L -0.393 -0.631 C -0.458 -0.666 -0.537 -0.618 -0.537 -0.544 L -0.537 0.718 C -0.537 0.792 -0.458 0.839 -0.393 0.804 L 0.773 0.179 L 0.773 0.881 C 0.773 0.919 0.804 0.950 0.842 0.950 C 0.880 0.950 0.911 0.919 0.911 0.881 L 0.911 -0.708 C 0.911 -0.746 0.880 -0.777 0.842 -0.777 Z',
    };

    function buttonIcon(type) {
      const artwork = document.createElement('canvas');
      artwork.width = artwork.height = 128;
      const ink = artwork.getContext('2d');
      ink.translate(64, 64);
      ink.scale(128 / 4.8, 128 / 4.8);
      ink.fillStyle = '#3d4042';
      ink.fill(new Path2D(buttonPrint[type]));
      const texture = new THREE.CanvasTexture(artwork);
      texture.encoding = THREE.sRGBEncoding;
      return new THREE.Mesh(
        new THREE.PlaneGeometry(4.8, 4.8),
        new THREE.MeshBasicMaterial({map: texture, transparent: true, alphaTest: .3}),
      );
    }
    const trackActions = ['previous', 'play', 'next'];
    for (const [index, type] of trackActions.entries()) {
      const icon = buttonIcon(type);
      icon.position.set((index - 1) * 10.2, 9.6, 27.31);
      icon.userData.trackAction = type;
      scene.add(icon);
    }


    function printMark(parent, width, height, position, rotation, paint) {
      const surface = document.createElement('canvas');
      surface.width = 512;
      surface.height = Math.round(512 * height / width);
      const context = surface.getContext('2d');
      context.scale(surface.width / width, surface.height / height);
      context.translate(width / 2, height / 2);
      context.fillStyle = context.strokeStyle = '#444b50';
      context.lineWidth = .3;
      context.lineCap = 'round';
      paint(context);
      const texture = new THREE.CanvasTexture(surface);
      texture.encoding = THREE.sRGBEncoding;
      const mark = new THREE.Mesh(
        new THREE.PlaneGeometry(width, height),
        new THREE.MeshBasicMaterial({map: texture, transparent: true, alphaTest: .25})
      );
      mark.position.set(...position);
      mark.rotation.set(...rotation, 'ZXY');
      mark.userData.printMark = true;
      parent.add(mark);
    }

    frontPrint.encoding = THREE.sRGBEncoding;
    const frontMark = new THREE.Mesh(
      new THREE.PlaneGeometry(57, 6.12),
      new THREE.MeshBasicMaterial({map: frontPrint, transparent: true, alphaTest: .25}),
    );
    frontMark.position.set(0, .25, 21.2);
    frontMark.rotation.x = Math.PI / 2;
    frontMark.userData.printMark = true;
    skin.add(frontMark);

    // Side-view artwork is aligned to the wheel and the power key in the drawing.
    for (const [z, plus] of [[10.54, true], [.42, false]]) {
      printMark(scene, 2.7, 2.7, [-32.57, 10.2, z], [Math.PI / 2, 0, -Math.PI / 2], context => {
        context.lineWidth = .26;
        context.beginPath();
        context.moveTo(-.51, 0);
        context.lineTo(.51, 0);
        if (plus) {
          context.moveTo(0, -.51);
          context.lineTo(0, .51);
        }
        context.stroke();
      });
    }
    printMark(scene, 3.4, 3.4, [32.72, 11.31, 1.76], [Math.PI / 2, 0, Math.PI / 2], context => {
      context.fillStyle = '#3d4042';
      const powerPrint = [
        'M 0.000 -0.058 C 0.083 -0.058 0.151 -0.126 0.151 -0.209 L 0.151 -1.055 C 0.151 -1.138 0.083 -1.205 0.000 -1.205 C -0.083 -1.205 -0.150 -1.138 -0.150 -1.055 L -0.150 -0.209 C -0.150 -0.126 -0.083 -0.058 0.000 -0.058 Z',
        'M 0.712 -0.746 C 0.648 -0.800 0.553 -0.792 0.500 -0.728 C 0.447 -0.665 0.455 -0.570 0.518 -0.517 C 0.700 -0.363 0.804 -0.139 0.804 0.098 C 0.804 0.541 0.443 0.901 0.000 0.901 C -0.443 0.901 -0.803 0.541 -0.803 0.098 C -0.803 -0.139 -0.699 -0.363 -0.518 -0.517 C -0.454 -0.570 -0.446 -0.665 -0.500 -0.728 C -0.553 -0.792 -0.648 -0.800 -0.711 -0.746 C -0.961 -0.536 -1.104 -0.228 -1.104 0.098 C -1.104 0.706 -0.609 1.202 0.000 1.202 C 0.609 1.202 1.104 0.706 1.104 0.098 C 1.104 -0.228 0.961 -0.536 0.712 -0.746 Z',
      ].join(' ');
      context.fill(new Path2D(powerPrint));
    });

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
    const mobileViewer = matchMedia('(max-width: 560px)');
    let frame;
    let coverAngle = 0;
    let skinLift = 0;
    let skinDetached = false;
    let cardOffset = 0;
    const coverOpening = THREE.MathUtils.degToRad(35);
    const views = Object.fromEntries(horizontalViews.map(({dataset: {view, yaw}}) => [
      view, [THREE.MathUtils.degToRad(Number(yaw)), Number(yaw) % 90 === 0 ? 0 : .35],
    ]));
    views.top = [0, Math.PI / 2];
    const panOffset = new THREE.Vector2();
    const viewTarget = new THREE.Vector3(0, -2, 0);
    const viewAngles = new THREE.Euler();
    const modelMeshes = [];
    scene.traverse(object => {
      if (!object.isMesh || object.userData.printMark) return;
      object.geometry.computeBoundingBox();
      modelMeshes.push(object);
    });
    const frameBounds = new THREE.Box3();
    const meshBounds = new THREE.Box3();
    const frameSize = new THREE.Vector3();
    const frameCenter = new THREE.Vector3();
    const viewMatrix = new THREE.Matrix4();
    const homeViewMatrix = new THREE.Matrix4();
    let aspect = 1;
    let desktopHeightRatio = 1;

    function findFrameBounds(cameraView) {
      frameBounds.makeEmpty();
      for (const mesh of modelMeshes) {
        viewMatrix.multiplyMatrices(cameraView, mesh.matrixWorld);
        meshBounds.copy(mesh.geometry.boundingBox).applyMatrix4(viewMatrix);
        frameBounds.union(meshBounds);
      }
    }

    function frameModel() {
      scene.updateMatrixWorld(true);
      camera.updateMatrixWorld(true);
      // Use the default angle for scale and the current angle for centering.
      findFrameBounds(homeViewMatrix);
      frameBounds.getSize(frameSize);
      const fitHeight = Math.max(62, frameSize.y / .88, frameSize.x / (.9 * aspect * desktopHeightRatio));
      const height = mobileViewer.matches ? fitHeight / .68 : fitHeight * desktopHeightRatio;

      findFrameBounds(camera.matrixWorldInverse);
      frameBounds.getCenter(frameCenter);
      const centerX = frameCenter.x + panOffset.x;
      const centerY = frameCenter.y + panOffset.y;
      const halfWidth = height * aspect / 2;
      camera.left = centerX - halfWidth;
      camera.right = centerX + halfWidth;
      camera.top = centerY + height / 2;
      camera.bottom = centerY - height / 2;
      camera.updateProjectionMatrix();
    }
    let cameraFrame;
    function viewOrientation(name) {
      const [yaw, pitch] = views[name];
      return new THREE.Quaternion().setFromEuler(viewAngles.set(Math.PI / 2 - pitch, 0, yaw, 'ZXY'));
    }

    function placeCamera() {
      // The camera's local +Z points away from the model.
      camera.position.set(0, 0, 170).applyQuaternion(camera.quaternion).add(viewTarget);
    }

    function setCameraView(name, resetZoom = false) {
      panOffset.set(0, 0);
      cancelAnimationFrame(cameraFrame);
      const orientation = viewOrientation(name);
      if (reducedMotion.matches || !stage.classList.contains('has-model')) {
        camera.quaternion.copy(orientation);
        if (resetZoom) {
          camera.zoom = 1;
          updateZoom(1);
        }
        render();
        return;
      }

      const startOrientation = camera.quaternion.clone();
      const startZoom = camera.zoom;
      const start = performance.now();
      function tick(now) {
        const t = Math.min((now - start) / 460, 1);
        const ease = t * t * (3 - 2 * t);
        camera.quaternion.slerpQuaternions(startOrientation, orientation, ease);
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
      placeCamera();
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
      const extraHeight = Number.parseFloat(getComputedStyle(stage).getPropertyValue('--viewer-extra-height')) || 0;
      desktopHeightRatio = height / Math.max(1, height - extraHeight);
      renderer.setSize(width, height, false);
      render();
    }

    selectModelView = setCameraView;
    rotateModel = (dx, dy) => {
      cancelAnimationFrame(cameraFrame);
      camera.rotateY(-dx * .14);
      camera.rotateX(-dy * .14);
      camera.quaternion.normalize();
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
    pickModelPart = event => {
      const bounds = canvas.getBoundingClientRect();
      mouse.set(2 * (event.clientX - bounds.left) / bounds.width - 1, 1 - 2 * (event.clientY - bounds.top) / bounds.height);
      ray.setFromCamera(mouse, camera);
      const hit = ray.intersectObjects(modelMeshes, false)[0];
      if (!hit) return;
      if (hit.object === trackButtons) {
        return trackActions[THREE.MathUtils.clamp(Math.round(hit.point.x / 10.2) + 1, 0, 2)];
      }
      return hit.object.userData.trackAction || 'model';
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
      zoomModel = panModel = null;
      transitioning = false;
      stopAutomatic();
      selectModelView = toggleModelSkin = resetSkin = rotateModel = pickModelPart = cardNeedsStowing = null;
      stage.classList.remove('has-model');
      skinPanel.hidden = true;
      drawModel = null;
      canvas.hidden = true;
      showPhotoPreview();
      selectView('home');
    });
    drawModel = update;
    canvas.hidden = false;
    preview.hidden = true;
    panModel = (dx, dy) => {
      cancelAnimationFrame(cameraFrame);
      const unitsPerPixel = (camera.top - camera.bottom) / (camera.zoom * stage.clientHeight);
      panOffset.x -= dx * unitsPerPixel;
      panOffset.y += dy * unitsPerPixel;
      render();
    };
    zoomModel = zoom => {
      cancelAnimationFrame(cameraFrame);
      camera.zoom = zoom;
      render();
    };
    camera.zoom = scale;
    camera.quaternion.copy(viewOrientation('home'));
    placeCamera();
    camera.updateMatrixWorld(true);
    homeViewMatrix.copy(camera.matrixWorldInverse);
    setCameraView(views[activeView] ? activeView : 'home');
    resize();
    update(step);
    if (designMode) {
      if (variant === 'color') {
        const choices = [...document.querySelectorAll('[data-palette]')];
        const materials = [shell, skinMaterial, glass, buttons, powerMaterial];
        const canvasTexture = (width, height, paint) => {
          const surface = document.createElement('canvas');
          surface.width = width;
          surface.height = height;
          paint(surface.getContext('2d'));
          const texture = new THREE.CanvasTexture(surface);
          texture.encoding = THREE.sRGBEncoding;
          return texture;
        };
        const popArtPrint = canvasTexture(frontPrint.image.width, frontPrint.image.height, ink => {
          ink.drawImage(frontPrint.image, 0, 0);
          const original = ink.getImageData(0, 0, 220, frontPrint.image.height);
          ink.globalCompositeOperation = 'source-atop';
          const logoBands = [
            [30, 96, '#234c86'],
            [96, 171, '#d59a32'],
            [171, 213, '#bd5468'],
          ];
          for (const [left, right, color] of logoBands) {
            ink.fillStyle = color;
            ink.fillRect(left, 0, right - left, frontPrint.image.height);
          }
          const logo = ink.getImageData(0, 0, original.width, original.height);
          for (let pixel = 0; pixel < original.data.length; pixel += 4) {
            const [red, green, blue] = original.data.subarray(pixel, pixel + 3);
            if (green - red > 35 && blue - red > 35) {
              logo.data.set([35, 76, 134], pixel);
            }
          }
          ink.putImageData(logo, 0, 0);
        });
        const printedEditions = {};
        const loadPrint = async source => {
          const map = await new THREE.TextureLoader().loadAsync(source);
          map.encoding = THREE.sRGBEncoding;
          return map;
        };
        const mockupPrints = {
          najeon: ['data:image/webp;base64,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', 'data:image/webp;base64,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'],
          kids: ['data:image/webp;base64,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', 'data:image/webp;base64,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'],
        };
        await Promise.all(Object.entries(mockupPrints).map(async ([name, sources]) => {
          const [face, piece] = await Promise.all(sources.map(loadPrint));
          printedEditions[name] = {face, piece};
        }));
        const editionPrints = {
          murakami: canvasTexture(512, 352, ink => {
            const blooms = [[465, 294, 16, '#f6759e'], [429, 321, 12, '#f5c943'],
              [484, 251, 8, '#62c7ef'], [390, 330, 7, '#a890e4']];
            for (const [x, y, radius, color] of blooms) {
              ink.fillStyle = color;
              for (let petalIndex = 0; petalIndex < 7; petalIndex++) {
                const angle = petalIndex * Math.PI * 2 / 7;
                ink.beginPath();
                ink.arc(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius,
                  radius * .54, 0, Math.PI * 2);
                ink.fill();
              }
              ink.fillStyle = '#fff2a6';
              ink.beginPath();
              ink.arc(x, y, radius * .65, 0, Math.PI * 2);
              ink.fill();
            }
          }),
          art: canvasTexture(512, 352, ink => {
            const strokes = [
              ['#264864', 'M0 352 V282 Q62 228 165 292 T310 321 Q366 322 401 352 Z'],
              ['#ce9d50', 'M0 304 Q67 245 167 294 Q80 266 0 326 Z'],
              ['#b45c4c', 'M0 352 V333 Q69 306 133 352 Z'],
            ];
            for (const [color, outline] of strokes) {
              ink.fillStyle = color;
              ink.fill(new Path2D(outline));
            }
          }),
        };
        const petalDecal = new THREE.Mesh(new THREE.PlaneGeometry(62, 42.6),
          new THREE.MeshBasicMaterial({map: editionPrints.murakami, transparent: true, depthWrite: false}));
        petalDecal.rotation.x = Math.PI / 2;
        petalDecal.position.set(0, -2.2, 19.5);
        petalDecal.renderOrder = 2;
        hinge.add(petalDecal);
        function applyPalette(selected) {
          selected.dataset.palette.split(',').forEach((hex, index) => {
            materials[index].color.setStyle(`#${hex}`).convertSRGBToLinear();
          });
          const printedEdition = printedEditions[selected.dataset.windowArt];
          frontMark.material.map = printedEdition?.face ||
            (selected.hasAttribute('data-pop-art') ? popArtPrint : frontPrint);
          card.material[0].map = printedEdition?.piece || artwork;
          const editionPrint = editionPrints[selected.dataset.windowArt];
          glass.opacity = editionPrint || printedEdition ? .16 : .65;
          petalDecal.material.map = editionPrint || editionPrints.murakami;
          petalDecal.visible = Boolean(editionPrint);
          for (const choice of choices) {
            choice.setAttribute('aria-pressed', String(choice === selected));
          }
          render();
        }
        for (const choice of choices) choice.addEventListener('click', () => applyPalette(choice));
        applyPalette(choices[0]);
      }
      card.visible = false;
      showDesignCard = attached => {
        card.visible = attached;
        render();
      };
      designCard.disabled = false;
      render();
    }
  }

  function showPhotoPreview() {
    if (designMode) {
      designCard.disabled = true;
      document.querySelector('#design-unavailable').hidden = false;
      return;
    }
    preview.hidden = false;
  }

  if (window.THREE) loadModel(window.THREE).catch(showPhotoPreview);
  else showPhotoPreview();
})();
