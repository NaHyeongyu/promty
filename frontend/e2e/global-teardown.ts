import type { FullConfig } from "@playwright/test";

import { runSessionHelper } from "./session";


export default function globalTeardown(_config: FullConfig) {
  runSessionHelper("--cleanup");
}
