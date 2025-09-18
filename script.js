// --- Game Configuration ---
const CANVAS_WIDTH = 400; // Base width for game logic
const CANVAS_HEIGHT = 600; // Base height for game logic
const BUBBLE_RADIUS = 20;
const BUBBLE_DIAMETER = BUBBLE_RADIUS * 2;
const SHOOT_SPEED = 10;
const INITIAL_GRID_ROWS = 5;
const GRID_COLS = 10; // Max columns
const CANNON_HEIGHT = 40;
const CANNON_WIDTH = 60;
const AIM_LINE_LENGTH = 150;
const POP_SCORE = 10;

// Colors for bubbles
const BUBBLE_COLORS = ['red', 'green', 'blue', 'yellow', 'purple'];

// --- Game State Variables ---
let canvas;
let ctx;
let score = 0;
let cannonAngle = 0; // Angle in degrees
let bubbles = []; // Array of all bubbles (grid + flying)
let gridBubbles = []; // Array of bubbles fixed in the grid
let flyingBubble = null; // The bubble currently shot by the cannon
let animationFrameId; // To manage requestAnimationFrame

// Audio elements
let shootSound;
let popSound;

// --- Utility Functions ---

// Get a random color from the available bubble colors
function getRandomBubbleColor() {
    const availableColors = getAvailableColorsInGrid();
    if (availableColors.length > 0) {
        return availableColors[Math.floor(Math.random() * availableColors.length)];
    }
    // If no bubbles in grid yet, just pick from all colors
    return BUBBLE_COLORS[Math.floor(Math.random() * BUBBLE_COLORS.length)];
}

// Convert degrees to radians
function toRadians(angle) {
    return angle * (Math.PI / 180);
}

// Distance between two points
function dist(p1, p2) {
    return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
}

// Hexagonal grid position calculation (simplified for snapping)
function getGridPosition(x, y) {
    const colWidth = BUBBLE_DIAMETER;
    const rowHeight = BUBBLE_DIAMETER * Math.sqrt(3) / 2; // Hex vertical spacing

    let row = Math.round((y - BUBBLE_RADIUS) / rowHeight);
    let col = Math.round((x - BUBBLE_RADIUS - (row % 2) * BUBBLE_RADIUS) / colWidth);

    // Calculate exact center of the nearest grid cell
    const snappedY = BUBBLE_RADIUS + row * rowHeight;
    const snappedX = BUBBLE_RADIUS + col * colWidth + (row % 2) * BUBBLE_RADIUS;

    return { x: snappedX, y: snappedY, row, col };
}

// --- Bubble Class ---
class Bubble {
    constructor(x, y, color, isGrid = false) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.radius = BUBBLE_RADIUS;
        this.isGrid = isGrid;
        this.vx = 0;
        this.vy = 0;
        this.isPopping = false;
        this.popFrame = 0; // For animation
    }

    draw() {
        if (this.isPopping) {
            // Simple pop animation: scale down and fade out
            const scale = 1 - (this.popFrame / 10); // 10 frames for pop
            const alpha = 1 - (this.popFrame / 10);

            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius * scale, 0, Math.PI * 2);
            ctx.fillStyle = this.color;
            ctx.fill();
            ctx.restore();
            this.popFrame++;
            if (this.popFrame >= 10) {
                return false; // Indicate that this bubble should be removed
            }
        } else {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.fillStyle = this.color;
            ctx.fill();
            ctx.strokeStyle = '#555';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
        return true; // Indicate that this bubble should still be drawn
    }

    // Check if two bubbles are touching
    isCollidingWith(otherBubble) {
        return dist(this, otherBubble) < (this.radius + otherBubble.radius - 2); // -2 for slight overlap tolerance
    }

    // Get neighboring grid bubbles
    getNeighbors() {
        const neighbors = [];
        for (const gridB of gridBubbles) {
            if (gridB !== this && this.isCollidingWith(gridB)) {
                neighbors.push(gridB);
            }
        }
        return neighbors;
    }
}

