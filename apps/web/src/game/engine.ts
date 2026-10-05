/**
 * The engine bound to the shipped content. This module is the heart of the lazy game chunk: importing it pulls in
 * Zod, the content JSON and the engine, none of which belong in the initial bundle (NFR-10).
 */
import { defaultContent, en } from '@fastlane/content';
import { createEngine } from '@fastlane/engine';
import { addContentStrings } from '../i18n/i18n.ts';

addContentStrings(en);

export const content = defaultContent;
export const engine = createEngine(content);
