// 3D Model setup - using ES modules
let scene3D, camera3D, renderer3D, model3D;
let mouseX = 0;
let mouseY = 0;
let targetRotationY = 0;
let targetRotationX = 0;
let currentRotationY = 0;
let currentRotationX = 0;

// Rotation sensitivity
const rotationSensitivity = 0.002;
const rotationSmoothing = 0.1;

async function init3DModel(canvasId = 'noema3d-canvas') {
    try {
        const { Scene, PerspectiveCamera, WebGLRenderer, AmbientLight, DirectionalLight, PointLight, HemisphereLight, Box3, Vector3 } = await import('three');
        const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
        
        const canvas = document.getElementById(canvasId);
        if (!canvas) {
            // Canvas doesn't exist on this page, skip
            return;
        }

        // Scene setup
        scene3D = new Scene();
        scene3D.background = null; // Transparent background

        // Camera setup
        const width = 320;
        const height = 300;
        camera3D = new PerspectiveCamera(50, width / height, 0.1, 1000);
        camera3D.position.set(0, 0, 3);

        // Renderer setup
        renderer3D = new WebGLRenderer({ 
            canvas: canvas, 
            alpha: true, 
            antialias: true 
        });
        renderer3D.setSize(width, height);
        renderer3D.setPixelRatio(window.devicePixelRatio);

        // Track mouse movement for rotation - anywhere on screen
        const handleMouseMove = (event) => {
            const rect = canvas.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            
            // Calculate direction from canvas center to cursor
            const deltaX = event.clientX - centerX;
            const deltaY = event.clientY - centerY;
            
            // Calculate distance (for scaling rotation intensity)
            const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
            const maxDistance = Math.max(window.innerWidth, window.innerHeight);
            
            // Calculate angles to face the cursor with subtle rotation
            // Reference distance for angle calculation (larger = smaller angle change)
            const refDistance = 800;
            
            // Y rotation: when cursor is right (deltaX > 0), rotate right (positive Y)
            // Using larger refDistance and smaller multiplier for subtle movement
            targetRotationY = Math.atan2(deltaX, refDistance) * 0.3;
            
            // X rotation: when cursor is below (deltaY > 0), tilt down (positive X)
            // Reduced multiplier for less extreme angles
            targetRotationX = Math.atan2(deltaY, refDistance) * 0.3;
            
            // Ensure perfect center when cursor is very close to center
            const threshold = 20; // pixels
            if (Math.abs(deltaX) < threshold && Math.abs(deltaY) < threshold) {
                targetRotationY = 0;
                targetRotationX = 0;
            }
        };

        // Add mouse move listener to entire window, not just canvas
        window.addEventListener('mousemove', handleMouseMove);

        // Enhanced lighting setup - very bright and visible
        // Ambient light for base illumination - much brighter
        const ambientLight = new AmbientLight(0xffffff, 1.5);
        scene3D.add(ambientLight);

        // Hemisphere light for natural sky/ground lighting - much brighter
        const hemisphereLight = new HemisphereLight(0xffdd99, 0xaaaaff, 2.0);
        scene3D.add(hemisphereLight);

        // Main directional light (key light) - orange tinted, very bright
        const mainLight = new DirectionalLight(0xffdd99, 3.5);
        mainLight.position.set(5, 5, 5);
        mainLight.castShadow = false;
        scene3D.add(mainLight);

        // Secondary directional light (fill light) - very bright
        const fillLight = new DirectionalLight(0xffcc99, 2.5);
        fillLight.position.set(-5, 3, -5);
        scene3D.add(fillLight);

        // Third directional light for extra highlights - very bright
        const rimLight = new DirectionalLight(0xffffff, 2.0);
        rimLight.position.set(0, -5, -5);
        scene3D.add(rimLight);

        // Additional directional light from side
        const sideLight = new DirectionalLight(0xffaa66, 2.0);
        sideLight.position.set(0, 0, 5);
        scene3D.add(sideLight);

        // Point lights for extra depth and highlights - very bright
        const pointLight1 = new PointLight(0xffdd99, 3.0, 20);
        pointLight1.position.set(4, 4, 4);
        scene3D.add(pointLight1);

        const pointLight2 = new PointLight(0xffcc99, 2.5, 20);
        pointLight2.position.set(-4, -4, -4);
        scene3D.add(pointLight2);

        const pointLight3 = new PointLight(0xffffff, 2.0, 18);
        pointLight3.position.set(0, 5, 0);
        scene3D.add(pointLight3);

        const pointLight4 = new PointLight(0xffaa66, 1.8, 18);
        pointLight4.position.set(5, 0, 0);
        scene3D.add(pointLight4);

        const pointLight5 = new PointLight(0xffaa66, 1.8, 18);
        pointLight5.position.set(-5, 0, 0);
        scene3D.add(pointLight5);

        // Load GLB model
        const loader = new GLTFLoader();
        loader.load(
            'noema3d.glb',
            (gltf) => {
                model3D = gltf.scene;
                
                // Make model materials reflective and brighter
                model3D.traverse((child) => {
                    if (child.isMesh) {
                        // Enable shadows if needed
                        child.castShadow = false;
                        child.receiveShadow = false;
                        
                        // Enhance materials for reflectiveness and brightness
                        if (child.material) {
                            // Handle array of materials
                            const materials = Array.isArray(child.material) ? child.material : [child.material];
                            
                            materials.forEach((material) => {
                                // Make material brighter and more reflective
                                if (material.emissive !== undefined) {
                                    material.emissive.setHex(0x664422); // Original orange-brown glow
                                    material.emissiveIntensity = 0.15; // Reduced brightness
                                }
                                
                                // Adjust material properties for reflectiveness
                                if (material.metalness !== undefined) {
                                    material.metalness = 0.6; // Make it more metallic/reflective
                                }
                                if (material.roughness !== undefined) {
                                    material.roughness = 0.3; // Lower roughness = more reflective
                                }
                                
                                // Increase emissive for brightness
                                if (material.color) {
                                    const currentColor = material.color.clone();
                                    material.color = currentColor.multiplyScalar(1.3); // Make colors 30% brighter
                                }
                                
                                // Enable environment mapping for reflections (if available)
                                material.needsUpdate = true;
                            });
                            
                            // If single material, ensure it's updated
                            if (!Array.isArray(child.material)) {
                                child.material = materials[0];
                            }
                        }
                    }
                });
                
                // Center and scale model - make it larger
                const box = new Box3().setFromObject(model3D);
                const center = box.getCenter(new Vector3());
                const size = box.getSize(new Vector3());
                const maxDim = Math.max(size.x, size.y, size.z);
                const scale = 2.0 / maxDim; // Slightly reduced from 2.2 to 2.0
                
                model3D.scale.multiplyScalar(scale);
                model3D.position.sub(center.multiplyScalar(scale));
                
                scene3D.add(model3D);
                animate3D();
            },
            (progress) => {
                if (progress.lengthComputable) {
                    console.log('Loading progress:', (progress.loaded / progress.total * 100) + '%');
                }
            },
            (error) => {
                console.error('Error loading 3D model:', error);
            }
        );
    } catch (error) {
        console.error('Error initializing 3D model:', error);
    }
}

