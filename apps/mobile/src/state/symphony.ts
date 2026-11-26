import { createSymphonyEnvironmentAtoms } from "@t3tools/client-runtime/state/symphony";

import { connectionAtomRuntime } from "../connection/runtime";

export const symphonyEnvironment = createSymphonyEnvironmentAtoms(connectionAtomRuntime);
