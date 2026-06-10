import type { StoreApi } from 'zustand';
import type { AppState } from './types';

export type StoreSet = StoreApi<AppState>['setState'];
export type StoreGet = StoreApi<AppState>['getState'];
