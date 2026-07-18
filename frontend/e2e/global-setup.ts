import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { FullConfig } from "@playwright/test";

import { repositoryDirectory, runSessionHelper } from "./session";


export default async function globalSetup(_config: FullConfig) {
  const session = JSON.parse(runSessionHelper()) as {
    cookie_name: string;
    refresh_cookie_name: string;
    refresh_token: string;
    token: string;
  };
  const stateDirectory = resolve(repositoryDirectory, "frontend/.playwright");
  await mkdir(stateDirectory, { recursive: true });
  await writeFile(
    resolve(stateDirectory, "e2e-auth.json"),
    JSON.stringify({
      cookies: [
        {
          domain: "127.0.0.1",
          httpOnly: true,
          name: session.cookie_name,
          path: "/",
          sameSite: "Lax",
          secure: false,
          value: session.token,
        },
        {
          domain: "127.0.0.1",
          httpOnly: true,
          name: session.refresh_cookie_name,
          path: "/api/auth",
          sameSite: "Lax",
          secure: false,
          value: session.refresh_token,
        },
      ],
      origins: [],
    }),
    "utf8",
  );
}
