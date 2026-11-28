(() => {
  const designMode = document.documentElement.classList.contains('player-design');
  const variant = document.documentElement.dataset.design;
  const designCard = document.querySelector('#design-card');
  const designCover = document.querySelector("#design-cover");
  let showDesignCard;
  let showDesignCover;
  if (designMode) {
    document.querySelector('#title').textContent = '네모 플레이어 디자인';
    document.querySelector('.player-nav .guide-link').removeAttribute('aria-current');
    document.querySelector('.player-nav .design-link').setAttribute('aria-current', 'page');
    const variantLink = document.querySelector(`[data-design-link="${variant}"]`);
    variantLink.setAttribute('aria-current', 'page');
    designCard.disabled = true;
    designCover.disabled = true;
    designCard.addEventListener('click', () => {
      const attached = designCard.getAttribute('aria-pressed') !== 'true';
      designCard.setAttribute('aria-pressed', String(attached));
      designCard.textContent = attached ? '카드 빼기' : '카드 장착';
      showDesignCard(attached);
    });
    designCover.addEventListener('click', () => {
      const open = designCover.getAttribute('aria-pressed') !== 'true';
      designCover.setAttribute('aria-pressed', String(open));
      designCover.textContent = open ? '커버 닫기' : '커버 열기';
      showDesignCover(open);
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
  const viewButtons = [...viewMenu.querySelectorAll('[data-view]')];
  const viewer = stage.closest('.demo-viewer');
  const fullscreen = document.querySelector('#demo-fullscreen');
  const expand = document.querySelector('#demo-expand');
  const closeFullscreen = document.querySelector('#demo-fullscreen-close');
  const mobileFullscreen = matchMedia('(max-width: 730px), (max-height: 560px) and (pointer: coarse)');
  const supportsFullscreen = !designMode && typeof fullscreen.showModal === 'function';
  let fullscreenTrigger;
  let fullscreenScrollTop;
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

  function openFullscreen() {
    if (!supportsFullscreen || !mobileFullscreen.matches || fullscreen.open) return;
    const trigger = document.activeElement;
    fullscreenTrigger = viewMenu.contains(trigger) || viewer.contains(trigger) ? trigger : expand;
    fullscreenScrollTop = window.scrollY;
    fullscreen.append(viewMenu, viewer);
    fullscreen.showModal();
  }

  function syncFullscreen() {
    expand.hidden = !mobileFullscreen.matches;
    if (expand.hidden && fullscreen.open) fullscreen.close();
  }

  if (supportsFullscreen) {
    expand.addEventListener('click', openFullscreen);
    closeFullscreen.addEventListener('click', () => fullscreen.close());
    fullscreen.addEventListener('close', () => {
      fullscreen.before(viewMenu, viewer);
      window.scrollTo(window.scrollX, fullscreenScrollTop);
      const trigger = fullscreenTrigger?.getClientRects().length ? fullscreenTrigger : stage;
      trigger.focus({preventScroll: true});
    });
    mobileFullscreen.addEventListener('change', syncFullscreen);
    syncFullscreen();
  }

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

  function advanceFromInteraction() {
    if (transitioning) return;
    openFullscreen();
    advance();
  }

  function togglePlayback() {
    if (audio.paused || audio.ended) {
      if (!canPlay()) return;
      openFullscreen();
      play();
    } else {
      pausePlayback();
    }
    show();
  }

  function changeTrack(direction) {
    if (!canPlay()) return;
    openFullscreen();
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
      advanceFromInteraction();
      return;
    }
    if (pickModelPart) {
      const part = pickModelPart(event);
      if (part === 'play') togglePlayback();
      else if (part === 'previous' || part === 'next') changeTrack(part === 'previous' ? -1 : 1);
      else if (part === 'model') advanceFromInteraction();
      return;
    }
    if (isOverPreview(event)) advanceFromInteraction();
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
    if (!automatic) advanceFromInteraction();
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
    openFullscreen();
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
    const [parts, controls, artwork, legacyFrontPrint] = await Promise.all([
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
    const powerMaterial = variant === 'color' || variant === 'artist' ? buttons.clone() : buttons;
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

    const frontArtwork = document.createElement('canvas');
    frontArtwork.width = legacyFrontPrint.image.width;
    frontArtwork.height = legacyFrontPrint.image.height;
    const frontInk = frontArtwork.getContext('2d');
    frontInk.drawImage(legacyFrontPrint.image, 0, 0);
    // The original 950 px print has a separate final i between columns 201 and 211.
    frontInk.clearRect(200, 0, 13, frontArtwork.height);
    const frontPrint = new THREE.CanvasTexture(frontArtwork);
    legacyFrontPrint.dispose();
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
      const height = mobileViewer.matches && !fullscreen.open ? fitHeight / .68 : fitHeight * desktopHeightRatio;

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
      if (variant === 'color' || variant === 'artist') {
        const choices = [...document.querySelectorAll(`.${variant}-options [data-palette]`)];
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
        const loadPrint = async source => {
          const map = await new THREE.TextureLoader().loadAsync(source);
          map.encoding = THREE.sRGBEncoding;
          return map;
        };
        const najeonArtwork = await loadPrint('data:image/webp;base64,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');
        const najeonPrintHeight = 58.5;
        const najeonFront = canvasTexture(1280, 138, ink => {
          ink.scale(2, 2);
          ink.drawImage(frontPrint.image, 0, 0, 640, 69);
          const wordmark = ink.getImageData(0, 0, 1280, 138);
          for (let i = 0; i < wordmark.data.length; i += 4) {
            const red = wordmark.data[i];
            const green = wordmark.data[i + 1];
            const blue = wordmark.data[i + 2];
            const waveform = green - red > 35 && blue - red > 35;
            wordmark.data.set(waveform ? [91, 155, 175] : [222, 220, 233], i);
          }
          ink.putImageData(wordmark, 0, 0);
          ink.fillStyle = '#9ab1b6';
          ink.fillRect(5, 63, 630, 2);
        });
        const stickerOutline = new THREE.Shape();
        stickerOutline.moveTo(-26.5, -20);
        stickerOutline.lineTo(26.5, -20);
        stickerOutline.lineTo(26.5, 20);
        stickerOutline.lineTo(-26.5, 20);
        stickerOutline.closePath();
        const stickerGeometry = new THREE.ShapeGeometry(stickerOutline);
        const sticker = new THREE.Mesh(stickerGeometry, new THREE.MeshBasicMaterial());
        sticker.rotation.x = Math.PI / 2;
        sticker.position.set(-1, 5.54, -1);
        sticker.visible = false;
        scene.add(sticker);
        const najeonInkActive = {value: 0};
        const exteriorPrint = {value: najeonArtwork};
        const lacquerPrint = {value: true};
        const kidsPrintActive = {value: false};
        const wrapPrintActive = {value: false};
        const wrapFromPaintedEdge = {value: false};
        const coverPrint = {value: false};
        const coverPrintButton = document.querySelector('#edition-cover-print');
        coverPrintButton.addEventListener('click', () => {
          coverPrint.value = !coverPrint.value;
          coverPrintButton.setAttribute('aria-pressed', String(coverPrint.value));
          render();
        });
        const kidsOrnaments = new THREE.Group();
        const hornShape = new THREE.SphereGeometry(1, 32, 20);
        const hornMaterial = new THREE.MeshStandardMaterial({color: 0xff6617, roughness: .78});
        const horn = new THREE.Mesh(hornShape, hornMaterial);
        horn.scale.set(3.35, 3.05, 4.45);
        horn.position.set(25.5, 15.2, 25.55);
        horn.rotation.y = .12;
        kidsOrnaments.add(horn);

        const cloudOutline = new THREE.Shape();
        cloudOutline.moveTo(-5.6, .45);
        cloudOutline.bezierCurveTo(-7.8, .6, -8.4, 4.4, -5.9, 5.8);
        cloudOutline.bezierCurveTo(-4.3, 8.4, -1.5, 9.5, 1.1, 8.8);
        cloudOutline.bezierCurveTo(3.3, 8.4, 3.55, 6.2, 5.05, 5.6);
        cloudOutline.bezierCurveTo(8.9, 4.2, 7.5, .15, 5.3, .42);
        cloudOutline.bezierCurveTo(1.3, .72, -1.4, .15, -5.6, .45);
        cloudOutline.closePath();
        const cloudGeometry = new THREE.ExtrudeGeometry(cloudOutline, {
          depth: 1.45, bevelEnabled: true, bevelThickness: 1.65, bevelSize: 1.1,
          bevelSegments: 12, curveSegments: 20,
        });
        cloudGeometry.rotateX(Math.PI / 2);
        const cloud = new THREE.Mesh(cloudGeometry,
          new THREE.MeshStandardMaterial({color: new THREE.Color('#dd8159').convertSRGBToLinear(), roughness: .71}));
        cloud.position.set(-23.7, 10.7, 25.88);
        printMark(cloud, 14, 8, [0, -3.13, 4.0], [Math.PI / 2, 0, 0], ink => {
          ink.fillStyle = '#b993cb';
          for (const x of [-3.8, 3.8]) {
            ink.beginPath();
            ink.ellipse(x, .8, 1.28, 1.01, 0, 0, Math.PI * 2);
            ink.fill();
          }
          ink.fillStyle = '#542b25';
          for (const x of [-1.95, 1.95]) {
            ink.beginPath();
            ink.arc(x, -.45, .39, 0, Math.PI * 2);
            ink.fill();
          }
          ink.fill(new Path2D('M -1.55 1.15 Q 0 1.75 1.55 1.1 Q .82 2.45 0 2.48 Q -.87 2.45 -1.55 1.15 Z'));
          ink.fillStyle = '#ee9b92';
          ink.fill(new Path2D('M -.55 2.23 Q 0 1.76 .56 2.22 Q 0 2.58 -.55 2.23 Z'));
        });
        kidsOrnaments.add(cloud);
        skin.add(kidsOrnaments);
        const [kidsPattern, kidsRearArt] = variant === 'color'
          ? await Promise.all([
            loadPrint('images/kids-edition-pattern.webp?v=clean-character-wrap'),
            loadPrint('images/kids-rear-characters.webp'),
          ])
          : [null, najeonArtwork];
        const artistArtwork = variant === 'artist' ? Object.fromEntries(await Promise.all(
          choices.map(async ({dataset: {windowArt}}) => [
            windowArt, await loadPrint(`images/artist-${windowArt}.webp`),
          ])
        )) : {};
        const kidsBackground = '#fef6df';
        const outlineFrontMark = (mark, outline) => canvasTexture(mark.image.width, mark.image.height, ink => {
          ink.shadowColor = outline;
          ink.shadowBlur = 7;
          ink.drawImage(mark.image, 0, 0);
          ink.drawImage(mark.image, 0, 0);
        });
        const kidsFrontMark = outlineFrontMark(frontPrint, kidsBackground);
        const popFrontMark = outlineFrontMark(popArtPrint, '#f3e7cf');
        for (const material of [shell, skinMaterial, glass]) {
          const isCover = {value: material === glass};
          material.onBeforeCompile = shader => {
            shader.uniforms.najeonArtwork = exteriorPrint;
            shader.uniforms.lacquerPrint = lacquerPrint;
            shader.uniforms.kidsPrintActive = kidsPrintActive;
            shader.uniforms.isCover = isCover;
            shader.uniforms.coverPrint = coverPrint;
            shader.uniforms.wrapPrintActive = wrapPrintActive;
            shader.uniforms.wrapFromPaintedEdge = wrapFromPaintedEdge;
            shader.uniforms.kidsRearArt = {value: kidsRearArt};
            shader.uniforms.najeonInkActive = najeonInkActive;
            shader.uniforms.najeonPrintHeight = {value: najeonPrintHeight};
            shader.uniforms.najeonAspect = {value: najeonArtwork.image.width / najeonArtwork.image.height};
            shader.vertexShader = shader.vertexShader
              .replace('#include <common>', '#include <common>\nvarying vec3 printPosition; varying vec3 printNormal;')
              .replace('#include <begin_vertex>', '#include <begin_vertex>\nprintPosition = position; printNormal = normal;');
            shader.fragmentShader = shader.fragmentShader
              .replace('#include <common>', `#include <common>
                varying vec3 printPosition;
                varying vec3 printNormal;
                uniform sampler2D najeonArtwork;
                uniform bool lacquerPrint;
                uniform bool kidsPrintActive;
                uniform bool isCover;
                uniform bool coverPrint;
                uniform bool wrapPrintActive;
                uniform bool wrapFromPaintedEdge;
                uniform sampler2D kidsRearArt;
                uniform float najeonInkActive;
                uniform float najeonAspect;
                uniform float najeonPrintHeight;

                vec2 wrapUv(vec2 unfolded) {
                  vec2 uv = vec2(0.49, 0.52) + unfolded / vec2(116.0, 104.0);
                  if (wrapFromPaintedEdge) uv.y = 0.47 - abs(unfolded.y) / 142.0;
                  return uv;
                }`)
              .replace('#include <color_fragment>', `#include <color_fragment>
                vec3 axis = abs(printNormal);
                if (isCover) {
                  if (najeonInkActive > 0.5 && coverPrint) {
                    bool leftOrRight = abs(printPosition.x) > 28.2;
                    bool lowerLip = printPosition.z < -21.9;
                    bool coverFront = printNormal.y < -0.12 && printPosition.y < 3.0;
                    bool sideReturn = leftOrRight && printPosition.x * printNormal.x > 3.5;
                    bool bottomReturn = lowerLip && printNormal.z < -0.12;
                    if ((leftOrRight || lowerLip) && (coverFront || sideReturn || bottomReturn)) {
                      vec2 unfolded = printPosition.xz;
                      float fromFront = max(0.0, printPosition.y - 0.4);
                      if (sideReturn) unfolded.x += sign(printPosition.x) * fromFront;
                      if (bottomReturn) unfolded.y -= fromFront;
                      diffuseColor = sRGBToLinear(texture2D(najeonArtwork, wrapUv(unfolded)));
                    }
                  }
                } else if (wrapPrintActive) {
                  bool face = axis.y > max(axis.x, axis.z);
                  bool rear = face && printNormal.y > 0.0 && printPosition.y > 12.0;
                  bool front = printNormal.y < -0.12 && printPosition.y < 3.0;
                  bool side = abs(printPosition.x) > 31.1 && printPosition.x * printNormal.x > 3.5;
                  bool top = printPosition.z > 24.1 && printNormal.z > 0.12;
                  bool bottom = printPosition.z < -24.6 && printNormal.z < -0.12;
                  float radius = length(printPosition.xz);
                  bool raisedGrille = printPosition.y > 21.5 && radius <= 22.35;
                  if (rear || raisedGrille) {
                    // Expand the artwork's opening to clear the CAD speaker holes.
                    // Restore the original spacing at the outer edge of the raised grille.
                    vec2 rearUv = vec2(-printPosition.x / 64.95, printPosition.z / 51.5);
                    if (kidsPrintActive) {
                      float artSpread = mix(0.72, 1.0, smoothstep(11.75, 22.35, radius));
                      diffuseColor.rgb = sRGBToLinear(texture2D(kidsRearArt, vec2(0.5) + rearUv * artSpread)).rgb;
                    } else {
                      float artSpread = smoothstep(10.9, 15.8, radius);
                      diffuseColor.rgb = sRGBToLinear(texture2D(najeonArtwork, vec2(0.5) + rearUv * artSpread)).rgb;
                    }
                  } else if (front || side || top || bottom) {
                    // Unfold the opaque rim from the front onto the four edges.
                    vec2 unfolded = printPosition.xz;
                    float depthFromFront = max(0.0, printPosition.y - 0.4);
                    if (side) unfolded.x += sign(printPosition.x) * depthFromFront;
                    if (top || bottom) unfolded.y += sign(printPosition.z) * depthFromFront;
                    vec2 uv = wrapUv(unfolded);
                    diffuseColor.rgb = sRGBToLinear(texture2D(najeonArtwork, uv)).rgb;
                  }
                } else if (najeonInkActive > 0.5) {
                  vec2 unfolded = vec2(-printPosition.x, printPosition.z);
                  float fromBack = max(0.0, 24.27 - printPosition.y);
                  bool exterior = true;
                  bool upperFace = false;
                  bool frontFace = false;
                  if (axis.x > max(axis.y, axis.z) && abs(printPosition.x) > 31.0 && printPosition.y > 3.0) {
                    float side = sign(printPosition.x);
                    unfolded.x = -side * (34.0 - fromBack);
                  } else if (axis.z > axis.y && printNormal.z > 0.0 && printPosition.z > 24.0 && printPosition.y > 1.0) {
                    unfolded.y += fromBack;
                    upperFace = true;
                  } else if (axis.z >= axis.y && printNormal.z < 0.0 && printPosition.z < -24.8 && printPosition.y > 2.0) {
                    unfolded.y = lacquerPrint ? -24.0 + fromBack : -printPosition.y;
                  } else {
                    frontFace = axis.y >= max(axis.x, axis.z) && printNormal.y < 0.0 &&
                      printPosition.y < 1.0 && printPosition.z > 17.0;
                    exterior = frontFace ||
                      (axis.y >= axis.z && printNormal.y > 0.0 && printPosition.y > 12.0);
                  }
                  vec2 uv = vec2(0.5, 0.505) +
                    vec2(unfolded.x / najeonAspect, unfolded.y) / najeonPrintHeight;
                  if (frontFace && lacquerPrint) {
                    uv = vec2(0.5, 0.11) +
                      vec2(-printPosition.x / najeonAspect, 24.27 + printPosition.z - 25.9) /
                      najeonPrintHeight;
                  }
                  if (exterior) {
                    vec2 border = min(uv, 1.0 - uv);
                    float coverage = smoothstep(0.0, 0.045, min(border.x, border.y));
                    vec3 printColor = texture2D(najeonArtwork, clamp(uv, 0.0, 1.0)).rgb;
                    vec3 inlayColor = pow(printColor, vec3(2.2)) * coverage;
                    if (lacquerPrint && axis.y > max(axis.x, axis.z) && printNormal.y > 0.0) {
                      inlayColor *= mix(0.28, 1.0, smoothstep(10.4, 14.5, length(printPosition.xz)));
                    }
                    if (upperFace && lacquerPrint) {
                      // Continue the rear artwork at the rear edge, then let the
                      // original cloud detail emerge toward the front band.
                      vec2 cloudUv = vec2(0.5, 0.11) +
                        vec2(-printPosition.x / najeonAspect, fromBack) / najeonPrintHeight;
                      vec2 cloudBorder = min(cloudUv, 1.0 - cloudUv);
                      float cloudCoverage = smoothstep(0.0, 0.045, min(cloudBorder.x, cloudBorder.y));
                      float cloudBlend = smoothstep(1.0, 6.0, fromBack);
                      vec3 cloud = texture2D(najeonArtwork, clamp(cloudUv, 0.0, 1.0)).rgb;
                      inlayColor = mix(inlayColor, pow(cloud, vec3(2.2)) * cloudCoverage, cloudBlend);
                    }
                    diffuseColor.rgb = lacquerPrint ? max(diffuseColor.rgb, inlayColor) : mix(diffuseColor.rgb, inlayColor / max(coverage, 0.001), coverage);
                  }
                }`);
          };
          material.needsUpdate = true;
        }
        const editionArtwork = {
          pop: canvasTexture(1440, 960, ink => {
            ink.scale(2, 2);
            ink.fillStyle = '#f3e7cf';
            ink.fillRect(0, 0, 720, 480);
            const shapes = [
              ['#234c86', 'M0 0H360L205 480H0Z'],
              ['#bd5468', 'M275 0H720V178L545 262 380 190Z'],
              ['#d59a32', 'M720 132V480H260L402 322 542 256Z'],
              ['#29405b', 'M372 166L506 129 530 326 385 397 303 288Z'],
              ['#f3e7cf', 'M381 189L478 158 498 307 390 353 331 278Z'],
            ];
            for (const [color, path] of shapes) {
              ink.fillStyle = color;
              ink.fill(new Path2D(path));
            }
            ink.fillStyle = '#234c86';
            ink.fill(new Path2D('M362 235L404 224 400 243 366 248Z M435 215L472 211 470 230 437 232Z M418 228L437 275 406 286Z'));
            ink.fillStyle = '#bd5468';
            ink.fill(new Path2D('M390 305Q429 287 460 298L429 320Z'));
          }),
          murakami: canvasTexture(1440, 960, ink => {
            ink.scale(2, 2);
            ink.fillStyle = '#fdf7e8';
            ink.fillRect(0, 0, 720, 480);
            const colors = ['#ed549a', '#efb344', '#63bfdd', '#9574c5', '#73bd8c'];
            const blooms = [[90, 80, 45], [273, 105, 62], [459, 44, 48], [625, 135, 64],
              [155, 259, 68], [385, 238, 43], [540, 330, 65], [68, 453, 61], [327, 427, 70]];
            for (const [i, [x, y, radius]] of blooms.entries()) {
              for (let petal = 0; petal < 8; petal++) {
                const angle = petal * Math.PI / 4;
                ink.fillStyle = colors[(i + petal) % colors.length];
                ink.beginPath();
                ink.arc(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius,
                  radius * .47, 0, Math.PI * 2);
                ink.fill();
              }
              ink.fillStyle = '#fff0a5';
              ink.beginPath();
              ink.arc(x, y, radius * .63, 0, Math.PI * 2);
              ink.fill();
            }
          }),
          art: canvasTexture(1440, 960, ink => {
            ink.scale(2, 2);
            ink.fillStyle = '#e9dfc8';
            ink.fillRect(0, 0, 720, 480);
            const strokes = [
              ['#ce9d50', 'M0 325Q140 170 327 304T720 217V480H0Z'],
              ['#264864', 'M0 357Q133 151 322 367T720 288V480H0Z'],
              ['#b45c4c', 'M0 432Q120 330 274 420T720 369V480H0Z'],
              ['#efe6d3', 'M0 402Q137 309 266 385T720 345V359Q410 490 262 401T0 421Z'],
            ];
            for (const [color, path] of strokes) {
              ink.fillStyle = color;
              ink.fill(new Path2D(path));
            }
          }),
          kids: kidsPattern,
        };
        const artistMarks = Object.fromEntries(choices
          .filter(choice => artistArtwork[choice.dataset.windowArt])
          .map(choice => [choice.dataset.windowArt, canvasTexture(1280, 138, ink => {
            ink.drawImage(frontPrint.image, 0, 0, 1280, 138);
            ink.globalCompositeOperation = 'source-in';
            ink.fillStyle = '#f9f1dc';
            ink.fillRect(0, 0, 1280, 138);
            ink.globalCompositeOperation = 'source-over';
            ink.clearRect(875, 0, 405, 138);
            ink.textAlign = 'right';
            ink.textBaseline = 'middle';
            ink.font = '600 42px Pretendard, sans-serif';
            ink.fillText(choice.textContent.trim(), 1208, 66);
          })]));
        function applyPalette(selected) {
          selected.dataset.palette.split(',').forEach((hex, index) => {
            materials[index].color.setStyle(`#${hex}`).convertSRGBToLinear();
          });
          const edition = selected.dataset.windowArt;
          const najeon = edition === 'najeon';
          const artistSurface = artistArtwork[edition];
          const surface = najeon ? najeonArtwork : artistSurface || editionArtwork[edition];
          exteriorPrint.value = surface;
          lacquerPrint.value = najeon;
          kidsPrintActive.value = edition === 'kids';
          kidsOrnaments.visible = kidsPrintActive.value;
          wrapPrintActive.value = Boolean(surface) && !najeon;
          wrapFromPaintedEdge.value = edition === 'art';
          coverPrintButton.hidden = !surface;
          najeonInkActive.value = Number(Boolean(surface));
          sticker.material.color.setStyle(`#${selected.dataset.stickerColor}`).convertSRGBToLinear();
          sticker.visible = true;
          card.material[0].map = artistSurface || artwork;
          frontMark.material.map = najeon ? najeonFront :
            (artistMarks[edition] || {kids: kidsFrontMark, pop: popFrontMark}[edition] || frontPrint);
          glass.opacity = .16;
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
      showDesignCover = open => update(open ? 1 : 0);
      designCard.disabled = false;
      designCover.disabled = false;
      render();
    }
  }

  function showPhotoPreview() {
    if (designMode) {
      designCard.disabled = true;
    designCover.disabled = true;
      document.querySelector('#design-unavailable').hidden = false;
      return;
    }
    preview.hidden = false;
  }

  if (window.THREE) loadModel(window.THREE).catch(showPhotoPreview);
  else showPhotoPreview();
})();