// --- Game Initialization ---
function initGame() {
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');
    shootSound = document.getElementById('shootSound');
    popSound = document.getElementById('popSound');

    // Make canvas responsive
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Event listeners for input
    canvas.addEventListener('mousemove', handleAim);
    canvas.addEventListener('touchmove', handleAim, { passive: false });
    canvas.addEventListener('mousedown', handleShoot);
    canvas.addEventListener('touchend', handleShoot, { passive: false });

    // Initialize game state
    score = 0;
    document.getElementById('score-display').textContent = `Score: ${score}`;
    bubbles = [];
    gridBubbles = [];
    flyingBubble = null;

    generateInitialGrid();
    animationFrameId = requestAnimationFrame(gameLoop);
}

function resizeCanvas() {
    // Maintain aspect ratio while fitting the screen
    const container = document.getElementById('game-container');
    let width = window.innerWidth;
    let height = window.innerHeight;
    const aspectRatio = CANVAS_WIDTH / CANVAS_HEIGHT;

    if (width / height > aspectRatio) {
        width = height * aspectRatio;
    } else {
        height = width / aspectRatio;
    }

    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    // Set internal canvas resolution for drawing
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;

    // Update canvas and container size for CSS
    container.style.width = `${width}px`;
    container.style.height = `${height}px`;
}


// Generate the initial grid of bubbles
function generateInitialGrid() {
    const colOffset = BUBBLE_RADIUS; // Half diameter for staggered rows

    for (let r = 0; r < INITIAL_GRID_ROWS; r++) {
        const isEvenRow = r % 2 === 0;
        // Adjust start X for staggering
        const startX = isEvenRow ? BUBBLE_RADIUS : BUBBLE_RADIUS + colOffset;

        for (let c = 0; c < GRID_COLS - (isEvenRow ? 0 : 1); c++) {
            const x = startX + c * BUBBLE_DIAMETER;
            const y = BUBBLE_RADIUS + r * (BUBBLE_DIAMETER * Math.sqrt(3) / 2);

            // Ensure bubbles are within canvas bounds
            if (x < CANVAS_WIDTH - BUBBLE_RADIUS && y < CANVAS_HEIGHT / 2) {
                const bubble = new Bubble(x, y, getRandomBubbleColor(), true);
                bubbles.push(bubble);
                gridBubbles.push(bubble);
            }
        }
    }
}

// --- Input Handlers ---
function getEventCoords(event) {
    let clientX, clientY;
    if (event.touches && event.touches.length > 0) {
        clientX = event.touches[0].clientX;
        clientY = event.touches[0].clientY;
    } else {
        clientX = event.clientX;
        clientY = event.clientY;
    }

    // Get canvas position relative to viewport
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    // Convert mouse/touch coordinates to canvas coordinates
    const canvasX = (clientX - rect.left) * scaleX;
    const canvasY = (clientY - rect.top) * scaleY;

    return { x: canvasX, y: canvasY };
}


function handleAim(event) {
    if (flyingBubble) return; // Don't aim while a bubble is flying

    const coords = getEventCoords(event);
    const cannonCenter = { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT - CANNON_HEIGHT / 2 };

    // Calculate angle from cannon to mouse/touch
    const dx = coords.x - cannonCenter.x;
    const dy = coords.y - cannonCenter.y;

    // Ensure we only aim upwards
    if (dy > 0) return;

    cannonAngle = Math.atan2(dy, dx); // Angle in radians
    // Convert to degrees for easier use if needed, but atan2 is in radians
    // We store it as radians for shooting directly
}

