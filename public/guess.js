const API_BASE = '/api';

// Clear session storage on page load to reset the game
sessionStorage.removeItem('gameSession');
sessionStorage.removeItem('guessData');

// Ensure back button is visible immediately
document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('back-btn');
    console.log('Back button element:', btn);
    if (btn) {
        // Force all styles with cssText
        btn.style.cssText = 'position: fixed !important; top: 20px !important; left: 20px !important; padding: 12px 20px !important; border: 3px solid #ff6b35 !important; border-radius: 4px !important; font-size: 18px !important; font-weight: 700 !important; cursor: pointer !important; color: white !important; text-shadow: 2px 2px 0px rgba(0, 0, 0, 0.5) !important; background-color: #ff6b35 !important; font-family: "VT323", monospace !important; z-index: 999999 !important; display: block !important; visibility: visible !important; opacity: 1 !important; box-shadow: 0 4px 8px rgba(0,0,0,0.3) !important;';
        console.log('Back button styles applied');
        console.log('Button position:', btn.getBoundingClientRect());
        console.log('Computed display:', window.getComputedStyle(btn).display);
        console.log('Computed visibility:', window.getComputedStyle(btn).visibility);
        console.log('Computed opacity:', window.getComputedStyle(btn).opacity);
        console.log('Computed z-index:', window.getComputedStyle(btn).zIndex);
    } else {
        console.error('Back button NOT FOUND in DOM!');
    }
});

// Also try immediately (for module scripts)
setTimeout(() => {
    const btn = document.getElementById('back-btn');
    if (btn) {
        console.log('Button found, applying styles...');
        console.log('Button computed styles:', window.getComputedStyle(btn));
        btn.style.cssText = 'position: fixed !important; top: 20px !important; left: 20px !important; padding: 12px 20px !important; border: 3px solid #ff6b35 !important; border-radius: 4px !important; font-size: 18px !important; font-weight: 700 !important; cursor: pointer !important; color: white !important; text-shadow: 2px 2px 0px rgba(0, 0, 0, 0.5) !important; background-color: #ff6b35 !important; font-family: "VT323", monospace !important; z-index: 999999 !important; display: block !important; visibility: visible !important; opacity: 1 !important; box-shadow: 0 4px 8px rgba(0,0,0,0.3) !important;';
        console.log('Button after styles:', btn);
        console.log('Button offset:', btn.offsetTop, btn.offsetLeft);
        console.log('Button getBoundingClientRect:', btn.getBoundingClientRect());
    }
}, 100);

// Load game session or guess data from sessionStorage (will be empty after reset)
const gameSession = {};
const guessData = {};
let sessionId = null;
let currentQuestionCount = 0;
let conversationHistory = []; // Store conversation history locally

// DOM elements
const gameScreen = document.getElementById('game-screen');
const guessScreen = document.getElementById('guess-screen');
const questionText = document.getElementById('question-text');
const questionNumber = document.getElementById('question-number');
const answerButtons = document.querySelectorAll('.btn-answer');
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
const backBtn = document.getElementById('back-btn');
const backQuestionBtn = document.getElementById('back-question-btn');
const copyText = document.getElementById('copy-text');

