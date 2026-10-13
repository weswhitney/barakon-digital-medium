import { Component, computed, effect, inject, signal } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

// 1. INTERFACES
interface Point {
  x: number;
  y: number;
}
interface Destination {
  id: string;
  name: string;
  position: Point;
  videoUrl: string;
  display: string;
}
interface RoadSegment {
  id: string;
  orientation: 'horizontal' | 'vertical';
  fixedCoordinate: number;
  start: number;
  end: number;
}

type WalkingDirection = 'left' | 'right' | 'up' | 'down' | null;

const STAND = 'assets/images/mascot-front.png';
const WALK_LEFT_1 = 'assets/images/barakon-left-1.png';
const WALK_LEFT_2 = 'assets/images/barakon-left-2.png';
const WALK_RIGHT_1 = 'assets/images/barakon-right-1.png';
const WALK_RIGHT_2 = 'assets/images/barakon-right-2.png';
const WALK_UP_1 = 'assets/images/barakon-up-1.png';
const WALK_UP_2 = 'assets/images/barakon-up-2.png';
const WALK_DOWN_1 = 'assets/images/barakon-down-1-2.png';
const WALK_DOWN_2 = 'assets/images/barakon-down-2-2.png';

// Define all unique coordinates as constants for readability and maintanence.
const START_X = 0.45;
const LEFT_X = 0.19;
const RIGHT_X = 0.85;
const PALM_TREE_X = LEFT_X;
const RED_DOOR_X = LEFT_X; // Aligned with Palm Tree for a straight vertical path
const VOLCANO_X = RIGHT_X;
const CASTLE_X = RIGHT_X;
const BOTTOM_Y = 0.6;
const TOP_Y = 0.2;
const RED_DOOR_Y = TOP_Y;
const VOLCANO_Y = TOP_Y;
const PALM_TREE_Y = BOTTOM_Y;
const START_Y = BOTTOM_Y;
const CASTLE_Y = 0.7;

// 2. GAME DATA CONSTANTS
const STARTING_POINT: Point = { x: START_X, y: START_Y };
const DESTINATIONS: Destination[] = [
  {
    id: 'd1',
    name: 'Palm Tree',
    position: { x: PALM_TREE_X, y: PALM_TREE_Y },
    videoUrl: 'https://www.youtube.com/embed/FteCOhQb4Ow',
    display: "What's new in Angular AI",
  },
  {
    id: 'd2',
    name: 'Red Door',
    position: { x: RED_DOOR_X, y: RED_DOOR_Y },
    videoUrl: 'https://www.youtube.com/embed/Cegc5JtWbrI',
    display: 'Meet Angular Aria',
  },
  {
    id: 'd3',
    name: 'Volcano',
    position: { x: VOLCANO_X, y: VOLCANO_Y },
    videoUrl: 'https://www.youtube.com/embed/7v8mIW9_NXw',
    display: 'Introducing Signal Forms',
  },
  {
    id: 'd4',
    name: 'Castle',
    position: { x: CASTLE_X, y: CASTLE_Y },
    videoUrl: 'https://www.youtube.com/embed/wiWUpCsJ9Os',
    display: "Say hello to Angular's new Mascot!",
  },
];

const ALL_ROAD_SEGMENTS: RoadSegment[] = [
  // Road 1 (Dest 1 <-> Start)
  {
    id: 'r1',
    orientation: 'horizontal',
    fixedCoordinate: PALM_TREE_Y,
    start: PALM_TREE_X,
    end: START_X,
  },
  // Road 2 (Palm Tree <-> Red Door)
  {
    id: 'r2',
    orientation: 'vertical',
    fixedCoordinate: PALM_TREE_X,
    start: RED_DOOR_Y,
    end: PALM_TREE_Y,
  },
  // Road 3 (Dest 2 <-> Dest 3)
  {
    id: 'r3',
    orientation: 'horizontal',
    fixedCoordinate: RED_DOOR_Y,
    start: RED_DOOR_X,
    end: VOLCANO_X,
  },
  // Road 4 (Dest 3 <-> Dest 4)
  {
    id: 'r4',
    orientation: 'vertical',
    fixedCoordinate: VOLCANO_X,
    start: VOLCANO_Y,
    end: CASTLE_Y,
  },
];

