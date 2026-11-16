import type { User } from '../types';
import { DEMO_USERS } from './seedData';
let current: User | null = null;
let demo = true;
export function getSessionUser() { return current; }
export function isDemoSession() { return demo; }
export function setSessionUser(user: User | null, isDemo = true) { current = user; demo = isDemo; }
export function initialDemoUser() { return DEMO_USERS[0] ?? null; }