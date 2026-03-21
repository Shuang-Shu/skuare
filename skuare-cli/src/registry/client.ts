import { callApi as callHttpApi } from "../http/client";
import type { ApiRequestOptions, ApiResponse } from "../http/client";
import { callGitApi, isGitRegistryServer } from "./git_backend";

export type { ApiRequestOptions, ApiResponse } from "../http/client";

export async function callApi(options: ApiRequestOptions): Promise<ApiResponse> {
  if (isGitRegistryServer(options.server)) {
    return callGitApi(options);
  }
  return callHttpApi(options);
}