// 3. GAME MECHANICS CONSTANTS
const MOVE_STEP = 0.0025;
const ANIMATION_SPEED = 28; // Higher is slower. Update image every 10 frames.
// How far off a road's axis the character can be
const MOVE_TOLERANCE = 0.002;
// How close to a destination to "arrive" (must be very small)
const DESTINATION_TOLERANCE = 0.005;

@Component({
  selector: 'app-game',
  templateUrl: './game.html',
  styleUrl: './game.css',
  host: {
    '(window:keydown)': 'handleKeydown($event)',
    '(window:keyup)': 'handleKeyup($event)',
  },
})
export class Game {
  characterPosition = signal<Point>(STARTING_POINT);
  isDialogOpen = signal<boolean>(false);
  visitedKeyDestinations = signal<Set<string>>(new Set());
  keysToShow = computed(() => Array.from(this.visitedKeyDestinations()));
  allKeysCollected = computed(() => this.keysToShow().length === 3);
  showMascot = signal(false);
  destinations = signal<Destination[]>(DESTINATIONS);
  walkingDirection = signal<WalkingDirection>(null);
  walkFrame = signal(0);
  characterImageUrl = computed(() => {
    if (this.activeDestination()) {
      return STAND;
    }
    const direction = this.walkingDirection();
    const frame = this.walkFrame();
    const animationFrame = Math.floor(frame / ANIMATION_SPEED) % 2;
    switch (direction) {
      case 'left':
        return animationFrame === 0 ? WALK_LEFT_1 : WALK_LEFT_2;
      case 'right':
        return animationFrame === 0 ? WALK_RIGHT_1 : WALK_RIGHT_2;
      case 'up':
        return animationFrame === 0 ? WALK_UP_1 : WALK_UP_2;
      case 'down':
        return animationFrame === 0 ? WALK_DOWN_1 : WALK_DOWN_2;
      default:
        return STAND;
    }
  });
  safeVideoUrl = signal<SafeResourceUrl | null>(null);
  pressedKeys = signal<Set<string>>(new Set());

  private sanitizer = inject(DomSanitizer);

