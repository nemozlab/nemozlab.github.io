(() => {
  const designMode = document.documentElement.classList.contains('player-design');
  const variant = document.documentElement.dataset.design;
  const retroDesign = designMode && variant === 'retro';
  const designCard = document.querySelector('#design-card');
  let showDesignCard;
  if (designMode) {
    document.querySelector('#title').textContent = '네모 플레이어 디자인';
    document.querySelector('.player-nav .guide-link').removeAttribute('aria-current');
    document.querySelector('.player-nav .design-link').setAttribute('aria-current', 'page');
    const variantLink = document.querySelector(`[data-design-link="${variant}"]`);
    variantLink.setAttribute('aria-current', 'page');
    if (retroDesign) {
      document.querySelector('#title').textContent = '네모 플레이어 디자인 · 레트로형';
      document.querySelector('.design-note').textContent = 'UV 인쇄 시안 · 차콜 패널과 주황색 포인트 · 왼쪽 NEMOBI, 오른쪽 NFC PLAYER와 안테나';
    }
    if (variant === 'artist') {
      document.querySelector('#title').textContent = variantLink.textContent;
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
  let pickModelPart;
  let cardNeedsStowing;
  const minZoom = .55;
  const maxZoom = 1.75;
  const zoomFactor = 1.12;
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


  stage.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
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
    rotateModel((event.clientX - pointer.lastX) / 18, (event.clientY - pointer.lastY) / 18);
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
    if (!overPlayer && !event.ctrlKey && !event.metaKey) return;
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
    scene.add(new THREE.HemisphereLight(0xffffff, 0x9bafbc, .62));
    const key = new THREE.DirectionalLight(0xffffff, .49);
    key.position.set(-75, -80, 135);
    const rearLight = new THREE.DirectionalLight(0xffffff, .34);
    rearLight.position.set(65, 110, 100);
    scene.add(key, rearLight);

    const shell = new THREE.MeshStandardMaterial({color: retroDesign ? 0xaeb2b7 : 0xc5cad0, roughness: .94, side: THREE.DoubleSide});
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
    scene.add(trackButtons, controlMesh('power', buttons));
    scene.add(controlMesh('wheel', wheelMaterial), controlMesh('usb', portMaterial));
    if (designMode) {
      // The original skin has a machined LED opening on the right. Cover it in
      // the design preview and show the indicator on the side specified by the drawing.
      const originalOpening = new THREE.Mesh(new THREE.CircleGeometry(.91, 48), skinMaterial);
      originalOpening.position.set(21.7, 9.6, 25.904);
      const drawingLedMaterial = ledMaterial.clone();
      drawingLedMaterial.color.setHex(0xe4efed);
      const drawingLed = new THREE.Mesh(new THREE.CircleGeometry(.8, 48), drawingLedMaterial);
      drawingLed.position.set(-21.7, 9.6, 25.925);
      skin.add(originalOpening, drawingLed);
    } else {
      scene.add(controlMesh('led', ledMaterial));
    }

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


    if (designMode) {
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

      printMark(skin, 57, 6.5, [0, .34, 21.2], [Math.PI / 2, 0, 0], context => {
        context.textBaseline = 'middle';

        if (retroDesign) {
          context.fillStyle = '#282b2d';
          context.fillRect(-28.5, -3.25, 57, 6.5);

          context.fillStyle = '#e88a43';
          context.fillRect(-26.4, -1.85, .55, 3.7);
          context.fillRect(-25.35, -1.85, .55, 3.7);
        }

        const wordmark = 'NEMOBI';
        const wordmarkX = retroDesign ? -23.3 : -25.8;
        context.fillStyle = retroDesign ? '#f2eee4' : '#27343c';
        context.font = '800 3.8px "Arial Black", Arial, sans-serif';
        context.fillText(wordmark, wordmarkX, .12);

        const barsX = wordmarkX + context.measureText(wordmark).width + 1.55;
        context.strokeStyle = retroDesign ? '#e88a43' : '#277f7a';
        context.lineWidth = .55;
        context.beginPath();
        for (const [index, height] of [0.45, 1.35, 2.65, 1.75].entries()) {
          const x = barsX + index * 1.15;
          context.moveTo(x, .12 - height / 2);
          context.lineTo(x, .12 + height / 2);
        }
        context.stroke();

        context.fillStyle = retroDesign ? '#f2eee4' : '#536069';
        const descriptor = 'NFC PLAYER';
        context.font = '600 1.8px Arial, sans-serif';
        context.textAlign = 'right';
        context.fillText(descriptor, 25.8, .12);

        const antennaX = 25.8 - context.measureText(descriptor).width - 2.65;
        context.strokeStyle = context.fillStyle;
        context.lineWidth = .21;
        context.beginPath();
        context.arc(antennaX, 0, .19, 0, 2 * Math.PI);
        context.fill();
        for (const radius of [.68, 1.19, 1.7]) {
          context.beginPath();
          context.arc(antennaX, 0, radius, -Math.PI / 4.5, Math.PI / 4.5);
          context.stroke();
        }
      });

      // The PDF places the volume marks next to the wheel and power on its button.
      for (const [z, plus] of [[9, true], [2, false]]) {
        printMark(scene, 2.7, 2.7, [-32.58, 9, z], [Math.PI / 2, 0, -Math.PI / 2], context => {
          context.beginPath();
          context.moveTo(-.72, 0);
          context.lineTo(.72, 0);
          if (plus) {
            context.moveTo(0, -.72);
            context.lineTo(0, .72);
          }
          context.stroke();
        });
      }
      printMark(scene, 3.4, 3.4, [32.7, 11.3, 1.76], [Math.PI / 2, 0, Math.PI / 2], context => {
        context.beginPath();
        context.arc(0, .1, .86, -Math.PI * .3, Math.PI * 1.3);
        context.moveTo(0, -1.13);
        context.lineTo(0, -.19);
        context.stroke();
      });
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
      const {x: centerX, y: centerY} = frameBounds.getCenter(frameCenter);
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
      zoomModel = null;
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
