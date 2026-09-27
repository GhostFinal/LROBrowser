import assert from 'node:assert/strict';
import test from 'node:test';

import {
  renderGuildMemberMarks,
  syncGuildMemberMarkPositions
} from './lastro-minimap-guild-render.mjs';

function createRecordingContext() {
  return {
    currentPath: [],
    beginPathCalls: 0,
    strokeCalls: 0,
    fillCalls: 0,
    strokePaths: [],
    fillPaths: [],
    beginPath() {
      this.beginPathCalls++;
      this.currentPath = [];
    },
    moveTo(x, y) {
      this.currentPath.push(['M', x, y]);
    },
    lineTo(x, y) {
      this.currentPath.push(['L', x, y]);
    },
    stroke() {
      this.strokeCalls++;
      this.strokePaths.push(this.currentPath.map((command) => [...command]));
    },
    fill() {
      this.fillCalls++;
      this.fillPaths.push(this.currentPath.map((command) => [...command]));
    }
  };
}

function flatten(paths) {
  return paths.flatMap((path) => path);
}

test('renders every guild member mark instead of only the last mark', () => {
  const context = createRecordingContext();
  const guild = [
    { key: 101, x: 10, y: 20 },
    { key: 202, x: 30, y: 40 }
  ];
  const expectedPath = [
    ['M', 10, 16],
    ['L', 14, 24],
    ['L', 6, 24],
    ['L', 10, 16],
    ['M', 30, 36],
    ['L', 34, 44],
    ['L', 26, 44],
    ['L', 30, 36]
  ];

  renderGuildMemberMarks(context, guild, (x) => x, (y) => y);

  assert.deepEqual(flatten(context.strokePaths), expectedPath);
  assert.deepEqual(flatten(context.fillPaths), expectedPath);
  assert.equal(context.beginPathCalls, 1);
  assert.equal(context.strokeCalls, 1);
  assert.equal(context.fillCalls, 1);
});

test('updates guild mark positions from live entities while retaining a fallback position', () => {
  const guild = [
    { key: 101, x: 10, y: 20 },
    { key: 202, x: 30, y: 40 }
  ];
  const entities = new Map([
    [101, { position: [15.5, 25.25, 0] }]
  ]);

  syncGuildMemberMarkPositions(guild, (key) => entities.get(key));

  assert.deepEqual(guild, [
    { key: 101, x: 15.5, y: 25.25 },
    { key: 202, x: 30, y: 40 }
  ]);
});
