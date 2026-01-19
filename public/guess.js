const API_BASE = '/api';

// Load game session or guess data from sessionStorage
const gameSession = JSON.parse(sessionStorage.getItem('gameSession') || '{}');
const guessData = JSON.parse(sessionStorage.getItem('guessData') || '{}');
let sessionId = gameSession.sessionId || guessData.sessionId || null;
let currentQuestionCount = gameSession.questionCount || 0;

// DOM elements
const gameScreen = document.getElementById('game-screen');
const guessScreen = document.getElementById('guess-screen');
const questionText = document.getElementById('question-text');
const questionNumber = document.getElementById('question-number');
const answerButtons = document.querySelectorAll('.btn-answer');
const loading = document.getElementById('loading');
const guessQuestionNumber = document.getElementById('guess-question-number');
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

// 3D Model variables for guess page
let scene3DGuess, camera3DGuess, renderer3DGuess, model3DGuess;
let mouseXGuess = 0;
let mouseYGuess = 0;
let targetRotationYGuess = 0;
let targetRotationXGuess = 0;
let currentRotationYGuess = 0;
let currentRotationXGuess = 0;
const rotationSensitivityGuess = 0.002;
const rotationSmoothingGuess = 0.1;

// 3D Model variables for game screen (questions page)
let scene3DGame, camera3DGame, renderer3DGame, model3DGame;
let targetRotationYGame = 0;
let targetRotationXGame = 0;
let currentRotationYGame = 0;
let currentRotationXGame = 0;
const rotationSmoothingGame = 0.1;

// Copy full 3D model initialization code from home page (with glow and all lighting)
async function initGuessPage3DModel() {
    try {
        const { Scene, PerspectiveCamera, WebGLRenderer, AmbientLight, DirectionalLight, PointLight, HemisphereLight, Box3, Vector3 } = await import('three');
        const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
        
        const canvas = document.getElementById('noema3d-canvas-guess');
        if (!canvas) return;

        // Scene setup
        scene3DGuess = new Scene();
        scene3DGuess.background = null;

        // Camera setup
        const width = 320;
        const height = 380;
        camera3DGuess = new PerspectiveCamera(50, width / height, 0.1, 1000);
        camera3DGuess.position.set(0, 0, 3);

        // Renderer setup
        renderer3DGuess = new WebGLRenderer({ 
            canvas: canvas, 
            alpha: true, 
            antialias: true 
        });
        renderer3DGuess.setSize(width, height);
        renderer3DGuess.setPixelRatio(window.devicePixelRatio);

        // Track mouse movement for rotation
        const handleMouseMove = (event) => {
            const rect = canvas.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            
            const deltaX = event.clientX - centerX;
            const deltaY = event.clientY - centerY;
            
            const refDistance = 800;
            targetRotationYGuess = Math.atan2(deltaX, refDistance) * 0.3;
            targetRotationXGuess = Math.atan2(deltaY, refDistance) * 0.3;
            
            const threshold = 20;
            if (Math.abs(deltaX) < threshold && Math.abs(deltaY) < threshold) {
                targetRotationYGuess = 0;
                targetRotationXGuess = 0;
            }
        };

        window.addEventListener('mousemove', handleMouseMove);

        // Enhanced lighting setup - same as home page
        const ambientLight = new AmbientLight(0xffffff, 1.5);
        scene3DGuess.add(ambientLight);

        const hemisphereLight = new HemisphereLight(0xffdd99, 0xaaaaff, 2.0);
        scene3DGuess.add(hemisphereLight);

        const mainLight = new DirectionalLight(0xffdd99, 3.5);
        mainLight.position.set(5, 5, 5);
        mainLight.castShadow = false;
        scene3DGuess.add(mainLight);

        const fillLight = new DirectionalLight(0xffcc99, 2.5);
        fillLight.position.set(-5, 3, -5);
        scene3DGuess.add(fillLight);

        const rimLight = new DirectionalLight(0xffffff, 2.0);
        rimLight.position.set(0, -5, -5);
        scene3DGuess.add(rimLight);

        const sideLight = new DirectionalLight(0xffaa66, 2.0);
        sideLight.position.set(0, 0, 5);
        scene3DGuess.add(sideLight);

        const pointLight1 = new PointLight(0xffdd99, 3.0, 20);
        pointLight1.position.set(4, 4, 4);
        scene3DGuess.add(pointLight1);

        const pointLight2 = new PointLight(0xffcc99, 2.5, 20);
        pointLight2.position.set(-4, -4, -4);
        scene3DGuess.add(pointLight2);

        const pointLight3 = new PointLight(0xffffff, 2.0, 18);
        pointLight3.position.set(0, 5, 0);
        scene3DGuess.add(pointLight3);

        const pointLight4 = new PointLight(0xffaa66, 1.8, 18);
        pointLight4.position.set(5, 0, 0);
        scene3DGuess.add(pointLight4);

        const pointLight5 = new PointLight(0xffaa66, 1.8, 18);
        pointLight5.position.set(-5, 0, 0);
        scene3DGuess.add(pointLight5);

        // Load GLB model
        const loader = new GLTFLoader();
        loader.load(
            'noema3d.glb',
            (gltf) => {
                model3DGuess = gltf.scene;
                
                // Make model materials reflective and brighter (same as home page)
                model3DGuess.traverse((child) => {
                    if (child.isMesh) {
                        child.castShadow = false;
                        child.receiveShadow = false;
                        
                        if (child.material) {
                            const materials = Array.isArray(child.material) ? child.material : [child.material];
                            
                            materials.forEach((material) => {
                                if (material.emissive !== undefined) {
                                    material.emissive.setHex(0x664422);
                                    material.emissiveIntensity = 0.15;
                                }
                                
                                if (material.metalness !== undefined) {
                                    material.metalness = 0.6;
                                }
                                if (material.roughness !== undefined) {
                                    material.roughness = 0.3;
                                }
                                
                                if (material.color) {
                                    const currentColor = material.color.clone();
                                    material.color = currentColor.multiplyScalar(1.3);
                                }
                                
                                material.needsUpdate = true;
                            });
                            
                            if (!Array.isArray(child.material)) {
                                child.material = materials[0];
                            }
                        }
                    }
                });
                
                // Center and scale model
                const box = new Box3().setFromObject(model3DGuess);
                const center = box.getCenter(new Vector3());
                const size = box.getSize(new Vector3());
                const maxDim = Math.max(size.x, size.y, size.z);
                const scale = 2.0 / maxDim;
                
                model3DGuess.scale.multiplyScalar(scale);
                model3DGuess.position.sub(center.multiplyScalar(scale));
                
                scene3DGuess.add(model3DGuess);
                animateGuess3D();
            },
            (progress) => {
                if (progress.lengthComputable) {
                    console.log('Loading progress:', (progress.loaded / progress.total * 100) + '%');
                }
            },
            (error) => console.error('Error loading 3D model:', error)
        );
    } catch (error) {
        console.error('Error initializing 3D model:', error);
    }
}