function animate3D() {
    requestAnimationFrame(animate3D);
    
    if (model3D) {
        // Smooth interpolation to target rotation
        currentRotationY += (targetRotationY - currentRotationY) * rotationSmoothing;
        currentRotationX += (targetRotationX - currentRotationX) * rotationSmoothing;
        
        // Apply rotations - keep upright (no Z rotation)
        model3D.rotation.y = currentRotationY;
        model3D.rotation.x = currentRotationX;
        model3D.rotation.z = 0; // Keep model upright, no slanting
    }
    
    if (renderer3D && scene3D && camera3D) {
        renderer3D.render(scene3D, camera3D);
    }
}

// Initialize 3D model when page loads - only for existing canvases
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        // Initialize landing page canvas if it exists
        const landingCanvas = document.getElementById('noema3d-canvas');
        if (landingCanvas) {
            init3DModel('noema3d-canvas');
        }
    });
} else {
    // Initialize landing page canvas if it exists
    const landingCanvas = document.getElementById('noema3d-canvas');
    if (landingCanvas) {
        init3DModel('noema3d-canvas');
    }
}

const API_BASE = 'http://localhost:3000/api';

let sessionId = null;
let currentQuestionCount = 0;
let lastQuestion = '';

// DOM elements
const startScreen = document.getElementById('start-screen');
const gameScreen = document.getElementById('game-screen');
const guessScreen = document.getElementById('guess-screen');
const endScreen = document.getElementById('end-screen');
const startBtn = document.getElementById('start-btn');
const questionText = document.getElementById('question-text');
const questionNumber = document.getElementById('question-number');
const answerButtons = document.querySelectorAll('.btn-answer');
const loading = document.getElementById('loading');
const progressFill = document.getElementById('progress-fill');
const progressText = document.getElementById('progress-text');
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
const playAgainBtn = document.getElementById('play-again-btn');
const endTitle = document.getElementById('end-title');
const endMessage = document.getElementById('end-message');

