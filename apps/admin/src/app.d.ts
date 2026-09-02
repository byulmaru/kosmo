declare global {
  namespace App {
    interface Locals {
      viewer: {
        label: string;
        login?: string;
      };
    }
  }
}

export {};