function animateGuess3D() {
    requestAnimationFrame(animateGuess3D);
    
    if (model3DGuess) {
        currentRotationYGuess += (targetRotationYGuess - currentRotationYGuess) * rotationSmoothingGuess;
        currentRotationXGuess += (targetRotationXGuess - currentRotationXGuess) * rotationSmoothingGuess;
        
        model3DGuess.rotation.y = currentRotationYGuess;
        model3DGuess.rotation.x = currentRotationXGuess;
        model3DGuess.rotation.z = 0;
    }
    
    if (renderer3DGuess && scene3DGuess && camera3DGuess) {
        renderer3DGuess.render(scene3DGuess, camera3DGuess);
    }
}

function animateGame3D() {
    requestAnimationFrame(animateGame3D);
    
    if (model3DGame) {
        currentRotationYGame += (targetRotationYGame - currentRotationYGame) * rotationSmoothingGame;
        currentRotationXGame += (targetRotationXGame - currentRotationXGame) * rotationSmoothingGame;
        
        model3DGame.rotation.y = currentRotationYGame;
        model3DGame.rotation.x = currentRotationXGame;
        model3DGame.rotation.z = 0;
    }
    
    if (renderer3DGame && scene3DGame && camera3DGame) {
        renderer3DGame.render(scene3DGame, camera3DGame);
    }
}

// Show a specific screen
function showScreen(screen) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    screen.classList.add('active');
    
    if (screen.id === 'guess-screen') {
        document.body.classList.add('guess-screen-active');
        document.body.classList.remove('game-screen-active');
    } else if (screen.id === 'game-screen') {
        document.body.classList.add('game-screen-active');
        document.body.classList.remove('guess-screen-active');
    }
}

