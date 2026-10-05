import { defineProject } from 'vitest/config';

// Sim tests play full games with utility bots and Jones; CI runners need more than the 5 s default.
export default defineProject({ test: { name: 'sim', testTimeout: 30_000 } });