function handleShoot(event) {
    if (flyingBubble) return;

    event.preventDefault(); // Prevent scrolling on mobile touch events

    const cannonCenter = { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT - CANNON_HEIGHT / 2 };
    const shootPoint = {
        x: cannonCenter.x + Math.cos(cannonAngle) * (CANNON_HEIGHT / 2),
        y: cannonCenter.y + Math.sin(cannonAngle) * (CANNON_HEIGHT / 2)
    };

    flyingBubble = new Bubble(shootPoint.x, shootPoint.y, getRandomBubbleColor());
    flyingBubble.vx = Math.cos(cannonAngle) * SHOOT_SPEED;
    flyingBubble.vy = Math.sin(cannonAngle) * SHOOT_SPEED;
    bubbles.push(flyingBubble);

    if (shootSound) {
        shootSound.currentTime = 0; // Rewind to start
        shootSound.play();
    }
}

// --- Game Logic ---

function updateGame() {
    // Update flying bubble
    if (flyingBubble) {
        flyingBubble.x += flyingBubble.vx;
        flyingBubble.y += flyingBubble.vy;

        // Wall collision
        if (flyingBubble.x - flyingBubble.radius < 0 || flyingBubble.x + flyingBubble.radius > CANVAS_WIDTH) {
            flyingBubble.vx *= -1; // Bounce horizontally
            // Adjust position to prevent sticking in wall
            if (flyingBubble.x - flyingBubble.radius < 0) flyingBubble.x = flyingBubble.radius;
            if (flyingBubble.x + flyingBubble.radius > CANVAS_WIDTH) flyingBubble.x = CANVAS_WIDTH - flyingBubble.radius;
        }

        // Ceiling or Grid collision
        if (flyingBubble.y - flyingBubble.radius < 0 || collisionWithGrid()) {
            flyingBubble.isGrid = true;
            snapBubbleToGrid(flyingBubble);
            gridBubbles.push(flyingBubble);
            checkMatches(flyingBubble); // Check for matches around the newly placed bubble
            flyingBubble = null; // Bubble is now part of the grid
            checkFloatingBubbles(); // After a pop, check if bubbles should fall
            checkGameOver();
        }
    }
}

function collisionWithGrid() {
    for (const gridB of gridBubbles) {
        if (flyingBubble.isCollidingWith(gridB)) {
            return true;
        }
    }
    return false;
}

function snapBubbleToGrid(bubble) {
    const snapped = getGridPosition(bubble.x, bubble.y);
    bubble.x = snapped.x;
    bubble.y = snapped.y;
}

function checkMatches(startBubble) {
    const matchingBubbles = getConnectedSameColorBubbles(startBubble);

    if (matchingBubbles.length >= 3) {
        popBubbles(matchingBubbles);
    }
}

function getConnectedSameColorBubbles(startBubble) {
    const q = [startBubble];
    const visited = new Set();
    const matching = [];

    visited.add(startBubble);
    matching.push(startBubble);

    let head = 0;
    while (head < q.length) {
        const current = q[head++];

        for (const neighbor of current.getNeighbors()) {
            if (!visited.has(neighbor) && neighbor.color === startBubble.color) {
                visited.add(neighbor);
                q.push(neighbor);
                matching.push(neighbor);
            }
        }
    }
    return matching;
}

function popBubbles(bubblesToPop) {
    score += bubblesToPop.length * POP_SCORE;
    document.getElementById('score-display').textContent = `Score: ${score}`;

    if (popSound) {
        popSound.currentTime = 0;
        popSound.play();
    }

    // Mark bubbles for popping animation, and remove them from gridBubbles
    for (const bubble of bubblesToPop) {
        bubble.isPopping = true;
        const index = gridBubbles.indexOf(bubble);
        if (index > -1) {
            gridBubbles.splice(index, 1);
        }
    }
    // Filter bubbles array later during drawing
}