// Initialize 3D model for game screen (same as home page with cursor tracking and glow)
async function initGamePage3DModel() {
    try {
        const { Scene, PerspectiveCamera, WebGLRenderer, AmbientLight, DirectionalLight, PointLight, HemisphereLight, Box3, Vector3 } = await import('three');
        const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
        
        const canvas = document.getElementById('noema3d-canvas-game');
        if (!canvas) return;

        // Scene setup
        scene3DGame = new Scene();
        scene3DGame.background = null;

        // Camera setup
        const width = 320;
        const height = 380;
        camera3DGame = new PerspectiveCamera(50, width / height, 0.1, 1000);
        camera3DGame.position.set(0, 0, 3);

        // Renderer setup
        renderer3DGame = new WebGLRenderer({ 
            canvas: canvas, 
            alpha: true, 
            antialias: true 
        });
        renderer3DGame.setSize(width, height);
        renderer3DGame.setPixelRatio(window.devicePixelRatio);

        // Track mouse movement for rotation - anywhere on screen (same as home page)
        const handleMouseMove = (event) => {
            const rect = canvas.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            
            const deltaX = event.clientX - centerX;
            const deltaY = event.clientY - centerY;
            
            const refDistance = 800;
            targetRotationYGame = Math.atan2(deltaX, refDistance) * 0.3;
            targetRotationXGame = Math.atan2(deltaY, refDistance) * 0.3;
            
            const threshold = 20;
            if (Math.abs(deltaX) < threshold && Math.abs(deltaY) < threshold) {
                targetRotationYGame = 0;
                targetRotationXGame = 0;
            }
        };

        window.addEventListener('mousemove', handleMouseMove);

        // Enhanced lighting setup - same as home page
        const ambientLight = new AmbientLight(0xffffff, 1.5);
        scene3DGame.add(ambientLight);

        const hemisphereLight = new HemisphereLight(0xffdd99, 0xaaaaff, 2.0);
        scene3DGame.add(hemisphereLight);

        const mainLight = new DirectionalLight(0xffdd99, 3.5);
        mainLight.position.set(5, 5, 5);
        mainLight.castShadow = false;
        scene3DGame.add(mainLight);

        const fillLight = new DirectionalLight(0xffcc99, 2.5);
        fillLight.position.set(-5, 3, -5);
        scene3DGame.add(fillLight);

        const rimLight = new DirectionalLight(0xffffff, 2.0);
        rimLight.position.set(0, -5, -5);
        scene3DGame.add(rimLight);

        const sideLight = new DirectionalLight(0xffaa66, 2.0);
        sideLight.position.set(0, 0, 5);
        scene3DGame.add(sideLight);

        const pointLight1 = new PointLight(0xffdd99, 3.0, 20);
        pointLight1.position.set(4, 4, 4);
        scene3DGame.add(pointLight1);

        const pointLight2 = new PointLight(0xffcc99, 2.5, 20);
        pointLight2.position.set(-4, -4, -4);
        scene3DGame.add(pointLight2);

        const pointLight3 = new PointLight(0xffffff, 2.0, 18);
        pointLight3.position.set(0, 5, 0);
        scene3DGame.add(pointLight3);

        const pointLight4 = new PointLight(0xffaa66, 1.8, 18);
        pointLight4.position.set(5, 0, 0);
        scene3DGame.add(pointLight4);

        const pointLight5 = new PointLight(0xffaa66, 1.8, 18);
        pointLight5.position.set(-5, 0, 0);
        scene3DGame.add(pointLight5);

        // Load GLB model
        const loader = new GLTFLoader();
        loader.load(
            'noema3d.glb',
            (gltf) => {
                model3DGame = gltf.scene;
                
                // Make model materials reflective and brighter (same as home page)
                model3DGame.traverse((child) => {
                    if (child.isMesh) {
                        child.castShadow = false;
                        child.receiveShadow = false;
                        
                        if (child.material) {
                            const materials = Array.isArray(child.material) ? child.material : [child.material];
                            
                            materials.forEach((material) => {
                                if (material.emissive !== undefined) {
                                    material.emissive.setHex(0x664422);
                                    material.emissiveIntensity = 0.15;
                                }
                                
                                if (material.metalness !== undefined) {
                                    material.metalness = 0.6;
                                }
                                if (material.roughness !== undefined) {
                                    material.roughness = 0.3;
                                }
                                
                                if (material.color) {
                                    const currentColor = material.color.clone();
                                    material.color = currentColor.multiplyScalar(1.3);
                                }
                                
                                material.needsUpdate = true;
                            });
                            
                            if (!Array.isArray(child.material)) {
                                child.material = materials[0];
                            }
                        }
                    }
                });
                
                // Center and scale model
                const box = new Box3().setFromObject(model3DGame);
                const center = box.getCenter(new Vector3());
                const size = box.getSize(new Vector3());
                const maxDim = Math.max(size.x, size.y, size.z);
                const scale = 2.0 / maxDim;
                
                model3DGame.scale.multiplyScalar(scale);
                model3DGame.position.sub(center.multiplyScalar(scale));
                
                scene3DGame.add(model3DGame);
                animateGame3D();
            },
            (progress) => {
                if (progress.lengthComputable) {
                    console.log('Loading progress:', (progress.loaded / progress.total * 100) + '%');
                }
            },
            (error) => console.error('Error loading 3D model:', error)
        );
    } catch (error) {
        console.error('Error initializing 3D model:', error);
    }
}

