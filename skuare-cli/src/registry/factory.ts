import type { RegistryBackend } from "./backend";
import { HttpRegistryBackend } from "./http_backend";
import { GitRegistryBackend, isGitRegistryServer } from "./git_backend";

const backendCache = new Map<string, Promise<RegistryBackend>>();

export async function getRegistryBackend(server: string): Promise<RegistryBackend> {
  let backend = backendCache.get(server);
  if (!backend) {
    backend = isGitRegistryServer(server)
      ? GitRegistryBackend.create(server)
      : Promise.resolve<RegistryBackend>(new HttpRegistryBackend(server));
    backendCache.set(server, backend);
  }
  return backend;
}