// Initialize 3D models immediately - don't wait for DOMContentLoaded
// Start loading both models right away
initGuessPage3DModel();
initGamePage3DModel();

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
        if (!canvas) {
            // Canvas not ready yet, try again after a short delay
            setTimeout(() => initGuessPage3DModel(), 100);
            return;
        }

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
                // Loading progress - removed console log
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
        // Show back button for guess screen
        if (backBtn) backBtn.style.display = 'block';
        if (backQuestionBtn) backQuestionBtn.style.display = 'none';
    } else if (screen.id === 'game-screen') {
        document.body.classList.add('game-screen-active');
        document.body.classList.remove('guess-screen-active');
        // Show back question button if we have history (after first question)
        if (backQuestionBtn && conversationHistory.length > 2) {
            backQuestionBtn.style.display = 'flex';
        } else if (backQuestionBtn) {
            backQuestionBtn.style.display = 'none';
        }
        if (backBtn) backBtn.style.display = 'none';
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
                // Loading progress - removed console log
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
        answerButtons.forEach(btn => btn.disabled = true);

        const response = await fetch(`${API_BASE}/game/answer`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                sessionId,
                answer,
                conversationHistory: conversationHistory
            })
        });

        if (!response.ok) {
            // If session not found, start a new game
            if (response.status === 404) {
                const errorData = await response.json().catch(() => ({}));
                if (errorData.error === 'Game session not found') {
                    // Start a new game
                    const startResponse = await fetch(`${API_BASE}/game/start`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        }
                    });
                    
                    if (!startResponse.ok) {
                        throw new Error('Failed to start new game');
                    }
                    
                    const startData = await startResponse.json();
                    sessionId = startData.sessionId;
                    currentQuestionCount = 1;
                    sessionStorage.setItem('gameSession', JSON.stringify({
                        sessionId: startData.sessionId,
                        question: startData.question,
                        questionCount: 1
                    }));
                    
                    // Show the new question - fade-in only on initial page load
                    questionText.textContent = startData.question;
                    if (questionNumber) {
                        questionNumber.textContent = `${currentQuestionCount}.`;
                    }
                    
                    answerButtons.forEach(btn => btn.disabled = false);
                    return;
                }
            }
            throw new Error('Failed to submit answer');
        }

        const data = await response.json();
        currentQuestionCount = data.questionCount;
        
        // Store conversation history locally
        conversationHistory.push({
            role: 'user',
            content: answer
        });
        conversationHistory.push({
            role: 'assistant',
            content: data.question
        });
        
        // Show back button if we have history (after first question)
        if (backQuestionBtn && conversationHistory.length > 2) {
            backQuestionBtn.style.display = 'flex';
        }
        
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
            
            // ALWAYS try to show image - fetch if not provided
            if (data.guessImage) {
                guessImage.src = data.guessImage;
                guessImageContainer.style.display = 'block';
            } else if (guessName) {
                // If no image provided, try to fetch it
                fetch(`${API_BASE}/game/info/${encodeURIComponent(guessName)}`)
                    .then(res => res.json())
                    .then(info => {
                        if (info.imageUrl) {
                            guessImage.src = info.imageUrl;
                            guessImageContainer.style.display = 'block';
                        } else {
                            // Show placeholder or hide container
                            guessImageContainer.style.display = 'none';
                        }
                    })
                    .catch(() => {
                        guessImageContainer.style.display = 'none';
                    });
            } else {
                guessImageContainer.style.display = 'none';
            }
            
            // 3D model already initialized at page load
        } else {
            // Continue with questions - no fade-in animation on updates
            questionText.textContent = data.question;
            if (questionNumber) {
                questionNumber.textContent = `${currentQuestionCount}.`;
            }
        }

        answerButtons.forEach(btn => btn.disabled = false);
    } catch (error) {
        console.error('Error submitting answer:', error);
        alert('Failed to submit answer. Please try again.');
        answerButtons.forEach(btn => btn.disabled = false);
    }
}

