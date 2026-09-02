import type { Viewer } from './server/viewer';

declare global {
  namespace App {
    interface Locals {
      viewer: Viewer;
    }
  }
}

export {};
