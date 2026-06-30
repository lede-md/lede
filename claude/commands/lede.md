---
description: Open a markdown file in the Lede app for reading/editing
argument-hint: <path-to-md-file>
allowed-tools: Bash(lede:*)
---

Open the markdown file at `$ARGUMENTS` in the Lede desktop app:

```bash
lede "$ARGUMENTS"
```

If `lede` is not found, tell the user to install the CLI shim
(`cp cli/lede /usr/local/bin/lede`) and that Lede.app must be in
/Applications.
