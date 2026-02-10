/**
 * Container Runtime Abstraction
 *
 * Supports Apple Container (macOS) and Docker (Linux).
 * Auto-detects based on platform, or override via NANOCLAW_CONTAINER_RUNTIME env var.
 */
import os from 'os';

export interface VolumeMount {
  hostPath: string;
  containerPath: string;
  readonly?: boolean;
}

export interface ContainerRuntime {
  name: string;
  command: string;
  buildCommand(contextDir: string, tag: string): string[];
  runArgs(mounts: VolumeMount[], image: string): string[];
  checkCommand(): string[];
}

const appleContainerRuntime: ContainerRuntime = {
  name: 'apple-container',
  command: 'container',

  buildCommand(contextDir: string, tag: string): string[] {
    return ['container', 'build', '-t', tag, contextDir];
  },

  runArgs(mounts: VolumeMount[], image: string): string[] {
    const args: string[] = ['run', '-i', '--rm'];

    for (const mount of mounts) {
      if (mount.readonly) {
        args.push(
          '--mount',
          `type=bind,source=${mount.hostPath},target=${mount.containerPath},readonly`,
        );
      } else {
        args.push('-v', `${mount.hostPath}:${mount.containerPath}`);
      }
    }

    args.push(image);
    return args;
  },

  checkCommand(): string[] {
    return ['container', 'system', 'status'];
  },
};

const dockerRuntime: ContainerRuntime = {
  name: 'docker',
  command: 'docker',

  buildCommand(contextDir: string, tag: string): string[] {
    return ['docker', 'build', '-t', tag, contextDir];
  },

  runArgs(mounts: VolumeMount[], image: string): string[] {
    const args: string[] = ['run', '-i', '--rm'];

    for (const mount of mounts) {
      if (mount.readonly) {
        args.push('-v', `${mount.hostPath}:${mount.containerPath}:ro`);
      } else {
        args.push('-v', `${mount.hostPath}:${mount.containerPath}`);
      }
    }

    args.push(image);
    return args;
  },

  checkCommand(): string[] {
    return ['docker', 'info'];
  },
};

let cachedRuntime: ContainerRuntime | null = null;

export function detectRuntime(): ContainerRuntime {
  if (cachedRuntime) return cachedRuntime;

  const override = process.env.NANOCLAW_CONTAINER_RUNTIME;

  if (override === 'docker') {
    cachedRuntime = dockerRuntime;
  } else if (override === 'container') {
    cachedRuntime = appleContainerRuntime;
  } else if (os.platform() === 'darwin') {
    cachedRuntime = appleContainerRuntime;
  } else {
    cachedRuntime = dockerRuntime;
  }

  return cachedRuntime;
}

// For testing
export function _resetRuntimeCache(): void {
  cachedRuntime = null;
}
