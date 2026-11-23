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
  const zoomControls = document.querySelector('.demo-zoom');
  const zoomOut = document.querySelector('#demo-zoom-out');
  const zoomIn = document.querySelector('#demo-zoom-in');
  const zoomLevels = [1, 1.2, 1.45, 1.75];
  let zoomIndex = 0;
  let zoomModel;
  let rotateModel;
  let resetView;
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
      photo.src = step === 2 ? 'images/cad-demo-open-empty.webp?v=matte' :
        step === 1 || step === 3 ? 'images/cad-cover-open.webp?v=matte' : 'images/cad-front.webp?v=matte';
      looseCard.hidden = step !== 2;
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

  function setZoom(value) {
    zoomIndex = value;
    const scale = zoomLevels[zoomIndex];
    preview.style.transform = `scale(${scale})`;
    zoomModel?.(scale);
    zoomOut.disabled = zoomIndex === 0;
    zoomIn.disabled = zoomIndex === zoomLevels.length - 1;
  }
  zoomOut.addEventListener('click', () => setZoom(zoomIndex - 1));
  zoomIn.addEventListener('click', () => setZoom(zoomIndex + 1));
  zoomControls.hidden = false;

  stage.addEventListener('click', event => {
    if (!dragged || event.detail === 0) advance();
    dragged = false;
  });
  stage.addEventListener('pointerdown', event => {
    if (event.button !== 0 || !event.isPrimary) return;
    dragged = false;
    if (!rotateModel) return;
    pointer = {id: event.pointerId, x: event.clientX, y: event.clientY};
    stage.setPointerCapture(pointer.id);
  });
  stage.addEventListener('pointermove', event => {
    if (event.pointerId !== pointer?.id) return;
    const dx = event.clientX - pointer.x;
    const dy = event.clientY - pointer.y;
    if (!dragged && Math.hypot(dx, dy) < 5) return;
    dragged = true;
    stage.classList.add('is-dragging');
    rotateModel(dx, dy);
    pointer.x = event.clientX;
    pointer.y = event.clientY;
  });
  stage.addEventListener('lostpointercapture', () => {
    pointer = null;
    stage.classList.remove('is-dragging');
  });
  stage.addEventListener('keydown', event => {
    const movement = {ArrowLeft: [-20, 0], ArrowRight: [20, 0], ArrowUp: [0, -20], ArrowDown: [0, 20]};
    if (!rotateModel || !movement[event.key]) return;
    event.preventDefault();
    rotateModel(...movement[event.key]);
  });
  next.addEventListener('click', advance);
  reset.addEventListener('click', () => {
    playAttempt += 1;
    audio.pause();
    audio.currentTime = 0;
    playbackError = false;
    step = 0;
    resetView?.();
    setZoom(0);
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
    for (const id of ['0', '1', '16']) scene.add(mesh(id, shell));
    scene.add(mesh('13', portMaterial));
    const buttons = new THREE.MeshStandardMaterial({color: 0xaab2ba, roughness: .94, side: THREE.DoubleSide});
    scene.add(controlMesh('buttons', buttons), controlMesh('power', buttons));
    scene.add(controlMesh('wheel', wheelMaterial), controlMesh('usb', portMaterial), controlMesh('led', ledMaterial));

    // The front door swings around the lower horizontal edge of the CAD mesh.
    const hinge = new THREE.Group();
    hinge.position.set(0, 2.2, -24);
    scene.add(hinge);
    const door = controlMesh('door', glass);
    door.position.copy(hinge.position).negate();
    door.renderOrder = 1;
    hinge.add(door);

    const card = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 40),
      new THREE.MeshBasicMaterial({map: artwork, transparent: true, alphaTest: .1, side: THREE.DoubleSide}),
    );
    scene.add(card);

    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    let frame;
    let coverAngle = 0;
    let cardOffset = 0;
    let viewShift = 0;
    const coverOpening = THREE.MathUtils.degToRad(35);
    const homeYaw = .54;
    const homePitch = .35;
    const views = {
      home: [homeYaw, homePitch], front: [0, 0], top: [0, Math.PI / 2 - .001],
      left: [-Math.PI / 2, 0], right: [Math.PI / 2, 0], back: [Math.PI, 0],
    };
    function markView(name) {
      for (const button of viewButtons) button.setAttribute('aria-pressed', String(button.dataset.view === name));
    }
    function selectView(name) {
      [yaw, pitch] = views[name];
      markView(name);
    }
    let yaw = homeYaw;
    let pitch = homePitch;
    let width, height;
    const slot = new THREE.Vector3(0, 2.1, -.85).sub(hinge.position);
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
      const radius = 170;
      const horizontal = radius * Math.cos(pitch);
      camera.position.set(viewShift + horizontal * Math.sin(yaw), -2 - horizontal * Math.cos(yaw), radius * Math.sin(pitch));
      camera.lookAt(viewShift, -2, 0);
      renderer.render(scene, camera);
    }
    function update(state) {
      cancelAnimationFrame(frame);
      const from = [coverAngle, cardOffset, viewShift];
      const targets = [state > 0 && state < 4 ? coverOpening : 0, state === 2 ? 1 : 0, state === 2 ? 25 : 0];
      if (reducedMotion.matches || from.every((n, i) => n === targets[i])) {
        [coverAngle, cardOffset, viewShift] = targets;
        render();
        return;
      }
      const start = performance.now();
      function tick(now) {
        const t = Math.min((now - start) / 460, 1);
        const ease = t * t * (3 - 2 * t);
        [coverAngle, cardOffset, viewShift] = from.map((value, i) => value + (targets[i] - value) * ease);
        render();
        if (t < 1) frame = requestAnimationFrame(tick);
      }
      frame = requestAnimationFrame(tick);
    }

    function resize() {
      ({width, height} = stage.getBoundingClientRect());
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

    rotateModel = (dx, dy) => {
      markView(null);
      yaw -= dx * .012;
      pitch = Math.max(-1.42, Math.min(1.42, pitch + dy * .012));
      render();
    };
    resetView = () => selectView('home');
    for (const button of viewButtons) button.addEventListener('click', () => {
      if (!rotateModel) return;
      selectView(button.dataset.view);
      render();
    });
    viewMenu.hidden = false;
    rotateHint.hidden = false;
    stage.classList.add('has-model');
    const observer = new ResizeObserver(resize);
    observer.observe(stage);
    canvas.addEventListener('webglcontextlost', () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      rotateModel = resetView = null;
      stage.classList.remove('has-model');
      rotateHint.hidden = viewMenu.hidden = true;
      zoomModel = null;
      drawModel = null;
      canvas.hidden = true;
      preview.hidden = false;
      show();
    });
    drawModel = update;
    canvas.hidden = false;
    preview.hidden = true;
    zoomModel = scale => {
      camera.zoom = scale;
      camera.updateProjectionMatrix();
      render();
    };
    camera.zoom = zoomLevels[zoomIndex];
    resize();
    update(step);
  }

  if (window.THREE) loadModel(window.THREE).catch(() => {
    // The same controls stay available on devices using the photo preview.
  });
})();