  constructor() {
    effect(() => {
      const destination = this.activeDestination();
      if (destination?.videoUrl) {
        this.safeVideoUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(destination.videoUrl));
      } else {
        this.safeVideoUrl.set(null);
      }
    });
    this.gameLoop();
  }

  gameLoop() {
    const keys = this.pressedKeys();
    if (!this.isDialogOpen()) {
      const currentPos = this.characterPosition();
      let newPos = { ...currentPos };
      let moveDirection: 'horizontal' | 'vertical' | null = null;
      if (keys.has('ArrowUp')) {
        newPos.y -= MOVE_STEP;
        moveDirection = 'vertical';
        this.walkingDirection.set('up');
      } else if (keys.has('ArrowDown')) {
        newPos.y += MOVE_STEP;
        moveDirection = 'vertical';
        this.walkingDirection.set('down');
      } else if (keys.has('ArrowLeft')) {
        newPos.x -= MOVE_STEP;
        moveDirection = 'horizontal';
        this.walkingDirection.set('left');
      } else if (keys.has('ArrowRight')) {
        newPos.x += MOVE_STEP;
        moveDirection = 'horizontal';
        this.walkingDirection.set('right');
      } else {
        this.walkingDirection.set(null);
      }
      if (moveDirection && this.isMoveAllowed(currentPos, newPos, moveDirection)) {
        this.characterPosition.set(newPos);
        this.walkFrame.update((frame) => frame + 1);
      }
    }
    requestAnimationFrame(() => this.gameLoop());
  }

  // 5. COMPUTED SIGNALS (DERIVED STATE)
  characterXPercent = computed(() => this.characterPosition().x * 100);
  characterYPercent = computed(() => this.characterPosition().y * 100);
  activeDestination = computed<Destination | null>(() => {
    const pos = this.characterPosition();
    for (const dest of this.destinations()) {
      const distance = Math.sqrt(
        Math.pow(pos.x - dest.position.x, 2) + Math.pow(pos.y - dest.position.y, 2),
      );
      if (distance < DESTINATION_TOLERANCE) {
        return dest;
      }
    }
    return null;
  });

  // 6. EVENT HANDLERS & METHODS
  handleKeydown(event: KeyboardEvent) {
    if (this.isDialogOpen() && event.key !== 'Escape') {
      return;
    }
    this.preventArrowDefault(event);
    this.pressedKeys.update((keys) => keys.add(event.key));
    if (
      event.key === 'Enter' &&
      this.activeDestination() &&
      (this.activeDestination()?.id !== 'd4' || this.allKeysCollected())
    ) {
      this.isDialogOpen.set(true);
    }
    if (event.key === 'Escape' && this.isDialogOpen()) {
      this.closeDialog();
    }
  }
  handleKeyup(event: KeyboardEvent) {
    this.preventArrowDefault(event);
    this.pressedKeys.update((keys) => {
      keys.delete(event.key);
      return keys;
    });
  }
  preventArrowDefault(event: KeyboardEvent) {
    const arrowKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    if (arrowKeys.includes(event.key)) {
      event.preventDefault();
    }
  }
  handleButtonPress(key: string) {
    this.pressedKeys.update((keys) => keys.add(key));
  }
  handleButtonRelease(key: string) {
    this.pressedKeys.update((keys) => {
      keys.delete(key);
      return keys;
    });
  }
  closeDialog(): void {
    const activeDest = this.activeDestination();
    if (activeDest && ['d1', 'd2', 'd3'].includes(activeDest.id)) {
      this.visitedKeyDestinations.update((visited) => {
        if (!visited.has(activeDest.id)) {
          visited.add(activeDest.id);
          return new Set(visited); // Return new Set to trigger update
        }
        return visited;
      });
    }
    if (activeDest?.id === 'd4' && this.allKeysCollected()) {
      this.showMascot.set(true);
    }
    this.isDialogOpen.set(false);
  }
  private isMoveAllowed(
    currentPos: Point,
    newPos: Point,
    direction: 'horizontal' | 'vertical',
  ): boolean {
    // Find the road the character is currently on by checking the axis perpendicular to movement.
    let currentRoad: RoadSegment | null = null;
    let minDistance = Infinity;
    for (const road of ALL_ROAD_SEGMENTS) {
      if (direction === 'horizontal' && road.orientation === 'horizontal') {
        const distance = Math.abs(currentPos.y - road.fixedCoordinate);
        if (distance < minDistance) {
          minDistance = distance;
          currentRoad = road;
        }
      } else if (direction === 'vertical' && road.orientation === 'vertical') {
        const distance = Math.abs(currentPos.x - road.fixedCoordinate);
        if (distance < minDistance) {
          minDistance = distance;
          currentRoad = road;
        }
      }
    }
    // If no road is close enough, movement is not allowed.
    if (!currentRoad || minDistance > MOVE_TOLERANCE) {
      return false;
    }
    // Check if the new position is within the bounds of the identified road.
    if (currentRoad.orientation === 'horizontal') {
      return (
        newPos.x >= Math.min(currentRoad.start, currentRoad.end) - MOVE_TOLERANCE &&
        newPos.x <= Math.max(currentRoad.start, currentRoad.end) + MOVE_TOLERANCE
      );
    } else {
      // Vertical
      return (
        newPos.y >= Math.min(currentRoad.start, currentRoad.end) - MOVE_TOLERANCE &&
        newPos.y <= Math.max(currentRoad.start, currentRoad.end) + MOVE_TOLERANCE
      );
    }
  }
}