function checkFloatingBubbles() {
    // 1. Find all bubbles connected to the top row (ceiling)
    const connectedToCeiling = new Set();
    const q = [];

    // Initialize queue with bubbles near the top
    for (const bubble of gridBubbles) {
        if (bubble.y <= BUBBLE_RADIUS * 2) { // Roughly top two rows
            q.push(bubble);
            connectedToCeiling.add(bubble);
        }
    }

    let head = 0;
    while (head < q.length) {
        const current = q[head++];
        for (const neighbor of current.getNeighbors()) {
            if (!connectedToCeiling.has(neighbor)) {
                connectedToCeiling.add(neighbor);
                q.push(neighbor);
            }
        }
    }

    // 2. Identify and make disconnected bubbles fall
    const fallingBubbles = [];
    for (let i = gridBubbles.length - 1; i >= 0; i--) {
        const bubble = gridBubbles[i];
        if (!connectedToCeiling.has(bubble)) {
            fallingBubbles.push(bubble);
            gridBubbles.splice(i, 1); // Remove from grid
            // Remove from main bubbles array to avoid re-checking for connections
            const mainIndex = bubbles.indexOf(bubble);
            if(mainIndex > -1) {
                bubbles.splice(mainIndex, 1);
            }
            bubble.isGrid = false; // It's no longer a grid bubble
            bubble.vy = 5; // Give it a downward velocity to fall
            score += 5; // Bonus for falling bubbles
        }
    }
    document.getElementById('score-display').textContent = `Score: ${score}`;
    // Add falling bubbles back to the 'bubbles' array for drawing/updating, but as dynamic
    bubbles.push(...fallingBubbles);
}

function checkGameOver() {
    // Check if any bubble in the grid has reached a "game over" line (e.g., bottom of screen)
    for (const bubble of gridBubbles) {
        if (bubble.y + bubble.radius > CANVAS_HEIGHT - CANNON_HEIGHT - BUBBLE_RADIUS * 2) { // Arbitrary line above cannon
            alert(`Game Over! Your Score: ${score}`);
            cancelAnimationFrame(animationFrameId); // Stop the game loop
            // Optional: Add a restart button or logic
            return;
        }
    }
    // Check for win condition (all grid bubbles cleared)
    if (gridBubbles.length === 0 && flyingBubble === null) {
        alert(`You Win! Your Score: ${score}`);
        cancelAnimationFrame(animationFrameId);
        // Optional: Next level or restart
    }
}

// Get unique colors currently present in the grid for generating next bubble
function getAvailableColorsInGrid() {
    const colors = new Set();
    for (const bubble of gridBubbles) {
        colors.add(bubble.color);
    }
    return Array.from(colors);
}


// --- Drawing Functions ---
function drawCannon() {
    const cannonCenter = { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT - CANNON_HEIGHT / 2 };

    ctx.save();
    ctx.translate(cannonCenter.x, cannonCenter.y);
    ctx.rotate(cannonAngle + Math.PI / 2); // Adjust for upward facing cannon
    ctx.fillStyle = 'gray';
    ctx.fillRect(-CANNON_WIDTH / 2, -CANNON_HEIGHT / 2, CANNON_WIDTH, CANNON_HEIGHT);
    ctx.restore();
}

function drawAimLine() {
    if (flyingBubble) return; // Don't draw aim line if a bubble is flying

    const cannonCenter = { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT - CANNON_HEIGHT / 2 };
    const aimEndX = cannonCenter.x + Math.cos(cannonAngle) * AIM_LINE_LENGTH;
    const aimEndY = cannonCenter.y + Math.sin(cannonAngle) * AIM_LINE_LENGTH;

    ctx.beginPath();
    ctx.moveTo(cannonCenter.x, cannonCenter.y);
    ctx.lineTo(aimEndX, aimEndY);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();
}

function drawBubbles() {
    // Filter out bubbles that have finished popping
    bubbles = bubbles.filter(bubble => {
        if (bubble.isPopping) {
            return bubble.draw(); // Returns false if pop animation is done
        }
        return true;
    });

    // Draw remaining bubbles
    for (const bubble of bubbles) {
        if (!bubble.isPopping) { // Only draw non-popping bubbles here
            bubble.draw();
        }
    }
}

function drawGame() {
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT); // Clear canvas
    drawBubbles();
    drawCannon();
    drawAimLine();
}

// --- Game Loop ---
function gameLoop() {
    updateGame();
    drawGame();
    animationFrameId = requestAnimationFrame(gameLoop);
}

// Start the game when the window loads
window.onload = initGame;