// Show a specific screen
function showScreen(screen) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    screen.classList.add('active');
    
    // Hide header and 3D logo on guess screen and game screen
    if (screen.id === 'guess-screen') {
        document.body.classList.add('guess-screen-active');
        document.body.classList.remove('game-screen-active');
    } else if (screen.id === 'game-screen') {
        document.body.classList.add('game-screen-active');
        document.body.classList.remove('guess-screen-active');
    } else {
        document.body.classList.remove('guess-screen-active');
        document.body.classList.remove('game-screen-active');
    }
}

// Update progress bar
function updateProgress(percentage) {
    if (progressFill && progressText) {
        progressFill.style.width = `${percentage}%`;
        progressText.textContent = `${percentage}%`;
    }
}

// Load image for guess
async function loadGuessImage(guessName, existingImageUrl = null) {
    if (existingImageUrl) {
        guessImage.onerror = () => { guessImageContainer.style.display = 'none'; };
        guessImage.src = existingImageUrl;
        guessImageContainer.style.display = 'block';
        return;
    }

    if (!guessName || guessName.length < 2) {
        guessImageContainer.style.display = 'none';
        return;
    }

    // Show loading state
    guessImageContainer.style.display = 'block';
    guessImage.style.opacity = '0.5';

    try {
        // Try to get image from server
        const response = await fetch(`${API_BASE}/game/image/${encodeURIComponent(guessName)}`);
        const data = await response.json();
        
        if (data.imageUrl) {
            guessImage.onerror = () => { 
                guessImageContainer.style.display = 'none';
            };
            guessImage.onload = () => {
                guessImage.style.opacity = '1';
            };
            guessImage.src = data.imageUrl;
        } else {
            guessImageContainer.style.display = 'none';
        }
    } catch (error) {
        console.error('Error loading image:', error);
        guessImageContainer.style.display = 'none';
    }
}

// Start a new game
async function startGame() {
    try {
        showScreen(gameScreen);
        // Initialize 3D model for game screen if not already done
        const gameCanvas = document.getElementById('noema3d-canvas-game');
        if (gameCanvas && !gameCanvas.hasAttribute('data-initialized')) {
            await init3DModel('noema3d-canvas-game');
            gameCanvas.setAttribute('data-initialized', 'true');
        }
        loading.style.display = 'block';
        answerButtons.forEach(btn => btn.disabled = true);

        const response = await fetch(`${API_BASE}/game/start`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error('Failed to start game');
        }

        const data = await response.json();
        sessionId = data.sessionId;
        currentQuestionCount = 1;
        lastQuestion = data.question;
        questionNumber.textContent = `Question ${currentQuestionCount}`;
        questionText.textContent = data.question;
        updateProgress(0);
        loading.style.display = 'none';
        answerButtons.forEach(btn => btn.disabled = false);
    } catch (error) {
        console.error('Error starting game:', error);
        alert('Failed to start game. Please make sure the server is running.');
        showScreen(startScreen);
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
        questionNumber.textContent = `Question ${currentQuestionCount}`;
        
        // Update progress bar
        if (data.progress !== undefined) {
            updateProgress(data.progress);
        } else {
            // Fallback calculation if progress not provided
            const maxQuestions = 25;
            const progress = Math.min(100, Math.round((currentQuestionCount / maxQuestions) * 100));
            updateProgress(progress);
        }

        // Check if this is a guess
        if (data.isGuess) {
            updateProgress(100);
            
            // Store the question before showing guess (so continue can work)
            // Don't update lastQuestion here since this is a guess, not a question
            
            // Extract and display guess name
            const guessName = data.guessName || data.question.replace(/^(I think you are thinking of|Are you thinking of)[:\s]+/i, '').replace(/[?\.]$/, '').trim();
            guessText.textContent = guessName;
            
            // Display description/occupation if available
            if (data.guessDescription) {
                guessDescription.textContent = data.guessDescription;
                guessDescription.style.display = 'block';
            } else {
                guessDescription.style.display = 'none';
            }
            
            // Store guess data in sessionStorage for guess.html
            sessionStorage.setItem('guessData', JSON.stringify({
                guessName: guessName,
                guessImage: data.guessImage,
                guessDescription: data.guessDescription,
                sessionId: sessionId,
                questionCount: currentQuestionCount
            }));
            
            // Redirect to guess page immediately - use absolute path
            const basePath = window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1);
            window.location.href = basePath + 'guess.html';
            return; // Exit early to prevent any other code from running
        } else {
            lastQuestion = data.question;
            questionText.textContent = data.question;
            showScreen(gameScreen);
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

// Handle continue questioning
async function handleContinue() {
    if (!sessionId) return;
    
    try {
        loading.style.display = 'block';
        
        // Send a message to continue asking questions instead of guessing
        const response = await fetch(`${API_BASE}/game/answer`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                sessionId,
                answer: 'Continue asking questions'
            })
        });

        if (!response.ok) {
            throw new Error('Failed to continue');
        }

        const data = await response.json();
        currentQuestionCount = data.questionCount;
        questionNumber.textContent = `Question ${currentQuestionCount}`;
        lastQuestion = data.question;
        
        // Update progress
        if (data.progress !== undefined) {
            updateProgress(data.progress);
        }
        
        questionText.textContent = data.question;
        showScreen(gameScreen);
        loading.style.display = 'none';
        answerButtons.forEach(btn => btn.disabled = false);
    } catch (error) {
        console.error('Error continuing:', error);
        alert('Failed to continue. Please try again.');
        loading.style.display = 'none';
        answerButtons.forEach(btn => btn.disabled = false);
    }
}