// Submit an answer
async function submitAnswer(answer) {
    if (!sessionId) return;

    try {
        loading.style.display = 'block';
        answerButtons.forEach(btn => btn.disabled = true);

        const response = await fetch(`${API_BASE}/game/answer`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                sessionId,
                answer
            })
        });

        if (!response.ok) {
            throw new Error('Failed to submit answer');
        }

        const data = await response.json();
        currentQuestionCount = data.questionCount;
        
        // Check if this is a guess
        if (data.isGuess) {
            // Store guess data and show guess screen
            const guessName = data.guessName || data.question.replace(/^(I think you are thinking of|Are you thinking of)[:\s]+/i, '').replace(/[?\.]$/, '').trim();
            
            sessionStorage.setItem('guessData', JSON.stringify({
                guessName: guessName,
                guessImage: data.guessImage,
                guessDescription: data.guessDescription,
                sessionId: sessionId,
                questionCount: currentQuestionCount
            }));
            
            // Show guess screen
            showScreen(guessScreen);
            guessText.textContent = guessName;
            
            // Display question number
            if (guessQuestionNumber) {
                guessQuestionNumber.textContent = `${currentQuestionCount}.`;
            }
            
            if (data.guessDescription) {
                guessDescription.textContent = data.guessDescription;
                guessDescription.style.display = 'block';
            }
            
            if (data.guessImage) {
                guessImage.src = data.guessImage;
                guessImageContainer.style.display = 'block';
            }
            
            // Initialize guess screen 3D model
            initGuessPage3DModel();
        } else {
            // Continue with questions
            questionText.textContent = data.question;
            if (questionNumber) {
                questionNumber.textContent = `${currentQuestionCount}.`;
            }
        }

        loading.style.display = 'none';
        answerButtons.forEach(btn => btn.disabled = false);
    } catch (error) {
        console.error('Error submitting answer:', error);
        alert('Failed to submit answer. Please try again.');
        loading.style.display = 'none';
        answerButtons.forEach(btn => btn.disabled = false);
    }
}

// Initialize page based on session data
if (gameSession.sessionId && gameSession.question) {
    // We were redirected from start game - show game screen
    showScreen(gameScreen);
    questionText.textContent = gameSession.question;
    currentQuestionCount = gameSession.questionCount || 1;
    if (questionNumber) {
        questionNumber.textContent = `${currentQuestionCount}.`;
    }
    
    // Initialize 3D model for game screen
    initGamePage3DModel();
    
    // Set up answer button listeners
    answerButtons.forEach(btn => {
        btn.addEventListener('click', () => submitAnswer(btn.dataset.answer));
    });
} else if (!gameSession.sessionId && !guessData.guessName) {
    // No session data yet - start game API call
    showScreen(gameScreen);
    loading.style.display = 'block';
    
    fetch(`${API_BASE}/game/start`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    }).then(response => {
        if (!response.ok) {
            throw new Error('Failed to start game');
        }
        return response.json();
    }).then(data => {
        sessionId = data.sessionId;
        sessionStorage.setItem('gameSession', JSON.stringify({
            sessionId: data.sessionId,
            question: data.question,
            questionCount: 1
        }));
        
        questionText.textContent = data.question;
        currentQuestionCount = 1;
        if (questionNumber) {
            questionNumber.textContent = `${currentQuestionCount}.`;
        }
        
        loading.style.display = 'none';
        initGamePage3DModel();
        
        answerButtons.forEach(btn => {
            btn.addEventListener('click', () => submitAnswer(btn.dataset.answer));
        });
    }).catch(error => {
        console.error('Error starting game:', error);
        alert('Failed to start game. Please make sure the server is running.');
        loading.style.display = 'none';
    });
} else if (guessData.guessName) {
    // We have guess data - show guess screen
    showScreen(guessScreen);
    guessText.textContent = guessData.guessName;
    
    // Display question number
    if (guessQuestionNumber && guessData.questionCount) {
        guessQuestionNumber.textContent = `${guessData.questionCount}.`;
    }
    
    if (guessData.guessDescription) {
        guessDescription.textContent = guessData.guessDescription;
        guessDescription.style.display = 'block';
    }
    
    if (guessData.guessImage) {
        guessImage.src = guessData.guessImage;
        guessImageContainer.style.display = 'block';
    }
    
    // Initialize guess screen 3D model
    initGuessPage3DModel();
} else {
    // No session data - redirect back to index
    window.location.href = window.location.origin + '/index.html';
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
