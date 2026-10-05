import { defineProject } from 'vitest/config';

// Property tests on shipped content play Jones's full utility-AI turns; CI runners need more than the 5 s default.
export default defineProject({ test: { name: 'engine', testTimeout: 30_000 } });
