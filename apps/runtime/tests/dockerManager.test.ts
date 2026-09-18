import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DockerManager } from '../src/docker/DockerManager.js';

describe('DockerManager Unit & Integration Tests', () => {
  let dockerManager: DockerManager;
  let isDockerAvailable = false;

  beforeAll(async () => {
    dockerManager = new DockerManager();
    try {
      await dockerManager.getDockerInstance().ping();
      isDockerAvailable = true;
    } catch (err) {
      void err;
      isDockerAvailable = false;
    }
  });

  describe('Security & Configuration Validation', () => {
    it('should throw an error if hostPath attempts to mount docker.sock', async () => {
      await expect(
        dockerManager.createContainer({
          workspaceId: 'test-security',
          hostPath: '/var/run/docker.sock',
        })
      ).rejects.toThrow('Mounting docker.sock inside sandbox container is strictly prohibited');
    });

    it('should initialize DockerManager instance cleanly', () => {
      expect(dockerManager).toBeDefined();
      expect(dockerManager.getDockerInstance()).toBeDefined();
    });
  });

  describe('Container Lifecycle & Execution (Integration)', () => {
    let containerId: string | null = null;

    afterAll(async () => {
      if (containerId && isDockerAvailable) {
        try {
          await dockerManager.stopContainer(containerId, 1);
          await dockerManager.removeContainer(containerId, true);
        } catch (err) {
          void err;
        }
      }
    });

    it('spawns container, verifies security parameters, runs whoami, and tears down container', async () => {
      if (!isDockerAvailable) {
        console.warn('Docker daemon not reachable; skipping live container integration test.');
        return;
      }

      // 1. Create Container
      containerId = await dockerManager.createContainer({
        workspaceId: 'test-ws-1',
        image: 'node:22-bookworm-slim',
      });
      expect(containerId).toBeDefined();

      // 2. Start Container
      await dockerManager.startContainer(containerId);

      // 3. Inspect Container Security Config
      const info = await dockerManager.inspectContainer(containerId);
      expect(info.Config.User).toBe('10001');
      expect(info.HostConfig.NanoCpus ?? (info.HostConfig as any)?.NanoCPUs).toBe(2 * 1e9);
      expect(info.HostConfig.Memory).toBe(1024 * 1024 * 1024);
      expect(info.HostConfig.PidsLimit).toBe(256);
      expect(info.HostConfig.CapDrop).toContain('ALL');
      expect(info.HostConfig.SecurityOpt).toContain('no-new-privileges:true');

      // 4. Exec command 'whoami' or 'id -u'
      const whoamiRes = await dockerManager.execCommand(containerId, ['id', '-u']);
      expect(whoamiRes.exitCode).toBe(0);
      expect(whoamiRes.stdout.trim()).toBe('10001');

      // 5. Verify docker.sock access fails / does not exist inside container
      const sockCheck = await dockerManager.execCommand(containerId, [
        'ls',
        '/var/run/docker.sock',
      ]);
      expect(sockCheck.exitCode).not.toBe(0);

      // 6. Tear down container
      await dockerManager.stopContainer(containerId, 1);
      await dockerManager.removeContainer(containerId, true);
      containerId = null;
    });
  });
});
