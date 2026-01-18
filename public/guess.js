const API_BASE = 'http://localhost:3000/api';

// Load guess data from sessionStorage
const guessData = JSON.parse(sessionStorage.getItem('guessData') || '{}');
let sessionId = guessData.sessionId || null;

// DOM elements
const guessText = document.getElementById('guess-text');
const guessDescription = document.getElementById('guess-description');
const guessImageContainer = document.getElementById('guess-image-container');
const guessImage = document.getElementById('guess-image');
const correctBtn = document.getElementById('correct-btn');
const wrongBtn = document.getElementById('wrong-btn');
const continueBtn = document.getElementById('continue-btn');
const wrongInput = document.getElementById('wrong-input');
const actualAnswerInput = document.getElementById('actual-answer');
const submitAnswerBtn = document.getElementById('submit-answer-btn');

// Initialize 3D model for guess page
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        // We'll need to copy the 3D model code here since we can't import it easily
        initGuessPage3DModel();
    });
} else {
    initGuessPage3DModel();
}

// Copy 3D model initialization code here for guess page
async function initGuessPage3DModel() {
    try {
        const { Scene, PerspectiveCamera, WebGLRenderer, AmbientLight, DirectionalLight, PointLight, HemisphereLight, Box3, Vector3 } = await import('three');
        const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
        
        const canvas = document.getElementById('noema3d-canvas-guess');
        if (!canvas) return;

        const scene3D = new Scene();
        scene3D.background = null;

        const width = 300;
        const height = 350;
        const camera3D = new PerspectiveCamera(50, width / height, 0.1, 1000);
        camera3D.position.set(0, 0, 3);

        const renderer3D = new WebGLRenderer({ 
            canvas: canvas, 
            alpha: true, 
            antialias: true 
        });
        renderer3D.setSize(width, height);
        renderer3D.setPixelRatio(window.devicePixelRatio);

        // Lighting
        const ambientLight = new AmbientLight(0xffffff, 1.5);
        scene3D.add(ambientLight);
        const hemisphereLight = new HemisphereLight(0xffdd99, 0xaaaaff, 2.0);
        scene3D.add(hemisphereLight);
        const mainLight = new DirectionalLight(0xffdd99, 3.5);
        mainLight.position.set(5, 5, 5);
        scene3D.add(mainLight);

        // Load model
        const loader = new GLTFLoader();
        loader.load(
            'noema3d.glb',
            (gltf) => {
                const model3D = gltf.scene;
                const box = new Box3().setFromObject(model3D);
                const center = box.getCenter(new Vector3());
                const size = box.getSize(new Vector3());
                const maxDim = Math.max(size.x, size.y, size.z);
                const scale = 2.0 / maxDim;
                model3D.scale.multiplyScalar(scale);
                model3D.position.sub(center.multiplyScalar(scale));
                scene3D.add(model3D);
                
                function animate() {
                    requestAnimationFrame(animate);
                    renderer3D.render(scene3D, camera3D);
                }
                animate();
            },
            undefined,
            (error) => console.error('Error loading 3D model:', error)
        );
    } catch (error) {
        console.error('Error initializing 3D model:', error);
    }
}

// Load guess data on page load
if (guessData.guessName) {
    guessText.textContent = guessData.guessName;
    
    if (guessData.guessDescription) {
        guessDescription.textContent = guessData.guessDescription;
        guessDescription.style.display = 'block';
    }
    
    if (guessData.guessImage) {
        guessImage.src = guessData.guessImage;
        guessImageContainer.style.display = 'block';
    }
}

// Handle continue questioning
async function handleContinue() {
    const targetUrl = window.location.origin + '/index.html';
    console.log('Redirecting from', window.location.href, 'to:', targetUrl);
    window.location.href = targetUrl;
}

// Handle guess result
async function handleGuessResult(correct) {
    if (!sessionId) {
        const targetUrl = window.location.origin + '/index.html';
        window.location.href = targetUrl;
        return;
    }

    if (correct) {
        const response = await fetch(`${API_BASE}/game/guess-result`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                sessionId,
                correct: true
            })
        });

        if (response.ok) {
            const targetUrl = window.location.origin + '/index.html';
            console.log('Redirecting from', window.location.href, 'to:', targetUrl);
            window.location.href = targetUrl;
        }
    } else {
        wrongInput.style.display = 'block';
        wrongBtn.disabled = true;
        correctBtn.disabled = true;
    }
}

// Submit actual answer when guess is wrong
async function submitActualAnswer() {
    if (!sessionId) return;

    const actualAnswer = actualAnswerInput.value.trim();
    if (!actualAnswer) {
        alert('Please enter who you were thinking of.');
        return;
    }

    const response = await fetch(`${API_BASE}/game/guess-result`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            sessionId,
            correct: false,
            actualAnswer
        })
    });

    if (response.ok) {
        const targetUrl = window.location.origin + '/index.html';
        console.log('Redirecting from', window.location.href, 'to:', targetUrl);
        window.location.href = targetUrl;
    }
}

// Event listeners
correctBtn.addEventListener('click', () => handleGuessResult(true));
wrongBtn.addEventListener('click', () => handleGuessResult(false));
continueBtn.addEventListener('click', handleContinue);
submitAnswerBtn.addEventListener('click', submitActualAnswer);

actualAnswerInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        submitActualAnswer();
    }
});