// Initialize page based on session data
if (gameSession.sessionId && gameSession.question) {
    // We were redirected from start game - show game screen
    showScreen(gameScreen);
    // Reset and retrigger fade-in animation
    questionText.style.animation = 'none';
    if (questionNumber) {
        questionNumber.style.animation = 'none';
    }
    void questionText.offsetWidth;
    if (questionNumber) {
        void questionNumber.offsetWidth;
    }
    questionText.style.animation = 'fadein 400ms ease-in 2000ms both';
    if (questionNumber) {
        questionNumber.style.animation = 'fadein 400ms ease-in 2000ms both';
    }
    // Initialize conversation history with first question
    conversationHistory = [{
        role: 'assistant',
        content: gameSession.question
    }];
    questionText.textContent = gameSession.question;
    currentQuestionCount = gameSession.questionCount || 1;
    if (questionNumber) {
        questionNumber.textContent = `${currentQuestionCount}.`;
    }
    
    // Hide back button on first question
    if (backQuestionBtn) {
        backQuestionBtn.style.display = 'none';
    }
    
    // 3D model already initialized at page load
    // Set up answer button listeners
    answerButtons.forEach(btn => {
        btn.addEventListener('click', () => submitAnswer(btn.dataset.answer));
    });
} else if (!gameSession.sessionId && !guessData.guessName) {
    // No session data yet - start game API call
    showScreen(gameScreen);
    
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
        
        // Initialize conversation history with first question
        conversationHistory = [{
            role: 'assistant',
            content: data.question
        }];
        
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
        
        // Hide back button on first question
        if (backQuestionBtn) {
            backQuestionBtn.style.display = 'none';
        }
        
        // 3D model already initialized at page load
        
        answerButtons.forEach(btn => {
            btn.addEventListener('click', () => submitAnswer(btn.dataset.answer));
        });
    }).catch(error => {
        console.error('Error starting game:', error);
        alert('Failed to start game. Please make sure the server is running.');
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
    
    // ALWAYS try to show image - fetch if not provided
    if (guessData.guessImage) {
        guessImage.src = guessData.guessImage;
        guessImageContainer.style.display = 'block';
    } else if (guessData.guessName) {
        // If no image provided, try to fetch it
        fetch(`${API_BASE}/game/info/${encodeURIComponent(guessData.guessName)}`)
            .then(res => res.json())
            .then(info => {
                if (info.imageUrl) {
                    guessImage.src = info.imageUrl;
                    guessImageContainer.style.display = 'block';
                } else {
                    guessImageContainer.style.display = 'none';
                }
            })
            .catch(() => {
                guessImageContainer.style.display = 'none';
            });
    } else {
        guessImageContainer.style.display = 'none';
    }
    
    // 3D model already initialized at page load
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

// Handle back button - go to home page
if (backBtn) {
    // Force button to be visible
    backBtn.style.display = 'block';
    backBtn.style.visibility = 'visible';
    backBtn.style.opacity = '1';
    backBtn.style.position = 'fixed';
    backBtn.style.top = '20px';
    backBtn.style.left = '20px';
    backBtn.style.zIndex = '99999';
    
    backBtn.addEventListener('click', () => {
        // Clear session data and go to home page
        sessionStorage.removeItem('gameSession');
        sessionStorage.removeItem('guessData');
        window.location.href = window.location.origin + '/index.html';
    });
} else {
    console.error('Back button not found!');
}

// Handle copyable text - always show "CA: ..." and copy it
if (copyText) {
    // Always show "CA: ..."
    copyText.textContent = 'CA: ...';
    
    // Copy to clipboard on click
    copyText.addEventListener('click', async () => {
        const textToCopy = '...';
        
        try {
            await navigator.clipboard.writeText(textToCopy);
            // Visual feedback - white color
            const originalText = copyText.textContent;
            copyText.textContent = 'Copied!';
            copyText.style.color = '#ffffff';
            setTimeout(() => {
                copyText.textContent = 'CA: ...';
                copyText.style.color = '#ff6b35';
            }, 1000);
        } catch (err) {
            console.error('Failed to copy:', err);
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = textToCopy;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            const originalText = copyText.textContent;
            copyText.textContent = 'Copied!';
            copyText.style.color = '#ffffff';
            setTimeout(() => {
                copyText.textContent = 'CA: ...';
                copyText.style.color = '#ff6b35';
            }, 1000);
        }
    });
}

// Handle back button for questions - go back one question
if (backQuestionBtn) {
    backQuestionBtn.addEventListener('click', async () => {
        // Need at least 2 messages (one question and one answer) to go back
        if (conversationHistory.length < 2) {
            // Can't go back if no history
            return;
        }
        
        // Make a copy before modifying
        const updatedHistory = [...conversationHistory];
        
        // Remove last question and answer from local history
        // Last message should be assistant (question), second to last should be user (answer)
        if (updatedHistory.length >= 2) {
            const lastMsg = updatedHistory[updatedHistory.length - 1];
            const secondLastMsg = updatedHistory[updatedHistory.length - 2];
            
            // Verify structure before removing
            if (lastMsg && lastMsg.role === 'assistant' && secondLastMsg && secondLastMsg.role === 'user') {
                updatedHistory.pop(); // Remove last assistant message (question)
                updatedHistory.pop(); // Remove last user message (answer)
            } else {
                console.error('Unexpected conversation history structure:', updatedHistory);
                alert('Cannot go back: unexpected conversation structure');
                return;
            }
        }
        
        // Update server with new history and get previous question
        try {
            answerButtons.forEach(btn => btn.disabled = true);
            
            const response = await fetch(`${API_BASE}/game/answer`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    sessionId,
                    answer: '',
                    conversationHistory: updatedHistory,
                    goBack: true
                })
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || 'Failed to go back');
            }
            
            const data = await response.json();
            
            if (!data.question) {
                throw new Error('No question returned from server');
            }
            
            currentQuestionCount = data.questionCount || updatedHistory.filter(m => m.role === 'assistant').length;
            
            // Update local conversation history
            conversationHistory.length = 0;
            conversationHistory.push(...updatedHistory);
            
            // Update UI
            questionText.textContent = data.question;
            if (questionNumber) {
                questionNumber.textContent = `${currentQuestionCount}.`;
            }
            
            // Hide back button if we're at the first question
            if (backQuestionBtn && updatedHistory.length <= 2) {
                backQuestionBtn.style.display = 'none';
            } else if (backQuestionBtn) {
                backQuestionBtn.style.display = 'flex';
            }
            
            answerButtons.forEach(btn => btn.disabled = false);
        } catch (error) {
            console.error('Error going back:', error);
            alert('Failed to go back: ' + error.message);
            answerButtons.forEach(btn => btn.disabled = false);
        }
    });
}