// Handle guess result
async function handleGuessResult(correct) {
    if (!sessionId) return;

    try {
        loading.style.display = 'block';

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

            if (!response.ok) {
                throw new Error('Failed to process guess result');
            }

            const data = await response.json();
            endTitle.textContent = 'I Got It!';
            endMessage.textContent = data.message;
            showScreen(endScreen);
        } else {
            wrongInput.style.display = 'block';
            wrongBtn.disabled = true;
            correctBtn.disabled = true;
        }

        loading.style.display = 'none';
    } catch (error) {
        console.error('Error handling guess result:', error);
        alert('Failed to process guess result. Please try again.');
        loading.style.display = 'none';
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

    try {
        loading.style.display = 'block';

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

        if (!response.ok) {
            throw new Error('Failed to process guess result');
        }

        const data = await response.json();

        if (data.continue) {
            // Continue with more questions
            currentQuestionCount++;
            questionNumber.textContent = `Question ${currentQuestionCount}`;
            questionText.textContent = data.question;
            // Update progress (slightly decrease since wrong guess)
            const maxQuestions = 25;
            const progress = Math.min(100, Math.round((currentQuestionCount / maxQuestions) * 100));
            updateProgress(Math.max(0, progress - 10));
            wrongInput.style.display = 'none';
            actualAnswerInput.value = '';
            wrongBtn.disabled = false;
            correctBtn.disabled = false;
            showScreen(gameScreen);
        } else {
            // Game ended
            endTitle.textContent = 'Game Over';
            endMessage.textContent = data.message;
            showScreen(endScreen);
        }

        loading.style.display = 'none';
    } catch (error) {
        console.error('Error submitting actual answer:', error);
        alert('Failed to submit answer. Please try again.');
        loading.style.display = 'none';
    }
}

// Event listeners
startBtn.addEventListener('click', startGame);

answerButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        const answer = btn.getAttribute('data-answer');
        submitAnswer(answer);
    });
});

correctBtn.addEventListener('click', () => {
    handleGuessResult(true);
});

wrongBtn.addEventListener('click', () => {
    handleGuessResult(false);
});

continueBtn.addEventListener('click', handleContinue);

submitAnswerBtn.addEventListener('click', submitActualAnswer);

actualAnswerInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        submitActualAnswer();
    }
});

playAgainBtn.addEventListener('click', () => {
    sessionId = null;
    currentQuestionCount = 0;
    actualAnswerInput.value = '';
    wrongInput.style.display = 'none';
    wrongBtn.disabled = false;
    correctBtn.disabled = false;
    guessImageContainer.style.display = 'none';
    guessImage.src = '';
    guessDescription.textContent = '';
    guessDescription.style.display = 'none';
    updateProgress(0);
    showScreen(startScreen);
});
