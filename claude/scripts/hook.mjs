// Claude Code hook for every event the tabby-groups plugin listens to: one node process per event (node's start is
// most of a hook's cost, slow under a virus scanner), running the parts that event needs, as hooks.json used to with
// one process each: asking (a question waits on the user), compacting (context compaction), inbox (waiting messages).
import { readHook } from './hookin.mjs';
import { asking } from './asking.mjs';
import { compacting } from './compacting.mjs';
import { inbox, finish } from './inbox.mjs';

const PARTS = {
  PreToolUse: [asking],
  PermissionRequest: [asking],
  PostToolUse: [asking, inbox],
  UserPromptSubmit: [asking, inbox],
  Stop: [asking, compacting],
  SessionEnd: [asking, compacting],
  PreCompact: [compacting],
  PostCompact: [compacting],
  SessionStart: [compacting],
};

const hook = await readHook();
let output = null;
for (const part of hook ? PARTS[hook.hook_event_name] ?? [] : []) {
  // One part's failure must not cost the others their turn.
  try {
    output = part(hook) ?? output;
  } catch { }
}
finish(output);
