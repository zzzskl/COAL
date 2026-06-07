// Browser entry point for context component tests.
// Imports components via server-relative paths, delegates to shared spec.

import { test, assert } from "./lib.js";
import { ContextCompact, ContextList, ContextDetail } from "/js/components/context/context.js";
import { registerContextTests } from "./context.spec.js";

registerContextTests({ test, assert, ContextCompact, ContextList, ContextDetail });
